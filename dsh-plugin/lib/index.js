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
//   POST /awf/task        body {path, type, id, action: update|pause|resume|delete, fields?, revert?, dryRun?, workspaceRoot?}
//                         update → 字段表行原位替换；pause → 状态=blocked；resume → 状态=active；
//                         delete + dryRun → 只读 git 查询 {ok:true, revert:{files:[{path,status}]}}；
//                         delete + revert:true → 白名单 git restore 修改范围文件 → 移除任务块 + done.md 追加 [已撤销] 行；
//                         code: not-found(404) / not-git-repo(400) / nothing-to-revert(409) / git-error(500)
// 白名单：path 必须绝对路径，且在全局索引（~/.agents/AGENTS.md readIndex）项目路径内，
//         或等于客户端上报的当前工作区根 workspaceRoot。
import { join, isAbsolute, resolve } from 'node:path'
import { homedir } from 'node:os'
import { readFile, stat } from 'node:fs/promises'
import {
  ledgerOf, readIndex, initSkeleton, startTask, archiveTask, isWhitelistedPath, TASK_TYPES,
  parseTodoRows, todoEdit, taskEdit, revertPreview, readSource, SOURCE_FILES,
} from '../src/ledger.js'

export const inject = ['webServer', 'connection']

const AGENTS_HOME = process.env.DSH_AGENTS_HOME || join(homedir(), '.agents')

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
        writeJson(res, 200, { ok: true, projects })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/projects route')

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
        if (!['update', 'pause', 'resume', 'delete'].includes(body.action)) {
          writeError(res, 400, 'bad-request', 'body.action 必须是 update|pause|resume|delete 之一')
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
  // （与 POST /awf/task {action:delete,...} 共享同一套 ledger 逻辑，双契约并存）
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
        const result = await revertPreview({ projectPath: guard.path, type: body.type, id: body.id.trim() })
        if (!result.ok) {
          if (result.code === 'not-found') {
            writeError(res, 404, 'not-found', `current.md 中不存在任务 ${body.id.trim()}`)
          } else {
            writeError(res, 400, result.code || 'bad-request', '删除回退预检参数非法')
          }
          return
        }
        writeJson(res, 200, result)
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
        if (!['rollback', 'ledger-only'].includes(body.mode)) {
          writeError(res, 400, 'bad-request', "body.mode 必须是 'rollback' | 'ledger-only' 之一")
          return
        }
        const result = await taskEdit({
          projectPath: guard.path,
          type: body.type,
          id: body.id.trim(),
          action: 'delete',
          revert: body.mode === 'rollback',
          dryRun: false,
        })
        if (!result.ok) {
          if (result.code === 'not-found') {
            writeError(res, 404, 'not-found', `current.md 中不存在任务 ${body.id.trim()}`)
          } else if (result.code === 'not-git-repo') {
            writeError(res, 400, 'not-git-repo', '目标目录不是 git 仓库，无法回退修改')
          } else if (result.code === 'nothing-to-revert') {
            writeError(res, 409, 'nothing-to-revert', result.message || '修改范围为空或无未提交改动')
          } else {
            writeError(res, 500, result.code || 'internal', result.stderr || '删除回退失败')
          }
          return
        }
        writeJson(res, 200, { ok: true, task: result.task })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/task/delete/execute route')
}
