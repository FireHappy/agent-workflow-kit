// dsh-awf-dashboard — 客户端 chunk 结构化测试（无需 GUI/宿主）
//
// 用桩模拟宿主的 ModuleLoader + react，加载 lib/client.js 后取 module.exports，
// 覆盖 DEV-179 新增/保留的纯函数：
//   WORKFLOW_STEPS / inferWorkflowStage / stageSummary（流程阶段推断与内联摘要）
// 类名契约相关断言（awf-stage*）在渲染层由宿主验证，这里只测纯函数语义。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

function loadClient() {
  const code = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
  let loaded = null
  const fakeWindow = {}
  fakeWindow.__ModuleLoader__ = { load(entry) { loaded = entry } }
  global.window = fakeWindow
  const reactStub = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: () => [null, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    useRef: () => ({}),
  }
  const requireStub = (id) => {
    if (id === 'react') return reactStub
    throw new Error('chunk 不应 require 未声明的外部模块: ' + id)
  }
  const source = new Function('window', 'require', 'module', 'exports', code)
  source(fakeWindow, requireStub, { exports: {} }, {})
  assert.ok(loaded, '必须通过 window.__ModuleLoader__.load 注册')
  assert.equal(loaded.id, 'dsh-awf-dashboard')
  const mod = loaded.factory(requireStub)
  return mod
}

// h() 桩元素树遍历：展开函数组件（桩不自动渲染）→ 文本展开 + 按条件收集节点
// 注意：renderLedgerBody 内的展示组件均为无 hooks 纯函数（TaskCard/Pill/StageInline…），可安全展开。
function expand(node) {
  if (node == null || typeof node === 'string') return node
  if (typeof node.type === 'function') return node.type(node.props || {})
  return node
}
function textOf(node) {
  if (node == null) return ''
  if (typeof node === 'string') return node
  const ch = Array.isArray(node.children) ? node.children : (node.children != null ? [node.children] : [])
  return ch.map((c) => textOf(expand(c))).join('')
}
function findNodes(root, pred, out = []) {
  if (root == null) return out
  if (Array.isArray(root)) { for (const n of root) findNodes(n, pred, out); return out }
  if (typeof root === 'string') return out
  const expanded = expand(root)
  if (Array.isArray(expanded)) { for (const n of expanded) findNodes(n, pred, out); return out }
  if (expanded && pred(expanded)) out.push(expanded)
  const ch = expanded && Array.isArray(expanded.children) ? expanded.children
    : (expanded && expanded.children != null ? [expanded.children] : [])
  for (const c of ch) findNodes(c, pred, out)
  return out
}
const clsHas = (n, part) => n && n.props && typeof n.props.className === 'string' && n.props.className.includes(part)

test('DEV-179 客户端 chunk：宿主加载契约', () => {
  const mod = loadClient()
  assert.equal(typeof mod.apply, 'function')
  assert.ok(Array.isArray(mod.inject))
  // 纯函数导出契约（README 文档化 + 单测断言）
  assert.equal(typeof mod.inferWorkflowStage, 'function')
  assert.equal(typeof mod.stageSummary, 'function')
  assert.ok(mod.WORKFLOW_STEPS.dev && mod.WORKFLOW_STEPS.debug && mod.WORKFLOW_STEPS.docs)
})

test('DEV-179 inferWorkflowStage：各类型/状态映射', () => {
  const { inferWorkflowStage } = loadClient()
  // dev：认领/方案/实现/验证/Review/归档（6 步）
  assert.deepEqual(inferWorkflowStage({ type: 'dev', status: 'active' }).index, 0)
  assert.equal(inferWorkflowStage({ type: 'dev', status: 'active' }).paused, false)
  assert.deepEqual(inferWorkflowStage({ type: 'dev', status: 'verify' }).index, 3)
  assert.deepEqual(inferWorkflowStage({ type: 'dev', status: 'review' }).index, 4)
  assert.deepEqual(inferWorkflowStage({ type: 'dev', status: 'handoff' }).index, 4)
  // debug：认领/选择诊断方式/收集证据/验证假设/修复与回归/归档（6 步）；verify=验证假设
  assert.deepEqual(inferWorkflowStage({ type: 'debug', status: 'verify' }).index, 3)
  // docs：认领/大纲与核实/撰写/审阅/归档（5 步）；verify/review=审阅
  assert.deepEqual(inferWorkflowStage({ type: 'docs', status: 'verify' }).index, 3)
  assert.deepEqual(inferWorkflowStage({ type: 'docs', status: 'review' }).index, 3)
  // blocked：停在 active 对应阶段并标注暂停
  const blk = inferWorkflowStage({ type: 'dev', status: 'blocked' })
  assert.equal(blk.paused, true)
  assert.deepEqual(blk.index, 0)
  // 未知类型 / 空入参 → null
  assert.equal(inferWorkflowStage({ type: 'nope', status: 'active' }), null)
  assert.equal(inferWorkflowStage(null), null)
  assert.equal(inferWorkflowStage({}), null)
})

test('DEV-179 stageSummary：内联阶段摘要文本（「流程 · <阶段> · 位置/总步数」）', () => {
  const { stageSummary, WORKFLOW_STEPS } = loadClient()
  const v = stageSummary({ type: 'dev', status: 'verify' })
  assert.equal(v.total, WORKFLOW_STEPS.dev.length)
  assert.equal(v.index, 3)
  assert.equal(v.current.label, '验证')
  assert.equal(v.text, '流程 · 验证 · 4/6')
  assert.equal(v.paused, false)
  // docs active → 1/5
  const d = stageSummary({ type: 'docs', status: 'active' })
  assert.equal(d.text, '流程 · 认领 · 1/5')
  // blocked → paused 语义保留，位置停在 active 阶段
  const b = stageSummary({ type: 'dev', status: 'blocked' })
  assert.equal(b.paused, true)
  assert.equal(b.text, '流程 · 认领 · 1/6')
  // 未知类型 → null
  assert.equal(stageSummary({ type: 'nope' }), null)
  assert.equal(stageSummary(null), null)
})

test('DEV-179 renderLedgerBody：当前任务行保持可点击（DEV-182 起无内联阶段徽章）+ DEV-205 版本 chip', () => {
  const mod = loadClient()
  const ledger = {
    project: { name: 'demo', path: '/tmp/demo' },
    current: [
      { id: 'DEV-1', type: 'dev', status: 'verify', prio: 'P1', title: '任务一', owner: 'lead', updated: '11-06' },
      { id: 'DEV-2', type: 'dev', status: 'blocked', prio: 'P2', title: '任务二', owner: 'lead' },
      { id: 'DOC-1', type: 'docs', status: 'active', title: '文档任务' },
    ],
    todo: [],
    recent: [],
  }
  const items = mod.renderLedgerBody(ledger, { onOpenSource: () => {}, onOpenArchive: () => {} })

  // DEV-182：静态流程阶段徽章/迷你分段已移除（status 静态映射无真实数据监控意义）
  const chips = findNodes(items, (n) => clsHas(n, 'awf-stage-chip'))
  assert.equal(chips.length, 0, 'DEV-182 起不再渲染 awf-stage-chip')
  const segs = findNodes(items, (n) => n && n.props && n.props.className === 'awf-stage-seg')
  assert.equal(segs.length, 0, 'DEV-182 起不再渲染 awf-stage-seg')

  // 回归：点击任务行仍打开详情（onClick 保留在 awf-row-clickable 上）
  const rows = findNodes(items, (n) => clsHas(n, 'awf-row-clickable'))
  assert.ok(rows.length >= 3, '当前任务行保持可点击')
  assert.equal(typeof rows[0].props.onClick, 'function')
})

test('DEV-205 renderLedgerBody：技能版本 chip 常显 + outdated 按骨架差量文案', () => {
  const mod = loadClient()
  const ledger = {
    project: { name: 'demo', path: '/tmp/demo' },
    current: [], todo: [], recent: [],
  }
  // outdated：技能版本 chip + 骨架版落后 → 「工作流可升级（骨架 v0.9.0 → v1.0.0）」
  const outdatedItems = mod.renderLedgerBody(ledger, {
    onOpenSource: () => {},
    versions: {
      status: 'outdated', installed: 'v0.9.0', installedFramework: 'v0.9.0', latestFramework: 'v1.0.0',
      upgradeTo: 'v1.0.0（骨架升级）', skillVersion: 'v1.4.1', latestAWF: 'v2', latestRelease: '1.4.1',
    },
    onUpgrade: () => {},
  })
  const skillChips = findNodes(outdatedItems, (n) => n && n.props && String(n.props.title || '').includes('技能版本'))
  assert.equal(skillChips.length, 1, '技能版本 chip 常显')
  assert.match(textOf(skillChips[0]), /技能版本 v1\.4\.1/)
  const chip = findNodes(outdatedItems, (n) => n && n.props && n.props.title && String(n.props.title).includes('工作流可升级'))
  assert.equal(chip.length, 1)
  assert.match(String(chip[0].props.title), /工作流可升级（骨架 v0\.9\.0 → v1\.0\.0）/)

  // latest：installed 展示骨架版（v1.0.0），技能版本 chip 仍在
  const latestItems = mod.renderLedgerBody(ledger, {
    onOpenSource: () => {},
    versions: { status: 'latest', installed: 'v1.0.0', installedFramework: 'v1.0.0', latestFramework: 'v1.0.0', skillVersion: 'v1.4.1' },
  })
  const latestChip = findNodes(latestItems, (n) => n && n.props && String(n.props.title || '').includes('工作流已最新'))
  assert.equal(latestChip.length, 1)
  const latestSkill = findNodes(latestItems, (n) => n && n.props && String(n.props.title || '').includes('技能版本'))
  assert.equal(latestSkill.length, 1)

  // 无版本信号 → 无任何版本 chip（兼容旧 client 契约）
  const noVs = mod.renderLedgerBody(ledger, { onOpenSource: () => {} })
  assert.equal(findNodes(noVs, (n) => n && n.props && String(n.props.title || '').includes('技能版本')).length, 0)
})
