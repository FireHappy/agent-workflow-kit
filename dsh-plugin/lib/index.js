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
//                         delete/return-todo 已废弃（判断型写操作改由 agent 执行，
//                         POST /awf/action/agent 或 POST /awf/agent/act action=delete|return-todo）
//                         code: not-found(404) / not-git-repo(400) / nothing-to-revert(409) / git-error(500)
//   DEV-039 服务端子代理通道（优先，不经主会话）：
//     POST /awf/action/agent  body {path, type, id, action: return-todo|delete|progress-backfill,
//                                   reason?, sessionId?}
//                         → 宿主 agents 服务在位时 ctx.agents.create() 拉起动作子代理执行并
//                           等待回报（meta.cwd=项目根，prompt 用 followup，dispose 于 finally）；
//                           agents 服务不可用 → 降级注入主对话（team.prompted，旧路径保留）。
//                         → {ok:true, channel:'agent'|'inject', action, task,
//                            agent:{id,text,seq}? | failed:{code,error}? | team?}
//     POST /awf/backfill/agent body 同 /awf/action/agent（action 固定 progress-backfill，回填专用）
//     GET  /awf/agents/probe → {ok:true, probe:{available,createType,arity,factoryReady,...}}（只读自检）
//   POST /awf/register    body {path, workspaceRoot?, local?}
//                         → {ok:true, project:{id,aliases,path}, initialized, local, versions}
//                         已有 agent-workflow/ → 直接登记全局索引；没有 → 先初始化骨架再登记；
//                         local=true 时额外写 project.yaml track:false + .gitignore 忽略区块（幂等）；
//                         登记时若 kit 可达且未记录发布版本 → 补齐 scaffold_version。零外部命令。
//                         code: bad-request / path-not-allowed / missing-id
//   POST /awf/upgrade     body {path, workspaceRoot?, sessionId?}
//                         → {ok:true, versions, team:{prompted,...}}
//                         版本落后时向主对话 session 注入升级意图（升级由 agent 执行并跑 awf check），
//                         插件只注入 + 监听版本文件/账本变化。code: up-to-date(409) / path-not-allowed
// 白名单：path 必须绝对路径，且在全局索引（~/.agents/AGENTS.md readIndex）项目路径内，
//         或等于客户端上报的当前工作区根 workspaceRoot。
import { join, isAbsolute, resolve } from 'node:path'
import { homedir } from 'node:os'
import { readFile, stat, writeFile, mkdir, readdir } from 'node:fs/promises'
import { watch } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  ledgerOf, readIndex, initSkeleton, startTask, archiveTask, isWhitelistedPath, TASK_TYPES,
  parseTodoRows, todoEdit, taskEdit, revertPreview, readSource, writeSource, SOURCE_FILES,
  writeProjectRegistration, readProjectMetaFile, readProjectAWFVersion, readProjectRelease,
  setProjectTrack, setScaffoldVersion, writeLocalGitignore, semverLt,
  parseCheckItems, findBlock, cmdCriterion, isSafeCommand, applyCmdEvidence,
  replaceBlockInMd, taskLedgerOverdue, classifyFreshness, isOpenTaskStatus,
  canAutoPrompt, markAutoPrompted, todayKey, todayLocal,
} from '../src/ledger.js'
// DEV-039：宿主 ctx.agents.create() 服务端子代理最小拉起骨架（t1 POC，mock 契约测试锁定）
import { probeAgentsService } from '../src/agents-poc.js'
import { runManagedActionAgent } from '../src/managed-action-agent.js'

export const inject = ['webServer', 'connection']

// DEV-033 块 B：测试可观测的监听/广播（挂起连接数、手动触发广播）
export { watchProjectLedger, broadcastLedgerChange, sseClients, ledgerWatchers }

const AGENTS_HOME = process.env.DSH_AGENTS_HOME || join(homedir(), '.agents')

// DEV-026 P1：sessionController.prompt(request, signal) 的 signal 是必传第二参，
// 首行 signal.throwIfAborted()（无默认值）；插件经 Cordis inject 进程内直拿宿主
// 原类实例不走网关（网关才补 carrier ?? NEVER_ABORTED_SIGNAL）。因此这里必须
// 显式传一个 never-aborted signal，否则每次调用首行抛 TypeError 被兜住降级。
const NEVER_ABORTED_SIGNAL = new AbortController().signal

// DEV-040：异步面板动作作业（显式 async=true 才启用；旧同步契约保持不变）。
const actionJobs = new Map()
const ACTION_JOB_TTL_MS = 10 * 60 * 1000
const ACTION_JOB_LIMIT = 100
function jobSnapshot(job) {
  return { jobId: job.jobId, action: job.action, task: job.task, projectPath: job.projectPath,
    status: job.status, phase: job.phase, createdAt: job.createdAt, startedAt: job.startedAt,
    finishedAt: job.finishedAt, version: job.version, error: job.error, result: job.result }
}
function broadcastJob(job, event = 'updated') {
  const payload = JSON.stringify({ type: 'job', event, jobId: job.jobId, seq: job.version, job: jobSnapshot(job) })
  for (const res of sseClients) { try { res.write(`data: ${payload}\\n\\n`) } catch {} }
}
function updateJob(job, patch, event = 'updated') {
  Object.assign(job, patch, { version: job.version + 1 })
  broadcastJob(job, event)
}
function pruneActionJobs() {
  const now = Date.now()
  for (const [id, job] of actionJobs) {
    if (job.finishedAt && now - Date.parse(job.finishedAt) > ACTION_JOB_TTL_MS) actionJobs.delete(id)
  }
  while (actionJobs.size > ACTION_JOB_LIMIT) {
    const first = actionJobs.keys().next().value
    actionJobs.delete(first)
  }
}

/** 唯一请求 ID（宿主 hasPromptRequest 对重复 requestId 直接 accepted:true 不注入，需避免碰撞）。 */
function makeRequestId(prefix) {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
}

// ---------------------------------------------------------------------------
// DEV-036：回填置信度（L1）工作信号 + L2 限频状态
// ---------------------------------------------------------------------------

/** L1 进程内回填基线：projectPath → { ledgerSig, workspaceSig, at }。
 *  ledgerSig = 各 tasks/<type>/current.md 全文摘要（账本是否被回填过）；
 *  workspaceSig = git status --porcelain 输出摘要（工作是否发生）。 */
const backfillBaseline = new Map()

function sha256Text(text) {
  return createHash('sha256').update(String(text)).digest('hex')
}

/** 工作区只读信号（git status --porcelain 摘要）；非 git 仓库或报错返回 null（不产生 S1）。 */
function workspaceSignal(projectPath) {
  try {
    const r = spawnSync('git', ['status', '--porcelain'], {
      cwd: projectPath,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (r.status !== 0) return null
    return sha256Text(r.stdout || '')
  } catch {
    return null
  }
}

/** L2 限频状态文件（插件级状态，不是项目账本；读写失败不崩溃）。 */
const BACKFILL_STATE_FILE = () => join(homedir(), '.dsh-awf', 'backfill-state.json')

async function readBackfillState() {
  try {
    return JSON.parse(await readFile(BACKFILL_STATE_FILE(), 'utf8')) || {}
  } catch {
    return {}
  }
}

async function writeBackfillState(state) {
  try {
    await mkdir(join(homedir(), '.dsh-awf'), { recursive: true })
    await writeFile(BACKFILL_STATE_FILE(), JSON.stringify(state, null, 2), 'utf8')
  } catch { /* 状态写失败不影响主流程 */ }
}

/** L2 限频检查（只读，不消耗配额）：今天该任务未提示过才放行。 */
async function checkAutoPromptQuota(taskId) {
  const state = await readBackfillState()
  const today = todayKey()
  if (!canAutoPrompt(state, taskId, today)) return { ok: false, taskId, today }
  return { ok: true, taskId, today }
}

/** L2 限频消耗：注入成功后调用（DEV-036 F6：失败不烧配额，下次可重试）。 */
async function commitAutoPromptQuota(taskId, today) {
  const state = await readBackfillState()
  await writeBackfillState(markAutoPrompted(state, taskId, today))
}

/** 计算某项目进行中任务的回填置信度（副作用：刷新进程内基线）。 */
async function computeFreshnessFor(projectPath, ledger) {
  const out = {}
  const rawByType = {}
  for (const type of TASK_TYPES) {
    try {
      rawByType[type] = await readFile(join(projectPath, 'agent-workflow', 'tasks', type, 'current.md'), 'utf8')
    } catch {
      rawByType[type] = ''
    }
  }
  let ledgerSig = ''
  for (const type of TASK_TYPES) ledgerSig += rawByType[type]
  ledgerSig = sha256Text(ledgerSig)
  const workspaceSig = workspaceSignal(projectPath)
  const today = todayLocal()

  const baseline = backfillBaseline.get(projectPath)
  let workspaceChangedSinceLedger = false
  if (baseline) {
    if (baseline.ledgerSig !== ledgerSig) {
      // 账本变了 → 视为已回填，重置基线（下次工作信号从新基线开始）
      backfillBaseline.set(projectPath, { ledgerSig, workspaceSig, at: Date.now() })
    } else if (workspaceSig !== null && baseline.workspaceSig !== null && baseline.workspaceSig !== workspaceSig) {
      workspaceChangedSinceLedger = true
    }
  } else {
    // 首见：建立基线，不误报
    backfillBaseline.set(projectPath, { ledgerSig, workspaceSig, at: Date.now() })
  }

  for (const task of ledger.current || []) {
    if (!isOpenTaskStatus(task.status)) {
      out[task.id] = { level: 'skip', signals: [] }
      continue
    }
    const blockRaw = findBlock(rawByType[task.type] || '', task.id) || ''
    const signals = {
      workspaceChangedSinceLedger,
      ledgerOverdueDays: taskLedgerOverdue(blockRaw, today),
      uncheckedInVerifyOrReview: !!(task.checkItems
        && task.checkItems.done < task.checkItems.total
        && (task.status === 'verify' || task.status === 'review')),
      summaryStale: ledger.status ? ledger.status.fresh === false : false,
    }
    out[task.id] = classifyFreshness(signals)
  }
  return out
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

// ---- 框架版本信号（DEV-035：AWF_VERSION 代次 + 发布版本双信号） --------------

/** kit（agent-workflow-kit）项目在全局索引里的登记行；未登记返回 null。 */
async function findKitProject() {
  const projects = await readIndex(AGENTS_HOME)
  return projects.find((p) =>
    p.id === 'agent-workflow-kit' ||
    String(p.aliases || '').split(/[,\s]+/).includes('agent-workflow-kit')) || null
}

/** kit 侧最新版本信号（代次 + 发布版）；kit 未登记/不可读时对应字段为 null。 */
async function kitVersions() {
  const kit = await findKitProject()
  if (!kit || !kit.path) return { kitPath: null, latestAWF: null, latestRelease: null }
  const latestAWF = await readProjectAWFVersion(kit.path)
  // DEV-178：读 kit 自身 project.yaml 的 version_file（was 硬编码根 VERSION；DEV-174 迁移后
  // kit 锚点 = agent-workflow/VERSION），与 bin/awf upgrade 源版本读取（KVF）口径一致。
  const latestRelease = await readProjectRelease(kit.path)
  return { kitPath: kit.path, latestAWF, latestRelease }
}

/** 项目侧已安装版本信号（代次 + scaffold_version）。 */
async function projectVersions(projectPath) {
  const installedAWF = await readProjectAWFVersion(projectPath)
  const meta = await readProjectMetaFile(projectPath)
  return { installedAWF, scaffoldVersion: (meta && meta.scaffold_version) || null, installedRelease: await readProjectRelease(projectPath) }
}

/**
 * 汇总版本状态：latest（已最新）/ outdated（落后，给出 upgradeTo）/ unknown（kit 或版本不可读）。
 * DEV-184（v1.2.0 骨架化）：升级判定基于**骨架契约版本（AWF_VERSION 代次）**——
 *   骨架（bin/awf 结构、账本格式、AGENTS.md 模板）变化才提示 upgrade；
 *   发布版 semver（细节流程更新）只作显示，不再触发 outdated（细节在技能，符号链接自动生效）。
 * 规则：AWF 代次可读 → 优先代次比对；代次缺失 → 回退发布版 semver（兼容存量全量副本项目）。
 */
async function versionStatus(projectPath) {
  const p = await projectVersions(projectPath)
  const k = await kitVersions()
  let status = 'unknown'
  let upgradeTo = null
  if (p.installedAWF !== null && k.latestAWF !== null) {
    // 骨架契约版本（DEV-184）：AWF_VERSION 代次是结构性版本，+1 才意味着骨架变更
    status = p.installedAWF < k.latestAWF ? 'outdated' : 'latest'
  } else if (p.installedRelease && k.latestRelease) {
    // 代次缺失（旧项目未带 AWF_VERSION）回退发布版 semver 判定
    status = semverLt(p.installedRelease, k.latestRelease) === true ? 'outdated' : 'latest'
  } else if (status !== 'outdated' && !p.installedRelease && k.latestRelease && p.scaffoldVersion) {
    const lt = semverLt(p.scaffoldVersion, k.latestRelease)
    if (lt === true) status = 'outdated'
  }
  if (status === 'outdated') {
    if (p.installedAWF !== null && k.latestAWF !== null && p.installedAWF < k.latestAWF) {
      upgradeTo = `v${k.latestAWF}（骨架契约升级）`
    } else if (k.latestRelease) {
      upgradeTo = k.latestRelease
    } else {
      upgradeTo = '最新'
    }
  }
  return {
    status, upgradeTo,
    installed: p.installedRelease ? `v${p.installedRelease}` : (p.installedAWF === null ? null : `v${p.installedAWF}`),
    installedRelease: p.installedRelease || null,
    scaffold: p.scaffoldVersion || null,
    latestAWF: k.latestAWF === null ? null : `v${k.latestAWF}`,
    latestRelease: k.latestRelease || null,
    kitPath: k.kitPath,
  }
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
// 程序只传意图：动作枚举（start/return-todo/delete/progress-backfill）+ 任务引用 + 一句话约束。
// 详细执行规则由 agent 读 AGENTS.md 与 SKILL.md 团队协作节 自行展开——程序不重复业务细节。
// DEV-039：engine 区分执行框架——'subagent'=服务端子代理通道（指令即子代理任务书，
// 由宿主 ctx.agents.create() 拉起，全程不经主会话）；'inject'=注入主对话降级路径（旧路径保留）。

// DEV-103：init 动作的完整初始化指令（subagent 与 inject 共用）。
// agent 感知项目上下文生成完整框架，替代仅空模板的最小骨架（缺 workflows/README/bin 等运行时文件）。
const INIT_AGENT_GUIDE = [
  '初始化 agent-workflow 工作流框架（完整版，不要只生成空模板）：',
  '1. 先读项目上下文：README.md / package.json / 目录结构 / 语言与技术栈 / 现有约定，据此填写 project.yaml 的 id / name / purpose / aliases / stack（stack 影响默认校验命令，如 node、python、unity 等）；',
  '2. 生成文件（参照全局技能 agent-workflow-scaffold 的初始化产物）：agent-workflow/project.yaml（项目事实，唯一输入）；agent-workflow/README.md、agent-workflow/workflows/{dev,debug,docs,review,cross-project,release}.md（可参照 kit 模板）；agent-workflow/templates/AGENTS.md.tmpl；agent-workflow/bin/awf（+awf-dispatch 若有）；check_workflow.sh 兼容入口；tasks/{dev,debug,docs}/{todo,current,done}.md 骨架（todo.md 表格行=标准 4 列 `| 任务ID | 优先级 | 描述 | 登记日期 |`）；根目录 AGENTS.md 受控区块（由 bootstrap 生成）；CLAUDE.md 指针；',
  '3. 尽量从项目实际填充初始信息：todo.md 可写 1-3 条真实可行的初始任务（如「梳理项目现状并登记待办」），current.md 留空待认领，done.md 空表；project.yaml 填写真实 stack 与 purpose，不要默认 generic；',
  '4. 完成后运行 agent-workflow/bin/awf check 验证通过（或等价 bootstrap），再运行 awf status 刷新 status.md；',
  '5. 用简洁文本回报：生成了哪些文件、project.yaml 的关键字段、check/status 结果；失败时说明原因与已写文件。',
].join('\n')
export function buildActPrompt({ action, id, type, projectPath, reason, engine = 'inject' }) {
  const actionLine = {
    init: `在项目 ${projectPath} 初始化（生成）完整的 agent-workflow 工作流框架`,
    start: `在项目 ${projectPath} 的任务账本中，为任务 ${id}（类型 ${type}）创建 AgentTeams 团队并执行`,
    'return-todo': `在项目 ${projectPath} 的任务账本中，处理任务 ${id}（类型 ${type}）的「返回待办」操作`,
    delete: `在项目 ${projectPath} 的任务账本中，处理任务 ${id}（类型 ${type}）的「删除」操作`,
    'progress-backfill': `在项目 ${projectPath} 的任务账本中，回填任务 ${id}（类型 ${type}）的进度`,
  }[action]
  const constraint = {
    init: INIT_AGENT_GUIDE,
    start: `按阶段代理模型（DEV-038）：动作先派独立子代理分析（任务路由/可否执行）再处理，不占用主会话。该任务已登记在 agent-workflow/tasks/${type}/current.md（状态 active）。按 AGENTS.md 任务路由决定是否建队：可并行拆分才建队，小任务单会话直接完成并说明原因；approval=automatic（本仓库已授权）；完成后按团队流程回填账本（验证→review→归档）。`,
    'return-todo': `按阶段代理模型（DEV-038）：先派独立子代理分析（未提交改动/团队是否仍在执行/todo.md 是否有可恢复行），确认可放回才从 current.md 移除块并恢复 todo.md 行；不可则说明原因不改账本。`,
    delete: `按阶段代理模型（DEV-038）：先派独立子代理分析（修改范围/依赖/验收进度/git 未提交改动），可删除则移除块并在 done.md 追加[已撤销]行（需回退 git 修改时分析后执行）；不可则说明原因不改账本。`,
    'progress-backfill': `面板检测到该任务可能未回填（原因：${reason || '信号未知'}）。按阶段代理模型（DEV-038）：状态字段应在启动阶段代理那一刻已流转（启动验证→verify、启动复核→review），回填只补验收勾选与证据，且由独立子代理执行、不占用主会话——优先派一个「账本回填子代理」处理（读账本→对照证据→改 current.md→跑 awf status→回报），子代理不可用时才自行处理。约束：
1. 若状态未随阶段启动流转，先补状态（按实际阶段）；再对照任务块「验收标准」逐条判断：**判断型条目**已完成但未勾选的勾上 - [x]；**命令类 [cmd] 条目不要手动勾选**（由程序验证后带证据勾选，见任务块 awf:evidence 注释）；
2. 按实际进展更新 | 状态 |（active/verify/review）与「最近更新」；
3. 只回填事实，不虚构进度；无法判断的保持原样并说明。`,
  }[action]
  // DEV-039：服务端子代理通道——本指令即子代理自己的任务书，措辞从「派子代理」改为「由你执行」
  const constraintSubagent = {
    init: INIT_AGENT_GUIDE,
    start: `该任务已登记在 agent-workflow/tasks/${type}/current.md（状态 active）。由你作为本面板动作的阶段执行子代理推进：按 AGENTS.md 任务路由决定执行方式——可并行拆分才建队，小任务单会话直接完成并说明原因；approval=automatic（本仓库已授权）；完成后按团队流程回填账本（验证→review→归档）。`,
    'return-todo': `先由你分析（未提交改动/团队是否仍在执行/todo.md 是否有可恢复行），确认可放回才从 current.md 移除块并恢复 todo.md 行；不可则说明原因不改账本。`,
    delete: `先由你分析（修改范围/依赖/验收进度/git 未提交改动），可删除则移除块并在 done.md 追加[已撤销]行（需回退 git 修改时分析后执行）；不可则说明原因不改账本。`,
    'progress-backfill': `面板检测到该任务可能未回填（原因：${reason || '信号未知'}）。由你作为「账本回填子代理」完成：读账本→对照证据→改 current.md→跑 awf status→回报。约束：
1. 状态字段应在启动阶段代理那一刻已流转（启动验证→verify、启动复核→review）；若未流转，先按实际阶段补状态；再对照任务块「验收标准」逐条判断：**判断型条目**已完成但未勾选的勾上 - [x]；**命令类 [cmd] 条目不要手动勾选**（由程序验证后带证据勾选，见任务块 awf:evidence 注释）；
2. 按实际进展更新 | 状态 |（active/verify/review）与「最近更新」；
3. 只回填事实，不虚构进度；无法判断的保持原样并说明。`,
  }[action]
  if (engine === 'subagent') {
    return [
      '【Agent Workflow 面板动作 · 服务端子代理】',
      `你是 Agent Workflow 插件通过宿主 subagents.startActivation 注册的受管理子代理。由你执行任务，不把工作转交主会话；完成结果由宿主向主对话汇报。请执行面板动作：`,
      `动作：${actionLine}`,
      `执行约束：`,
      `1. ${constraintSubagent}`,
      `2. 处理完成后更新项目 ${projectPath} 的任务账本，并用简洁文本回报执行结果（成功/失败与原因）；Agent Workflow 面板会因账本数据变化自动刷新。`,
    ].join('\n')
  }
  return [
    `【Agent Workflow 动作指令】`,
    `请${actionLine}：`,
    `1. ${constraint}`,
    `2. 处理完成后更新账本并回报结果（成功/原因）；Agent Workflow 面板会因账本数据变化自动刷新。`,
  ].join('\n')
}

// DEV-039：面板判断型动作白名单（服务端子代理通道与 /awf/agent/act 注入通道共用；不删旧白名单）。
export const AGENT_ACTIONS = ['init', 'return-todo', 'delete', 'progress-backfill']

/**
 * 面板动作执行入口（DEV-039）：优先走宿主 agents 服务创建动作子代理（不经主会话），
 * agents 服务不可用时降级为「注入主对话」旧路径（promptSession；/awf/agent/act 白名单保留）。
 * 子代理运行期失败（agent-error/timeout 等）只返回失败结果，不回退注入——避免同一动作双重执行。
 * @param {object} ctx Cordis 上下文
 * @param {object} o {action, id, type, projectPath, reason?, sessionId?}
 * @returns {Promise<{channel:'agent', result:object}|{channel:'inject', reason?:string}>}
 */
function actionJobKey(body, projectPath) {
  const key = String(body.idempotencyKey || '').trim()
  return key ? `${projectPath}|${body.type}|${body.id}|${body.action}|${key}` : null
}

function createActionJob(ctx, body, projectPath) {
  pruneActionJobs()
  const key = actionJobKey(body, projectPath)
  const fingerprint = createHash('sha256').update(JSON.stringify({ path: projectPath, type: body.type, id: body.id, action: body.action, reason: body.reason || '' })).digest('hex')
  if (key) {
    const existing = [...actionJobs.values()].find((job) => job.idempotencyKey === key)
    if (existing) {
      if (existing.fingerprint !== fingerprint) { const error = new Error('idempotencyKey 已用于不同动作'); error.code = 'idempotency-conflict'; throw error }
      return existing
    }
  }
  const job = { jobId: `job-${randomUUID()}`, idempotencyKey: key, fingerprint,
    action: body.action, task: { id: body.id, type: body.type, action: body.action }, projectPath,
    status: 'queued', phase: 'queued', createdAt: new Date().toISOString(), startedAt: null,
    finishedAt: null, version: 0, error: null, result: null }
  actionJobs.set(job.jobId, job)
  broadcastJob(job, 'queued')
  setImmediate(async () => {
    updateJob(job, { status: 'running', phase: 'starting', startedAt: new Date().toISOString() }, 'running')
    try {
      const out = await runAgentAction(ctx, { action: body.action, id: body.id, type: body.type, projectPath, reason: body.reason, sessionId: body.sessionId })
      if (out.channel === 'agent' && !out.result.ok) updateJob(job, { status: 'failed', phase: 'failed', error: { code: out.result.code || 'agent-run-failed', message: out.result.error || '子代理执行失败' }, result: out }, 'failed')
      else updateJob(job, { status: 'succeeded', phase: 'completed', result: out }, 'completed')
    } catch (error) {
      updateJob(job, { status: 'failed', phase: 'failed', error: { code: error.code || 'queue-failed', message: error.message || String(error) } }, 'failed')
    } finally {
      job.finishedAt ||= new Date().toISOString()
      pruneActionJobs()
    }
  })
  return job
}

export async function runAgentAction(ctx, { action, id, type, projectPath, reason, sessionId } = {}) {
  const result = await runManagedActionAgent(ctx, {
    prompt: buildActPrompt({ action, id, type, projectPath, reason, engine: 'subagent' }),
    cwd: projectPath,
    parentSessionId: typeof sessionId === 'string' ? sessionId.trim() : undefined,
    label: `工作流动作：${id} ${action}`,
  })
  // Fail closed: no invisible bare Agent and no surprise main-session fallback.
  return { channel: 'agent', result }
}

/**
 * 动作子代理路由处理器。校验 → 宿主受管理子代理（runAgentAction）。
 * 缺受管理服务或精确 live 父代理时失败关闭，不创建裸会话、不自动注入主会话。
 * @param {string[]} allowedActions 该路由接受的 action 白名单
 * @param {{ctx: object, fence: Function, forbidden: Function}} deps apply() 闭包内上下文与帮手
 */
export function makeAgentActionRoute(allowedActions, deps = {}) {
  const { ctx, fence, forbidden } = deps
  return async (req, res) => {
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
      if (!allowedActions.includes(action)) {
        writeError(res, 400, 'bad-request', `body.action 必须是 ${allowedActions.join('|')} 之一`)
        return
      }
      const task = { id: body.id.trim(), type: body.type, action }
      if (body.async === true) {
        try {
          const job = createActionJob(ctx, { ...body, id: task.id, type: task.type, action }, project.path)
          writeJson(res, 202, { ok: true, channel: 'job', job: jobSnapshot(job) })
        } catch (error) {
          writeError(res, error.code === 'idempotency-conflict' ? 409 : 500, error.code || 'queue-failed', error.message || String(error))
        }
        return
      }
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined
      const reason = typeof body.reason === 'string' ? body.reason : undefined
      const out = await runAgentAction(ctx, {
        action, id: task.id, type: task.type, projectPath: project.path, reason, sessionId,
      })
      if (out.channel === 'agent') {
        const r = out.result
        if (r.ok) {
          writeJson(res, 200, {
            ok: true, channel: 'agent', action, task,
            agent: { id: r.agentId, text: r.text, seq: r.seq, phases: r.phases || [] },
          })
        } else {
          writeJson(res, 200, {
            ok: true, channel: 'agent', failed: true, action, task,
            agent: { id: r.agentId || null, code: r.code || 'agent-run-failed', error: r.error || '子代理执行失败', phases: r.phases || [] },
          })
        }
        return
      }
      // 降级：无 agents 服务 → 注入主对话（旧路径，动作白名单保留）
      const team = await promptSession(ctx, sessionId, buildActPrompt({
        action, id: task.id, type: task.type, projectPath: project.path, reason,
      }), 'awf-act-fallback-' + action)
      writeJson(res, 200, {
        ok: true, channel: 'inject', action, task, team, fallbackReason: out.reason,
      })
    } catch (error) {
      writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
    }
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

  // DEV-170：回报聚合路由（数据与渲染分离，AgentTeams 式）——读所有登记项目的 dispatch/reports/*.json
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/reports',
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
        const reports = []
        const seen = new Set()
        for (const p of projects) {
          if (!p || typeof p.path !== 'string' || !p.path) continue
          const dir = join(p.path, 'dispatch', 'reports')
          let names = []
          try { names = await readdir(dir) } catch (e) { continue }
          for (const name of names) {
            if (!name.endsWith('.json')) continue
            const abs = join(dir, name)
            try {
              const raw = await readFile(abs, 'utf-8')
              const data = JSON.parse(raw)
              if (!data || data.kind !== 'awf-report') continue
              data.file = name
              data.projectPath = p.path
              const key = data.reportedAt + '|' + abs
              if (!seen.has(key)) { seen.add(key); reports.push(data) }
            } catch (e) { /* 单条回报损坏不影响聚合 */ }
          }
        }
        reports.sort((a, b) => (b.reportedAt || 0) - (a.reportedAt || 0))
        writeJson(res, 200, { ok: true, reports })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/reports route')



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
          // DEV-041：区分「从未初始化」与「已有工作流文件夹但缺少/不完整 project.yaml」（半初始化）。
          //   后者引导升级/整理而非初始化（面板 detectNotInitialized 识别 needs-upgrade）。
          if (path && (await isDirectory(join(path, 'agent-workflow')))) {
            writeError(res, 400, 'needs-upgrade', '已检测到 agent-workflow/ 文件夹（工作流可能不完整或版本落后）：请走升级/整理流程，而非初始化')
            return
          }
          writeError(res, 400, 'bad-request', 'path 必须是含 agent-workflow/project.yaml 的绝对项目根目录')
          return
        }
        const ledger = await ledgerOf(path)
        let versions = null
        try { versions = await versionStatus(path) } catch { /* 版本信号不可读不影响账本 */ }
        // DEV-036 L1：任务级回填置信度
        try {
          const freshness = await computeFreshnessFor(path, ledger)
          ledger.current = (ledger.current || []).map((t) => ({
            ...t,
            freshness: freshness[t.id] || { level: 'skip', signals: [] },
          }))
        } catch { /* 置信度计算失败不影响账本 */ }
        writeJson(res, 200, { ok: true, ledger, versions })
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

  // DEV-103：看板「初始化工作流」改为 agent 完整配置（用户决策：面板 init 只生成空模板，信息不完整）。
  //   agent 读项目上下文生成完整骨架（project.yaml + AGENTS.md 区块 + workflows/templates/bin + 初始账本），
  //   完成后改动账本触发面板自动刷新；受管理子代理不可用时失败关闭（不创建裸会话、不注入主会话）。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/init/agent',
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
        // 已初始化则拒绝（agent 不覆盖既有工作流；升级走 /awf/upgrade）
        if (await isDirectory(join(path, 'agent-workflow'))) {
          writeError(res, 409, 'already-initialized', '目录已初始化 agent-workflow，请走升级/整理流程（/awf/upgrade）')
          return
        }
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined
        // DEV-183：初始化与升级一致——注入主会话由 agent 完整配置（不再用受管理子代理）。
        //   gitignore=true 时附加「把工作流写入 .gitignore」步骤（对应 awf init --gitignore / awf gitignore）。
        const gitignore = body && body.gitignore === true
        const initText = buildActPrompt({ action: 'init', id: 'INIT', type: 'dev', projectPath: path, reason: '', engine: 'inject' })
          + (gitignore ? '\n\n附加步骤（gitignore）：初始化完成后把本机私有工作流写入项目 .gitignore——在 .gitignore 追加 `agent-workflow/`、`AGENTS.md`、`CLAUDE.md` 忽略块（对应 awf init --gitignore / awf gitignore；已含标记则跳过，末尾无换行先补换行再追加），并在回报里说明是否写入。' : '')
        const team = await promptSession(ctx, sessionId, initText, 'awf-init')
        writeJson(res, 200, { ok: true, channel: 'inject', gitignore, team })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/init/agent route')

  // DEV-035：面板「登记当前项目」。
  //   已有 agent-workflow/project.yaml → 直接登记全局索引；没有 → 先初始化骨架再登记。
  //   local=true → 仅本地模式：project.yaml track:false + .gitignore 忽略区块（幂等）。
  //   登记时 kit 可达且项目未记录发布版本 → 补齐 scaffold_version。零外部命令。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/register',
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
        const path = project.path
        // 1) 有工作流 → 直接登记；没有 → 先生成骨架再登记
        let meta = await readProjectMetaFile(path)
        let initialized = false
        if (!meta) {
          const r = await initSkeleton({ projectPath: path })
          if (!r.ok && r.code !== 'already-initialized') {
            writeError(res, 409, r.code || 'init-failed', '初始化工作流骨架失败')
            return
          }
          initialized = true
          meta = await readProjectMetaFile(path)
          if (!meta) {
            writeError(res, 500, 'internal', '初始化后仍无法读取 project.yaml')
            return
          }
        }
        if (!meta.id) {
          writeError(res, 400, 'missing-id', '无法从 agent-workflow/project.yaml 读取项目 id')
          return
        }
        // 2) 仅本地：track:false + .gitignore 忽略区块（幂等）
        if (body.local === true) {
          await writeLocalGitignore(path)
          await setProjectTrack(path, 'false')
        }
        // 3) 登记时若 kit 可达且未记录发布版本 → 补齐 scaffold_version（不阻塞登记）
        const kit = await kitVersions()
        if (kit.latestRelease && !meta.scaffold_version) {
          try {
            await setScaffoldVersion(path, kit.latestRelease)
            meta.scaffold_version = kit.latestRelease
          } catch { /* 补齐失败不阻塞登记 */ }
        }
        // 4) 写全局索引（projects.tsv + AGENTS.md 受控区块）
        const out = await writeProjectRegistration(AGENTS_HOME, {
          id: meta.id, aliases: meta.aliases || meta.id, path,
        })
        watchProjectLedger(path)
        writeJson(res, 200, {
          ok: true,
          project: out.project,
          initialized,
          local: body.local === true,
          versions: await versionStatus(path),
        })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/register route')

  // DEV-035：框架版本落后时注入升级意图。升级由 agent 执行（同步工作流文件、
  // 保留 tasks 账本、跑 awf check），程序只注入 + 靠版本文件/账本变化监听状态。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/upgrade',
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
        const vs = await versionStatus(project.path)
        if (vs.status !== 'outdated') {
          // DEV-041：已存在工作流文件夹但版本不可读（unknown，如半初始化）也允许进入升级流程，
          //   由 agent 整理合并补全；只有确认为最新才拒绝。
          const present = await isDirectory(join(project.path, 'agent-workflow'))
          if (vs.status === 'latest' || !present) {
            writeError(res, 409, 'up-to-date', '工作流已是最新版本，无需升级')
            return
          }
        }
        const text = [
          '【Agent Workflow 动作指令】',
          `请升级项目 ${project.path} 的 agent-workflow 框架版本（当前 ${vs.installed || vs.scaffold || '未知'} → 目标 ${vs.upgradeTo || '最新'}）。`,
          `1. 整理合并（不是整体覆盖）：参照 kit（${vs.kitPath || 'agent-workflow-kit'}）的升级方式，把 agent-workflow/ 下的框架文件（bin/awf、bin/awf-dispatch、workflows/、templates/、README.md、check_workflow.sh 兼容入口等）合并为当前 kit 版本；`,
          '2. 保留清单（不得覆盖/删除）：agent-workflow/tasks/ 任务账本（含 done.md 历史）、project.yaml 项目事实（若 kit 模板有新增字段则补全而非重写）、AGENTS.md 受控区块外的自定义内容；',
          '3. 完成后更新 project.yaml 的 scaffold_version，运行 agent-workflow/bin/awf check 验证通过；',
          '3b. 账本格式规范（升级必查，避免面板无法显示）：检查 agent-workflow/tasks/*/todo.md 的任务表格行统一为 4 列标准格式 `| 任务ID | 优先级 | 描述 | 登记日期 |`（表头/分隔行除外）；发现 5 列或畸形列（如 `| 任务ID | Priority | Title | Dependencies | Date |`）时，把依赖信息并入描述（形如 `描述（依赖 X）`）并转为标准 4 列，不要静默跳过；同时检查 current.md/done.md 任务块格式保持 `## [ID] 标题` + 字段表 + `### 下一步`；最后用 `awf status` 刷新摘要确认待办行能正常解析；',
          '4. 合并完成后调用插件完成接口：POST /awf/upgrade/complete，body {"path":"<项目绝对路径>","ok":true,"version":"v<目标版本>","note":"升级摘要"}，让面板立即刷新；失败时也调用（ok:false + note 说明原因）。',
          '5. 回报升级结果（成功/失败原因）；若面板未自动刷新，提示用户刷新。',
        ].join('\n')
        const team = await promptSession(ctx, body.sessionId, text, 'awf-upgrade')
        writeJson(res, 200, { ok: true, versions: vs, team })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/upgrade route')

  // DEV-041：agent 完成「整理合并」升级后调用此接口，通知面板立即刷新。
  //   校验：路径白名单（同 /awf/upgrade）+ 仅接受 ok/version/note 三字段文本（无 shell 执行）。
  //   行为：记录完成通知 + 广播 ledger-changed 事件（面板 SSE 消费 → reload 账本与版本状态，upgrading 态结束）。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/upgrade/complete',
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
        if (body && typeof body.ok !== 'boolean') {
          writeError(res, 400, 'bad-request', 'body.ok 必须是布尔值（成功 true / 失败 false）')
          return
        }
        if (body && body.version != null && typeof body.version !== 'string') {
          writeError(res, 400, 'bad-request', 'body.version 必须是字符串')
          return
        }
        if (body && body.note != null && typeof body.note !== 'string') {
          writeError(res, 400, 'bad-request', 'body.note 必须是字符串')
          return
        }
        const vs = await versionStatus(project.path)
        const notice = {
          type: 'upgrade-complete',
          projectPath: project.path,
          ok: !body || body.ok !== false,
          version: (body && body.version) || (vs && vs.upgradeTo) || null,
          note: (body && body.note) || null,
          at: new Date().toISOString(),
        }
        // 持久记录（审计用，不影响账本格式）：追加到 agent-workflow/.upgrade-log.jsonl
        try {
          const logDir = join(project.path, 'agent-workflow')
          await mkdir(logDir, { recursive: true })
          const prev = await readFile(join(logDir, '.upgrade-log.jsonl'), 'utf8').catch(() => '')
          await writeFile(join(logDir, '.upgrade-log.jsonl'), prev + JSON.stringify(notice) + '\n')
        } catch (logErr) {
          // 记录失败不阻断通知（面板刷新仍生效）；错误仅随响应体带出
          notice.logError = logErr instanceof Error ? logErr.message : String(logErr)
        }
        // 广播给所有挂起 SSE 客户端（含 ledger-changed 语义：面板收到后 reload）
        broadcastLedgerChange(project.path)
        for (const res2 of sseClients) {
          try { res2.write(`data: ${JSON.stringify(notice)}\n\n`) } catch { /* 断开的连接由其 close 清理 */ }
        }
        writeJson(res, 200, { ok: true, notice })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/upgrade/complete route')

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
  // 先登记账本，再由宿主注册受管理执行代理；只在执行结束后向父会话汇报。
  // 缺 live 父代理时明确返回 failed，不能以主会话注入指令冒充已经启动。
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
        // 2) 直接注册受管理执行子代理，而不是发指令让主会话代为创建。
        const out = await runAgentAction(ctx, {
          action: 'start', id: body.id.trim(), type: body.type,
          projectPath: project.path, sessionId: body.sessionId,
        })
        const r = out.result
        writeJson(res, 200, { ok: true, channel: 'agent', task: result.task,
          failed: !r.ok, agent: { id: r.agentId, text: r.text, code: r.code, error: r.error, phases: r.phases } })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/team/start route')

  // DEV-033：判断型操作（返回待办/删除）→ 注入指令给主对话 agent，程序不改账本。
  // DEV-039：本路由保留为「注入主对话」降级路径（动作白名单不删）；面板优先走
  // /awf/action/agent 服务端子代理通道（agents 服务不可用时才经本路由注入）。
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
        if (!AGENT_ACTIONS.includes(action)) {
          writeError(res, 400, 'bad-request', 'body.action 必须是 return-todo|delete|progress-backfill 之一')
          return
        }
        const team = await promptSession(ctx, body.sessionId, buildActPrompt({
          action,
          id: body.id.trim(), type: body.type, projectPath: project.path,
          reason: typeof body.reason === 'string' ? body.reason : undefined,
        }), 'awf-act-' + action)
        writeJson(res, 200, { ok: true, task: { id: body.id.trim(), type: body.type, action }, team })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/agent/act route')

  // 面板动作只走宿主管理器；运行列表可见、继承父预设、结束后向父会话汇报。
  // 缺受管理接口时失败关闭，不创建无工具裸会话、不注入待执行指令。
  // /awf/backfill/agent：回填专用（action 固定 progress-backfill，前端回填按钮走这里）。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/action/agent',
    handler: makeAgentActionRoute(AGENT_ACTIONS, { ctx, fence, forbidden }),
  }), 'dsh-awf-dashboard: /awf/action/agent route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/backfill/agent',
    handler: makeAgentActionRoute(['progress-backfill'], { ctx, fence, forbidden }),
  }), 'dsh-awf-dashboard: /awf/backfill/agent route')

  // DEV-040：异步动作作业查询（内存态；插件重启后作业消失，未知 job 返回 404）。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/awf/job',
    handler: async (req, res) => {
      if (!fence(req)) { forbidden(res); return }
      const q = queryOf(req)
      const job = actionJobs.get(q.jobId)
      if (req.method !== 'GET') { writeError(res, 405, 'method-error', 'method not allowed'); return }
      if (!job) { writeError(res, 404, 'not-found', 'job 不存在或已过期'); return }
      writeJson(res, 200, { ok: true, job: jobSnapshot(job) })
    },
  }), 'dsh-awf-dashboard: /awf/job route')

  // DEV-039：只读自检——宿主 agents 服务在位性/契约形态（面板据此展示通道状态）。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/agents/probe',
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
        writeJson(res, 200, { ok: true, probe: probeAgentsService(ctx) })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/agents/probe route')

  // DEV-036 L2：自动回填意图（工作信号命中未回填 → 执行，限频每天每任务 ≤1 次）
  // DEV-039：优先服务端子代理通道（无需主会话 sessionId）；仅降级注入路径才需要 sessionId。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/backfill/auto',
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
        const ledger = await ledgerOf(project.path)
        let freshness = {}
        try { freshness = await computeFreshnessFor(project.path, ledger) } catch { /* 降级：无信号不自动注入 */ }
        const candidates = (ledger.current || [])
          .filter((t) => freshness[t.id] && freshness[t.id].level !== 'fresh' && freshness[t.id].level !== 'skip')
          .map((t) => ({ task: t, level: freshness[t.id].level, signals: freshness[t.id].signals }))
          .sort((a, b) => (a.level === b.level ? 0 : a.level === 'stale' ? -1 : 1))
        if (candidates.length === 0) {
          writeJson(res, 200, { ok: true, injected: false, reason: 'nothing-stale' })
          return
        }
        const pick = candidates[0]
        const quota = await checkAutoPromptQuota(pick.task.id)
        if (!quota.ok) {
          writeJson(res, 200, { ok: true, injected: false, reason: 'rate-limited', taskId: pick.task.id })
          return
        }
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined
        const reason = `${pick.level}（${pick.signals.join('/') || '无具体信号'}）`
        const out = await runAgentAction(ctx, {
          action: 'progress-backfill',
          id: pick.task.id,
          type: pick.task.type,
          projectPath: project.path,
          reason,
          sessionId,
        })
        if (out.channel === 'agent') {
          // F6：子代理执行成功才消耗当日配额；失败不烧配额，稍后可重试
          if (out.result.ok) await commitAutoPromptQuota(pick.task.id, quota.today)
          writeJson(res, 200, {
            ok: true,
            injected: out.result.ok,
            channel: 'agent',
            taskId: pick.task.id,
            reason,
            agent: out.result.ok
              ? { id: out.result.agentId, text: out.result.text }
              : { code: out.result.code, error: out.result.error },
          })
          return
        }
        // 降级注入路径：必须要有主会话 sessionId（L2 旧语义）
        if (!sessionId || !sessionId.trim()) {
          writeJson(res, 200, { ok: true, injected: false, channel: 'inject', reason: 'no-session', taskId: pick.task.id, fallbackReason: out.reason })
          return
        }
        const team = await promptSession(ctx, sessionId, buildActPrompt({
          action: 'progress-backfill',
          id: pick.task.id,
          type: pick.task.type,
          projectPath: project.path,
          reason,
        }), 'awf-backfill-auto')
        // F6：注入成功才消耗当日配额；未注入（无宿主会话/失败）不烧配额，稍后可重试
        if (team.prompted) await commitAutoPromptQuota(pick.task.id, quota.today)
        writeJson(res, 200, {
          ok: true,
          injected: team.prompted,
          channel: 'inject',
          taskId: pick.task.id,
          reason,
          team,
          fallbackReason: out.reason,
        })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/backfill/auto route')

  // DEV-036 L3：命令类标准证据勾选（程序写最小集例外——只写机器可判定的命令证据）
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/verify-evidence',
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
        const id = body.id.trim()
        const curFile = join(project.path, 'agent-workflow', 'tasks', body.type, 'current.md')
        let md = ''
        try { md = await readFile(curFile, 'utf8') } catch {
          writeError(res, 404, 'not-found', `未找到 ${body.type} current.md`)
          return
        }
        const block = findBlock(md, id)
        if (!block) {
          writeError(res, 404, 'task-not-found', `current.md 中未找到任务 ${id}`)
          return
        }
        const items = (parseCheckItems(block) || { items: [] }).items
        const targets = items.filter((i) => !i.checked && cmdCriterion(i.text))
        if (targets.length === 0) {
          writeJson(res, 200, { ok: true, updated: 0, checked: 0, message: '没有未勾选的命令类验收标准' })
          return
        }
        // 去重 + 安全校验（全部通过才执行，任一非法 → 400 不执行任何命令）
        const seen = new Set()
        const jobs = []
        for (const t of targets) {
          const c = cmdCriterion(t.text)
          if (!c || seen.has(c.key)) continue
          seen.add(c.key)
          jobs.push(c)
        }
        const unsafe = jobs.filter((j) => !isSafeCommand(j.command))
        if (unsafe.length > 0) {
          writeError(res, 400, 'unsafe-command',
            `命令含非法字符（拒绝执行）：${unsafe.map((j) => j.command).join('；')}——[cmd] 命令只允许简单命令+参数`)
          return
        }
        // 逐条执行（cwd=项目根，仅记录退出码/输出尾）
        const results = []
        for (const j of jobs) {
          let r
          try {
            r = spawnSync(j.command, {
              cwd: project.path,
              encoding: 'utf8',
              timeout: 120000,
              maxBuffer: 4 * 1024 * 1024,
              shell: false,
            })
          } catch (e) {
            r = { status: null, error: e }
          }
          const exit = r.status === 0 ? 0 : (r.status !== null && r.status !== undefined ? r.status : (r.error ? 124 : 126))
          const tail = (String(r.stdout || '') + String(r.stderr || '')).trim().slice(-300)
          results.push({ key: j.key, command: j.command, exit, note: j.description || tail })
        }
        const failed = results.filter((r) => r.exit !== 0)
        if (failed.length > 0) {
          writeJson(res, 409, {
            ok: false,
            code: 'verify-failed',
            message: `验证未通过（未改动账本）：${failed.map((f) => `${f.command} exit=${f.exit}`).join('；')}`,
            results,
          })
          return
        }
        // 全过 → 写证据 + 勾选（DEV-036 F1：写回前重读 current.md，账本窗口期被并发修改则 409 不写，
        // 绝不拿执行前的陈旧快照整文件覆盖——否则会吞掉 agent 会话的并发回填）
        const digest = sha256Text(md)
        try {
          const nowMd = await readFile(curFile, 'utf8')
          if (sha256Text(nowMd) !== digest) {
            writeJson(res, 409, {
              ok: false,
              code: 'ledger-changed',
              message: `验证期间账本被修改（current.md 摘要已变化），未写入证据。请刷新面板后重试「程序验证」——验证命令结果未丢失，重试会再次执行。`,
            })
            return
          }
        } catch {
          writeError(res, 404, 'not-found', `写回前读取 current.md 失败：${curFile}`)
          return
        }
        const at = Date.now()
        const evidenceMap = {}
        for (const r of results) {
          evidenceMap[r.key] = [{ command: r.command, exit: 0, at, digest, note: r.note && r.note.length > 0 ? r.note : undefined }]
        }
        const applied = applyCmdEvidence(block, evidenceMap)
        if (!applied.ok) {
          writeError(res, 500, 'broken-evidence-marker', '任务块证据注释标记损坏，未改动账本')
          return
        }
        const replaced = replaceBlockInMd(md, id, applied.block)
        if (!replaced.ok) {
          writeError(res, 500, 'task-not-found', `写回时未找到任务 ${id}`)
          return
        }
        await writeFile(curFile, replaced.md, 'utf8')
        const checked = applied.changed
        writeJson(res, 200, { ok: true, updated: results.length, checked, evidence: evidenceMap })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/verify-evidence route')

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
        const id = (queryOf(req).id || '').trim()
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
        if (id !== '' && !/^[A-Z]+-[0-9]+$/.test(id)) {
          writeError(res, 400, 'bad-id', `任务 id 应为 类型-数字，如 DEV-001：${id}`)
          return
        }
        const result = await readSource({ projectPath: path, type, file, id: id || undefined })
        if (!result.ok) {
          if (result.code === 'not-found') {
            writeError(res, 404, 'not-found', `账本文件不存在：tasks/${type}/${file}/${id || '<ID>'}（目录式）或 ${file}.md（旧形态）`)
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

  // DEV-043：源文件安全写回（前端「打开源文件并编辑」保存）。
  // 白名单与 GET 一致（type/file 枚举），只允许写回已存在文件；内容必须为字符串。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/source-write',
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
        const path = body && body.path
        const type = body && body.type
        const file = body && body.file
        const content = body && body.content
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
        if (typeof content !== 'string') {
          writeError(res, 400, 'bad-content', 'content 必须是字符串（.md 文件原文）')
          return
        }
        const result = await writeSource({ projectPath: path, type, file, content })
        if (!result.ok) {
          if (result.code === 'not-found') {
            writeError(res, 404, 'not-found', `账本文件不存在：tasks/${type}/${file}.md（只允许写回已存在文件）`)
          } else {
            writeError(res, 400, result.code || 'bad-request', '源文件写回参数非法')
          }
          return
        }
        writeJson(res, 200, { ok: true, source: result.source })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/source-write route')

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
        // DEV-033：判断型写操作（delete/return-todo/回退）已改由 agent 执行
        // （DEV-039：优先 /awf/action/agent 服务端子代理，/awf/agent/act 注入保留为降级）。
        // /awf/task 只保留纯字段操作：update（字段表）/pause（blocked）/resume（active）。
        if (!['update', 'pause', 'resume'].includes(body.action)) {
          writeError(res, 400, 'bad-request', 'body.action 必须是 update|pause|resume 之一；delete/return-todo 请走 POST /awf/action/agent（服务端子代理执行；agents 不可用经 /awf/agent/act 降级注入主对话）')
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
  // DEV-033 废弃，DEV-039 新通道：删除/回退由 agent 执行（POST /awf/action/agent action=delete）
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
        writeError(res, 410, 'deprecated', '删除/回退已改由 agent 执行：请 POST /awf/action/agent {action:"delete"}（服务端子代理；agents 不可用经 /awf/agent/act 降级注入主对话）')
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
        writeError(res, 410, 'deprecated', '删除/回退已改由 agent 执行：请 POST /awf/action/agent {action:"delete"}（服务端子代理；agents 不可用经 /awf/agent/act 降级注入主对话）')
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/task/delete/execute route')

  // DEV-033 块 B：插件卸载时关闭全部账本文件监听（防热重载泄漏 watcher 句柄）。
  return () => {
    actionJobs.clear()
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
