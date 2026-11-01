// dsh-awf-dashboard — 账本解析器（纯 Node ESM，无依赖，服务端与测试共用）
//
// 解析规则与 agent-workflow-kit 的 bin/awf 保持一致（含 KIT-DEV-017 的字段表行锚定）：
//   - 任务块：`## [ID] 标题`，字段表只认 `|` 开头的表格行（正文引用 `| 状态 |` 等字样不算字段）；
//   - done.md 摘要行：`| ID | 优先级 | 描述 | 完成日期 |`；
//   - todo.md 进度：`- [ ]` 未完成 / `- [x]` 已完成；
//   - status.md 新鲜度：status.md mtime >= 各账本文件（current/todo/done）mtime。
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

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
      for (const b of parseBlocks(cur)) current.push({ type, ...b })
    }
    const td = fileContent[join(dir, 'todo.md')]
    if (td !== undefined) todo.push({ type, ...countTodo(td) })
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
    recent: recent.slice(0, 8),
  }
}
