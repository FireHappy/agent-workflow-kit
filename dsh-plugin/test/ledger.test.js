// dsh-awf-dashboard — 账本解析器单元测试（node --test，无需 GUI）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  parseIndex, parseBlocks, countTodo, parseDoneRows, ledgerOf,
} from '../src/ledger.js'

test('parseIndex: 解析全局索引表格，忽略表头/分隔/正文行', () => {
  const md = [
    '# 项目索引',
    '',
    '| 项目ID | 别名 | 路径 | 入口 |',
    '|--------|------|------|------|',
    '| agent-workflow-kit | agent-workflow-kit | /Users/x/GitHub/agent-workflow-kit | AGENTS.md |',
    '| dsh-settings | dsh-settings | /Users/x/GitHub/dsh-settings | AGENTS.md |',
    '正文行不该被解析 | 状态 | x',
  ].join('\n')
  const out = parseIndex(md)
  assert.equal(out.length, 2)
  assert.deepEqual(out[0], { id: 'agent-workflow-kit', aliases: 'agent-workflow-kit', path: '/Users/x/GitHub/agent-workflow-kit' })
})

test('parseBlocks: 块字段表只认 | 开头的行（正文引用“| 状态 |”不算字段）', () => {
  // 回归：KIT-DEV-017 曾因正文引用迁移字样污染状态列
  const md = [
    '## [DEV-001] 示例任务',
    '',
    '| 字段 | 内容 |',
    '|------|------|',
    '| 优先级 | P1 |',
    '| 状态 | active |',
    '| Owner | wg-kit |',
    '| 协作模式 | single |',
    '| 最近更新 | 2026-11-01 |',
    '',
    '正文提到：旧英文表头 `| Status |` 请改为 `| 状态 |`（保留原值）',
    '还有 `| 优先级 | P2 |` 这种正文例子也不算字段',
    '## [DEV-002] 第二个任务',
    '',
    '| 字段 | 内容 |',
    '|------|------|',
    '| 状态 | blocked |',
  ].join('\n')
  const out = parseBlocks(md)
  assert.equal(out.length, 2)
  assert.deepEqual(out[0], {
    id: 'DEV-001', title: '示例任务', prio: 'P1', status: 'active',
    owner: 'wg-kit', mode: 'single', updated: '2026-11-01',
  })
  // 正文的 `| 状态 | blocked` 等在第二个块里紧随表头之后出现才算——这里第二块只有合法表格行
  assert.equal(out[1].status, 'blocked')
})

test('parseBlocks: 双标题行防御', () => {
  const md = [
    '## [DEV-001] A',
    '## [DEV-002] B',
    '| 字段 | 内容 |',
    '|------|------|',
    '| 状态 | active |',
  ].join('\n')
  const out = parseBlocks(md)
  assert.equal(out.length, 2)
  // 字段归属第二个块
  assert.equal(out[1].status, 'active')
  assert.equal(out[0].status, '')
})

test('countTodo: 统计 checkbox 进度', () => {
  const md = [
    '- [ ] 甲',
    '- [x] 乙',
    '- [X] 丙（大写也算）',
    '  - [ ] 缩进',
    '普通 - [ ] 代码示例不算',
  ].join('\n')
  assert.deepEqual(countTodo(md), { done: 2, total: 4 })
})

test('parseDoneRows: 解析摘要行并按最新在前', () => {
  const md = [
    '| ID | P | 描述 | 完成日期 |',
    '|----|---|------|----------|',
    '| DEV-001 | P1 | 甲 | 2026-10-29 |',
    '| DEV-002 | P1 | 乙 | 2026-11-01 |',
    '| DEBUG-003 | P2 | 丙 | 2026-10-30 |',
    '非表格行 | DEV-004 | 不算 | 2026-11-01 |',
  ].join('\n')
  const out = parseDoneRows(md, 2)
  assert.equal(out.length, 2)
  assert.equal(out[0].id, 'DEV-002')
  assert.equal(out[1].id, 'DEBUG-003')
})

async function fixtureProject(overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'awf-dash-'))
  const awf = join(dir, 'agent-workflow')
  await mkdir(join(awf, 'tasks', 'dev'), { recursive: true })
  await mkdir(join(awf, 'tasks', 'docs'), { recursive: true })
  await writeFile(join(awf, 'project.yaml'), [
    'name: fixture-proj',
    'purpose: 测试项目',
  ].join('\n') + '\n')
  await writeFile(join(awf, 'tasks', 'dev', 'todo.md'), [
    '- [x] 已做',
    '- [ ] 待做',
  ].join('\n') + '\n')
  await writeFile(join(awf, 'tasks', 'dev', 'current.md'), [
    '## [DEV-100] 当前任务',
    '',
    '| 字段 | 内容 |',
    '|------|------|',
    '| 优先级 | P1 |',
    '| 状态 | active |',
    '| Owner | wg-kit |',
    '| 协作模式 | single |',
    '| 最近更新 | 2026-11-01 |',
  ].join('\n') + '\n')
  await writeFile(join(awf, 'tasks', 'docs', 'current.md'), [
    '## [DOCS-1] 文档任务',
    '',
    '| 字段 | 内容 |',
    '|------|------|',
    '| 状态 | review |',
  ].join('\n') + '\n')
  await writeFile(join(awf, 'tasks', 'dev', 'done.md'), [
    '| ID | P | 描述 | 完成日期 |',
    '|----|---|------|----------|',
    '| DEV-099 | P1 | 旧任务 | 2026-10-30 |',
  ].join('\n') + '\n')
  if (overrides.status !== undefined) {
    await writeFile(join(awf, 'tasks', 'status.md'), overrides.status)
  }
  return dir
}

test('ledgerOf: 汇总项目账本', async () => {
  const dir = await fixtureProject({ status: 'status 内容' })
  const led = await ledgerOf(dir)
  assert.equal(led.project.name, 'fixture-proj')
  assert.equal(led.project.purpose, '测试项目')
  assert.equal(led.current.length, 2)
  const dev = led.current.find((c) => c.id === 'DEV-100')
  assert.equal(dev.type, 'dev')
  assert.equal(dev.status, 'active')
  assert.equal(dev.prio, 'P1')
  assert.deepEqual(led.todo.find((t) => t.type === 'dev'), { type: 'dev', done: 1, total: 2 })
  assert.equal(led.recent[0].id, 'DEV-099')
  // status.md 刚写入、时间最新 → 新鲜
  assert.equal(led.status.fresh, true)
})

test('ledgerOf: status.md 过期 → fresh=false', async () => {
  const dir = await fixtureProject({ status: 'status 内容' })
  // 把 status.md 的 mtime 拨到过去，让 current.md 更新于其后
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000)
  await utimes(join(dir, 'agent-workflow', 'tasks', 'status.md'), past, past)
  const led = await ledgerOf(dir)
  assert.equal(led.status.fresh, false)
  assert.ok(led.status.updated)
})

test('ledgerOf: 缺 status.md → fresh=false', async () => {
  const dir = await fixtureProject()
  const led = await ledgerOf(dir)
  assert.equal(led.status.fresh, false)
  assert.equal(led.status.updated, null)
})