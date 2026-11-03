// DEV-100：parseTodoRows 4 列回归 + 5 列兼容（依赖并入 desc）单测。
// DEV-101：parseDoneRows 4/5/6 列归档行兼容（desc = 第 3 列，完成日期 = 行内首个 YYYY-MM-DD）单测。
// 运行：cd dsh-plugin && node --test（package.json scripts.test = node --test "test/*.test.js"）
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseTodoRows, parseDoneRows } from '../src/ledger.js'

test('4 列行解析（回归：与旧实现结果一致）', () => {
  const rows = parseTodoRows('| DEV-054 | P0 | MRC physical camera route | 2026-11-03 |\n')
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], { id: 'DEV-054', prio: 'P0', desc: 'MRC physical camera route', date: '2026-11-03' })
})

test('5 列行：依赖并入 desc（title（依赖 deps））', () => {
  // 验收标准 2 的原样用例
  const rows = parseTodoRows('| DEV-010 | P0 | 示例任务 | 依赖A; 依赖B | 2026-11-03 |')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].desc, '示例任务（依赖 依赖A; 依赖B）')
  assert.deepEqual(rows[0], { id: 'DEV-010', prio: 'P0', desc: '示例任务（依赖 依赖A; 依赖B）', date: '2026-11-03' })
})

test('5 列行：deps 为空单元格时不并入（desc = title）', () => {
  const rows = parseTodoRows('| DEV-011 | P1 | 无依赖任务 |  | 2026-11-04 |')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].desc, '无依赖任务')
  assert.equal(rows[0].date, '2026-11-04')
})

test('5 列行：deps 为空字符串结尾时不并入（多列表格常见省略写法）', () => {
  const rows = parseTodoRows('| DEV-012 | P2 | 省略依赖格 | | 2026-11-05 |')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].desc, '省略依赖格')
})

test('表头行 / 分隔行不产生任务行', () => {
  const md = [
    '| 任务ID | Priority | Title | Dependencies | Date |',
    '|--------|----------|-------|--------------|------|',
    '| DEV-010 | P0 | 示例任务 | 依赖A | 2026-11-03 |',
  ].join('\n')
  const rows = parseTodoRows(md)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'DEV-010')
})

test('日期非法行跳过（日期不是 YYYY-MM-DD）', () => {
  // 5 列：最后一格不是合法日期
  assert.equal(parseTodoRows('| DEV-010 | P0 | 示例任务 | 依赖A | 2026-11-3 |').length, 0)
  assert.equal(parseTodoRows('| DEV-010 | P0 | 示例任务 | 依赖A | 2026/11/03 |').length, 0)
  assert.equal(parseTodoRows('| DEV-010 | P0 | 示例任务 | 依赖A | 11-03 |').length, 0)
  // 4 列：最后一格不是合法日期
  assert.equal(parseTodoRows('| DEV-010 | P0 | 示例任务 | 明天 |').length, 0)
})

test('ID 非法行跳过（不是 TYPE-数字）', () => {
  assert.equal(parseTodoRows('| bad-id | P0 | 示例任务 | 依赖A | 2026-11-03 |').length, 0)
  assert.equal(parseTodoRows('| DEV-010X | P0 | 示例任务 | 依赖A | 2026-11-03 |').length, 0)
  assert.equal(parseTodoRows('| DEV | P0 | 示例任务 | 依赖A | 2026-11-03 |').length, 0)
  assert.equal(parseTodoRows('| 010 | P0 | 示例任务 | 依赖A | 2026-11-03 |').length, 0)
  // 4 列同规则
  assert.equal(parseTodoRows('| BAD-ROW | P0 | 无日期 | 2026-11-03 |').length, 0)
})

test('空表返回 []（空字符串 / 只有注释与标题）', () => {
  assert.deepEqual(parseTodoRows(''), [])
  assert.deepEqual(parseTodoRows('# 正在排队的开发任务\n\n> 说明行\n'), [])
})

test('4 列行不被 5 列分支误吞（回归关键：deps 组不会吃掉 desc）', () => {
  const rows = parseTodoRows('| DEV-020 | P2 | 描述含 2026-11-03 字样 | 2026-11-03 |')
  assert.equal(rows.length, 1)
  // 4 列：第三格是 desc，第四格是日期；desc 不应被误并入依赖
  assert.equal(rows[0].desc, '描述含 2026-11-03 字样')
  assert.equal(rows[0].date, '2026-11-03')
})

test('混合表格：真实 todo.md 结构（表头 + 分隔 + 4/5 列混排）', () => {
  const md = [
    '# 正在排队的开发任务',
    '',
    '| 任务ID | Priority | Title | Date |',
    '|--------|----------|-------|------|',
    '| DEV-054 | P0 | MRC physical camera route | 2026-11-03 |',
    '| DEBUG-009 | P1 | Miracast 面板无法投屏 | 2026-08-25 |',
    '',
    '| 任务ID | Priority | Title | Dependencies | Date |',
    '|--------|----------|-------|--------------|------|',
    '| DEV-010 | P0 | 示例任务 | 依赖A; 依赖B | 2026-11-03 |',
    '| DEBUG-011 | P1 | 调试任务 | DEBUG-009 | 2026-11-04 |',
    '',
  ].join('\n')
  const rows = parseTodoRows(md)
  assert.deepEqual(rows.map((r) => r.id), ['DEV-054', 'DEBUG-009', 'DEV-010', 'DEBUG-011'])
  assert.equal(rows[2].desc, '示例任务（依赖 依赖A; 依赖B）')
  assert.equal(rows[3].desc, '调试任务（依赖 DEBUG-009）')
})

test('多行解析 + 单连字符 ID 前缀（DASH-100 等）均可解析', () => {
  const rows = parseTodoRows('| DASH-100 | P1 | 升级闭环 |  | 2026-11-01 |\n| DASH-200 | P2 | 面板 | 无 | 2026-11-02 |')
  assert.deepEqual(rows.map((r) => r.id), ['DASH-100', 'DASH-200'])
  assert.equal(rows[0].desc, '升级闭环')
  assert.equal(rows[1].desc, '面板（依赖 无）')
  // 双连字符 ID（如 KIT-DEV-017）不符合 [A-Z]+-[0-9]+ 规则 → 与账本校验一致地跳过
  assert.equal(parseTodoRows('| KIT-DEV-017 | P1 | 非法ID | | 2026-11-01 |').length, 0)
})

// ---- DEV-101：parseDoneRows 4/5/6 列归档行 ----

test('parseDoneRows 4 列行解析（回归：与旧实现结果一致）', () => {
  const rows = parseDoneRows('| DEV-010 | P0 | 示例任务 | 2026-11-03 |', 10)
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], { id: 'DEV-010', prio: 'P0', desc: '示例任务', date: '2026-11-03' })
})

test('parseDoneRows 5 列 docs 型：desc = 第 3 列，日期 = 完成日期格', () => {
  const rows = parseDoneRows('| DOCS-002 | P1 | 设计 VST 投屏与录屏技术方案 | Phase 0 实现（DEV-024~028）已回退 | 2026-07-22 |', 10)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'DOCS-002')
  assert.equal(rows[0].prio, 'P1')
  assert.equal(rows[0].desc, '设计 VST 投屏与录屏技术方案')
  assert.equal(rows[0].date, '2026-07-22')
})

test('parseDoneRows 6 列 dev/debug 型：日期后带链接列，链接含日期不抢前', () => {
  const md = '| DEBUG-008 | P0 | 系统组件投屏状态缓存导致启停命令误判 | Server 通过 AIDL Observer 推送状态 | 2026-08-11 | agent-workflow/memory/history/debug-008-2026-08-11.md |'
  const rows = parseDoneRows(md, 10)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].desc, '系统组件投屏状态缓存导致启停命令误判')
  // 完成日期 = 行内第一个 YYYY-MM-DD（日期格在链接列之前，链接内的 2026-08-11 不会抢前）
  assert.equal(rows[0].date, '2026-08-11')
})

test('parseDoneRows 表头行 / 分隔行 / 非任务行不产生记录', () => {
  const md = [
    '| 任务ID | 优先级 | 任务 | 摘要 | 完成日期 |',
    '|--------|--------|------|------|----------|',
    '| Field | Value |',
    '| 状态 | done |',
    '| DEV-010 | P0 | 示例任务 | 2026-11-03 |',
  ].join('\n')
  const rows = parseDoneRows(md, 10)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'DEV-010')
})

test('parseDoneRows 无日期行跳过（严格性：不把无日期行当完成记录）', () => {
  assert.equal(parseDoneRows('| DEV-099 | P2 | 无日期任务 | 待定 |', 10).length, 0)
  // 多列表格但整行不含任何 YYYY-MM-DD（如回顾表里的占位行）
  assert.equal(parseDoneRows('| DEV-099 | P2 | 无日期任务 | 待定 | 无 |', 10).length, 0)
  // 日期非法（非 YYYY-MM-DD）同样跳过
  assert.equal(parseDoneRows('| DEV-099 | P2 | 日期非法 | 2026/11/03 |', 10).length, 0)
})

test('parseDoneRows 按完成日期倒序 + 截取前 n 条（保持现状语义）', () => {
  const md = [
    '| DEV-001 | P1 | 较早 | 2026-09-01 |',
    '| DEV-002 | P0 | 中间 | 2026-10-01 |',
    '| DEV-003 | P0 | 最新 | 2026-11-01 |',
  ].join('\n')
  const rows = parseDoneRows(md, 2)
  assert.deepEqual(rows.map((r) => r.id), ['DEV-003', 'DEV-002'])
})

test('parseDoneRows 混排表格：4/5/6 列 + 表头 + 无日期行；空表返回 []', () => {
  const md = [
    '| 任务ID | 优先级 | 任务 | 摘要 | 完成日期 |',
    '|--------|--------|------|------|----------|',
    '| DEV-054 | P0 | MRC physical camera route | 2026-11-03 |',
    '| DEBUG-008 | P0 | 系统组件投屏状态缓存 | 摘要 | 2026-08-11 | agent-workflow/memory/history/debug-008-2026-08-11.md |',
    '| DOCS-002 | P1 | 设计 VST 技术方案 | 摘要 | 2026-07-22 |',
    '| DEV-099 | P2 | 无日期 | 待定 |',
    '',
  ].join('\n')
  const rows = parseDoneRows(md, 10)
  assert.deepEqual(rows.map((r) => r.id), ['DEV-054', 'DEBUG-008', 'DOCS-002'])
  assert.deepEqual(parseDoneRows('', 10), [])
  assert.deepEqual(parseDoneRows('# 归档\n\n> 说明行\n', 10), [])
})

// ---- DEV-102：parseDoneRows 块式归档 + ledgerOf recent 全局倒序 ----

test('块式：状态=完成 + 归档日期 → 计入最近完成（desc=标题）', () => {
  const md = [
    '## [DEV-058] XRBI Runtime 相机诊断 APK',
    '',
    '| Field | Value |',
    '|-------|-------|',
    '| Priority | P0 |',
    '| 状态 | 完成 |',
    '| 归档日期 | 2026-11-03 |',
  ].join('\n')
  const rows = parseDoneRows(md, 10)
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], { id: 'DEV-058', prio: 'P0', desc: 'XRBI Runtime 相机诊断 APK', date: '2026-11-03' })
})

test('块式：状态=取消 同样计入已归档记录', () => {
  const md = [
    '## [DEBUG-027] 已取消任务',
    '| 状态 | 取消 |',
    '| 归档日期 | 2026-11-03 |',
  ].join('\n')
  const rows = parseDoneRows(md, 10)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'DEBUG-027')
  assert.equal(rows[0].date, '2026-11-03')
})

test('块式：非归档状态（active/done/archived/pending）与缺日期块跳过', () => {
  const md = [
    '## [DEV-200] active 块',
    '| 状态 | active |',
    '| 最近更新 | 2026-11-03 |',
    '## [DEV-201] 旧式 done 块',
    '| 状态 | done |',
    '| Last Updated | 2026-11-02 |',
    '## [DEV-202] 本仓库 archived 块',
    '| 状态 | archived |',
    '| 完成日期 | 2026-11-01 |',
    '## [DEV-203] 完成但无日期块',
    '| 状态 | 完成 |',
    '| 优先级 | P2 |',
    '## [DEV-204] 日期键全缺的完成块',
    '| 状态 | 完成 |',
    '| 最近更新 | 待更新 |',
  ].join('\n')
  assert.deepEqual(parseDoneRows(md, 10), [])
})

test('块式：日期优先级 归档日期 > 完成日期 > 最近更新/Last Updated', () => {
  const md = [
    '## [DEV-301] 三键齐全',
    '| 状态 | 完成 |',
    '| 完成日期 | 2026-10-01 |',
    '| 最近更新 | 2026-11-03 |',
    '| 归档日期 | 2026-10-20 |',
    '## [DEV-302] 仅完成日期',
    '| 状态 | 完成 |',
    '| 完成日期 | 2026-10-15 |',
    '## [DEV-303] 英文键 Last Updated（带时间）',
    '| Status | 完成 |',
    '| Priority | P1 |',
    '| Last Updated | 2026-10-26 11:59 |',
  ].join('\n')
  const rows = parseDoneRows(md, 10)
  // 返回按日期倒序：DEV-303(10-26) > DEV-301(10-20) > DEV-302(10-15)
  assert.equal(rows.length, 3)
  assert.equal(rows[0].id, 'DEV-303')
  assert.equal(rows[0].date, '2026-10-26') // Last Updated 取 YYYY-MM-DD 部分
  assert.equal(rows[0].prio, 'P1')
  assert.equal(rows[1].id, 'DEV-301')
  assert.equal(rows[1].date, '2026-10-20') // 归档日期优先于更新更晚的最近更新
  assert.equal(rows[2].id, 'DEV-302')
  assert.equal(rows[2].date, '2026-10-15')
})

test('HTML 注释内的示例块不解析', () => {
  const md = [
    '<!--',
    '## [DEV-999] 骨架示例任务',
    '| 状态 | 完成 |',
    '| 归档日期 | 2026-11-03 |',
    '-->',
    '| DEV-100 | P1 | 真实任务 | 2026-11-02 |',
  ].join('\n')
  const rows = parseDoneRows(md, 10)
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], { id: 'DEV-100', prio: 'P1', desc: '真实任务', date: '2026-11-02' })
})

test('行 + 块去重：同 ID 块式优先（desc/date/prio 取块）', () => {
  const md = [
    '| DEV-100 | P1 | 行式描述 | 2026-08-10 |',
    '## [DEV-100] 块式标题',
    '| Field | Value |',
    '|-------|-------|',
    '| 状态 | 完成 |',
    '| 优先级 | P0 |',
    '| 归档日期 | 2026-11-03 |',
  ].join('\n')
  const rows = parseDoneRows(md, 10)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].desc, '块式标题')
  assert.equal(rows[0].prio, 'P0')
  assert.equal(rows[0].date, '2026-11-03')
})

test('行 + 块混合：倒序取前 n（块的新近日期排前）', () => {
  const md = [
    '| DOCS-010 | P1 | 老归档 | 2026-09-10 |',
    '## [DEBUG-014] 新块归档',
    '| 状态 | 完成 |',
    '| 归档日期 | 2026-11-03 |',
    '| DEV-020 | P2 | 中间行 | 2026-10-05 |',
  ].join('\n')
  const rows = parseDoneRows(md, 2)
  assert.deepEqual(rows.map((r) => r.id), ['DEBUG-014', 'DEV-020'])
})

test('ledgerOf recent 全局按日期倒序、跨类型混合（修复 dev 独占槽位缺陷）', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const root = await mkdtemp(join(tmpdir(), 'awf-recent-'))
  const { ledgerOf } = await import('../src/ledger.js')
  try {
    const mk = async (type, doneMd) => {
      const dir = join(root, 'agent-workflow', 'tasks', type)
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'done.md'), doneMd + '\n')
    }
    // dev 2 条（较早）、debug 1 条（中间）、docs 1 条（最新）→ 全局应为 docs > debug > dev
    await mk('dev', '| DEV-001 | P1 | 较早 | 2026-09-01 |\n| DEV-002 | P2 | 更早 | 2026-08-01 |')
    await mk('debug', '| DEBUG-001 | P0 | 中间 | 2026-10-01 |')
    await mk('docs', '## [DOCS-001] 最新块\n| 状态 | 完成 |\n| 归档日期 | 2026-11-02 |')
    const ledger = await ledgerOf(root)
    // dev 2 条 + debug 1 条 + docs 1 条 = 4 条，全局倒序
    assert.deepEqual(ledger.recent.map((r) => r.id), ['DOCS-001', 'DEBUG-001', 'DEV-001', 'DEV-002'])
    assert.deepEqual(ledger.recent.map((r) => r.type), ['docs', 'debug', 'dev', 'dev'])
    assert.equal(ledger.recent.length, 4)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
