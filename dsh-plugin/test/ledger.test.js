// dsh-awf-dashboard — 账本解析器单元测试（node --test，无需 GUI）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, utimes, readFile, readdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join, basename, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import {
  parseIndex, parseBlocks, countTodo, parseDoneRows, ledgerOf,
  initSkeleton, skeletonFiles, startTask, archiveTask,
  parseTodoRows, findBlock, isWhitelistedPath, todayLocal, slugify,
  renderTaskBlock, todoCrud, todoEdit, updateTaskFields, parseBlockFieldMap, blockTitle,
  parseScopeFiles, deleteTask, taskEdit, revertPreview, readSource, parseCheckItems,
  returnTaskToTodo,
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

// ---------------------------------------------------------------------------
// DEV-022：init 骨架生成 / task start 迁移 / archive 归档查询
// ---------------------------------------------------------------------------

/** 递归快照目录下所有文件内容（用于断言「不写任何文件」）。 */
async function snapshotDir(root) {
  const out = {}
  const walk = async (dir) => {
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name)
      if (ent.isDirectory()) await walk(p)
      else out[p.slice(root.length)] = await readFile(p, 'utf8')
    }
  }
  await walk(root)
  return out
}

test('initSkeleton: 生成最小骨架且可被 ledgerOf 消费；已初始化拒绝且不写任何文件', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'awf-init-'))
  const r1 = await initSkeleton({ projectPath: dir, purpose: '测试骨架' })
  assert.equal(r1.ok, true)
  assert.equal(r1.project.name, basename(dir))
  assert.equal(r1.project.id, slugify(basename(dir)))

  // 骨架文件齐全：project.yaml + 3 类型 × 3 账本文件 + status.md
  const yaml = await readFile(join(dir, 'agent-workflow', 'project.yaml'), 'utf8')
  assert.match(yaml, /^id: /m)
  assert.match(yaml, /^name: /m)
  assert.match(yaml, /^purpose: 测试骨架/m)
  assert.match(yaml, /^aliases: /m)
  assert.match(yaml, /^stack: generic/m)
  for (const type of ['dev', 'debug', 'docs']) {
    for (const f of ['current.md', 'todo.md', 'done.md']) {
      const content = await readFile(join(dir, 'agent-workflow', 'tasks', type, f), 'utf8')
      assert.ok(content.length > 0, `${type}/${f} 不应为空`)
    }
  }
  const status = await readFile(join(dir, 'agent-workflow', 'tasks', 'status.md'), 'utf8')
  assert.ok(status.includes('<!-- awf:status:begin -->'))
  assert.ok(status.includes('<!-- awf:status:end -->'))

  // 骨架可被 ledgerOf 消费（空账本可解析）
  const led = await ledgerOf(dir)
  assert.equal(led.project.name, basename(dir))
  assert.equal(led.project.purpose, '测试骨架')
  assert.equal(led.current.length, 0)
  assert.deepEqual(led.todo, [
    { type: 'dev', done: 0, total: 0 },
    { type: 'debug', done: 0, total: 0 },
    { type: 'docs', done: 0, total: 0 },
  ])
  assert.deepEqual(led.recent, [])

  // 幂等：二次初始化拒绝，且目录内容分毫不差
  const before = await snapshotDir(dir)
  const r2 = await initSkeleton({ projectPath: dir })
  assert.equal(r2.ok, false)
  assert.equal(r2.code, 'already-initialized')
  assert.deepEqual(await snapshotDir(dir), before, '已初始化目录不得新增/修改任何文件')
})

test('initSkeleton: skeletonFiles 纯函数可注入 id/name/stack，路径都落在项目根内', () => {
  const files = skeletonFiles({
    projectPath: '/tmp/fake-proj', id: 'my-proj', name: '我的项目',
    purpose: 'purpose-x', stack: 'node', date: '2026-11-01',
  })
  assert.equal(files.length, 11) // project.yaml + 3 类型×3 账本 + status.md
  for (const f of files) {
    assert.ok(f.path.startsWith('/tmp/fake-proj/agent-workflow/'), f.path)
  }
  const yaml = files.find((f) => f.path.endsWith('project.yaml')).content
  assert.match(yaml, /^id: my-proj$/m)
  assert.match(yaml, /^name: 我的项目$/m)
  assert.match(yaml, /^stack: node$/m)
  const status = files.find((f) => f.path.endsWith('status.md')).content
  assert.ok(status.includes('<!-- awf:status:begin -->') && status.includes('<!-- awf:status:end -->'))
})

test('isWhitelistedPath: 绝对路径 ∧（全局索引 ∨ 工作区根），否则拒绝', () => {
  const index = ['/Users/x/GitHub/proj-a', '/Users/x/GitHub/proj-b']
  assert.equal(isWhitelistedPath('/Users/x/GitHub/proj-a', index, undefined), true)
  assert.equal(isWhitelistedPath('/Users/x/GitHub/proj-b', index, '/ws'), true)
  // 当前工作区根（客户端上报）
  assert.equal(isWhitelistedPath('/ws/root', [], '/ws/root'), true)
  assert.equal(isWhitelistedPath('/ws', [], '/ws'), true)
  // 拒绝：非白名单绝对路径 / 相对路径 / 缺失
  assert.equal(isWhitelistedPath('/Users/x/GitHub/other', index, undefined), false)
  assert.equal(isWhitelistedPath('/Users/x/GitHub/other', index, '/ws/root'), false)
  assert.equal(isWhitelistedPath('relative/path', index, undefined), false)
  assert.equal(isWhitelistedPath('', index, undefined), false)
  assert.equal(isWhitelistedPath(undefined, index, undefined), false)
})

test('startTask: todo 行删除并追加可解析的 active 任务块；不匹配返回 not-found', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'awf-start-'))
  const awf = join(dir, 'agent-workflow', 'tasks', 'dev')
  await mkdir(awf, { recursive: true })
  await writeFile(join(awf, 'todo.md'), [
    '# 待开发',
    '',
    '| 任务ID | 优先级 | 描述 | 登记日期 |',
    '|--------|--------|------|----------|',
    '| DEV-200 | P1 | 示例功能 | 2026-11-01 |',
    '| DEV-201 | P2 | 保留任务 | 2026-11-01 |',
  ].join('\n') + '\n')
  await writeFile(join(awf, 'current.md'), '# 正在开发\n\n（暂无进行中任务）\n')

  const r = await startTask({ projectPath: dir, type: 'dev', id: 'DEV-200' })
  assert.equal(r.ok, true)
  assert.equal(r.task.id, 'DEV-200')
  assert.equal(r.task.status, 'active')
  assert.equal(r.task.prio, 'P1')

  const todo = await readFile(join(awf, 'todo.md'), 'utf8')
  assert.ok(!todo.includes('DEV-200'), 'todo.md 应删除目标行')
  assert.ok(todo.includes('DEV-201'), 'todo.md 应保留其他行')
  assert.ok(todo.includes('| 任务ID | 优先级 | 描述 | 登记日期 |'), '表头应保留')

  const cur = await readFile(join(awf, 'current.md'), 'utf8')
  assert.ok(cur.includes('## [DEV-200] 示例功能'), 'current.md 应含任务块标题')
  assert.ok(cur.includes('| 状态 | active |'))
  assert.ok(cur.includes('| 优先级 | P1 |'))
  assert.ok(cur.includes('| 协作模式 | single |'))
  assert.ok(cur.includes('| 来源任务 | todo 登记 |'))
  assert.ok(cur.includes('| 最近更新 | ' + todayLocal() + ' |'))
  assert.ok(cur.includes('### 目标'))
  assert.ok(cur.includes('### 验收标准'))
  assert.ok(cur.includes('### 下一步'))

  // awf 解析器可读：parseBlocks 取到该块且状态 active
  const blocks = parseBlocks(cur)
  const moved = blocks.find((b) => b.id === 'DEV-200')
  assert.ok(moved, '新块应被 parseBlocks 解析')
  assert.equal(moved.title, '示例功能')
  assert.equal(moved.status, 'active')
  assert.equal(moved.prio, 'P1')
  assert.equal(moved.mode, 'single')

  // 不匹配 → not-found（且文件不变化）
  const before = await snapshotDir(dir)
  const miss = await startTask({ projectPath: dir, type: 'dev', id: 'DEV-999' })
  assert.equal(miss.ok, false)
  assert.equal(miss.code, 'not-found')
  assert.deepEqual(await snapshotDir(dir), before)

  // 非法 type / id 直接拒绝
  assert.equal((await startTask({ projectPath: dir, type: 'test', id: 'DEV-201' })).code, 'bad-type')
  assert.equal((await startTask({ projectPath: dir, type: 'dev', id: 'dev-201' })).code, 'bad-id')
})

test('parseTodoRows: 解析 todo 表行并忽略表头/分隔/正文', () => {
  const md = [
    '# 待开发',
    '',
    '| 任务ID | 优先级 | 描述 | 登记日期 |',
    '|--------|--------|------|----------|',
    '| DEV-100 | P1 | 甲 | 2026-11-01 |',
    '| DEBUG-2 | P3 | 乙 | 2026-10-30 |',
    '非表格行 | DEV-3 | 不算 | 2026-11-01 |',
  ].join('\n')
  const rows = parseTodoRows(md)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], { id: 'DEV-100', prio: 'P1', desc: '甲', date: '2026-11-01' })
  assert.deepEqual(rows[1], { id: 'DEBUG-2', prio: 'P3', desc: '乙', date: '2026-10-30' })
})

test('archiveTask: 返回 done.md 表格行 + 完整任务块；无则 not-found', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'awf-arch-'))
  const awf = join(dir, 'agent-workflow', 'tasks', 'dev')
  await mkdir(awf, { recursive: true })
  await writeFile(join(awf, 'done.md'), [
    '# 已完成',
    '',
    '| 任务ID | 优先级 | 描述 | 完成日期 |',
    '|--------|--------|------|----------|',
    '| DEV-090 | P2 | 早前任务 | 2026-10-30 |',
    '| DEV-091 | P1 | 近期任务 | 2026-11-01 |',
    '',
    '## [DEV-091] 近期任务',
    '',
    '| 字段 | 内容 |',
    '|------|------|',
    '| 优先级 | P1 |',
    '| 状态 | 完成 |',
    '| Owner | me |',
    '| 最近更新 | 2026-11-01 |',
    '',
    '### 下一步',
    '无',
  ].join('\n') + '\n')

  const r = await archiveTask({ projectPath: dir, id: 'DEV-091' })
  assert.equal(r.ok, true)
  assert.equal(r.done.type, 'dev')
  assert.deepEqual(r.done.row, { id: 'DEV-091', prio: 'P1', desc: '近期任务', date: '2026-11-01' })
  assert.ok(r.done.block.startsWith('## [DEV-091] 近期任务'), '应返回完整任务块原文')
  assert.ok(r.done.block.includes('| 状态 | 完成 |'))
  assert.ok(r.done.block.includes('### 下一步'))

  // findBlock 跨块边界正确
  const doneMd = await readFile(join(awf, 'done.md'), 'utf8')
  const b = findBlock(doneMd, 'DEV-091')
  assert.ok(b && b.includes('| Owner | me |') && !b.includes('DEV-090'))

  // 只有表格行、无任务块 → row 有值、block 为 null
  const missBlock = await archiveTask({ projectPath: dir, id: 'DEV-090' })
  assert.equal(missBlock.ok, true)
  assert.equal(missBlock.done.block, null)

  // 不存在 → not-found
  const miss = await archiveTask({ projectPath: dir, id: 'DEV-999' })
  assert.equal(miss.ok, false)
  assert.equal(miss.code, 'not-found')
})

// ---------------------------------------------------------------------------
// DEV-022（t4）：todo CRUD / 当前任务 update/pause/resume / delete 回退
// ---------------------------------------------------------------------------

const TODO_HEADER = '# 待开发\n\n| 任务ID | 优先级 | 描述 | 登记日期 |\n|--------|--------|------|----------|\n'
const TODO_FIXTURE = TODO_HEADER + '| DEV-300 | P1 | 任务甲 | 2026-11-01 |\n| DEV-301 | P2 | 任务乙 | 2026-11-02 |\n'

test('todoCrud: add/update/delete 表格行 + 校验（id 格式 / P0-P3 / 重复）', () => {
  // add
  const add = todoCrud(TODO_FIXTURE, { action: 'add', row: { id: 'DEV-302', 优先级: 'P3', 描述: '任务丙' }, date: '2026-11-03' })
  assert.equal(add.ok, true)
  assert.deepEqual(add.rows.slice(-1)[0], { id: 'DEV-302', prio: 'P3', desc: '任务丙', date: '2026-11-03' })
  assert.equal((todoCrud(TODO_FIXTURE, { action: 'add', row: { id: 'dev-302', 优先级: 'P1', 描述: 'x' } })).code, 'invalid-id')
  assert.equal((todoCrud(TODO_FIXTURE, { action: 'add', row: { id: 'DEV-302', 优先级: 'P9', 描述: 'x' } })).code, 'invalid-prio')
  assert.equal((todoCrud(TODO_FIXTURE, { action: 'add', row: { id: 'DEV-300', 优先级: 'P1', 描述: 'x' } })).code, 'duplicate')

  // update：原位替换优先级/描述，登记日期保留
  const upd = todoCrud(TODO_FIXTURE, { action: 'update', row: { id: 'DEV-300', 优先级: 'P0', 描述: '任务甲（改）' } })
  assert.equal(upd.ok, true)
  const uRow = upd.rows.find((r) => r.id === 'DEV-300')
  assert.deepEqual(uRow, { id: 'DEV-300', prio: 'P0', desc: '任务甲（改）', date: '2026-11-01' })
  const misUpd = todoCrud(TODO_FIXTURE, { action: 'update', row: { id: 'DEV-999', 优先级: 'P1', 描述: 'x' } })
  assert.equal(misUpd.ok, false)
  assert.equal(misUpd.code, 'not-found')

  // delete：删行保他行
  const del = todoCrud(TODO_FIXTURE, { action: 'delete', row: { id: 'DEV-301' } })
  assert.equal(del.ok, true)
  assert.ok(!del.rows.some((r) => r.id === 'DEV-301'))
  assert.ok(del.rows.some((r) => r.id === 'DEV-300'))
  assert.ok(del.md.includes('| 任务ID | 优先级 | 描述 | 登记日期 |'), '表头保留')
  const misDel = todoCrud(TODO_FIXTURE, { action: 'delete', row: { id: 'DEV-999' } })
  assert.equal(misDel.code, 'not-found')
  assert.equal(todoCrud(TODO_FIXTURE, { action: 'rename', row: {} }).code, 'bad-action')
})

test('todoEdit: 项目级 CRUD 落盘，缺失 todo.md 时 add 按模板新建', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'awf-todo-'))
  const type = 'dev'
  const todoFile = join(dir, 'agent-workflow', 'tasks', type, 'todo.md')

  // 缺文件 → add 自动按骨架模板新建
  const r1 = await todoEdit({ projectPath: dir, type, action: 'add', row: { id: 'DEV-310', 优先级: 'P1', 描述: '新任务' }, date: '2026-11-05' })
  assert.equal(r1.ok, true)
  assert.equal(r1.type, 'dev')
  assert.equal(r1.rows.length, 1)
  assert.ok((await readFile(todoFile, 'utf8')).includes('| DEV-310 | P1 | 新任务 | 2026-11-05 |'))

  // 缺文件 + 非 add → not-found
  const r2 = await todoEdit({ projectPath: dir, type, action: 'delete', row: { id: 'DEV-999' } })
  assert.equal(r2.ok, false)
  assert.equal(r2.code, 'not-found')

  // update 后 rows 结构化可渲染
  const r3 = await todoEdit({ projectPath: dir, type, action: 'update', row: { id: 'DEV-310', 优先级: 'P2', 描述: '新任务v2' } })
  assert.equal(r3.ok, true)
  assert.deepEqual(r3.rows, [{ id: 'DEV-310', prio: 'P2', desc: '新任务v2', date: '2026-11-05' }])

  // 非法 type / action
  assert.equal((await todoEdit({ projectPath: dir, type: 'ops', action: 'add', row: {} })).code, 'bad-type')
  assert.equal((await todoEdit({ projectPath: dir, type, action: 'nope', row: {} })).code, 'bad-action')
})

/** 生成含任务块的 current.md 夹具文字（修改范围可注入）。 */
function blockFixture(id, overrides = {}) {
  let block = renderTaskBlock({
    id,
    title: overrides.title || '示例任务',
    prio: overrides.prio || 'P1',
    status: overrides.status || 'active',
    owner: 'unassigned',
    mode: 'single',
    date: '2026-11-01',
  })
  if (overrides.scope !== undefined) {
    block = block.replace('| 修改范围 | 待补充 |', `| 修改范围 | ${overrides.scope} |`)
  }
  return '# 正在开发\n\n（暂无进行中任务）\n' + block
}

test('taskEdit: update 字段原位替换（含 title/描述 改标题行）/ pause / resume', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'awf-task-'))
  const awf = join(dir, 'agent-workflow', 'tasks', 'dev')
  await mkdir(awf, { recursive: true })
  const currentFile = join(awf, 'current.md')
  await writeFile(currentFile, blockFixture('DEV-400', { scope: 'src/a.js, docs/b.md' }))

  // update 多个字段
  const upd = await taskEdit({
    projectPath: dir, type: 'dev', id: 'DEV-400', action: 'update',
    fields: { 优先级: 'P0', Owner: 'me', 依赖: 'DEV-300' },
  })
  assert.equal(upd.ok, true)
  assert.equal(upd.task.fields['优先级'], 'P0')
  assert.equal(upd.task.fields.Owner, 'me')
  assert.equal(upd.task.fields['状态'], 'active')
  assert.equal(upd.task.fields['依赖'], 'DEV-300')
  const md1 = await readFile(currentFile, 'utf8')
  const blocks1 = parseBlocks(md1)
  assert.equal(blocks1[0].prio, 'P0')
  assert.equal(blocks1[0].status, 'active')
  assert.ok(md1.includes('| 优先级 | P0 |'))

  // title / 描述 → 标题行
  const ren = await taskEdit({ projectPath: dir, type: 'dev', id: 'DEV-400', action: 'update', fields: { 描述: '新标题' } })
  assert.equal(ren.ok, true)
  assert.equal(ren.task.fields.title, '新标题')
  const md2 = await readFile(currentFile, 'utf8')
  assert.ok(md2.includes('## [DEV-400] 新标题'))

  // pause → blocked；resume → active
  const pause = await taskEdit({ projectPath: dir, type: 'dev', id: 'DEV-400', action: 'pause' })
  assert.equal(pause.ok, true)
  assert.equal(pause.task.fields['状态'], 'blocked')
  assert.equal((await readFile(currentFile, 'utf8')).includes('| 状态 | blocked |'), true)
  const resume = await taskEdit({ projectPath: dir, type: 'dev', id: 'DEV-400', action: 'resume' })
  assert.equal(resume.ok, true)
  assert.equal(resume.task.fields['状态'], 'active')

  // 未找到 / 参数非法
  const miss = await taskEdit({ projectPath: dir, type: 'dev', id: 'DEV-999', action: 'pause' })
  assert.equal(miss.ok, false)
  assert.equal(miss.code, 'not-found')
  assert.equal((await taskEdit({ projectPath: dir, type: 'dev', id: 'DEV-400', action: 'boom' })).code, 'bad-action')
  assert.equal((await taskEdit({ projectPath: dir, type: 'dev', id: 'DEV-400', action: 'update', fields: {} })).code, 'bad-fields')
  assert.equal((await taskEdit({ projectPath: dir, type: 'nope', id: 'DEV-400', action: 'pause' })).code, 'bad-type')
})

test('updateTaskFields / parseBlockFieldMap / blockTitle：缺失字段插入、字段表解析', () => {
  const md = [
    '## [DEBUG-7] 调试任务',
    '',
    '| 字段 | 内容 |',
    '|------|------|',
    '| 状态 | active |',
    '| Owner | me |',
  ].join('\n')
  const r = updateTaskFields(md, { id: 'DEBUG-7', fields: { 依赖: '无', Owner: 'you' } })
  assert.equal(r.ok, true)
  assert.ok(r.md.includes('| 依赖 | 无 |'), '缺失字段应插入字段表')
  assert.ok(r.md.includes('| Owner | you |'))
  assert.equal(r.fields['状态'], 'active')
  assert.equal(parseBlockFieldMap('## [X-1] t\n\n| 字段 | 内容 |\n|------|------|\n| 状态 | active |').状态, 'active')
  assert.equal(blockTitle('## [X-1] 我的标题\n| 字段 | 内容 |'), '我的标题')
})

test('parseScopeFiles: 只抽安全路径 token，拒绝 ../ 与通配', () => {
  const toks = parseScopeFiles('src/a.js, docs/b.md、lib/ 与 tools/README.md')
  assert.ok(toks.includes('src/a.js'))
  assert.ok(toks.includes('docs/b.md'))
  assert.ok(toks.includes('lib/'))
  assert.ok(toks.includes('tools/README.md'))

  const evil = parseScopeFiles('../evil.js, ../../etc/passwd, src/*.js, a?b.txt')
  assert.ok(!evil.some((t) => t.includes('..')), '不得含 ..')
  assert.ok(!evil.some((t) => t.includes('*') || t.includes('?')), '不得含通配符')

  assert.deepEqual(parseScopeFiles('待补充'), [], '非路径文字返回空')
  assert.deepEqual(parseScopeFiles(''), [])
})

/** 在临时目录初始化一个 git 仓库：写入文件并提交首个 commit。 */
async function gitInitFixture(files) {
  const dir = await mkdtemp(join(tmpdir(), 'awf-git-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, rel)), { recursive: true })
    await writeFile(join(dir, rel), content)
  }
  execFileSync('git', ['add', '-A'], { cwd: dir })
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init'], { cwd: dir })
  return dir
}

async function ledgerFilesFixture(dir, type, currentContent) {
  const awf = join(dir, 'agent-workflow', 'tasks', type)
  await mkdir(awf, { recursive: true })
  await writeFile(join(dir, 'agent-workflow', 'project.yaml'), 'id: fixture\nname: fixture\n')
  await writeFile(join(awf, 'current.md'), currentContent)
  if (!(await readFile(join(awf, 'done.md'), 'utf8').catch(() => null))) {
    await writeFile(join(awf, 'done.md'), '# 已完成\n\n| 任务ID | 优先级 | 描述 | 完成日期 |\n|--------|--------|------|----------|\n')
  }
}

test('deleteTask: dryRun 只读查询 + execute 白名单 git restore + 已撤销行', async () => {
  const dir = await gitInitFixture({ 'src/app.js': 'v1\n' })
  await ledgerFilesFixture(dir, 'dev', blockFixture('DEV-500', { scope: 'src/app.js' }))
  const currentFile = join(dir, 'agent-workflow', 'tasks', 'dev', 'current.md')
  const doneFile = join(dir, 'agent-workflow', 'tasks', 'dev', 'done.md')
  const appFile = join(dir, 'src/app.js')

  // 预置 done.md：既有摘要行 + 归档任务块（验证插入位置与块位置不变）
  await writeFile(doneFile, [
    '# 已完成',
    '',
    '| 任务ID | 优先级 | 描述 | 完成日期 |',
    '|--------|--------|------|----------|',
    '| DEV-099 | P2 | 旧任务 | 2026-10-30 |',
    '',
    '## [DEV-013] 已归档块',
    '',
    '| 字段 | 内容 |',
    '|------|------|',
    '| 状态 | 完成 |',
  ].join('\n') + '\n')

  // 制造未提交改动
  await writeFile(appFile, 'v2\n')

  // dryRun：只读查询，返回有改动的文件，不写任何文件
  const dry = await deleteTask({ projectPath: dir, type: 'dev', id: 'DEV-500', revert: true, dryRun: true })
  assert.equal(dry.ok, true)
  assert.deepEqual(dry.revert.files, [{ path: 'src/app.js', status: 'modified' }])
  assert.equal(await readFile(appFile, 'utf8'), 'v2\n', 'dryRun 不得改动文件')
  assert.ok((await readFile(currentFile, 'utf8')).includes('## [DEV-500]'), 'dryRun 不得移除任务块')
  assert.equal((await readFile(doneFile, 'utf8')).includes('[已撤销]'), false, 'dryRun 不得写 done.md')

  // execute：真实 restore，文件回退、块移除、done.md 插入 [已撤销] 行（表格区顶部）
  const ex = await deleteTask({ projectPath: dir, type: 'dev', id: 'DEV-500', revert: true, dryRun: false })
  assert.equal(ex.ok, true)
  assert.equal(ex.task.removed, true)
  assert.deepEqual(ex.revert.files, [{ path: 'src/app.js', status: 'modified' }])
  assert.equal(await readFile(appFile, 'utf8'), 'v1\n', 'git restore 应回退工作区改动')
  const curAfter = await readFile(currentFile, 'utf8')
  assert.ok(!curAfter.includes('## [DEV-500]'), '任务块应从 current.md 移除')
  const doneAfter = await readFile(doneFile, 'utf8')
  const doneLines = doneAfter.split('\n')
  const sepIdx = doneLines.findIndex((l) => /^\|[\s\-|]+\|$/.test(l) && l.includes('--'))
  assert.ok(sepIdx > 0, '应找到表头分隔行')
  assert.ok(
    /^\| DEV-500 \| P1 \| \[已撤销\] 示例任务 \| \d{4}-\d{2}-\d{2} \|$/.test(doneLines[sepIdx + 1]),
    '已撤销行必须位于表格区顶部（表头分隔行之后第一行）',
  )
  assert.ok(doneLines.some((l) => l.startsWith('| DEV-099 |')), '既有摘要行保留')
  assert.ok(doneLines.indexOf(doneLines.find((l) => l.startsWith('| DEV-099 |'))) > sepIdx + 1, '旧摘要行在已撤销行之下')
  assert.ok(doneAfter.includes('## [DEV-013] 已归档块'), '既有归档任务块保留')
  const doneRow = parseDoneRows(doneAfter, 5).find((r) => r.id === 'DEV-500')
  assert.equal(doneRow.prio, 'P1')
  assert.ok(doneRow.desc.startsWith('[已撤销]'))
})

test('deleteTask: 非 git 仓库 / 无改动 / 空修改范围 / 未跟踪文件', async () => {
  // 1) 非 git 仓库
  const plain = await mkdtemp(join(tmpdir(), 'awf-nogit-'))
  await ledgerFilesFixture(plain, 'dev', blockFixture('DEV-510', { scope: 'a.txt' }))
  const notRepoDry = await deleteTask({ projectPath: plain, type: 'dev', id: 'DEV-510', revert: true, dryRun: true })
  assert.equal(notRepoDry.ok, false)
  assert.equal(notRepoDry.code, 'not-git-repo')
  const notRepoEx = await deleteTask({ projectPath: plain, type: 'dev', id: 'DEV-510', revert: true })
  assert.equal(notRepoEx.code, 'not-git-repo')

  // 2) 修改范围为空 → dryRun 可查（查不到文件），execute 拒绝
  const empty = await gitInitFixture({ 'a.txt': 'v1\n' })
  await ledgerFilesFixture(empty, 'dev', blockFixture('DEV-511')) // 修改范围=待补充
  const emptyDry = await deleteTask({ projectPath: empty, type: 'dev', id: 'DEV-511', revert: true, dryRun: true })
  assert.equal(emptyDry.ok, true)
  assert.deepEqual(emptyDry.revert.files, [])
  const emptyEx = await deleteTask({ projectPath: empty, type: 'dev', id: 'DEV-511', revert: true })
  assert.equal(emptyEx.ok, false)
  assert.equal(emptyEx.code, 'nothing-to-revert')

  // 3) git 仓库内文件无未提交改动 → execute 拒绝
  const cleanGit = await gitInitFixture({ 'a.txt': 'v1\n' })
  await ledgerFilesFixture(cleanGit, 'dev', blockFixture('DEV-512', { scope: 'a.txt' }))
  const cleanDry = await deleteTask({ projectPath: cleanGit, type: 'dev', id: 'DEV-512', revert: true, dryRun: true })
  assert.equal(cleanDry.ok, true)
  assert.deepEqual(cleanDry.revert.files, [])
  const cleanEx = await deleteTask({ projectPath: cleanGit, type: 'dev', id: 'DEV-512', revert: true })
  assert.equal(cleanEx.code, 'nothing-to-revert')

  // 4) 仅未跟踪文件 → dryRun 报 untracked，execute 拒绝（restore 无从回退）
  const untracked = await gitInitFixture({ 'tracked.txt': 'v1\n' })
  await ledgerFilesFixture(untracked, 'dev', blockFixture('DEV-513', { scope: 'new.txt' }))
  await writeFile(join(untracked, 'new.txt'), 'new\n')
  const untDry = await deleteTask({ projectPath: untracked, type: 'dev', id: 'DEV-513', revert: true, dryRun: true })
  assert.equal(untDry.ok, true)
  assert.deepEqual(untDry.revert.files, [{ path: 'new.txt', status: 'untracked' }])
  const untEx = await deleteTask({ projectPath: untracked, type: 'dev', id: 'DEV-513', revert: true })
  assert.equal(untEx.code, 'nothing-to-revert')

  // 5) 目录 token：git status 展开为目录下实际改动文件
  const dirGit = await gitInitFixture({ 'pkg/x.js': '1\n', 'pkg/y.js': '1\n' })
  await ledgerFilesFixture(dirGit, 'dev', blockFixture('DEV-514', { scope: 'pkg' }))
  await writeFile(join(dirGit, 'pkg/y.js'), '2\n')
  const dirDry = await deleteTask({ projectPath: dirGit, type: 'dev', id: 'DEV-514', revert: true, dryRun: true })
  assert.equal(dirDry.ok, true)
  assert.deepEqual(dirDry.revert.files, [{ path: 'pkg/y.js', status: 'modified' }])
})

test('deleteTask: rejected 文件穿过项目根、git 缺失（mock runGit）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'awf-mock-'))
  await ledgerFilesFixture(dir, 'dev', blockFixture('DEV-515', { scope: 'src/a.js' }))

  // mock runGit：git 二进制缺失
  const missing = { ok: false, code: 'git-missing', stderr: 'ENOENT' }
  const mockRunGit = () => Promise.resolve(missing)
  const dry = await deleteTask({ projectPath: dir, type: 'dev', id: 'DEV-515', revert: true, dryRun: true, runGit: mockRunGit })
  assert.equal(dry.ok, false)
  assert.equal(dry.code, 'git-missing')

  // 越过项目根的路径不会进入 git 调用（parseScopeFiles 已过滤 ..）
  const tokens = parseScopeFiles('../../outside.js')
  assert.equal(tokens.length, 0)

  // 纯删除（revert:false, dryRun:false）：不碰 git，仅移除块
  await writeFile(join(dir, 'agent-workflow', 'tasks', 'dev', 'current.md'), blockFixture('DEV-520', { scope: 'src/a.js' }))
  const plainDel = await deleteTask({ projectPath: dir, type: 'dev', id: 'DEV-520', revert: false })
  assert.equal(plainDel.ok, true)
  assert.equal(plainDel.revert, undefined)
  const cur = await readFile(join(dir, 'agent-workflow', 'tasks', 'dev', 'current.md'), 'utf8')
  assert.ok(!cur.includes('## [DEV-520]'), '纯删除应移除任务块')
  const done = await readFile(join(dir, 'agent-workflow', 'tasks', 'dev', 'done.md'), 'utf8')
  assert.ok(!done.includes('[已撤销]'), '纯删除不写 done.md')
})

test('ledgerOf: todoRows 返回结构化待办行（供前端开始任务渲染）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'awf-tdorows-'))
  const dev = join(dir, 'agent-workflow', 'tasks', 'dev')
  await mkdir(dev, { recursive: true })
  await writeFile(join(dir, 'agent-workflow', 'project.yaml'), 'id: x\nname: x\n')
  await writeFile(join(dev, 'todo.md'), TODO_HEADER + '| DEV-301 | P1 | 甲行 | 2026-11-01 |\n| DEV-302 | P2 | 乙行 | 2026-11-02 |\n')
  await writeFile(join(dev, 'current.md'), '\n')
  await writeFile(join(dev, 'done.md'), '# 已完成\n\n| 任务ID | 优先级 | 描述 | 完成日期 |\n|--------|--------|------|----------|\n')

  const led = await ledgerOf(dir)
  const devRows = led.todoRows.find((t) => t.type === 'dev')
  assert.deepEqual(devRows.rows, [
    { id: 'DEV-301', prio: 'P1', desc: '甲行', date: '2026-11-01' },
    { id: 'DEV-302', prio: 'P2', desc: '乙行', date: '2026-11-02' },
  ])
  // 开始任务后，行从 todoRows 消失（startTask 删除 todo 行）
  await startTask({ projectPath: dir, type: 'dev', id: 'DEV-301' })
  const led2 = await ledgerOf(dir)
  const after = led2.todoRows.find((t) => t.type === 'dev').rows.map((r) => r.id)
  assert.deepEqual(after, ['DEV-302'], '已开始的行不得留在 todoRows')
})

test('revertPreview: rollbackable / reason（not-git / no-scope / clean / 可回退）', async () => {
  // not-git：非 git 仓库
  const plain = await mkdtemp(join(tmpdir(), 'awf-prev-'))
  await ledgerFilesFixture(plain, 'dev', blockFixture('DEV-530', { scope: 'a.txt' }))
  const ng = await revertPreview({ projectPath: plain, type: 'dev', id: 'DEV-530' })
  assert.equal(ng.ok, true)
  assert.deepEqual(ng.dryRun, { rollbackable: false, files: [], reason: 'not-git' })

  // no-scope：修改范围为空
  const empty = await gitInitFixture({ 'a.txt': 'v1\n' })
  await ledgerFilesFixture(empty, 'dev', blockFixture('DEV-531'))
  const ns = await revertPreview({ projectPath: empty, type: 'dev', id: 'DEV-531' })
  assert.deepEqual(ns.dryRun, { rollbackable: false, files: [], reason: 'no-scope' })

  // clean：scope 文件无未提交改动
  const cleanGit = await gitInitFixture({ 'a.txt': 'v1\n' })
  await ledgerFilesFixture(cleanGit, 'dev', blockFixture('DEV-532', { scope: 'a.txt' }))
  const cl = await revertPreview({ projectPath: cleanGit, type: 'dev', id: 'DEV-532' })
  assert.deepEqual(cl.dryRun, { rollbackable: false, files: [], reason: 'clean' })

  // rollbackable：scope 文件有未提交改动
  const dirty = await gitInitFixture({ 'a.txt': 'v1\n' })
  await ledgerFilesFixture(dirty, 'dev', blockFixture('DEV-533', { scope: 'a.txt' }))
  await writeFile(join(dirty, 'a.txt'), 'v2\n')
  const rb = await revertPreview({ projectPath: dirty, type: 'dev', id: 'DEV-533' })
  assert.equal(rb.ok, true)
  assert.equal(rb.dryRun.rollbackable, true)
  assert.deepEqual(rb.dryRun.files, [{ path: 'a.txt', status: 'modified' }])
  assert.equal(rb.dryRun.reason, undefined)

  // 块不存在 → 错误（路由层映射 404）
  const miss = await revertPreview({ projectPath: dirty, type: 'dev', id: 'DEV-999' })
  assert.equal(miss.ok, false)
  assert.equal(miss.code, 'not-found')
})

test('readSource: 只读返回账本源文件（枚举白名单，无穿越面）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'awf-src-'))
  const dev = join(dir, 'agent-workflow', 'tasks', 'dev')
  await mkdir(dev, { recursive: true })
  await writeFile(join(dev, 'current.md'), '# 正在开发\n\n## [DEV-600] 源文件任务\n')
  await writeFile(join(dir, 'agent-workflow', 'tasks', 'status.md'), 'status')

  // 正常读取
  const r = await readSource({ projectPath: dir, type: 'dev', file: 'current' })
  assert.equal(r.ok, true)
  assert.equal(r.source.type, 'dev')
  assert.equal(r.source.file, 'current')
  assert.equal(r.source.absPath, join(dir, 'agent-workflow', 'tasks', 'dev', 'current.md'))
  assert.ok(r.source.content.includes('## [DEV-600]'))

  // 枚举白名单：非法 type / file 直接拒绝（400），非法枚举组合不可能触达其他路径
  assert.equal((await readSource({ projectPath: dir, type: 'ops', file: 'current' })).code, 'bad-type')
  assert.equal((await readSource({ projectPath: dir, type: 'dev', file: 'secret' })).code, 'bad-file')
  assert.equal((await readSource({ projectPath: dir, type: 'dev', file: '../todo' })).code, 'bad-file')

  // 文件不存在 → not-found
  const miss = await readSource({ projectPath: dir, type: 'dev', file: 'done' })
  assert.equal(miss.ok, false)
  assert.equal(miss.code, 'not-found')
})

test('parseCheckItems: 解析任务块验收勾选；无 checkbox → null；注释内不计', () => {
  // 无 checkbox（纯字段块）
  assert.equal(parseCheckItems('## [DEV-800] 纯字段块\n\n| 字段 | 内容 |\n| 状态 | active |'), null)

  // 混合勾选：大写 X 也算；`### 验收标准` 之外的行也算（契约「块内任意 checkbox 行」）
  const md = [
    '## [DEV-801] 验收任务',
    '',
    '| 字段 | 内容 |',
    '|------|------|',
    '| 状态 | active |',
    '',
    '### 目标',
    '- [x] 目标区勾选也算',
    '',
    '### 验收标准',
    '- [x] 校验命令通过',
    '- [ ] 目标行为符合预期',
    '- [X] 大写也算勾选',
    '',
    '### 下一步',
    '无',
  ].join('\n')
  const ci = parseCheckItems(md)
  assert.equal(ci.total, 4)
  assert.equal(ci.done, 3)
  assert.deepEqual(ci.items[0], { checked: true, text: '目标区勾选也算' })
  assert.equal(ci.items[1].checked, true)
  assert.equal(ci.items[2].checked, false)
  assert.equal(ci.items[3].checked, true)

  // HTML 注释内的 checkbox 不计数（骨架示例块不污染统计）
  const commentMd = [
    '## [DEV-802] 注释任务',
    '',
    '<!-- 示例',
    '- [ ] 注释里的不算',
    '-->',
    '',
    '### 验收标准',
    '- [ ] 真勾选',
  ].join('\n')
  const ci2 = parseCheckItems(commentMd)
  assert.equal(ci2.total, 1)
  assert.equal(ci2.items[0].text, '真勾选')

  // 空内容 → null
  assert.equal(parseCheckItems(null), null)
})

test('ledgerOf: current 任务块带 checkItems（有勾选/无勾选）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'awf-check-'))
  const dev = join(dir, 'agent-workflow', 'tasks', 'dev')
  await mkdir(dev, { recursive: true })
  await writeFile(join(dir, 'agent-workflow', 'project.yaml'), 'id: x\nname: x\n')
  await writeFile(join(dev, 'current.md'), [
    '## [DEV-710] 带验收',
    '',
    '| 字段 | 内容 |',
    '|------|------|',
    '| 状态 | active |',
    '',
    '### 验收标准',
    '- [x] 甲',
    '- [ ] 乙',
    '',
    '## [DEV-711] 无验收',
    '',
    '| 字段 | 内容 |',
    '|------|------|',
    '| 状态 | active |',
  ].join('\n') + '\n')

  const led = await ledgerOf(dir)
  const withChecks = led.current.find((c) => c.id === 'DEV-710')
  assert.deepEqual(withChecks.checkItems, {
    done: 1,
    total: 2,
    items: [{ checked: true, text: '甲' }, { checked: false, text: '乙' }],
  })
  const none = led.current.find((c) => c.id === 'DEV-711')
  assert.equal(none.checkItems, null)
})
test('returnTaskToTodo: current 块移除并恢复 todo 行（startTask 逆操作）；无块返回 not-found', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'awf-return-'))
  const awf = join(dir, 'agent-workflow', 'tasks', 'dev')
  await mkdir(awf, { recursive: true })
  // 先 startTask 造一个 active 块，再放回
  await writeFile(join(awf, 'todo.md'), [
    '# 待开发',
    '',
    '| 任务ID | 优先级 | 描述 | 登记日期 |',
    '|--------|--------|------|----------|',
    '| DEV-300 | P1 | 回退还任务 | 2026-11-01 |',
  ].join('\n') + '\n')
  await writeFile(join(awf, 'current.md'), '# 正在开发\n\n（暂无进行中任务）\n')
  const started = await startTask({ projectPath: dir, type: 'dev', id: 'DEV-300' })
  assert.equal(started.ok, true)

  // 放回
  const r = await returnTaskToTodo({ projectPath: dir, type: 'dev', id: 'DEV-300' })
  assert.equal(r.ok, true)
  assert.equal(r.task.id, 'DEV-300')
  assert.equal(r.task.prio, 'P1')
  assert.equal(r.task.desc, '回退还任务')

  // current.md 应移除块（无 ## [DEV-300]）
  const cur = await readFile(join(awf, 'current.md'), 'utf8')
  assert.ok(!cur.includes('## [DEV-300]'), 'current.md 应移除任务块')

  // todo.md 应恢复行 + 保留表头
  const todo = await readFile(join(awf, 'todo.md'), 'utf8')
  assert.ok(todo.includes('| DEV-300 | P1 | 回退还任务 |'), 'todo.md 应恢复该任务行')
  assert.ok(todo.includes('| 任务ID | 优先级 | 描述 | 登记日期 |'), '表头应保留')

  // 放回后可再次 startTask（闭环）
  const again = await startTask({ projectPath: dir, type: 'dev', id: 'DEV-300' })
  assert.equal(again.ok, true)
  assert.equal(again.task.status, 'active')

  // 无此块 → not-found 且文件不变化
  const before = await snapshotDir(dir)
  const miss = await returnTaskToTodo({ projectPath: dir, type: 'dev', id: 'DEV-999' })
  assert.equal(miss.ok, false)
  assert.equal(miss.code, 'not-found')
  assert.deepEqual(await snapshotDir(dir), before)

  // 非法 type / id
  assert.equal((await returnTaskToTodo({ projectPath: dir, type: 'test', id: 'DEV-300' })).code, 'bad-type')
  assert.equal((await returnTaskToTodo({ projectPath: dir, type: 'dev', id: 'dev-300' })).code, 'bad-id')
})
