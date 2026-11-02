// dsh-awf-dashboard — 服务端（cordis 插件）
//
// 只读 JSON API：
//   GET /awf/projects  → 全局项目索引 [{id, aliases, path}]
//   GET /awf/ledger?path=<项目根> → 账本看板 JSON
//   GET /awf/archive?path=<项目根>&id=<任务ID> → 归档只读查询 {ok, done:{type,row,block}}
//   GET /awf/todo?path=<项目根>&type=dev|debug|docs → 结构化待办行 {ok, rows:[{id,prio,desc,date}]}
//   GET /awf/source?path=<项目根>&type=dev|debug|docs&file=todo|current|done
//                         → {ok, source:{type,file,absPath,content}}（枚举白名单，路径不可穿越）
// 写 JSON API（全部走连接认证围栏 + 路径白名单，除白名单 git restore 外不执行任何命令）：
//   POST /awf/init        body {path, workspaceRoot?, name?, purpose?, stack?}
//                         → {ok:true, project:{...}} | {ok:false, error:{code}}
//                         code: already-initialized（不写任何文件）/ path-not-allowed / bad-request
//   POST /awf/task/start  body {path, type: dev|debug|docs, id, workspaceRoot?}
//                         → {ok:true, task:{id,type,title,prio,status:'active',date}}
//                           | {ok:false, error:{code}}  code: not-found / path-not-allowed / bad-request
//   POST /awf/todo        body {path, type, action: add|update|delete, row:{id?,优先级?,描述?}, workspaceRoot?}
//                         → {ok:true, action, type, rows:[{id,prio,desc,date}]}
//                           code: invalid-id / invalid-prio / duplicate(409) / not-found(404)
//   POST /awf/task        body {path, type, id, action: update|pause|resume, fields?, workspaceRoot?}
//                         update → 字段表行原位替换；pause → 状态=blocked；resume → 状态=active；
//                         delete/return-todo 已废弃（判断型写操作改由 agent 注入执行，
//                         POST /awf/agent/act action=delete|return-todo）
//                         code: not-found(404) / not-git-repo(400) / nothing-to-revert(409) / git-error(500)
// 白名单：path 必须绝对路径，且在全局索引（~/.agents/AGENTS.md readIndex）项目路径内，
//         或等于客户端上报的当前工作区根 workspaceRoot。
import { join, isAbsolute, resolve } from 'node:path'
import { homedir } from 'node:os'
import { readFile, stat } from 'node:fs/promises'
import { watch } from 'node:fs'
import {
  ledgerOf, readIndex, initSkeleton, startTask, archiveTask, isWhitelistedPath, TASK_TYPES,
  parseTodoRows, todoEdit, taskEdit, revertPreview, readSource, SOURCE_FILES,
} from '../src/ledger.js'

export const inject = ['webServer', 'connection']

// DEV-033 块 B：测试可观测的监听/广播（挂起连接数、手动触发广播）
export { watchProjectLedger, broadcastLedgerChange, sseClients, ledgerWatchers }

const AGENTS_HOME = process.env.DSH_AGENTS_HOME || join(homedir(), '.agents')

// DEV-026 P1：sessionController.prompt(request, signal) 的 signal 是必传第二参，
// 首行 signal.throwIfAborted()（无默认值）；插件经 Cordis inject 进程内直拿宿主
// 原类实例不走网关（网关才补 carrier ?? NEVER_ABORTED_SIGNAL）。因此这里必须
// 显式传一个 never-aborted signal，否则每次调用首行抛 TypeError 被兜住降级。
const NEVER_ABORTED_SIGNAL = new AbortController().signal

/** 唯一请求 ID（宿主 hasPromptRequest 对重复 requestId 直接 accepted:true 不注入，需避免碰撞）。 */
function makeRequestId(prefix) {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
}

/**
 * 向主对话 session 注入指令（sessionController.prompt，宿主 user/message 事件触发 agent 处理）。
 * sessionController 运行时探测（ctx.get）：宿主缺服务/无 sessionId 时返回 prompted:false，不抛错。
 * @param {object} ctx Cordis 上下文
 * @param {string} sessionId 目标主对话 session（可为空 → 不注入）
 * @param {string} text 注入的指令文本
 * @param {string} prefix requestId 前缀
 * @returns {Promise<{prompted: boolean, sessionId?: string, error?: string}>}
 */
async function promptSession(ctx, sessionId, text, prefix) {
  const sid = typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : null
  if (!sid) return { prompted: false }
  const sessionController = ctx.get('sessionController')
  if (!sessionController) return { prompted: false, sessionId: sid }
  try {
    const outcome = await sessionController.prompt({
      requestId: makeRequestId(prefix),
      sessionId: sid,
      mode: 'queue',
      content: [{ type: 'text', text }],
    }, NEVER_ABORTED_SIGNAL)
    return { prompted: !!outcome && !!outcome.accepted, sessionId: sid }
  } catch (promptError) {
    return {
      prompted: false,
      sessionId: sid,
      error: promptError instanceof Error ? promptError.message : String(promptError),
    }
  }
}

function writeJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(body)
}

function writeError(res, status, code, message) {
  writeJson(res, status, { ok: false, error: { code, message } })
}

function queryOf(req) {
  const url = new URL(req.url || '/', 'http://dsh.internal')
  const q = {}
  for (const [k, v] of url.searchParams) q[k] = v
  return q
}

// ---- DEV-033 块 B：事件推送（数据状态驱动页面） ----------------------------
// 程序不主动通知 UI「我改了账本」——UI 只对「账本数据变化」负责：
// fs.watch 监听已登记项目的 tasks 目录，任何写者（agent/程序/用户手动）
// 改变账本文件都向挂起的 SSE 客户端广播；15s 轮询保留为兜底降级。

/** 已 watch 的项目任务目录（防重复监听）。 */
const ledgerWatchers = new Map()
/** 挂起的 SSE 客户端（res 上注册了 close 清理）。 */
const sseClients = new Set()

/** 监听项目的 tasks 目录，文件变化（任何写者）→ 广播 {projectPath}。返回 watcher（测试可 close）。 */
function watchProjectLedger(projectPath) {
  if (ledgerWatchers.has(projectPath)) return ledgerWatchers.get(projectPath)
  const tasksDir = join(projectPath, 'agent-workflow', 'tasks')
  let watcher
  try {
    watcher = watch(tasksDir, { recursive: true }, (_event, filename) => {
      if (!filename) return
      const name = String(filename)
      if (/\.md$/.test(name)) broadcastLedgerChange(projectPath)
    })
  } catch {
    return undefined // 目录不存在/watch 不支持时降级为轮询
  }
  ledgerWatchers.set(projectPath, watcher)
  return watcher
}

/** 向所有挂起 SSE 客户端广播账本变更事件。 */
function broadcastLedgerChange(projectPath) {
  const payload = JSON.stringify({ type: 'ledger-changed', projectPath })
  for (const res of sseClients) {
    try { res.write(`data: ${payload}\n\n`) } catch { /* 断开的连接由其 close 清理 */ }
  }
}

/** SSE 客户端连接：写入 SSE 头并挂起，连接关闭时移出集合。 */
function holdSseClient(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Connection', 'keep-alive')
  res.write('retry: 15000\n\n') // 断线重连退避与轮询同频
  sseClients.add(res)
  res.on('close', () => sseClients.delete(res))
}

/** 读取 JSON 请求体；非法 JSON / 超限返回 null。 */
function readBody(req) {
  return new Promise((resolvePromise) => {
    let data = ''
    let done = false
    req.on('data', (chunk) => {
      if (done) return
      data += chunk
      if (data.length > 1024 * 1024) {
        done = true
        req.destroy()
        resolvePromise(null)
      }
    })
    req.on('end', () => {
      if (done) return
      done = true
      try {
        resolvePromise(data.trim() ? JSON.parse(data) : {})
      } catch {
        resolvePromise(null)
      }
    })
    req.on('error', () => {
      if (!done) { done = true; resolvePromise(null) }
    })
  })
}

/** 只允许读取 agent-workflow 项目根目录（须含 agent-workflow/project.yaml）。 */
async function isProjectRoot(p) {
  if (!p || !isAbsolute(p)) return false
  try {
    await readFile(join(p, 'agent-workflow', 'project.yaml'))
    return true
  } catch {
    return false
  }
}

/** 写路径白名单：绝对路径 ∧（全局索引 ∨ 当前工作区根）。 */
async function isAllowedPath(target, workspaceRoot) {
  if (!target || !isAbsolute(target)) return false
  const projects = await readIndex(AGENTS_HOME)
  return isWhitelistedPath(target, projects.map((p) => p.path), workspaceRoot)
}

/** 目标必须是已存在的目录。 */
async function isDirectory(p) {
  if (!p || !isAbsolute(p)) return false
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}

// DEV-026/DEV-033：动作指令构建器（唯一入口）。
// 程序只传意图：动作枚举（start/return-todo/delete）+ 任务引用 + 一句话约束。
// 详细执行规则由 agent 读 AGENTS.md 与 docs/team-flow.md 自行展开——程序不重复业务细节。
export function buildActPrompt({ action, id, type, projectPath }) {
  const actionLine = {
    start: `在项目 ${projectPath} 的任务账本中，为任务 ${id}（类型 ${type}）创建 AgentTeams 团队并执行`,
    'return-todo': `在项目 ${projectPath} 的任务账本中，处理任务 ${id}（类型 ${type}）的「返回待办」操作`,
    delete: `在项目 ${projectPath} 的任务账本中，处理任务 ${id}（类型 ${type}）的「删除」操作`,
  }[action]
  const constraint = {
    start: `该任务已登记在 agent-workflow/tasks/${type}/current.md（状态 active）。按 AGENTS.md 任务路由决定是否建队：可并行拆分才建队，小任务单会话直接完成并说明原因；approval=automatic（本仓库已授权）；完成后按团队流程回填账本（验证→review→归档）。`,
    'return-todo': `分析能否放回（未提交改动/团队是否仍在执行），可放回则从 current.md 移除块并恢复 todo.md 行；不可则说明原因不改账本。`,
    delete: `分析能否删除（修改范围/依赖/验收进度/git 未提交改动），可删除则移除块并在 done.md 追加[已撤销]行（需回退 git 修改时分析后执行）；不可则说明原因不改账本。`,
  }[action]
  return [
    `【Agent Workflow 动作指令】`,
    `请${actionLine}：`,
    `1. ${constraint}`,
    `2. 处理完成后更新账本并回报结果（成功/原因）；Agent Workflow 面板会因账本数据变化自动刷新。`,
  ].join('\n')
}

/** 写路由公共前置：body.path 绝对路径 + 目录存在 + 白名单（同 init/start 的路径校验）。 */
async function whitelistedProjectPath(body) {
  if (!body || typeof body.path !== 'string' || !body.path.trim() || !isAbsolute(body.path)) {
    return { ok: false, status: 400, code: 'bad-request', message: 'body.path 必须是绝对路径字符串' }
  }
  const path = resolve(body.path)
  if (!(await isDirectory(path))) {
    return { ok: false, status: 400, code: 'bad-request', message: `目标目录不存在或不是目录：${path}` }
  }
  if (!(await isAllowedPath(path, body.workspaceRoot))) {
    return { ok: false, status: 403, code: 'path-not-allowed', message: 'path 不在白名单：必须位于全局项目索引或当前工作区根' }
  }
  return { ok: true, path }
}

export function apply(ctx) {
  // 与平台一致的认证围栏（宿主 Connection 服务，同 /api 网关准入）
  const fence = (req) => ctx.connection.requestRejection(req) === undefined
  const forbidden = (res) => writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/projects',
    handler: async (req, res) => {
      try {
        if (!fence(req)) {
          forbidden(res)
          return
        }
        if (req.method !== 'GET') {
          writeError(res, 405, 'method-error', 'method not allowed')
          return
        }
        const projects = await readIndex(AGENTS_HOME)
        // DEV-033 块 B：对每个已登记项目启动账本文件监听（幂等，供 SSE 广播）
        for (const p of projects) {
          if (p && typeof p.path === 'string' && p.path) watchProjectLedger(resolve(p.path))
        }
        writeJson(res, 200, { ok: true, projects })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/projects route')

  // DEV-033 块 B：账本变更 SSE 事件流（GET，认证后挂起）。
  // 前端 EventSource 订阅；账本文件变化（任何写者）→ 广播 → UI 立即刷新。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/events',
    handler: (req, res) => {
      if (!fence(req)) {
        forbidden(res)
        return
      }
      if (req.method !== 'GET') {
        writeError(res, 405, 'method-error', 'method not allowed')
        return
      }
      holdSseClient(res)
    },
  }), 'dsh-awf-dashboard: /awf/events route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/ledger',
    handler: async (req, res) => {
      try {
        if (!fence(req)) {
          forbidden(res)
          return
        }
        if (req.method !== 'GET') {
          writeError(res, 405, 'method-error', 'method not allowed')
          return
        }
        const path = queryOf(req).path
        if (!(await isProjectRoot(path))) {
          writeError(res, 400, 'bad-request', 'path 必须是含 agent-workflow/project.yaml 的绝对项目根目录')
          return
        }
        const ledger = await ledgerOf(path)
        writeJson(res, 200, { ok: true, ledger })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/ledger route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/init',
    handler: async (req, res) => {
      try {
        if (!fence(req)) {
          forbidden(res)
          return
        }
        if (req.method !== 'POST') {
          writeError(res, 405, 'method-error', 'method not allowed')
          return
        }
        const body = await readBody(req)
        if (!body || typeof body.path !== 'string' || !body.path.trim() || !isAbsolute(body.path)) {
          writeError(res, 400, 'bad-request', 'body.path 必须是绝对路径字符串')
          return
        }
        const path = resolve(body.path)
        if (!(await isDirectory(path))) {
          writeError(res, 400, 'bad-request', `目标目录不存在或不是目录：${path}`)
          return
        }
        if (!(await isAllowedPath(path, body.workspaceRoot))) {
          writeError(res, 403, 'path-not-allowed', 'path 不在白名单：必须位于全局项目索引或当前工作区根')
          return
        }
        const result = await initSkeleton({
          projectPath: path,
          name: body.name,
          purpose: body.purpose,
          stack: body.stack,
          aliases: body.aliases,
        })
        if (!result.ok) {
          writeError(res, 409, result.code || 'already-initialized', '目录已初始化 agent-workflow，不覆盖任何文件')
          return
        }
        writeJson(res, 200, { ok: true, project: result.project })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/init route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/task/start',
    handler: async (req, res) => {
      try {
        if (!fence(req)) {
          forbidden(res)
          return
        }
        if (req.method !== 'POST') {
          writeError(res, 405, 'method-error', 'method not allowed')
          return
        }
        const body = await readBody(req)
        if (!body || typeof body.path !== 'string' || !body.path.trim() || !isAbsolute(body.path)) {
          writeError(res, 400, 'bad-request', 'body.path 必须是绝对路径字符串')
          return
        }
        if (!TASK_TYPES.includes(body.type)) {
          writeError(res, 400, 'bad-request', `body.type 必须是 ${TASK_TYPES.join('|')} 之一`)
          return
        }
        if (typeof body.id !== 'string' || !/^[A-Z]+-[0-9]+$/.test(body.id.trim())) {
          writeError(res, 400, 'bad-request', 'body.id 必须是任务 ID（如 DEV-001）')
          return
        }
        const path = resolve(body.path)
        if (!(await isAllowedPath(path, body.workspaceRoot))) {
          writeError(res, 403, 'path-not-allowed', 'path 不在白名单：必须位于全局项目索引或当前工作区根')
          return
        }
        const result = await startTask({ projectPath: path, type: body.type, id: body.id.trim() })
        if (!result.ok) {
          writeError(res, 404, result.code || 'not-found', `todo.md 中不存在任务 ${body.id.trim()}`)
          return
        }
        writeJson(res, 200, { ok: true, task: result.task })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/task/start route')

  // DEV-026：开始任务并以 AgentTeams 建队执行。
  // 链路：登记账本（复用 startTask，保证「建队前先登记」铁律）→ 向主对话 session
  //   注入建队指令（sessionController.prompt，宿主 user/message 事件触发主对话 agent
  //   执行 agent_teams_* 建队）。sessionId 缺失或 prompt 失败不阻断登记（降级为普通开始）。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/team/start',
    handler: async (req, res) => {
      try {
        if (!fence(req)) {
          forbidden(res)
          return
        }
        if (req.method !== 'POST') {
          writeError(res, 405, 'method-error', 'method not allowed')
          return
        }
        const body = await readBody(req)
        const project = await whitelistedProjectPath(body)
        if (!project.ok) {
          writeError(res, project.status, project.code, project.message)
          return
        }
        if (!TASK_TYPES.includes(body.type)) {
          writeError(res, 400, 'bad-request', `body.type 必须是 ${TASK_TYPES.join('|')} 之一`)
          return
        }
        if (typeof body.id !== 'string' || !/^[A-Z]+-[0-9]+$/.test(body.id.trim())) {
          writeError(res, 400, 'bad-request', 'body.id 必须是任务 ID（如 DEV-001）')
          return
        }
        // 1) 登记账本（建队前先登记，铁律）
        const result = await startTask({ projectPath: project.path, type: body.type, id: body.id.trim() })
        if (!result.ok) {
          writeError(res, 404, result.code || 'not-found', `todo.md 中不存在任务 ${body.id.trim()}`)
          return
        }
        // 2) 向主对话注入建队指令（失败不阻断登记）
        const team = await promptSession(ctx, body.sessionId, buildActPrompt({
          action: 'start',
          id: body.id.trim(), type: body.type, projectPath: project.path,
        }), 'awf-team')
        writeJson(res, 200, { ok: true, task: result.task, team })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/team/start route')

  // DEV-033：判断型操作（返回待办/删除）→ 只注入指令给主对话 agent，程序不改账本。
  // 链路：认证 → 白名单 → type/id/action 校验 → promptSession 注入操作指令（mode:queue）。
  // 程序不再调用 returnTaskToTodo/deleteTask——由 agent 分析未提交改动/修改范围后
  // 执行并更新账本，插件页面靠数据状态驱动刷新。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/agent/act',
    handler: async (req, res) => {
      try {
        if (!fence(req)) {
          forbidden(res)
          return
        }
        if (req.method !== 'POST') {
          writeError(res, 405, 'method-error', 'method not allowed')
          return
        }
        const body = await readBody(req)
        const project = await whitelistedProjectPath(body)
        if (!project.ok) {
          writeError(res, project.status, project.code, project.message)
          return
        }
        if (!TASK_TYPES.includes(body.type)) {
          writeError(res, 400, 'bad-request', `body.type 必须是 ${TASK_TYPES.join('|')} 之一`)
          return
        }
        if (typeof body.id !== 'string' || !/^[A-Z]+-[0-9]+$/.test(body.id.trim())) {
          writeError(res, 400, 'bad-request', 'body.id 必须是任务 ID（如 DEV-001）')
          return
        }
        const action = String(body.action || '')
        if (!['return-todo', 'delete'].includes(action)) {
          writeError(res, 400, 'bad-request', 'body.action 必须是 return-todo|delete 之一')
          return
        }
        const team = await promptSession(ctx, body.sessionId, buildActPrompt({
          action,
          id: body.id.trim(), type: body.type, projectPath: project.path,
        }), 'awf-act-' + action)
        writeJson(res, 200, { ok: true, task: { id: body.id.trim(), type: body.type, action }, team })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/agent/act route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/archive',
    handler: async (req, res) => {
      try {
        if (!fence(req)) {
          forbidden(res)
          return
        }
        if (req.method !== 'GET') {
          writeError(res, 405, 'method-error', 'method not allowed')
          return
        }
        const path = queryOf(req).path
        const id = queryOf(req).id
        if (!(await isProjectRoot(path))) {
          writeError(res, 400, 'bad-request', 'path 必须是含 agent-workflow/project.yaml 的绝对项目根目录')
          return
        }
        if (typeof id !== 'string' || !/^[A-Z]+-[0-9]+$/.test(id.trim())) {
          writeError(res, 400, 'bad-request', 'id 必须是任务 ID（如 DEV-001）')
          return
        }
        const result = await archiveTask({ projectPath: path, id: id.trim() })
        if (!result.ok) {
          writeError(res, 404, 'not-found', `done.md 中不存在任务 ${id.trim()}`)
          return
        }
        writeJson(res, 200, { ok: true, done: result.done })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/archive route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/todo',
    handler: async (req, res) => {
      try {
        if (!fence(req)) {
          forbidden(res)
          return
        }
        if (req.method === 'GET') {
          const path = queryOf(req).path
          const type = queryOf(req).type
          if (!(await isProjectRoot(path))) {
            writeError(res, 400, 'bad-request', 'path 必须是含 agent-workflow/project.yaml 的绝对项目根目录')
            return
          }
          if (!TASK_TYPES.includes(type)) {
            writeError(res, 400, 'bad-request', `type 必须是 ${TASK_TYPES.join('|')} 之一`)
            return
          }
          let md = ''
          try {
            md = await readFile(join(path, 'agent-workflow', 'tasks', type, 'todo.md'), 'utf8')
          } catch { /* 缺 todo.md → 空列表 */ }
          writeJson(res, 200, { ok: true, type, rows: parseTodoRows(md) })
          return
        }
        if (req.method !== 'POST') {
          writeError(res, 405, 'method-error', 'method not allowed')
          return
        }
        const body = await readBody(req)
        const guard = await whitelistedProjectPath(body)
        if (!guard.ok) {
          writeError(res, guard.status, guard.code, guard.message)
          return
        }
        if (!TASK_TYPES.includes(body.type)) {
          writeError(res, 400, 'bad-request', `body.type 必须是 ${TASK_TYPES.join('|')} 之一`)
          return
        }
        if (!['add', 'update', 'delete'].includes(body.action)) {
          writeError(res, 400, 'bad-request', 'body.action 必须是 add|update|delete 之一')
          return
        }
        if (!body.row || typeof body.row !== 'object' || Array.isArray(body.row)) {
          writeError(res, 400, 'bad-request', 'body.row 必须是对象（{id?, 优先级?, 描述?}）')
          return
        }
        const result = await todoEdit({ projectPath: guard.path, type: body.type, action: body.action, row: body.row })
        if (!result.ok) {
          if (result.code === 'not-found') {
            writeError(res, 404, 'not-found', `todo.md 中不存在目标行（action=${body.action}）`)
          } else if (result.code === 'duplicate') {
            writeError(res, 409, 'duplicate', 'todo 已存在同 ID 行')
          } else {
            writeError(res, 400, result.code || 'bad-request', 'row 校验失败：ID 需 TYPE-xxx 格式，优先级需 P0-P3')
          }
          return
        }
        writeJson(res, 200, { ok: true, action: result.action, type: result.type, rows: result.rows })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/todo route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/source',
    handler: async (req, res) => {
      try {
        if (!fence(req)) {
          forbidden(res)
          return
        }
        if (req.method !== 'GET') {
          writeError(res, 405, 'method-error', 'method not allowed')
          return
        }
        const path = queryOf(req).path
        const type = queryOf(req).type
        const file = queryOf(req).file
        if (!(await isProjectRoot(path))) {
          writeError(res, 400, 'bad-request', 'path 必须是含 agent-workflow/project.yaml 的绝对项目根目录')
          return
        }
        if (!TASK_TYPES.includes(type)) {
          writeError(res, 400, 'bad-request', `type 必须是 ${TASK_TYPES.join('|')} 之一`)
          return
        }
        if (!SOURCE_FILES.includes(file)) {
          writeError(res, 400, 'bad-request', `file 必须是 ${SOURCE_FILES.join('|')} 之一`)
          return
        }
        const result = await readSource({ projectPath: path, type, file })
        if (!result.ok) {
          if (result.code === 'not-found') {
            writeError(res, 404, 'not-found', `账本文件不存在：tasks/${type}/${file}.md`)
          } else {
            writeError(res, 400, result.code || 'bad-request', '源文件参数非法')
          }
          return
        }
        writeJson(res, 200, result)
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/source route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/task',
    handler: async (req, res) => {
      try {
        if (!fence(req)) {
          forbidden(res)
          return
        }
        if (req.method !== 'POST') {
          writeError(res, 405, 'method-error', 'method not allowed')
          return
        }
        const body = await readBody(req)
        const guard = await whitelistedProjectPath(body)
        if (!guard.ok) {
          writeError(res, guard.status, guard.code, guard.message)
          return
        }
        if (!TASK_TYPES.includes(body.type)) {
          writeError(res, 400, 'bad-request', `body.type 必须是 ${TASK_TYPES.join('|')} 之一`)
          return
        }
        if (typeof body.id !== 'string' || !/^[A-Z]+-[0-9]+$/.test(body.id.trim())) {
          writeError(res, 400, 'bad-request', 'body.id 必须是任务 ID（如 DEV-001）')
          return
        }
        // DEV-033：判断型写操作（delete/return-todo/回退）已改由 agent 注入执行（/awf/agent/act）。
        // /awf/task 只保留纯字段操作：update（字段表）/pause（blocked）/resume（active）。
        if (!['update', 'pause', 'resume'].includes(body.action)) {
          writeError(res, 400, 'bad-request', 'body.action 必须是 update|pause|resume 之一；delete/return-todo 请走 /awf/agent/act（agent 注入执行）')
          return
        }
        if (body.action === 'update'
            && (!body.fields || typeof body.fields !== 'object' || Array.isArray(body.fields) || Object.keys(body.fields).length === 0)) {
          writeError(res, 400, 'bad-request', 'update 需要非空 fields 对象（字段名→新值）')
          return
        }
        const result = await taskEdit({
          projectPath: guard.path,
          type: body.type,
          id: body.id.trim(),
          action: body.action,
          fields: body.fields,
          revert: body.revert === true,
          dryRun: body.dryRun === true,
        })
        if (!result.ok) {
          if (result.code === 'not-found') {
            writeError(res, 404, 'not-found', `current.md 中不存在任务 ${body.id.trim()}`)
          } else if (result.code === 'not-git-repo') {
            writeError(res, 400, 'not-git-repo', '目标目录不是 git 仓库，无法查询/回退修改')
          } else if (result.code === 'nothing-to-revert') {
            writeError(res, 409, 'nothing-to-revert', result.message || '修改范围为空或无未提交改动')
          } else {
            writeError(res, 500, result.code || 'internal', result.stderr || '任务操作失败')
          }
          return
        }
        const payload = { ok: true, task: result.task }
        if (result.revert !== undefined) payload.revert = result.revert
        writeJson(res, 200, payload)
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/task route')

  // 前端契约（t2）适配路由：/awf/task/delete/dry-run 与 /awf/task/delete/execute
  // DEV-033 废弃：删除/回退已改由 agent 注入执行（POST /awf/agent/act action=delete）。
  // 程序不再提供 dry-run/execute 写路径（避免绕过 agent 判断直接改账本/git restore）。
  // 保留路由返回 410 Gone，提示改走新契约（不静默 404，便于旧客户端定位）。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/task/delete/dry-run',
    handler: async (req, res) => {
      try {
        if (!fence(req)) {
          forbidden(res)
          return
        }
        if (req.method !== 'POST') {
          writeError(res, 405, 'method-error', 'method not allowed')
          return
        }
        writeError(res, 410, 'deprecated', '删除/回退已改由 agent 注入执行：请 POST /awf/agent/act {action:"delete"}')
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/task/delete/dry-run route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/task/delete/execute',
    handler: async (req, res) => {
      try {
        if (!fence(req)) {
          forbidden(res)
          return
        }
        if (req.method !== 'POST') {
          writeError(res, 405, 'method-error', 'method not allowed')
          return
        }
        writeError(res, 410, 'deprecated', '删除/回退已改由 agent 注入执行：请 POST /awf/agent/act {action:"delete"}')
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/task/delete/execute route')

  // DEV-033 块 B：插件卸载时关闭全部账本文件监听（防热重载泄漏 watcher 句柄）。
  return () => {
    for (const [path, watcher] of ledgerWatchers) {
      try { watcher.close() } catch { /* 已关闭 */ }
      ledgerWatchers.delete(path)
    }
    for (const res of sseClients) {
      try { res.end() } catch { /* 已断开 */ }
      sseClients.delete(res)
    }
  }
}
