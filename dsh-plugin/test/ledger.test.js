// DEV-100：parseTodoRows 4 列回归 + 5 列兼容（依赖并入 desc）单测。
// 运行：cd dsh-plugin && node --test（package.json scripts.test = node --test "test/*.test.js"）
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseTodoRows } from '../src/ledger.js'

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
