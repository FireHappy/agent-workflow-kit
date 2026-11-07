
// ---- DEV-132：readSource 带任务 id → 单任务文件详情（点已完成/当前任务不再开整桶索引） ----
test('DEV-132 readSource dir：带 id 读单任务文件；不带 id 读桶 README', async () => {
  const { mkdtemp } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { readSource } = await import('../src/ledger.js')
  const root = await mkdtemp(join(tmpdir(), 'awf-srcid-'))
  try {
    await dirFixture(root).write()
    // 1) 带 id → 单任务文件详情
    const one = await readSource({ projectPath: root, type: 'dev', file: 'done', id: 'DEV-302' })
    assert.equal(one.ok, true)
    assert.ok(one.source.absPath.endsWith('/tasks/dev/done/DEV-302.md'))
    assert.equal(one.source.id, 'DEV-302')
    assert.match(one.source.content, /## \[DEV-302\] 目录式已完成/)
    assert.equal(one.source.content.includes('README'), false)
    // 2) 不带 id → 桶 README 检索索引（保留整桶视图能力）
    const idx = await readSource({ projectPath: root, type: 'dev', file: 'done' })
    assert.ok(idx.source.absPath.endsWith('/tasks/dev/done/README.md'))
    assert.match(idx.source.content, /^# done 索引/)
    // 3) 缺文件 → not-found；非法 id → bad-id
    const miss = await readSource({ projectPath: root, type: 'dev', file: 'done', id: 'DEV-999' })
    assert.equal(miss.ok, false); assert.equal(miss.code, 'not-found')
    const bad = await readSource({ projectPath: root, type: 'dev', file: 'done', id: 'x' })
    assert.equal(bad.ok, false); assert.equal(bad.code, 'bad-id')
    // 4) current 桶同样按 id 读单文件；todo 桶同理
    const cur = await readSource({ projectPath: root, type: 'dev', file: 'current', id: 'DEV-301' })
    assert.ok(cur.source.absPath.endsWith('/tasks/dev/current/DEV-301.md'))
    const td = await readSource({ projectPath: root, type: 'dev', file: 'todo', id: 'DEV-300' })
    assert.ok(td.source.absPath.endsWith('/tasks/dev/todo/DEV-300.md'))
  } finally {
    await (await import('node:fs/promises')).rm(root, { recursive: true, force: true })
  }
})

test('DEV-132 readSource legacy：id 被忽略（旧大文件语义保持）', async () => {
  const { readSource } = await import('../src/ledger.js')
  const root = '/no/such/legacy/project-' + Date.now()
  const r = await readSource({ projectPath: root, type: 'dev', file: 'done', id: 'DEV-999' })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'not-found')
})

// ---- DEV-127：目录式账本（tasks/<type>/{todo,current,done}/<ID>.md + README 索引） ----

const DIR_FIXTURE = {
  todo: `## [DEV-300] 目录式待办

| 字段 | 内容 |
|------|------|
| 优先级 | P2 |
| 状态 | todo |
| Owner | smoke |
| 登记日期 | 2026-11-04 |

### 目标
验证目录式认领/归档。

### 验收标准
- [ ] 认领后 current/ 出现且状态 active
- [ ] 归档后 done/ 出现且状态 done

### 下一步
跑测试。
`,
  current: `## [DEV-301] 目录式进行中

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | active |
| Owner | lead |
| 最近更新 | 2026-11-04 |

### 验收标准
- [x] 进行中块被看板列出

### 下一步
完成。
`,
  done: `## [DEV-302] 目录式已完成

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | done |
| 完成日期 | 2026-11-04 |

### 验收标准
- [x] 归档后计入最近完成
`,
}

function dirFixture(root) {
  return {
    root,
    awf: root + '/agent-workflow',
    write: async () => {
      const { mkdir, writeFile } = await import('node:fs/promises')
      for (const type of ['dev', 'debug', 'docs']) {
        for (const bucket of ['todo', 'current', 'done']) {
          await mkdir(`${root}/agent-workflow/tasks/${type}/${bucket}`, { recursive: true })
          await writeFile(`${root}/agent-workflow/tasks/${type}/${bucket}/README.md`, `# ${bucket} 索引\n\n（空）\n`, 'utf8')
        }
      }
      for (const [bucket, content] of Object.entries(DIR_FIXTURE)) {
        await writeFile(`${root}/agent-workflow/tasks/dev/${bucket}/DEV-30${bucket === 'todo' ? '0' : bucket === 'current' ? '1' : '2'}.md`, content, 'utf8')
      }
    },
  }
}

test('DEV-127 目录式 ledgerOf：current/todo/recent/fresh 全部识别', async () => {
  const { mkdtemp } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { ledgerOf } = await import('../src/ledger.js')
  const root = await mkdtemp(join(tmpdir(), 'awf-dir-'))
  try {
    await dirFixture(root).write()
    // status.md 缺失 → fresh=false（有账本文件时）
    let ledger = await ledgerOf(root)
    assert.ok(Array.isArray(ledger.current))
    assert.equal(ledger.current.length, 1)
    assert.equal(ledger.current[0].id, 'DEV-301')
    assert.equal(ledger.current[0].status, 'active')
    assert.deepEqual(ledger.todoRows.find((t) => t.type === 'dev').rows[0], {
      id: 'DEV-300', prio: 'P2', desc: '目录式待办', date: '2026-11-04',
    })
    assert.deepEqual(ledger.recent.map((r) => r.id), ['DEV-302'])
    assert.equal(ledger.status.fresh, false)
    // 写 status.md（mtime 晚于任务文件）→ fresh=true
    const { writeFile } = await import('node:fs/promises')
    await writeFile(`${root}/agent-workflow/tasks/status.md`, '# global\n', 'utf8')
    await new Promise((r) => setTimeout(r, 30))
    ledger = await ledgerOf(root)
    assert.equal(ledger.status.fresh, true)
  } finally {
    await (await import('node:fs/promises')).rm(root, { recursive: true, force: true })
  }
})

test('DEV-127 目录式 startTask：todo/<ID>.md 认领到 current/ + 状态 active', async () => {
  const { mkdtemp, readFile, readdir } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { startTask } = await import('../src/ledger.js')
  const root = await mkdtemp(join(tmpdir(), 'awf-start-'))
  try {
    await dirFixture(root).write()
    const res = await startTask({ projectPath: root, type: 'dev', id: 'DEV-300' })
    assert.equal(res.ok, true)
    assert.deepEqual(res.task, { id: 'DEV-300', type: 'dev', title: '目录式待办', prio: 'P2', status: 'active', date: '2026-11-04' })
    // todo/ 无该文件；current/ 有且状态 active
    assert.deepEqual((await readdir(`${root}/agent-workflow/tasks/dev/todo`)).sort(), ['README.md'])
    const moved = await readFile(`${root}/agent-workflow/tasks/dev/current/DEV-300.md`, 'utf8')
    assert.match(moved, /\| 状态 \| active \|/)
    assert.match(moved, /## \[DEV-300\] 目录式待办/)
  } finally {
    await (await import('node:fs/promises')).rm(root, { recursive: true, force: true })
  }
})

test('DEV-127 目录式 todoEdit：add 新建文件 / delete 删除文件', async () => {
  const { mkdtemp, readFile, readdir } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { todoEdit } = await import('../src/ledger.js')
  const root = await mkdtemp(join(tmpdir(), 'awf-todo-'))
  try {
    await dirFixture(root).write()
    const add = await todoEdit({ projectPath: root, type: 'dev', action: 'add', row: { id: 'DEV-303', '优先级': 'P3', desc: '新增待办' }, date: '2026-11-04' })
    assert.equal(add.ok, true)
    const added = await readFile(`${root}/agent-workflow/tasks/dev/todo/DEV-303.md`, 'utf8')
    assert.match(added, /## \[DEV-303\] 新增待办/)
    assert.match(added, /\| 状态 \| todo \|/)
    const del = await todoEdit({ projectPath: root, type: 'dev', action: 'delete', row: { id: 'DEV-303' } })
    assert.equal(del.ok, true)
    assert.deepEqual((await readdir(`${root}/agent-workflow/tasks/dev/todo`)).sort(), ['DEV-300.md', 'README.md'])
  } finally {
    await (await import('node:fs/promises')).rm(root, { recursive: true, force: true })
  }
})

test('DEV-127 目录式 readSource：返回桶 README 索引；writeSource 拒绝直写', async () => {
  const { mkdtemp } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { readSource, writeSource } = await import('../src/ledger.js')
  const root = await mkdtemp(join(tmpdir(), 'awf-src-'))
  try {
    await dirFixture(root).write()
    const r = await readSource({ projectPath: root, type: 'dev', file: 'current' })
    assert.equal(r.ok, true)
    assert.ok(r.source.absPath.endsWith('/tasks/dev/current/README.md'))
    assert.match(r.source.content, /^# current 索引/)
    const w = await writeSource({ projectPath: root, type: 'dev', file: 'current', content: 'x' })
    assert.equal(w.ok, false)
    assert.equal(w.code, 'readonly')
  } finally {
    await (await import('node:fs/promises')).rm(root, { recursive: true, force: true })
  }
})

test('DEV-127 skeletonFiles：目录式三桶 README + status.md 数据来源文案', async () => {
  const { mkdtemp } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { skeletonFiles } = await import('../src/ledger.js')
  const root = await mkdtemp(join(tmpdir(), 'awf-skel-'))
  try {
    const files = skeletonFiles({ projectPath: root, name: 'demo', purpose: 'demo 项目' })
    const paths = files.map((f) => f.path)
    for (const bucket of ['todo', 'current', 'done']) {
      assert.ok(paths.some((p) => p.endsWith(`/tasks/dev/${bucket}/README.md`)), `${bucket} README`)
      assert.ok(paths.some((p) => p.endsWith(`/tasks/debug/${bucket}/README.md`)))
      assert.ok(paths.some((p) => p.endsWith(`/tasks/docs/${bucket}/README.md`)))
    }
    const status = files.find((f) => f.path.endsWith('/tasks/status.md')).content
    assert.match(status, /tasks\/<type>\/\{todo,current,done\}\/<ID>\.md/)
  } finally {
    await (await import('node:fs/promises')).rm(root, { recursive: true, force: true })
  }
})

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

test('块式：非归档状态（active/archived/pending）与缺日期块跳过；done（DEV-127 目录式归档）计入', () => {
  const md = [
    '## [DEV-200] active 块',
    '| 状态 | active |',
    '| 最近更新 | 2026-11-03 |',
    '## [DEV-201] 目录式 done 块',
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
  // DEV-127：目录式归档文件状态字段=done（accounting 视同 完成/取消），必须计入
  const rows = parseDoneRows(md, 10)
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], { id: 'DEV-201', prio: '', desc: '目录式 done 块', date: '2026-11-02' })
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

// ---- DEBUG-002：recent 同日次键改为「任务 ID 数值倒序」（目录式不再字母序/legacy 不再行序反转） ----

test('DEBUG-002 目录式 recent：同日按任务 ID 数值倒序（字母序不再污染）', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { ledgerOf } = await import('../src/ledger.js')
  const root = await mkdtemp(join(tmpdir(), 'awf-dbg2-'))
  try {
    // 目录式三桶 + done 桶 6 个同日归档、2 个跨日（日期倒序在前）
    const mkDirFile = async (type, bucket, rel, content) => {
      const dir = join(root, 'agent-workflow', 'tasks', type, bucket)
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, rel), content, 'utf8')
    }
    for (const bucket of ['todo', 'current', 'done']) await mkDirFile('dev', bucket, 'README.md', `# ${bucket} 索引\n\n（空）\n`)
    const block = (id, date) => `## [${id}] 任务 ${id}\n\n| 字段 | 值 |\n|---|---|\n| 状态 | done |\n| 完成日期 | ${date} |\n`
    // 同日 2026-11-04 六个：字母序 115/116/…/134 → 期望按数值倒序 134/133/132/131/130/129
    for (const id of ['DEV-115', 'DEV-116', 'DEV-129', 'DEV-130', 'DEV-133', 'DEV-134']) {
      await mkDirFile('dev', 'done', id + '.md', block(id, '2026-11-04'))
    }
    await mkDirFile('dev', 'done', 'DEV-113.md', block('DEV-113', '2026-11-03')) // 更早日期排最后
    const ledger = await ledgerOf(root)
    assert.deepEqual(ledger.recent.map((r) => r.id), ['DEV-134', 'DEV-133', 'DEV-130', 'DEV-129', 'DEV-116', 'DEV-115', 'DEV-113'])
    // 最新完成的 DEV-134 必须排第一（用户观测：字母序下被 DEV-115 顶掉）
    assert.equal(ledger.recent[0].id, 'DEV-134')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('DEBUG-002 legacy recent：同日按任务 ID 数值倒序（表顶=最新，不再反转）', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { ledgerOf } = await import('../src/ledger.js')
  const root = await mkdtemp(join(tmpdir(), 'awf-dbg2l-'))
  try {
    const mk = async (type, doneMd) => {
      const dir = join(root, 'agent-workflow', 'tasks', type)
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'done.md'), doneMd + '\n')
    }
    // legacy 归档表：顶部插入最新（DEV-029 行号最小 = 最新完成）
    await mk('dev', [
      '| DEV-029 | P1 | 当日最新 | 2026-11-04 |',
      '| DEV-028 | P1 | 当日中间 | 2026-11-04 |',
      '| DEV-026 | P1 | 当日最早 | 2026-11-04 |',
      '| DEV-030 | P1 | 前一日 | 2026-10-30 |',
    ].join('\n'))
    await mk('debug', '| DEBUG-001 | P0 | 调试 | 2026-11-05 |')
    const ledger = await ledgerOf(root)
    // 跨类型日期倒序：DEBUG-001(11-05) 最先；同日 dev 三条约束为 ID 数值倒序 029/028/026
    assert.deepEqual(ledger.recent.map((r) => r.id), ['DEBUG-001', 'DEV-029', 'DEV-028', 'DEV-026', 'DEV-030'])
    assert.equal(ledger.recent[1].id, 'DEV-029') // 最新完成的当日任务排第二（跨类型之后第一个）
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

// ---- DEV-178：readProjectRelease 按 project.yaml version_file 解析（kit 锚点迁移适配） ----

test('DEV-178 readProjectRelease 默认：未配置 version_file → 读仓库根 VERSION（向后兼容）', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { readProjectRelease, projectVersionFile, readProjectMetaFile } = await import('../src/ledger.js')
  const root = await mkdtemp(join(tmpdir(), 'awf-vfdef-'))
  try {
    // 无 agent-workflow/project.yaml（或没有 version_file 键）→ 默认根 VERSION
    await writeFile(join(root, 'VERSION'), '1.1.7\n')
    assert.equal(projectVersionFile(root), join(root, 'VERSION'))
    assert.equal(await readProjectRelease(root), '1.1.7')
    // 读不到 → null
    await rm(join(root, 'VERSION'))
    assert.equal(await readProjectRelease(root), null)
    // 有 project.yaml 但未配置 version_file → 仍默认根 VERSION
    await mkdir(join(root, 'agent-workflow'), { recursive: true })
    await writeFile(join(root, 'agent-workflow', 'project.yaml'), 'id: demo\nname: demo\n')
    await writeFile(join(root, 'VERSION'), '0.9.0\n')
    const meta = await readProjectMetaFile(root)
    assert.equal(projectVersionFile(root, meta), join(root, 'VERSION'))
    assert.equal(await readProjectRelease(root), '0.9.0')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('DEV-178 readProjectRelease 已配置：version_file 指向的相对文件优先（kit 自身 = agent-workflow/VERSION）', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { readProjectRelease, projectVersionFile, readProjectMetaFile } = await import('../src/ledger.js')
  const root = await mkdtemp(join(tmpdir(), 'awf-vfcfg-'))
  try {
    await mkdir(join(root, 'agent-workflow'), { recursive: true })
    await writeFile(join(root, 'agent-workflow', 'project.yaml'),
      'id: agent-workflow-kit\nname: agent-workflow-kit\nversion_file: agent-workflow/VERSION\n')
    // 根 VERSION 存在但 version_file 指向 agent-workflow/VERSION → 读指向文件（kit 迁移后形态）
    await writeFile(join(root, 'VERSION'), '0.0.0-stale\n')
    await writeFile(join(root, 'agent-workflow', 'VERSION'), '1.1.7\n')
    const meta = await readProjectMetaFile(root)
    assert.equal(projectVersionFile(root, meta), join(root, 'agent-workflow', 'VERSION'))
    assert.equal(await readProjectRelease(root), '1.1.7')
    // 指向文件不存在 → null（不回退根 VERSION，与 bin/awf upgrade 锚点语义一致）
    await rm(join(root, 'agent-workflow', 'VERSION'))
    assert.equal(await readProjectRelease(root), null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

// ---- DEV-205 双版本模型：readProjectFrameworkVersion 骨架版读取 ----

test('DEV-205 readProjectFrameworkVersion：存在 → trim 后的骨架 semver；缺失/空 → null', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { readProjectFrameworkVersion } = await import('../src/ledger.js')
  const root = await mkdtemp(join(tmpdir(), 'awf-fwv-'))
  try {
    // 缺失 → null
    assert.equal(await readProjectFrameworkVersion(root), null)
    // 存在 → trim 后原样返回
    await mkdir(join(root, 'agent-workflow'), { recursive: true })
    await writeFile(join(root, 'agent-workflow', 'FRAMEWORK_VERSION'), '  1.0.0\n')
    assert.equal(await readProjectFrameworkVersion(root), '1.0.0')
    // 空内容 → null（骨架版不存在等价于未迁移）
    await writeFile(join(root, 'agent-workflow', 'FRAMEWORK_VERSION'), '  \n')
    assert.equal(await readProjectFrameworkVersion(root), null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})


// ---- DEV-205 双版本模型：versionStatus 骨架版判定链（lib/index.js 导出，纯函数无 cordis 上下文） ----
// lib/index.js 的模块级 AGENTS_HOME 在首次 import 时固化 → 本区块在模块顶层
// 一次性创建受控 DSH_AGENTS_HOME + kit 夹具，各用例只建自己的项目子目录；
// 不依赖真实全局索引 / 真实 kit 仓库状态。
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// 构造受控全局索引：AGENTS.md 内登记 agent-workflow-kit → kitPath。
async function writeAgentsIndex(agentsHome, kitPath) {
  const { mkdir, writeFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  await mkdir(agentsHome, { recursive: true })
  await writeFile(join(agentsHome, 'AGENTS.md'), [
    '# 测试索引',
    '<!-- awf:projects:begin -->',
    '| 项目ID | 别名 | 路径 | 入口 |',
    '|--------|------|------|------|',
    `| agent-workflow-kit | agent-workflow-kit | ${kitPath} | AGENTS.md |`,
    '<!-- awf:projects:end -->',
  ].join('\n') + '\n')
}

// kit 夹具：骨架版 1.0.0 / 技能版 1.4.1 / AWF 代次 2 / version_file → agent-workflow/VERSION。
async function writeKitFixture(kitPath) {
  const { mkdir, writeFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  await mkdir(join(kitPath, 'agent-workflow', 'bin'), { recursive: true })
  await writeFile(join(kitPath, 'agent-workflow', 'project.yaml'),
    'id: agent-workflow-kit\nname: agent-workflow-kit\nversion_file: agent-workflow/VERSION\n')
  await writeFile(join(kitPath, 'agent-workflow', 'FRAMEWORK_VERSION'), '1.0.0\n')
  await writeFile(join(kitPath, 'agent-workflow', 'VERSION'), '1.4.1\n')
  await writeFile(join(kitPath, 'agent-workflow', 'bin', 'awf'), '#!/usr/bin/env bash\nAWF_VERSION=2\n')
}

// 项目夹具：按 opts 写入可选版本信号。
async function writeProjectFixture(projPath, opts) {
  const { mkdir, writeFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  await mkdir(join(projPath, 'agent-workflow'), { recursive: true })
  if (opts.framework) await writeFile(join(projPath, 'agent-workflow', 'FRAMEWORK_VERSION'), opts.framework + '\n')
  if (opts.awf) {
    await mkdir(join(projPath, 'agent-workflow', 'bin'), { recursive: true })
    await writeFile(join(projPath, 'agent-workflow', 'bin', 'awf'), '#!/usr/bin/env bash\nAWF_VERSION=' + opts.awf + '\n')
  }
  if (opts.release) await writeFile(join(projPath, 'VERSION'), opts.release + '\n')
  if (opts.scaffold) {
    await writeFile(join(projPath, 'agent-workflow', 'project.yaml'),
      'id: proj\nname: proj\nscaffold_version: ' + opts.scaffold + '\n')
  }
}

const awfAgentsHome = await mkdtemp(join(tmpdir(), 'awf-agents-'))
process.env.DSH_AGENTS_HOME = awfAgentsHome // 必须在 import ../lib/index.js 前设置（模块级 AGENTS_HOME）
const awfKitPath = join(awfAgentsHome, 'kit')
await writeAgentsIndex(awfAgentsHome, awfKitPath)
await writeKitFixture(awfKitPath)

test('DEV-205 versionStatus 骨架链：骨架落后 → outdated（upgradeTo=v最新（骨架升级））；installed 优先骨架版', async () => {
  const { versionStatus } = await import('../lib/index.js')
  // 骨架落后（0.9.0 < 1.0.0）+ 项目同时有发布版 5.5.5 → installed 必须优先骨架版 v0.9.0
  const projPath = join(awfAgentsHome, 'proj-lag')
  await writeProjectFixture(projPath, { framework: '0.9.0', release: '5.5.5', awf: 2 })
  const vs = await versionStatus(projPath)
  assert.equal(vs.status, 'outdated')
  assert.equal(vs.upgradeTo, 'v1.0.0（骨架升级）')
  assert.equal(vs.installed, 'v0.9.0')
  assert.equal(vs.installedFramework, 'v0.9.0')
  assert.equal(vs.latestFramework, 'v1.0.0')
  assert.equal(vs.skillVersion, 'v1.4.1')
  assert.equal(vs.installedRelease, '5.5.5')
})

test('DEV-205 versionStatus 骨架链：骨架相同 → latest（技能更新不触发 outdated）', async () => {
  const { versionStatus } = await import('../lib/index.js')
  // 骨架相同 1.0.0；项目发布版 1.3.9 落后于 kit 技能版 1.4.1 —— 技能差量不判 outdated
  const projPath = join(awfAgentsHome, 'proj-same')
  await writeProjectFixture(projPath, { framework: '1.0.0', release: '1.3.9', awf: 2 })
  const vs = await versionStatus(projPath)
  assert.equal(vs.status, 'latest')
  assert.equal(vs.upgradeTo, null)
  assert.equal(vs.installed, 'v1.0.0')
  assert.equal(vs.skillVersion, 'v1.4.1')
})

test('DEV-205 versionStatus 回退链 1：无骨架版 → AWF 代次落后判 outdated（提示骨架版本迁移补写）', async () => {
  const { versionStatus } = await import('../lib/index.js')
  // 存量项目：无 FRAMEWORK_VERSION，AWF 代次 1 < kit 2 → 回退链判 outdated
  const projPath = join(awfAgentsHome, 'proj-awf1')
  await writeProjectFixture(projPath, { awf: 1 })
  const vs = await versionStatus(projPath)
  assert.equal(vs.status, 'outdated')
  assert.match(vs.upgradeTo, /v2（骨架契约升级；骨架版本迁移，awf upgrade 补写）/)
  assert.equal(vs.latestFramework, 'v1.0.0')
  assert.equal(vs.installedFramework, null)
  assert.equal(vs.skillVersion, 'v1.4.1')
  // AWF 代次相同 → latest
  const projPath2 = join(awfAgentsHome, 'proj-awf2')
  await writeProjectFixture(projPath2, { awf: 2 })
  const vs2 = await versionStatus(projPath2)
  assert.equal(vs2.status, 'latest')
})

test('DEV-205 versionStatus 回退链 2：无骨架版 + 无 AWF 代次 → 发布版 semver 判定（outdated 带迁移提示）', async () => {
  const { versionStatus } = await import('../lib/index.js')
  // 无 FRAMEWORK_VERSION、无 bin/awf，发布版 0.5.0 < kit 1.4.1 → 回退链 2 判 outdated
  const projPath = join(awfAgentsHome, 'proj-rel')
  await writeProjectFixture(projPath, { release: '0.5.0' })
  const vs = await versionStatus(projPath)
  assert.equal(vs.status, 'outdated')
  assert.equal(vs.upgradeTo, '1.4.1（骨架版本迁移，awf upgrade 补写）')
  assert.equal(vs.installed, 'v0.5.0')
})

test('DEV-205 夹具清理', async () => {
  const { rm } = await import('node:fs/promises')
  delete process.env.DSH_AGENTS_HOME
  await rm(awfAgentsHome, { recursive: true, force: true })
})
