// dsh-awf-dashboard — 账本解析器（纯 Node ESM，无依赖，服务端与测试共用）
//
// 解析规则与 agent-workflow-kit 的 bin/awf 保持一致（含 KIT-DEV-017 的字段表行锚定）：
//   - 任务块：`## [ID] 标题`，字段表只认 `|` 开头的表格行（正文引用 `| 状态 |` 等字样不算字段）；
//   - done.md 摘要行：`| ID | 优先级 | 描述 | 完成日期 |`；
//   - todo.md 进度：`- [ ]` 未完成 / `- [x]` 已完成；
//   - status.md 新鲜度：status.md mtime >= 各账本文件（current/todo/done）mtime。
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises'
import { join, basename, dirname, isAbsolute, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'

export const AGENTS_HOME_DEFAULT = join(homedir(), '.agents')
export const TASK_TYPES = ['dev', 'debug', 'docs']

// ---------------------------------------------------------------------------
// 通用小工具
// ---------------------------------------------------------------------------

function trim(s) {
  return String(s).replace(/^\s+/, '').replace(/\s+$/, '')
}

/** 字段表行的第二列；仅当整行以 `|` 开头时才有意义（锚定表格行）。 */
function secondField(line) {
  const parts = String(line).split('|')
  return parts.length >= 3 ? trim(parts[1]) : ''
}

// ---------------------------------------------------------------------------
// 全局项目索引（~/.agents/AGENTS.md 的受控区块表格）
// ---------------------------------------------------------------------------

/**
 * 解析全局索引表格：
 *   | 项目ID | 别名 | 路径 | 入口 |
 * @param {string} md 文件内容
 * @returns {Array<{id: string, aliases: string, path: string}>}
 */
export function parseIndex(md) {
  const out = []
  for (const line of String(md).split('\n')) {
    if (!line.startsWith('|')) continue
    const parts = line.split('|').map(trim)
    // 跳过表头/分隔行：第二列是 项目ID 或全是 - 的都不是数据行
    if (parts[1] === '项目ID' || /^-+$/.test(parts[1] || '')) continue
    if (parts.length < 3) continue
    out.push({ id: parts[1], aliases: parts[2] || '', path: parts[3] || '' })
  }
  return out
}

/**
 * 读取全局索引。
 * @param {string} [agentsHome] ~/.agents 等价目录（测试可注入）
 */
export async function readIndex(agentsHome) {
  const file = join(agentsHome || AGENTS_HOME_DEFAULT, 'AGENTS.md')
  let md
  try {
    md = await readFile(file, 'utf8')
  } catch {
    return []
  }
  return parseIndex(md)
}

// ---------------------------------------------------------------------------
// 任务块解析（current.md）
// ---------------------------------------------------------------------------

/**
 * 解析 current.md 的任务块。
 * 块 = `## [ID] 标题` 到下一个 `## [` 之间；字段表只取以 `|` 开头的行；
 * 字段键：优先级 / 状态 / Owner / 协作模式 / 最近更新（正文引用字样被锚定规则排除）。
 * @param {string} md
 * @returns {Array<{id: string, title: string, prio: string, status: string, owner: string, mode: string, updated: string}>}
 */
export function parseBlocks(md) {
  const blocks = []
  let cur = null
  for (const line of String(md).split('\n')) {
    const head = /^## \[([A-Z]+-[0-9]+)\] (.+)$/.exec(line)
    if (head) {
      cur = { id: head[1], title: trim(head[2]), prio: '', status: '', owner: '', mode: '', updated: '' }
      blocks.push(cur)
      continue
    }
    if (!cur) continue
    if (!line.startsWith('|')) continue // 字段表行锚定：正文不算字段
    const key = secondField(line)
    const value = trim(line.split('|')[2] || '')
    if (!key || !value) continue
    if (key === '优先级') cur.prio = value
    else if (key === '状态') cur.status = value
    else if (key === 'Owner') cur.owner = value
    else if (key === '协作模式') cur.mode = value
    else if (key === '最近更新') cur.updated = value
  }
  return blocks
}

// ---------------------------------------------------------------------------
// todo.md 进度 / done.md 最近完成
// ---------------------------------------------------------------------------

/**
 * 统计 todo.md 的 checkbox 进度。
 * @returns {{done: number, total: number}}
 */
export function countTodo(md) {
  let done = 0
  let total = 0
  for (const line of String(md).split('\n')) {
    if (/^\s*- \[ \]/.test(line)) total += 1
    else if (/^\s*- \[[xX]\]/.test(line)) { done += 1; total += 1 }
  }
  return { done, total }
}

/**
 * 解析任务块（原文）内的验收勾选子项（仅 `### 验收标准` 段内，`### 下一步` 起停止计数——
 * 「下一步」是执行动作清单，不是验收条件，计入会虚增分母，如 14/17 实为 14/14）。
 * 只有 checkbox 行，无勾选子项时返回 null（前端据此不渲染验收进度条）。
 * HTML 注释（`<!-- ... -->`）内的 checkbox 不计入（骨架自带的示例块不会污染计数）。
 * @param {string} blockText 任务块原文（findBlock 输出）
 * @returns {null | {done: number, total: number, items: Array<{checked: boolean, text: string}>}}
 */
export function parseCheckItems(blockText) {
  const items = []
  let inComment = false
  let inNext = false // 已越过「### 下一步」：其后的 checkbox 是动作清单，不计入
  for (const line of String(blockText || '').split('\n')) {
    if (!inComment && /<!--/.test(line) && !/-->/.test(line)) { inComment = true; continue }
    if (inComment) {
      if (/-->/.test(line)) inComment = false
      continue
    }
    if (/^###\s*下一步/.test(line)) { inNext = true; continue }
    if (inNext) continue
    const m = /^\s*-\s*\[([ xX])\]\s+(.*)$/.exec(line)
    if (m) items.push({ checked: m[1].toLowerCase() === 'x', text: trim(m[2]) })
  }
  if (items.length === 0) return null
  return { done: items.filter((i) => i.checked).length, total: items.length, items }
}

/**
 * 解析 done.md 的摘要行（`| ID | P | 描述 | 日期 |`），取最新 n 条。
 * 与 awf status 的「最近完成」一致：只认 `|` 开头的行。
 * @param {string} md
 * @param {number} n
 * @returns {Array<{id: string, prio: string, desc: string, date: string}>}
 */
export function parseDoneRows(md, n) {
  const rows = []
  for (const line of String(md).split('\n')) {
    const m = /^\|\s*([A-Z]+-[0-9]+)\s*\|\s*([^|]*)\s*\|\s*([^|]*?)\s*\|\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*\|/.exec(line)
    if (!m) continue
    rows.push({ id: m[1], prio: trim(m[2]), desc: trim(m[3]), date: m[4] })
  }
  // 按完成日期倒序（不依赖 done.md 文件顺序），取最新 n 条
  return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, n)
}

// ---------------------------------------------------------------------------
// 项目账本汇总
// ---------------------------------------------------------------------------

/**
 * 汇总一个 agent-workflow 项目的账本为看板 JSON。
 * @param {string} projectPath 项目根目录（须含 agent-workflow/）
 * @returns {Promise<object>} 结构化看板数据
 */
export async function ledgerOf(projectPath) {
  const awf = join(projectPath, 'agent-workflow')
  // 项目事实
  let name = ''
  let purpose = ''
  try {
    const p = await readFile(join(awf, 'project.yaml'), 'utf8')
    const idLine = /^name:\s*(.+)$/m.exec(p)
    const purposeLine = /^purpose:\s*(.+)$/m.exec(p)
    if (idLine) name = trim(idLine[1])
    if (purposeLine) purpose = trim(purposeLine[1])
  } catch {
    /* 非 agent-workflow 项目：由调用方先行校验 */
  }

  const tasksDir = join(awf, 'tasks')
  const ledgerFiles = []
  for (const type of TASK_TYPES) {
    try {
      const names = await readdir(join(tasksDir, type))
      for (const f of ['todo.md', 'current.md', 'done.md']) {
        if (names.includes(f)) ledgerFiles.push(join(tasksDir, type, f))
      }
    } catch { /* 缺目录则跳过 */ }
  }
  const statusFile = join(tasksDir, 'status.md')

  const current = []
  const todo = []
  const todoRows = []
  const recent = []
  let maxLedgerMtime = 0
  let statusMtime = 0

  const fileContent = {}
  for (const f of ledgerFiles) {
    try {
      const st = await stat(f)
      if (st.mtimeMs > maxLedgerMtime) maxLedgerMtime = st.mtimeMs
      fileContent[f] = await readFile(f, 'utf8')
    } catch { /* 忽略竞态 */ }
  }
  try {
    const st = await stat(statusFile)
    statusMtime = st.mtimeMs
    fileContent.status = await readFile(statusFile, 'utf8')
  } catch { /* status.md 缺失：新鲜度判 false */ }

  for (const type of TASK_TYPES) {
    const dir = join(tasksDir, type)
    const cur = fileContent[join(dir, 'current.md')]
    if (cur !== undefined) {
      for (const b of parseBlocks(cur)) {
        current.push({ type, ...b, checkItems: parseCheckItems(findBlock(cur, b.id)) })
      }
    }
    const td = fileContent[join(dir, 'todo.md')]
    if (td !== undefined) {
      todo.push({ type, ...countTodo(td) })
      // 结构化待办行（前端「开始任务」渲染用；todo.md 只含未开始行，startTask 会删行迁移）
      todoRows.push({ type, rows: parseTodoRows(td) })
    }
    const dn = fileContent[join(dir, 'done.md')]
    if (dn !== undefined) {
      for (const r of parseDoneRows(dn, 8)) recent.push({ type, ...r })
    }
  }

  // status.md 新鲜度：status mtime 不低于任一账本文件 mtime（500ms 容差）
  const fresh = ledgerFiles.length > 0 ? statusMtime >= maxLedgerMtime - 500 : true

  return {
    project: { path: projectPath, name, purpose },
    status: { fresh, updated: statusMtime ? new Date(statusMtime).toISOString() : null },
    current,
    todo,
    todoRows,
    recent: recent.slice(0, 8),
  }
}

// ---------------------------------------------------------------------------
// DEV-022：骨架生成器 / 任务迁移 / 归档查询（纯文件操作，不执行任何外部命令）
// ---------------------------------------------------------------------------

/** 本地时区的 YYYY-MM-DD（任务块「最近更新」与骨架 status.md 用）。 */
export function todayLocal() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 目录名 → 合法项目 id：小写、非字母数字转 `-`。 */
export function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * 写路径白名单（init / task:start 共用）：目标必须绝对路径，
 * 且要么在全局索引（readIndex）的项目路径列表内，要么等于客户端上报的当前工作区根。
 * @param {string} target 待写入的项目根（绝对路径）
 * @param {Array<string>} indexPaths 全局索引的项目 path 列表
 * @param {string} [workspaceRoot] 客户端计算的当前工作区根（可选，绝对路径）
 */
export function isWhitelistedPath(target, indexPaths, workspaceRoot) {
  if (!target || typeof target !== 'string' || !isAbsolute(target)) return false
  if (Array.isArray(indexPaths) && indexPaths.includes(target)) return true
  if (workspaceRoot && typeof workspaceRoot === 'string' && isAbsolute(workspaceRoot) && workspaceRoot === target) return true
  return false
}

/**
 * 解析 todo.md 的表格行：`| ID | 优先级 | 描述 | 登记日期 |`
 * （表头各类型略有差异：任务ID/问题描述/文档主题；锚定规则同 parseDoneRows）。
 * @param {string} md
 * @returns {Array<{id: string, prio: string, desc: string, date: string}>}
 */
export function parseTodoRows(md) {
  const rows = []
  for (const line of String(md).split('\n')) {
    const m = /^\|\s*([A-Z]+-[0-9]+)\s*\|\s*([^|]*)\s*\|\s*([^|]*?)\s*\|\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*\|/.exec(line)
    if (!m) continue
    rows.push({ id: m[1], prio: trim(m[2]), desc: trim(m[3]), date: m[4] })
  }
  return rows
}

/**
 * 取出 md 中 ID 对应任务块的原文（`## [ID] 标题` 起，到下一个 `## [` 前）。
 * @param {string} md
 * @param {string} id 形如 DEV-001
 * @returns {string|null}
 */
export function findBlock(md, id) {
  const lines = String(md).split('\n')
  let start = -1
  let inComment = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 跳过 HTML 注释区（骨架「任务块格式示例 / DEV-XXX」模板不会被误当成真任务）
    if (!inComment && /<!--/.test(line) && !/-->/.test(line)) { inComment = true; continue }
    if (inComment) {
      if (/-->/.test(line)) inComment = false
      continue
    }
    // ID 已校验为 [A-Z]+-[0-9]+，无正则元字符，可安全嵌入
    if (line === `## [${id}]` || line.startsWith(`## [${id}] `)) { start = i; break }
  }
  if (start === -1) return null
  const out = [lines[start]]
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## [')) break
    out.push(lines[i])
  }
  return out.join('\n')
}

/**
 * 生成任务块原文（格式与仓库 current.md 一致，awf check / parseBlocks 可解析）：
 * `## [ID] 标题` + 字段表（状态=active、Owner、协作模式=single、来源任务=todo 登记…）
 * + `### 目标` / `### 验收标准` / `### 下一步` 占位。
 * @param {object} o {id, title, prio, status, owner, mode, source, date}
 */
export function renderTaskBlock(o) {
  const date = o.date || todayLocal()
  const rows = [
    ['优先级', o.prio || 'P2'],
    ['状态', o.status || 'active'],
    ['Owner', o.owner || 'unassigned'],
    ['协作模式', o.mode || 'single'],
    ['来源任务', o.source || 'todo 登记'],
    ['修改范围', '待补充'],
    ['分支/工作区', '待补充'],
    ['依赖', '无'],
    ['最近更新', date],
  ]
  return [
    `## [${o.id}] ${o.title}`,
    '',
    '| 字段 | 内容 |',
    '|------|------|',
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '### 目标',
    '待补充。',
    '',
    '### 验收标准',
    '- [ ] 待补充',
    '',
    '### 下一步',
    '待补充。',
    '',
  ].join('\n')
}

// 骨架文件模板（与 agent-workflow/bin/awf write_task_files 的头部一致，含解析锚定表头）

const TODO_MD = {
  dev: '# 待开发\n\n| 任务ID | 优先级 | 描述 | 登记日期 |\n|--------|--------|------|----------|\n',
  debug: '# 待调试\n\n| 任务ID | 优先级 | 问题描述 | 登记日期 |\n|--------|--------|----------|----------|\n',
  docs: '# 待撰写\n\n| 任务ID | 优先级 | 文档主题 | 登记日期 |\n|--------|--------|----------|----------|\n',
}

const DONE_MD = {
  dev: '# 已完成\n\n| 任务ID | 优先级 | 描述 | 完成日期 |\n|--------|--------|------|----------|\n',
  debug: '# 已完成\n\n| 任务ID | 优先级 | 问题描述 | 完成日期 |\n|--------|--------|----------|----------|\n',
  docs: '# 已完成\n\n| 任务ID | 优先级 | 文档主题 | 完成日期 |\n|--------|--------|----------|----------|\n',
}

const CURRENT_MD = {
  dev: [
    '# 正在开发',
    '',
    '> 任务从 `todo.md` 移入此文件开始执行，完成后移入 `done.md`。',
    '> 优先级只写 `P0` / `P1` / `P2` / `P3`。',
    '> `awf status` 会解析本文件，任务块格式必须保持：`## [ID] 标题` + 字段表 + `### 下一步`。',
    '',
    '（暂无进行中任务）',
    '',
  ].join('\n'),
  debug: [
    '# 正在调试',
    '',
    '> 问题从 `todo.md` 移入此文件开始排查，解决后移入 `done.md`。',
    '> 每个任务块必须写清：现象、假设、证伪方法、下一步。',
    '',
    '（暂无进行中任务）',
    '',
  ].join('\n'),
  docs: [
    '# 正在撰写',
    '',
    '> 文档任务从 `todo.md` 移入此文件开始撰写，完成后移入 `done.md`。',
    '',
    '（暂无进行中任务）',
    '',
  ].join('\n'),
}

function renderProjectYaml(o) {
  return [
    '# agent-workflow 项目事实（唯一输入）',
    '#',
    '# 改完这里运行：./agent-workflow/bin/awf bootstrap',
    '# 说明：只使用扁平 `key: value`，列表字段写成逗号分隔的单行字符串，',
    '#       这样无需 YAML 解析器也能被 awf 与任意 shell 稳定读取。',
    '',
    `version: 1`,
    `id: ${o.id}`,
    `name: ${o.name}`,
    `purpose: ${o.purpose}`,
    `aliases: ${o.aliases}`,
    `stack: ${o.stack}`,
    '',
    '# 校验命令（留空表示暂未配置）',
    'gate:',
    'compile:',
    'test:',
    '',
  ].join('\n')
}

function renderStatusMd(date) {
  return [
    '# 全局状态摘要',
    '',
    '<!-- awf:status:begin -->',
    '> 本区块由 `agent-workflow/bin/awf status` 生成，请勿手改。',
    '> 数据来源：`tasks/*/current.md`、`tasks/*/todo.md`、`tasks/*/done.md`。',
    '',
    '## 当前进行中',
    '',
    '（无）',
    '',
    '## 待处理',
    '',
    '（无）',
    '',
    '## 最近完成',
    '',
    '（无）',
    '',
    `*最后更新：${date}*`,
    '<!-- awf:status:end -->',
    '',
  ].join('\n')
}

/**
 * 生成最小 agent-workflow 骨架的文件清单（纯函数，供 initSkeleton 与测试使用）。
 * 只产出：project.yaml（扁平 kv）+ tasks/{dev,debug,docs}/{current,todo,done}.md
 *          + tasks/status.md（含 awf:status:begin/end 空区块）。
 * @param {object} o {projectPath, name, id, purpose, aliases, stack, date}
 * @returns {Array<{path: string, content: string}>}
 */
export function skeletonFiles(o) {
  const date = o.date || todayLocal()
  const oneLine = (s) => String(s == null ? '' : s).replace(/\s*\n\s*/g, ' ').trim()
  const name = oneLine(o.name || basename(o.projectPath) || 'project')
  const id = slugify(oneLine(o.id || name)) || 'project'
  const purpose = oneLine(o.purpose || `${name} 项目`)
  const aliases = oneLine(o.aliases || name)
  const stack = oneLine(o.stack || 'generic')
  const files = []
  files.push({
    path: join(o.projectPath, 'agent-workflow', 'project.yaml'),
    content: renderProjectYaml({ id, name, purpose, aliases, stack }),
  })
  for (const type of TASK_TYPES) {
    files.push({ path: join(o.projectPath, 'agent-workflow', 'tasks', type, 'todo.md'), content: TODO_MD[type] })
    files.push({ path: join(o.projectPath, 'agent-workflow', 'tasks', type, 'current.md'), content: CURRENT_MD[type] })
    files.push({ path: join(o.projectPath, 'agent-workflow', 'tasks', type, 'done.md'), content: DONE_MD[type] })
  }
  files.push({ path: join(o.projectPath, 'agent-workflow', 'tasks', 'status.md'), content: renderStatusMd(date) })
  return files
}

/**
 * 初始化工作流骨架：目标已含 agent-workflow/project.yaml → 拒绝且不写任何文件；
 * 否则创建最小骨架（见 skeletonFiles）。只做文件系统操作，不执行任何外部命令。
 * 路径白名单由路由层（lib/index.js）先行校验。
 * @param {object} o {projectPath, name?, id?, purpose?, aliases?, stack?}
 * @returns {Promise<{ok: boolean, code?: string, project?: object}>}
 */
export async function initSkeleton(o) {
  const projectPath = o.projectPath
  try {
    await readFile(join(projectPath, 'agent-workflow', 'project.yaml'))
    return { ok: false, code: 'already-initialized' }
  } catch {
    /* 尚未初始化，继续 */
  }
  const files = skeletonFiles(o)
  for (const f of files) {
    await mkdir(dirname(f.path), { recursive: true })
    await writeFile(f.path, f.content, 'utf8')
  }
  const meta = {
    path: projectPath,
    name: o.name || basename(projectPath) || 'project',
  }
  return {
    ok: true,
    project: {
      path: projectPath,
      id: slugify(meta.name) || 'project',
      name: meta.name,
    },
  }
}

/**
 * 开始任务：把 todo.md 中 ID 匹配的表格行删除，并在 current.md 追加 active 任务块。
 * @param {object} o {projectPath, type, id, date?}
 * @returns {Promise<{ok: boolean, code?: string, task?: object}>}
 */
export async function startTask(o) {
  const { projectPath, type, id, date } = o
  if (!TASK_TYPES.includes(type)) return { ok: false, code: 'bad-type' }
  if (!/^[A-Z]+-[0-9]+$/.test(String(id))) return { ok: false, code: 'bad-id' }
  const dir = join(projectPath, 'agent-workflow', 'tasks', type)
  const todoFile = join(dir, 'todo.md')
  const currentFile = join(dir, 'current.md')

  let todoMd
  try {
    todoMd = await readFile(todoFile, 'utf8')
  } catch {
    return { ok: false, code: 'not-found' }
  }
  const row = parseTodoRows(todoMd).find((r) => r.id === id)
  if (!row) return { ok: false, code: 'not-found' }

  // a) 从 todo.md 删除该表格行（只删 ID 精确匹配的 `|` 行，表头/分隔/其他行保留）
  const kept = String(todoMd).split('\n').filter((line) => {
    if (!line.trimStart().startsWith('|')) return true
    const m = /^\|\s*([A-Z]+-[0-9]+)\s*\|/.exec(line)
    return !(m && m[1] === id)
  })
  const todoNext = kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n'

  // b) 向 current.md 追加任务块（确保以换行结尾后追加，块自带尾部空行）
  let currentMd = ''
  try {
    currentMd = await readFile(currentFile, 'utf8')
  } catch {
    /* current.md 缺失：按空文件重建，仅含新块 */
  }
  const sep = currentMd === '' || currentMd.endsWith('\n') ? '' : '\n'
  const block = renderTaskBlock({
    id,
    title: row.desc || id,
    prio: row.prio || 'P2',
    status: 'active',
    date: date || todayLocal(),
  })

  await writeFile(currentFile, currentMd + sep + block, 'utf8')
  await writeFile(todoFile, todoNext, 'utf8')

  return {
    ok: true,
    task: {
      id,
      type,
      title: row.desc || id,
      prio: row.prio || 'P2',
      status: 'active',
      date: date || todayLocal(),
    },
  }
}

/**
 * 归档只读查询：在项目三个 done.md 中找 ID 匹配的表格行 + 完整任务块。
 * @param {object} o {projectPath, id}
 * @returns {Promise<{ok: boolean, code?: string, done?: {type, row, block}}>}
 */
export async function archiveTask(o) {
  const { projectPath, id } = o
  if (!/^[A-Z]+-[0-9]+$/.test(String(id))) return { ok: false, code: 'bad-id' }
  for (const type of TASK_TYPES) {
    let md
    try {
      md = await readFile(join(projectPath, 'agent-workflow', 'tasks', type, 'done.md'), 'utf8')
    } catch {
      continue
    }
    const row = parseDoneRows(md, Number.MAX_SAFE_INTEGER).find((r) => r.id === id)
    if (!row) continue
    return { ok: true, done: { type, row, block: findBlock(md, id) } }
  }
  return { ok: false, code: 'not-found' }
}

// ---------------------------------------------------------------------------
// DEV-022（t4）：todo 表格行 CRUD / 当前任务字段更新 / 暂停 / 继续 / 删除回退
// ---------------------------------------------------------------------------

/** 收敛 md 尾部空白与多余空行，保证以单个换行结尾。 */
function normalizeMd(s) {
  return String(s).replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n'
}

/**
 * 把 done.md 摘要行插入表格区顶部：表头分隔行（`|------|`）之后第一行；
 * 无表格区（文件缺失/不含表格）时按类型模板重建。
 * @param {string|null} doneMd done.md 原文（可为 null）
 * @param {string} type dev|debug|docs（决定模板）
 * @param {string} row 摘要行（`| ID | P | 描述 | 日期 |`）
 */
function insertDoneTableRow(doneMd, type, row) {
  const lines = String(doneMd == null ? '' : doneMd).split('\n')
  for (let i = 0; i < lines.length; i++) {
    // 表头分隔行：`|` 开头、只含 -/|/空格
    if (/^\|[\s\-|]+\|$/.test(lines[i]) && lines[i].includes('--')) {
      lines.splice(i + 1, 0, row)
      return normalizeMd(lines.join('\n'))
    }
  }
  return normalizeMd(DONE_MD[type] + row)
}

const ID_RE = /^[A-Z]+-[0-9]+$/
const PRIO_RE = /^P[0-3]$/

/** 行内值清洗：去掉 `|` 与换行，避免破坏表格结构。 */
function safeCell(s) {
  return String(s == null ? '' : s).replace(/[|\r\n]+/g, ' ').trim()
}

/**
 * todo.md 表格行 CRUD（纯函数，md → md）。
 * @param {string} md todo.md 原文
 * @param {object} o {action: 'add'|'update'|'delete', row: {id?, 优先级?, 描述?}, date?}
 * @returns {{ok: true, md: string, rows: Array}|{ok: false, code: string}}
 *   code: invalid-id / invalid-prio / duplicate / not-found
 */
export function todoCrud(md, o) {
  const { action, row = {}, date } = o
  const day = date || todayLocal()

  if (action === 'add') {
    const id = safeCell(row.id)
    if (!ID_RE.test(id)) return { ok: false, code: 'invalid-id' }
    let prio = safeCell(row['优先级'] ?? row.prio)
    if (prio === '') prio = 'P2'
    if (!PRIO_RE.test(prio)) return { ok: false, code: 'invalid-prio' }
    const desc = safeCell(row['描述'] ?? row.desc) || id
    if (parseTodoRows(md).some((r) => r.id === id)) return { ok: false, code: 'duplicate' }
    const next = String(md).replace(/\s+$/, '') + `\n| ${id} | ${prio} | ${desc} | ${day} |\n`
    return { ok: true, md: next, rows: parseTodoRows(next) }
  }

  if (action === 'update') {
    const id = safeCell(row.id)
    if (!ID_RE.test(id)) return { ok: false, code: 'invalid-id' }
    const target = parseTodoRows(md).find((r) => r.id === id)
    if (!target) return { ok: false, code: 'not-found' }
    let prio = safeCell(row['优先级'] ?? row.prio)
    if (prio === '') prio = target.prio
    if (!PRIO_RE.test(prio)) return { ok: false, code: 'invalid-prio' }
    const desc = row['描述'] != null && safeCell(row['描述']) !== '' ? safeCell(row['描述']) : target.desc
    const d = safeCell(row.date) || target.date
    const next = normalizeMd(String(md).split('\n').map((line) => {
      if (!line.trimStart().startsWith('|')) return line
      const m = /^\|\s*([A-Z]+-[0-9]+)\s*\|/.exec(line)
      return m && m[1] === id ? `| ${id} | ${prio} | ${desc} | ${d} |` : line
    }).join('\n'))
    return { ok: true, md: next, rows: parseTodoRows(next) }
  }

  if (action === 'delete') {
    const id = safeCell(row.id)
    if (!ID_RE.test(id)) return { ok: false, code: 'invalid-id' }
    if (!parseTodoRows(md).some((r) => r.id === id)) return { ok: false, code: 'not-found' }
    const next = normalizeMd(String(md).split('\n').filter((line) => {
      if (!line.trimStart().startsWith('|')) return true
      const m = /^\|\s*([A-Z]+-[0-9]+)\s*\|/.exec(line)
      return !(m && m[1] === id)
    }).join('\n'))
    return { ok: true, md: next, rows: parseTodoRows(next) }
  }

  return { ok: false, code: 'bad-action' }
}

/**
 * 项目级 todo CRUD（含文件读写）。add 时 todo.md 缺失按骨架模板新建。
 * @param {object} o {projectPath, type, action, row, date?}
 * @returns {Promise<{ok: true, action, type, rows}|{ok: false, code}>}
 */
export async function todoEdit(o) {
  const { projectPath, type, action, row, date } = o
  if (!TASK_TYPES.includes(type)) return { ok: false, code: 'bad-type' }
  if (!['add', 'update', 'delete'].includes(action)) return { ok: false, code: 'bad-action' }
  const file = join(projectPath, 'agent-workflow', 'tasks', type, 'todo.md')
  let md = null
  try {
    md = await readFile(file, 'utf8')
  } catch {
    if (action === 'add') md = TODO_MD[type]
    else return { ok: false, code: 'not-found' }
  }
  const res = todoCrud(md, { action, row, date })
  if (!res.ok) return res
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, res.md, 'utf8')
  return { ok: true, action, type, rows: res.rows }
}

/** 块区间 [start, end)：start 为 `## [id]` 行，end 为下一 `## [` 行（或文件尾）。 */
function blockRange(lines, id) {
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === `## [${id}]` || lines[i].startsWith(`## [${id}] `)) { start = i; break }
  }
  if (start === -1) return [-1, -1]
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## [')) { end = i; break }
  }
  return [start, end]
}

/**
 * 解析任务块原文的字段表 → {字段名: 值}（只认 `|` 开头的行，跳过表头/分隔行）。
 * @param {string} blockText 任务块原文
 */
export function parseBlockFieldMap(blockText) {
  const map = {}
  for (const line of String(blockText).split('\n')) {
    if (!line.trimStart().startsWith('|')) continue
    const parts = line.split('|')
    if (parts.length < 3) continue
    const key = trim(parts[1])
    if (!key || key === '字段' || /^-+$/.test(key)) continue
    map[key] = trim(parts[2] || '')
  }
  return map
}

/** 取任务块标题（`## [ID] 标题` 中 `] ` 之后的部分）。 */
export function blockTitle(blockText) {
  const m = /^## \[[^\]]+\]\s+(.+)$/.exec(String(blockText).split('\n')[0] || '')
  return m ? m[1].trim() : ''
}

/**
 * 原位更新 current.md 中 ID 对应任务块的字段（字段表行锚定替换；title/描述 改标题行）。
 * @param {string} md current.md 原文
 * @param {object} o {id, fields: {字段名: 值, ...}}
 * @returns {{ok: true, md: string, fields: object}|{ok: false, code: 'not-found'}}
 */
export function updateTaskFields(md, o) {
  const { id, fields = {} } = o
  const lines = String(md).split('\n')
  const [start, end] = blockRange(lines, id)
  if (start === -1) return { ok: false, code: 'not-found' }

  const blockLines = lines.slice(start, end)
  let title = blockTitle(blockLines.join('\n'))
  const newTitleCell = fields.title !== undefined
    ? safeCell(fields.title)
    : (fields['描述'] !== undefined ? safeCell(fields['描述']) : undefined)
  if (newTitleCell !== undefined && newTitleCell !== '') {
    title = newTitleCell
    lines[start] = `## [${id}] ${title}`
  }

  const rowKeys = new Set()
  for (let i = start + 1; i < end; i++) {
    const line = lines[i]
    if (!line.trimStart().startsWith('|')) continue
    const parts = line.split('|')
    if (parts.length < 3) continue
    const key = trim(parts[1])
    if (!key || key === '字段' || /^-+$/.test(key)) continue
    rowKeys.add(key)
    if (fields[key] !== undefined) {
      lines[i] = `| ${key} | ${safeCell(fields[key])} |`
    }
  }

  // 目标字段在块中不存在时，插到分隔行之后（保持表格结构完整）
  const missing = Object.keys(fields).filter((k) => k !== 'title' && k !== '描述' && fields[k] !== undefined && !rowKeys.has(k))
  if (missing.length > 0) {
    let insertAt = -1
    for (let i = start + 1; i < end; i++) {
      const key = trim((lines[i].split('|')[1] || ''))
      if (/^-+$/.test(key)) { insertAt = i + 1; break }
    }
    if (insertAt === -1) {
      for (let i = start + 1; i < end; i++) {
        if (trim((lines[i].split('|')[1] || '')) === '字段') { insertAt = i + 1; break }
      }
    }
    if (insertAt !== -1) {
      const inserts = missing.map((k) => `| ${safeCell(k)} | ${safeCell(fields[k])} |`)
      lines.splice(insertAt, 0, ...inserts)
    }
  }

  const next = normalizeMd(lines.join('\n'))
  const updatedBlock = findBlock(next, id)
  const updatedFields = {
    title: blockTitle(updatedBlock || ''),
    ...(updatedBlock ? parseBlockFieldMap(updatedBlock) : {}),
  }
  return { ok: true, md: next, fields: updatedFields }
}

// ---------------------------------------------------------------------------
// 删除回退：git 只读查询 + 白名单 git restore（execFile 无 shell；不得执行其他命令）
// ---------------------------------------------------------------------------

/** 提交 git 命令（execFile 数组参数，无 shell，隔离注入；超时 15s）。 */
function defaultRunGit(args, cwd) {
  return new Promise((resolvePromise) => {
    execFile('git', args, { cwd, timeout: 15000 }, (err, stdout, stderr) => {
      if (err) {
        resolvePromise({
          ok: false,
          code: err && err.code === 'ENOENT' ? 'git-missing' : 'git-error',
          stderr: String(stderr || ''),
        })
        return
      }
      resolvePromise({ ok: true, stdout: String(stdout || '') })
    })
  })
}

/**
 * 从「修改范围」字段抽取出候选路径 token：
 * 只取安全字符集 [A-Za-z0-9_./-]，排除 `..` 穿越与 `*?` 通配；
 * 要求包含 `/` 或带扩展名（裸名至少 3 字符，兼容 README/VERSION 这类文件名）。
 * 若是目录 token（含尾 `/`），git pathspec 会展开为目录下实际文件。
 * @param {string} text
 * @returns {string[]}
 */
export function parseScopeFiles(text) {
  const out = []
  const re = /[A-Za-z0-9_./-]+/g
  for (const m of String(text || '').matchAll(re)) {
    const tok = m[0]
    if (!/^[A-Za-z0-9_./-]+$/.test(tok)) continue
    if (tok.includes('..')) continue          // 禁止路径穿越
    if (/[*?]/.test(tok)) continue            // 禁止通配
    if (!tok.includes('/') && !/\.[A-Za-z0-9]+$/.test(tok) && tok.length < 3) continue
    if (!out.includes(tok)) out.push(tok)
  }
  return out
}

/** 解析 git porcelain 状态码 → 人类可读状态（前端映射枚举：modified|untracked|added|deleted|staged）。 */
function classifyPorcelain(xy) {
  const x = xy[0] || ' '
  const y = xy[1] || ' '
  if (x === '?' && y === '?') return 'untracked'
  if (x !== ' ' && x !== '?' && y === ' ') return 'staged' // 仅暂存区有改动（M /A 等）
  if (x === 'D' || y === 'D') return 'deleted'
  if (x === 'A' || y === 'A') return 'added'
  if (x === 'R' || y === 'R') return 'renamed'
  if (x === 'M' || y === 'M' || x === 'T') return 'modified'
  return xy.trim() || 'changed'
}

/**
 * 只读 git 查询：scope 中哪些路径有未提交改动。
 * @param {object} o {projectRoot, scopeTokens, runGit?}
 * @returns {Promise<{ok: true, changed: Array<{path, status}>}|{ok: false, code}>}
 *   code: not-git-repo / git-error / git-missing
 */
export async function gitChangedFiles(o) {
  const { projectRoot, scopeTokens, runGit = defaultRunGit } = o
  const repo = await runGit(['rev-parse', '--is-inside-work-tree'], projectRoot)
  // rev-parse 失败只有两种语义：git 二进制缺失 / 不在仓库内
  if (!repo.ok) return { ok: false, code: repo.code === 'git-missing' ? 'git-missing' : 'not-git-repo' }
  if (String(repo.stdout).trim() !== 'true') return { ok: false, code: 'not-git-repo' }

  // 过滤：只保留项目仓库内真实存在的路径（token 缺省即跳过，避免 pathspec 报错）
  const existing = []
  for (const tok of scopeTokens) {
    const abs = resolve(projectRoot, tok)
    if (abs !== projectRoot && !abs.startsWith(projectRoot + sep)) continue
    try {
      const st = await stat(abs)
      if (st.isFile() || st.isDirectory()) existing.push(tok)
    } catch { /* 不存在 → 跳过 */ }
  }
  if (existing.length === 0) return { ok: true, changed: [] }

  const st = await runGit(['status', '--porcelain', '--', ...existing], projectRoot)
  if (!st.ok) return { ok: false, code: st.code || 'git-error', stderr: st.stderr }
  const changed = []
  for (const line of String(st.stdout).split('\n')) {
    if (!line.trim()) continue
    const m = /^(.{2}) (.*)$/.exec(line)
    if (!m) continue
    const path = m[2].replace(/^"|"$/g, '')
    if (!path) continue
    changed.push({ path, status: classifyPorcelain(m[1]) })
  }
  return { ok: true, changed }
}

/**
 * 删除当前任务；可选 git 回退：
 *  - dryRun:true（任意 revert）→ 只读查询 {revert:{files:[{path,status}]}}，不做任何写入；
 *  - dryRun:false + revert:true → 白名单 git restore 修改范围中有未提交改动的文件，
 *    成功后从 current.md 移除任务块并在 done.md 追加「[已撤销]」表格行；
 *  - dryRun:false + revert:false → 仅移除任务块（不碰 git / done.md）。
 * @param {object} o {projectPath, type, id, revert?, dryRun?, date?, runGit?}
 * @returns {Promise<object>}
 */
export async function deleteTask(o) {
  const { projectPath, type, id, revert = false, dryRun = false, date, runGit = defaultRunGit } = o
  const dir = join(projectPath, 'agent-workflow', 'tasks', type)
  const currentFile = join(dir, 'current.md')
  const doneFile = join(dir, 'done.md')
  const day = date || todayLocal()

  let currentMd
  try {
    currentMd = await readFile(currentFile, 'utf8')
  } catch {
    return { ok: false, code: 'not-found' }
  }
  const block = findBlock(currentMd, id)
  if (!block) return { ok: false, code: 'not-found' }
  const fields = parseBlockFieldMap(block)
  const title = blockTitle(block)
  const prio = /^P[0-3]$/.test(fields['优先级']) ? fields['优先级'] : 'P2'
  const scopeTokens = parseScopeFiles(fields['修改范围'] || '')

  // dryRun：只读查询，不写任何文件
  if (dryRun) {
    const res = await gitChangedFiles({ projectRoot: projectPath, scopeTokens, runGit })
    if (!res.ok) return res
    return { ok: true, task: { id, type }, revert: { files: res.changed } }
  }

  const reverted = []
  if (revert) {
    if (scopeTokens.length === 0) {
      return { ok: false, code: 'nothing-to-revert', message: '修改范围为空，无文件可回退' }
    }
    const repo = await runGit(['rev-parse', '--is-inside-work-tree'], projectPath)
    if (!repo.ok) return { ok: false, code: repo.code === 'git-missing' ? 'git-missing' : 'not-git-repo' }
    if (String(repo.stdout).trim() !== 'true') {
      return { ok: false, code: 'not-git-repo' }
    }
    const res = await gitChangedFiles({ projectRoot: projectPath, scopeTokens, runGit })
    if (!res.ok) return res
    // 仅 restore 有未提交改动且非未跟踪（git restore 对 ?? 会报 pathspec 不匹配）的文件
    const restorable = res.changed.filter((c) => c.status !== 'untracked')
    if (restorable.length === 0) {
      return { ok: false, code: 'nothing-to-revert', message: '修改范围中的文件没有未提交改动' }
    }
    const restorePaths = restorable.map((c) => c.path)
    const rst = await runGit(['restore', '--', ...restorePaths], projectPath)
    if (!rst.ok) return { ok: false, code: rst.code || 'git-error', stderr: rst.stderr }
    reverted.push(...restorable)
  }

  // 从 current.md 移除任务块
  const lines = currentMd.split('\n')
  const [start, end] = blockRange(lines, id)
  const next = normalizeMd([...lines.slice(0, start), ...lines.slice(end)].join('\n'))
  await writeFile(currentFile, next, 'utf8')

  if (revert) {
    // done.md 摘要行插入表格区顶部（表头分隔行之后第一行，与归档约定一致）；无表格区按模板新建
    let doneMd = null
    try {
      doneMd = await readFile(doneFile, 'utf8')
    } catch { /* 缺失按模板新建 */ }
    const row = `| ${id} | ${prio} | [已撤销] ${safeCell(title) || id} | ${day} |`
    await writeFile(doneFile, insertDoneTableRow(doneMd, type, row), 'utf8')
  }

  return {
    ok: true,
    task: { id, type, removed: true },
    revert: revert ? { files: reverted.map((c) => ({ path: c.path, status: c.status })) } : undefined,
  }
}

/**
 * 删除回退预检（dry-run 只读，无任何写操作）：
 * 供前端 POST /awf/task/delete/dry-run 使用；判定可回退性并给出待回退清单。
 * @param {object} o {projectPath, type, id, runGit?}
 * @returns {Promise<{ok: true, dryRun: {rollbackable: boolean, files: Array<{path,status}>, reason?: string}}
 *                    |{ok: false, code: string}>}
 *   reason: not-git / no-scope / clean
 */
export async function revertPreview(o) {
  const { projectPath, type, id, runGit = defaultRunGit } = o
  if (!TASK_TYPES.includes(type)) return { ok: false, code: 'bad-type' }
  if (!ID_RE.test(String(id))) return { ok: false, code: 'bad-id' }
  const currentFile = join(projectPath, 'agent-workflow', 'tasks', type, 'current.md')
  let currentMd
  try {
    currentMd = await readFile(currentFile, 'utf8')
  } catch {
    return { ok: false, code: 'not-found' }
  }
  const block = findBlock(currentMd, id)
  if (!block) return { ok: false, code: 'not-found' }
  const scope = parseBlockFieldMap(block)['修改范围'] || ''
  const scopeTokens = parseScopeFiles(scope)
  if (scopeTokens.length === 0) {
    return { ok: true, dryRun: { rollbackable: false, files: [], reason: 'no-scope' } }
  }
  const res = await gitChangedFiles({ projectRoot: projectPath, scopeTokens, runGit })
  // git 缺失 / 非 git 仓库 / git 错误 → 一律不可回退（reason=not-git）
  if (!res.ok) {
    return { ok: true, dryRun: { rollbackable: false, files: [], reason: 'not-git' } }
  }
  if (res.changed.length === 0) {
    return { ok: true, dryRun: { rollbackable: false, files: [], reason: 'clean' } }
  }
  return { ok: true, dryRun: { rollbackable: true, files: res.changed } }
}

/**
 * 项目级当前任务编辑：update / pause / resume / delete。
 * @param {object} o {projectPath, type, id, action, fields?, revert?, dryRun?, date?, runGit?}
 * @returns {Promise<object>}
 */
export async function taskEdit(o) {
  const { projectPath, type, id, action, fields, revert, dryRun, date, runGit } = o
  if (!TASK_TYPES.includes(type)) return { ok: false, code: 'bad-type' }
  if (!ID_RE.test(String(id))) return { ok: false, code: 'bad-id' }
  if (action === 'delete') {
    return deleteTask({ projectPath, type, id, revert, dryRun, date, runGit })
  }
  if (!['update', 'pause', 'resume'].includes(action)) return { ok: false, code: 'bad-action' }
  const currentFile = join(projectPath, 'agent-workflow', 'tasks', type, 'current.md')
  let currentMd
  try {
    currentMd = await readFile(currentFile, 'utf8')
  } catch {
    return { ok: false, code: 'not-found' }
  }
  let toApply
  if (action === 'pause') toApply = { 状态: 'blocked' }
  else if (action === 'resume') toApply = { 状态: 'active' }
  else {
    if (fields === null || typeof fields !== 'object' || Array.isArray(fields) || Object.keys(fields).length === 0) {
      return { ok: false, code: 'bad-fields' }
    }
    toApply = fields
  }
  const res = updateTaskFields(currentMd, { id, fields: toApply })
  if (!res.ok) return res
  await writeFile(currentFile, res.md, 'utf8')
  return { ok: true, task: { id, type, fields: res.fields } }
}

// ---------------------------------------------------------------------------
// 源文件只读查看（前端「编辑任务 → 打开 .md 源文件」用）
// ---------------------------------------------------------------------------

export const SOURCE_FILES = ['todo', 'current', 'done']

/**
 * 只读返回任务账本源文件内容。
 * 枚举白名单：type ∈ dev|debug|docs，file ∈ todo|current|done；
 * 文件路径固定拼接 tasks/<type>/<file>.md，无穿越面。
 * @param {object} o {projectPath, type, file}
 * @returns {Promise<{ok: true, source: {type, file, absPath, content}}|{ok: false, code}>}
 *   code: bad-type / bad-file / not-found
 */
export async function readSource(o) {
  const { projectPath, type, file } = o
  if (!TASK_TYPES.includes(type)) return { ok: false, code: 'bad-type' }
  if (!SOURCE_FILES.includes(file)) return { ok: false, code: 'bad-file' }
  const absPath = join(projectPath, 'agent-workflow', 'tasks', type, `${file}.md`)
  let content
  try {
    content = await readFile(absPath, 'utf8')
  } catch {
    return { ok: false, code: 'not-found' }
  }
  return { ok: true, source: { type, file, absPath, content } }
}
