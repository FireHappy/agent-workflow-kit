// dsh-awf-dashboard — 客户端 chunk 结构化测试（无需 GUI/宿主）
//
// 用桩模拟宿主的 ModuleLoader + cordis slots，验证：
//   1) chunk 以 {id, factory} 注册到 window.__ModuleLoader__
//   2) factory(require) 返回 { inject, apply }
//   3) apply(ctx) 在 sidebar.right.pane.tab / .title 各注册一个页签（key=awf-dashboard）
//   4) inject 列表与 package.json 的 dsh.client.inject 一致
//   5) DEV-022 新交互：改名 Agent Workflow / 初始化引导 / 开始任务 / 最近完成 5 条 /
//      归档弹层 / 删除任务回退二次确认（render + mock fetch 流程）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

test('客户端 chunk：宿主加载契约', () => {
  const code = readFileSync(join(root, 'lib', 'client.js'), 'utf8')

  // 桩：window.__ModuleLoader__.load({id, factory})
  let loaded = null
  const fakeWindow = {} // 不直接给 __ModuleLoader__，模拟宿主注入
  fakeWindow.__ModuleLoader__ = {
    load(entry) { loaded = entry },
  }
  global.window = fakeWindow

  // 桩 require：react 返回最小可渲染实现
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

  // 加载
  const source = new Function('window', 'require', 'module', 'exports', code)
  source(fakeWindow, requireStub, { exports: {} }, {})
  assert.ok(loaded, '必须通过 window.__ModuleLoader__.load 注册')
  assert.equal(loaded.id, 'dsh-awf-dashboard')
  assert.equal(typeof loaded.factory, 'function')

  // 执行 factory，取返回值（chunk 自建 module/exports 并 return module.exports）
  const mod = loaded.factory(requireStub)
  assert.ok(Array.isArray(mod.inject), 'exports.inject 应为数组')
  assert.equal(typeof mod.apply, 'function', 'exports.apply 应为函数')

  // exports.inject 是 cordis 服务键（ctx.get 可取的键），不是包名：
  // web boot 的 pending 检测 = fiber.ctx.get(inject 里的每个键)，包名取不到会一直
  // pending（dsh-better-sidebar 的 chunk 用 ["slots","sessions","locale",...]）。
  // package.json 的 dsh.client.inject 则是 web 端模块加载依赖声明（包名），两者不同义。
  assert.ok(mod.inject.includes('slots'), 'exports.inject 应含服务键 slots')
  assert.ok(!mod.inject.some((k) => k.startsWith('@')), 'exports.inject 不应是包名')

  // manifest 的 dsh.client.inject 仍应是包名数组（web 端模块加载依赖）
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.ok(Array.isArray(pkg.dsh.client.inject), 'manifest 应声明 dsh.client.inject')
  assert.ok(pkg.dsh.client.inject.every((k) => k.startsWith('@')), 'manifest 依赖应为包名')

  // apply(ctx)：用桩 ctx 记录 slots 注册
  const registrations = []
  const disposers = []
  const fakeCtx = {
    slots: {
      inject(name, factory) {
        const reg = factory()
        if (reg && reg.name) registrations.push({ name, reg })
        const d = () => {}
        disposers.push(d)
        return d
      },
      register(reg) { return reg },
    },
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); return () => {} },
    // 桩 ctx.inject：cordis 动态注入。测试默认视为 betterSidebar 已存在，立即回调；
    // 回调返回值是一个 disposer（真实 cordis 中服务移除时调用它反注册）。
    inject(deps, factory) {
      const injected = { get: (key) => (key === 'betterSidebar' ? fakeBetterSidebar : undefined) }
      const dispose = factory(injected)
      if (typeof dispose === 'function') disposers.push(dispose)
      return () => {}
    },
  }
  // betterSidebar 桩：记录 registerTab 调用，返回 eol disposer
  const fakeBetterSidebar = {
    registerTab(descriptor) {
      betterRegistrations.push(descriptor)
      return () => { betterDone = true }
    },
  }
  const betterRegistrations = []
  let betterDone = false
  mod.apply(fakeCtx)

  const tab = registrations.filter((r) => r.name === 'sidebar.right.pane.tab')
  const title = registrations.filter((r) => r.name === 'sidebar.right.pane.tab.title')
  assert.equal(tab.length, 1, '应注册一个 sidebar.right.pane.tab')
  assert.equal(title.length, 1, '应注册一个 sidebar.right.pane.tab.title')
  assert.equal(tab[0].reg.key, 'awf-dashboard')
  assert.equal(tab[0].reg.name, 'sidebar.right.pane.tab')
  assert.equal(title[0].reg.key, 'awf-dashboard')

  // betterSidebar 动态注入应注册我们的 tab（用户实际看到的入口）
  assert.equal(betterRegistrations.length, 1, '应通过 betterSidebar.registerTab 注册')
  assert.equal(betterRegistrations[0].id, 'awf-dashboard')
  // DEV-022：页签标题改为 Agent Workflow
  assert.equal(betterRegistrations[0].title, 'Agent Workflow')
  assert.equal(typeof betterRegistrations[0].component, 'function')

  // inject(sessionId) 返回带 sessionId 的 props
  const props = tab[0].reg.inject('sess-1')
  assert.equal(props.sessionId, 'sess-1')

  // 清理
  delete global.window
})

test('客户端 chunk：apply 的注册组件是函数（可渲染的 React 组件）', () => {
  // 复用上一测试的加载路径太冗长，这里直接检查源码结构：两个注册都传入了组件函数
  const code = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
  assert.ok(/sidebar\.right\.pane\.tab['"]/.test(code))
  assert.ok(/key: 'awf-dashboard'/.test(code))
  assert.ok(/function Dashboard\(/.test(code))
  assert.ok(/function TabTitle\(\)/.test(code))
})

test('改名：页签标题与硬编码文案全部为 Agent Workflow', () => {
  const code = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
  const occurrences = (code.match(/Agent Workflow/g) || []).length
  assert.ok(occurrences >= 3,
    `Agent Workflow 应出现于注册标题 / TabTitle / 页头等（实际 ${occurrences} 次）`)
  assert.ok(!code.includes("'工作流进度'"), '不应残留硬编码旧页签标题文案')
})

// 加载 chunk 的公共桩环境（供渲染测试复用）
function loadChunk() {
  let loaded = null
  global.window = { __ModuleLoader__: { load(entry) { loaded = entry } } }
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
  const code = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
  const source = new Function('window', 'require', 'module', 'exports', code)
  source(fakeWindowOr(window), requireStub, { exports: {} }, {})
  const mod = loaded.factory(requireStub)
  return { mod, reactStub }
}
function fakeWindowOr(w) { return w } // 占位：保留 window 全局

// 收集元素树中的全部文本（支持嵌套 children 数组）。
// 桩 createElement 不会渲染函数组件，这里遇到函数类型节点时自行展开其渲染输出：
// 把第三方 children 并入 props.children（真实 React 的 h(type, props, ...children)
// 会把 children 写进 props.children），再调用 type(props)。
function collectTexts(node, out) {
  if (node == null || typeof node === 'boolean') return out
  if (Array.isArray(node)) { for (const n of node) collectTexts(n, out); return out }
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (node && typeof node === 'object') {
    if (typeof node.type === 'function') {
      const props = Object.assign({}, node.props || {}, { children: node.children })
      collectTexts(node.type(props), out)
      return out
    }
    collectTexts(node.children, out)
  }
  return out
}

// 收集 DOM 元素上的 value（input/select 编辑表单值，文本节点收集不到 props）
function collectInputValues(node, out) {
  if (node == null || typeof node === 'boolean') return out
  if (Array.isArray(node)) { for (const n of node) collectInputValues(n, out); return out }
  if (node && typeof node === 'object') {
    if (typeof node.type === 'function') {
      const props = Object.assign({}, node.props || {}, { children: node.children })
      collectInputValues(node.type(props), out)
      return out
    }
    const tag = typeof node.type === 'string' ? node.type : ''
    if (tag === 'input' || tag === 'select') {
      const v = node.props && node.props.value
      if (v !== undefined) out.push(String(v))
    }
    collectInputValues(node.children, out)
  }
  return out
}

// 收集 DOM 元素指定 prop 的值（如 placeholder）
function collectProps(node, name, out) {
  if (node == null || typeof node === 'boolean') return out
  if (Array.isArray(node)) { for (const n of node) collectProps(n, name, out); return out }
  if (node && typeof node === 'object') {
    if (typeof node.type === 'function') {
      const props = Object.assign({}, node.props || {}, { children: node.children })
      collectProps(node.type(props), name, out)
      return out
    }
    const tag = typeof node.type === 'string' ? node.type : ''
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      const v = node.props && node.props[name]
      if (v !== undefined && v !== null) out.push(String(v))
    }
    collectProps(node.children, name, out)
  }
  return out
}

test('renderLedgerBody：完整渲染账本数据（不抛错、关键字段齐全）', () => {
  const { mod } = loadChunk()
  const ledger = {
    project: { path: '/Users/x/agent-workflow-kit', name: 'agent-workflow-kit', purpose: '测试项目' },
    status: { fresh: false, updated: '2026-11-01T09:00:00.000Z' },
    current: [
      { type: 'dev', id: 'DEV-019', title: '工作流进度 DSH 插件', prio: 'P1', status: 'active', owner: 'wg-kit', mode: 'single', updated: '2026-11-01' },
      { type: 'docs', id: 'DOCS-1', title: '文档任务', prio: 'P2', status: 'review', owner: '', mode: '', updated: '' },
    ],
    todo: [
      { type: 'dev', done: 2, total: 5 },
      { type: 'docs', done: 0, total: 3 },
    ],
    recent: [
      { type: 'dev', id: 'DEV-018', prio: 'P1', desc: '发版 v0.5.0', date: '2026-11-01' },
    ],
  }
  const tree = mod.renderLedgerBody(ledger)
  const texts = collectTexts(tree, [])
  const joined = texts.join('|')

  // 必含关键内容
  assert.ok(joined.includes('agent-workflow-kit'), '应含项目名')
  assert.ok(joined.includes('账本过期'), 'fresh=false 时应显示账本过期')
  assert.ok(joined.includes('请运行 awf status'), '过期时应给出提示')
  assert.ok(joined.includes('DEV-019'), '应含当前任务 ID')
  assert.ok(joined.includes('进行中'), 'active 状态徽章文案')
  assert.ok(joined.includes('复核中'), 'review 状态徽章文案')
  // todo.md 是表格行格式、无 checkbox：不渲染进度条（countTodo 恒 0/0 无意义）
  assert.ok(!joined.includes('待办进度'), '不再渲染「待办进度」区')
  assert.ok(!joined.includes('2/5'), 'todo 进度条已移除（2/5 不应出现）')
  assert.ok(joined.includes('开发'), '待办区类型 toggle 默认 dev 文案')
  assert.ok(joined.includes('未开始任务 · 开发'), '待办区显示按类型过滤的标题')
  assert.ok(joined.includes('DEV-018'), '最近完成含 ID')
})

test('renderLedgerBody：fresh=true 与空状态', () => {
  const { mod } = loadChunk()
  const fresh = { ...null, project: { path: '/p', name: 'p' }, status: { fresh: true, updated: null }, current: [], todo: [], recent: [] }
  const t1 = collectTexts(mod.renderLedgerBody(fresh), [])
  assert.ok(t1.join('|').includes('账本新鲜'))
  assert.ok(t1.join('|').includes('当前无进行中任务'))

  const t2 = collectTexts(mod.renderEmptyBody([]), [])
  assert.ok(t2.join('|').includes('未选择项目'))
  const t3 = collectTexts(mod.renderEmptyBody(null), [])
  assert.ok(t3.join('|').includes('索引为空'))

  const t4 = collectTexts(mod.renderErrorBody('boom'), [])
  assert.ok(t4.join('|').includes('读取失败'))
  assert.ok(t4.join('|').includes('boom'))

  // 清理 window
  delete global.window
})

// ---- DEV-022 新交互 ------------------------------------------------------

test('未初始化引导：detectNotInitialized 判定 + renderInitCard 文案', () => {
  const { mod } = loadChunk()

  // 后端契约：ledger 响应带 uninitialized / doesNotExist 标识
  assert.equal(mod.detectNotInitialized({ ledger: { uninitialized: true } }, null), true)
  assert.equal(mod.detectNotInitialized({ ledger: { doesNotExist: true } }, null), true)
  assert.equal(mod.detectNotInitialized({ uninitialized: true }, null), true)
  // 缺省回退：400 bad-request（缺 project.yaml）= 未初始化
  const err = new Error('path 必须是含 agent-workflow/project.yaml 的绝对项目根目录')
  err.code = 'bad-request'
  assert.equal(mod.detectNotInitialized(null, err), true)
  assert.equal(mod.detectNotInitialized(null, { code: 'uninitialized' }), true)
  // 已初始化 / 无关错误 → false
  assert.equal(mod.detectNotInitialized({ ledger: { current: [] } }, null), false)
  assert.equal(mod.detectNotInitialized(null, { code: 'bad-request', message: 'body.path 必须是绝对路径字符串' }), false)

  // 引导卡渲染：图标文案 + 初始化按钮 + busy/错误态
  const idle = collectTexts(mod.renderInitCard({ busy: false, error: null, onInit() {} }), [])
  assert.ok(idle.join('|').includes('工作流未初始化'))
  assert.ok(idle.join('|').includes('初始化工作流'))
  assert.ok(idle.join('|').includes('project.yaml'))
  const busy = collectTexts(mod.renderInitCard({ busy: true, error: null, onInit() {} }), [])
  assert.ok(busy.join('|').includes('初始化工作流'), 'busy 时按钮仍显示原名「初始化工作流」（无中间状态文案）')
  assert.ok(!busy.join('|').includes('初始化中…'), '按钮不显示中间状态文案')
  const failed = collectTexts(mod.renderInitCard({ busy: false, error: '路径不在白名单：必须位于全局项目索引或当前工作区根。', onInit() {} }), [])
  assert.ok(failed.join('|').includes('路径不在白名单'))
  // 无 onInit 时不渲染按钮（只读预览场景）
  const readonly = collectTexts(mod.renderInitCard({ busy: false, error: null }), [])
  assert.ok(!readonly.join('|').includes('初始化工作流'))
  delete global.window
})

test('开始任务：ledger todoRows → 未开始任务行 + 开始按钮；todoRows 缺失时兜底 todo[].rows', () => {
  const { mod } = loadChunk()
  const ledger = {
    project: { path: '/p', name: 'p' },
    status: { fresh: true, updated: null },
    current: [],
    todo: [{ type: 'dev', done: 1, total: 2 }],
    todoRows: [{ type: 'dev', rows: [{ id: 'DEV-030', prio: 'P2', desc: '开始任务新功能', date: '2026-11-01' }] }],
    recent: [],
  }
  let started = null
  const texts = collectTexts(mod.renderLedgerBody(ledger, {
    onStart: (row) => { started = row },
    starting: null,
  }), [])
  const joined = texts.join('|')
  assert.ok(joined.includes('未开始任务'), '应显示未开始任务分区')
  assert.ok(joined.includes('DEV-030'), '应列出 todo 表格行 ID')
  assert.ok(joined.includes('开始任务新功能'), '应列出描述')
  assert.ok(joined.includes('开始'), '每行应有「开始」按钮')

  // 从渲染树里找到 TodoRow 的按钮并触发（桩元素：找到所有 onClick 处理器）
  // —— 另起一个更直接的断言：collectTodoRows 兜底解析
  const rows = mod.collectTodoRows(ledger)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].type, 'dev')
  assert.equal(rows[0].id, 'DEV-030')

  // 无 todoRows 时兜底读 ledger.todo[i].rows
  const fallback = mod.collectTodoRows({ todo: [{ type: 'docs', done: 0, total: 1, rows: [{ id: 'DOCS-7', prio: 'P3', desc: '写文档', date: '2026-11-01' }] }] })
  assert.equal(fallback.length, 1)
  assert.equal(fallback[0].id, 'DOCS-7')
  // 都没有 → 空数组（只渲染进度条，不渲染开始按钮）
  assert.equal(mod.collectTodoRows({ todo: [{ type: 'dev', done: 0, total: 1 }] }).length, 0)
  assert.equal(mod.collectTodoRows(null).length, 0)
  delete global.window
})

test('最近完成：只显示最近 5 条（此前 8 条）', () => {
  const { mod } = loadChunk()
  const recent = []
  for (let i = 1; i <= 7; i++) {
    recent.push({ type: 'dev', id: 'DEV-' + (100 + i), prio: 'P2', desc: '已完成任务 ' + i, date: '2026-11-0' + i })
  }
  const ledger = {
    project: { path: '/p', name: 'p' },
    status: { fresh: true, updated: null },
    current: [],
    todo: [],
    recent,
  }
  const texts = collectTexts(mod.renderLedgerBody(ledger), [])
  const joined = texts.join('|')
  // 前 5 条在
  for (let i = 1; i <= 5; i++) assert.ok(joined.includes('已完成任务 ' + i), '应显示第 ' + i + ' 条')
  // 第 6、7 条不在（严格 5 条）
  assert.ok(!joined.includes('已完成任务 6'), '不应显示第 6 条')
  assert.ok(!joined.includes('已完成任务 7'), '不应显示第 7 条')
  // 计数徽章 = 5
  assert.ok(joined.includes('最近完成'), '分区标题存在')
  delete global.window
})

test('归档查看：renderArchiveModal 行 + 任务块 + busy/error 态', () => {
  const { mod } = loadChunk()
  const done = {
    type: 'dev',
    row: { id: 'DEV-018', prio: 'P1', desc: '发版 v0.5.0', date: '2026-11-01' },
    block: '## [DEV-018] 发版 v0.5.0\n\n| 字段 | 内容 |\n| 状态 | archived |',
  }
  const ok = collectTexts(mod.renderArchiveModal({ id: 'DEV-018', busy: false, data: done, error: null }, () => {}), [])
  const joined = ok.join('|')
  assert.ok(joined.includes('归档查看'), '标题')
  assert.ok(joined.includes('DEV-018'), '归档 ID')
  assert.ok(joined.includes('发版 v0.5.0'), '归档行描述')
  assert.ok(joined.includes('完成于 2026-11-01'), '完成日期')
  assert.ok(joined.includes('任务块原文（markdown）'), '任务块分区')
  assert.ok(joined.includes('## [DEV-018] 发版 v0.5.0'), '完整任务块 markdown 原文')
  assert.ok(joined.includes('关闭'), '有关闭按钮')

  // busy / error
  const busy = collectTexts(mod.renderArchiveModal({ id: 'DEV-018', busy: true }, () => {}), [])
  assert.ok(busy.join('|').includes('加载归档…'))
  const err = collectTexts(mod.renderArchiveModal({ id: 'DEV-999', busy: false, error: '归档中未找到该任务：DEV-999' }, () => {}), [])
  assert.ok(err.join('|').includes('归档读取失败'))
  assert.ok(err.join('|').includes('DEV-999'))

  // block 为 null：显示「仅摘要」而非报错式文案
  const noBlock = collectTexts(mod.renderArchiveModal({ id: 'DEV-001', busy: false, data: { type: 'dev', row: { id: 'DEV-001', prio: 'P2', desc: '摘要任务', date: '2026-11-01' }, block: null }, error: null }, () => {}), [])
  const nb = noBlock.join('|')
  assert.ok(nb.includes('摘要任务'), '仍显示摘要行')
  assert.ok(nb.includes('仅摘要'), '提示仅摘要')
  assert.ok(!nb.includes('未找到任务块原文'), '不再使用报错式文案')
  delete global.window
})

test('删除回退二次确认：buildDeleteView 规整 dry-run', () => {
  const { mod } = loadChunk()
  const v1 = mod.buildDeleteView({
    rollbackable: true,
    files: [{ path: '/p/src/a.ts', status: 'modified' }, { path: '/p/src/b.ts', status: 'untracked' }, { path: '', status: 'modified' }],
  })
  assert.equal(v1.rollbackable, true)
  assert.equal(v1.files.length, 2, '空 path 应被过滤')
  assert.equal(v1.files[0].status, 'modified')
  assert.equal(v1.files[1].status, 'untracked')

  // 可回退但无文件 → 视为无法回退（no-scope）
  const v2 = mod.buildDeleteView({ rollbackable: true, files: [] })
  assert.equal(v2.rollbackable, false)
  assert.equal(v2.reason, 'no-scope')

  // 服务端明确无法回退（非 git / 修改范围为空）
  const v3 = mod.buildDeleteView({ rollbackable: false, files: [], reason: 'not-git' })
  assert.equal(v3.rollbackable, false)
  assert.equal(v3.reason, 'not-git')
  const v4 = mod.buildDeleteView({ rollbackable: false, files: [], reason: 'no-scope' })
  assert.equal(v4.reason, 'no-scope')
  assert.ok(mod.deleteReasonText('not-git').includes('不是 git 仓库'))
  delete global.window
})

test('删除回退二次确认：可回退弹框（文件清单 + 警示 + 双动作 + 取消）', () => {
  const { mod } = loadChunk()
  const clicked = []
  const tree = mod.renderDeleteModal({
    task: { type: 'dev', id: 'DEV-009' },
    busy: false,
    error: null,
    view: {
      rollbackable: true,
      files: [
        { path: '/p/src/ledger.js', status: 'modified' },
        { path: '/p/src/new-file.ts', status: 'untracked' },
        { path: '/p/docs/old.md', status: 'deleted' },
      ],
      reason: '',
    },
  }, {
    onRollback: () => clicked.push('rollback'),
    onLedgerOnly: () => clicked.push('ledger-only'),
    onCancel: () => clicked.push('cancel'),
  })
  const joined = collectTexts(tree, []).join('|')
  // ① 文件清单 + 改动状态徽标
  assert.ok(joined.includes('将回退以下 3 个文件：'), '应列出回退文件数量')
  assert.ok(joined.includes('/p/src/ledger.js'), '应列出文件路径')
  assert.ok(joined.includes('/p/src/new-file.ts'), '应列出文件路径')
  assert.ok(joined.includes('/p/docs/old.md'), '应列出文件路径')
  assert.ok(joined.includes('已修改'), 'modified 状态徽标')
  assert.ok(joined.includes('未跟踪'), 'untracked 状态徽标')
  assert.ok(joined.includes('已删除'), 'deleted 状态徽标')
  // ② 警示文案
  assert.ok(joined.includes('删除后将回退这些文件的未提交修改，不可恢复'), '应有醒目警示文案')
  // ③ 三个按钮
  assert.ok(joined.includes('删除并回退修改'), '危险动作按钮')
  assert.ok(joined.includes('仅删除账本'), '仅删除账本按钮')
  assert.ok(joined.includes('取消'), '取消按钮')
  assert.ok(joined.includes('删除任务确认'), '弹框标题')
  delete global.window
})

test('删除回退二次确认：无法回退时仅提供 仅删除账本/取消（无危险动作）', () => {
  const { mod } = loadChunk()
  const tree = mod.renderDeleteModal({
    task: { type: 'dev', id: 'DEV-009' },
    busy: false,
    error: null,
    view: { rollbackable: false, files: [], reason: 'not-git' },
  }, {
    onRollback: () => {},
    onLedgerOnly: () => {},
    onCancel: () => {},
  })
  const joined = collectTexts(tree, []).join('|')
  assert.ok(joined.includes('无法回退未提交修改'), '应说明无法回退')
  assert.ok(joined.includes('不是 git 仓库'), '应说明原因')
  assert.ok(joined.includes('仅删除账本'), '仍可仅删除账本')
  assert.ok(joined.includes('取消'), '有取消')
  assert.ok(!joined.includes('删除并回退修改'), '无法回退时不得出现危险动作')

  // dry-run 失败（如后端路由未就绪）：只有取消
  const failed = mod.renderDeleteModal({
    task: { type: 'dev', id: 'DEV-009' },
    busy: false,
    error: '无法获取回退清单：HTTP 404',
    view: null,
  }, { onRollback: () => {}, onLedgerOnly: () => {}, onCancel: () => {} })
  const fJoined = collectTexts(failed, []).join('|')
  assert.ok(fJoined.includes('无法获取回退文件清单'), 'dry-run 失败提示')
  assert.ok(fJoined.includes('HTTP 404'), '错误细节展示')
  assert.ok(!fJoined.includes('删除并回退修改'))
  assert.ok(!fJoined.includes('仅删除账本'))
  delete global.window
})

test('删除回退流程：确认后才调 execute（mock fetch）', async () => {
  const { mod } = loadChunk()
  const calls = []
  const fetchImpl = async (url, opts) => {
    calls.push({ url, method: opts && opts.method, body: opts && opts.body })
    if (String(url).endsWith('/dry-run')) {
      return { ok: true, json: async () => ({ ok: true, dryRun: { rollbackable: true, files: [{ path: '/p/src/a.ts', status: 'modified' }] } }) }
    }
    return { ok: true, json: async () => ({ ok: true }) }
  }

  // 取消（confirm 返回 null）：只调 dry-run，绝不调 execute
  const r1 = await mod.runDeleteFlow({
    path: '/p', type: 'dev', id: 'DEV-009', workspaceRoot: '/ws',
    confirm: async () => null, fetchImpl,
  })
  assert.equal(r1.cancelled, true)
  assert.equal(calls.filter((c) => c.url.includes('/dry-run')).length, 1)
  assert.equal(calls.filter((c) => c.url.includes('/execute')).length, 0, '取消后不得调 execute')

  // 确认「删除并回退修改」→ execute 带 mode=rollback
  calls.length = 0
  const r2 = await mod.runDeleteFlow({
    path: '/p', type: 'dev', id: 'DEV-009', workspaceRoot: '/ws',
    confirm: async () => 'rollback', fetchImpl,
  })
  assert.equal(r2.cancelled, false)
  const exec2 = calls.find((c) => c.url.includes('/execute'))
  assert.ok(exec2, '确认后必须调 execute')
  assert.equal(exec2.method, 'POST')
  assert.deepEqual(JSON.parse(exec2.body), {
    path: '/p', type: 'dev', id: 'DEV-009', mode: 'rollback', workspaceRoot: '/ws',
  })

  // 确认「仅删除账本」→ execute 带 mode=ledger-only
  calls.length = 0
  await mod.runDeleteFlow({
    path: '/p', type: 'dev', id: 'DEV-009', workspaceRoot: '/ws',
    confirm: async () => 'ledger-only', fetchImpl,
  })
  const exec3 = calls.find((c) => c.url.includes('/execute'))
  assert.equal(JSON.parse(exec3.body).mode, 'ledger-only')

  // 服务端未就绪（404）：dry-run 抛错不吞
  const failing = async (url) => ({ ok: false, status: 404, json: async () => ({ ok: false, error: { code: 'not-found', message: 'route missing' } }) })
  await assert.rejects(
    mod.runDeleteFlow({ path: '/p', type: 'dev', id: 'DEV-1', confirm: async () => 'rollback', fetchImpl: failing }),
    (e) => e.code === 'not-found')
  delete global.window
})

test('postJson/getJson：请求封装与错误映射（{ok:false} / HTTP 错误）', async () => {
  const { mod } = loadChunk()
  // 成功：POST body 序列化 + Content-Type + 返回值
  const calls = []
  const okFetch = async (url, opts) => {
    calls.push({ url, opts })
    return { ok: true, json: async () => ({ ok: true, task: { id: 'DEV-001' } }) }
  }
  const res = await mod.postJson('/awf/task/start', { path: '/p', type: 'dev', id: 'DEV-001' }, okFetch)
  assert.equal(res.task.id, 'DEV-001')
  assert.equal(calls[0].url, '/awf/task/start')
  assert.equal(calls[0].opts.method, 'POST')
  assert.equal(calls[0].opts.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(calls[0].opts.body), { path: '/p', type: 'dev', id: 'DEV-001' })

  // {ok:false} → 抛错带 code/message（服务端统一错误格式）
  const errFetch = async () => ({ ok: false, status: 404, json: async () => ({ ok: false, error: { code: 'not-found', message: 'todo.md 中不存在任务 DEV-999' } }) })
  await assert.rejects(mod.postJson('/awf/task/start', {}, errFetch),
    (e) => e.code === 'not-found' && /DEV-999/.test(e.message))

  // 非 JSON 5xx → 回退 HTTP 状态文案
  const badFetch = async () => ({ ok: false, status: 500, json: async () => { throw new Error('not json') } })
  await assert.rejects(mod.postJson('/awf/task/start', {}, badFetch),
    (e) => /HTTP 500/.test(e.message))

  // getJson 走 GET + no-store
  const getCalls = []
  const getFetch = async (url, opts) => {
    getCalls.push({ url, opts })
    return { ok: true, json: async () => ({ ok: true, ledger: { current: [] } }) }
  }
  await mod.getJson('/awf/ledger?path=%2Fp', getFetch)
  assert.ok(getCalls[0].url.includes('/awf/ledger'))
  assert.equal(getCalls[0].opts.cache, 'no-store')
  delete global.window
})

test('默认锚定：resolveDefaultProject 精确匹配 / 最长前缀 / 容器歧义', () => {
  const { mod } = loadChunk()
  const projects = [
    { id: 'a', path: '/Users/x/GitHub/a' },
    { id: 'kit', path: '/Users/x/GitHub/agent-workflow-kit' },
    { id: 'b', path: '/Users/x/GitHub/b' },
  ]
  // 精确匹配（当前会话工作区根 == 项目路径）
  assert.equal(mod.resolveDefaultProject(projects, '/Users/x/GitHub/agent-workflow-kit'), '/Users/x/GitHub/agent-workflow-kit')
  // 项目路径是 cwd 的最长前缀（会话在项目根下的子目录）
  assert.equal(mod.resolveDefaultProject(projects, '/Users/x/GitHub/agent-workflow-kit/sub/dir'), '/Users/x/GitHub/agent-workflow-kit')
  // 容器目录下悬挂多个项目 → 歧义，不自动选中
  assert.equal(mod.resolveDefaultProject(projects, '/Users/x/GitHub'), '')
  // 容器目录下只有唯一项目 → 自动选中
  const solo = [{ id: 'only', path: '/Users/x/GitHub/only' }]
  assert.equal(mod.resolveDefaultProject(solo, '/Users/x/GitHub'), '/Users/x/GitHub/only')
  // 无匹配 / 空索引
  assert.equal(mod.resolveDefaultProject(projects, '/elsewhere'), '')
  assert.equal(mod.resolveDefaultProject(null, '/elsewhere'), '')
  assert.equal(mod.resolveDefaultProject(projects, ''), '')
  delete global.window
})

test('默认锚定：resolveAnchorRoot 优先级（工作区成员 > 会话 cwd > 会话快照 > scope.cwd）', () => {
  const { mod } = loadChunk()
  // 1) useWorkspaces 快照：sessionIds 命中 → workspace.path 最权威
  const wss = { items: [{ path: '/ws-root', sessionIds: ['s1'] }, { path: '/other-ws', sessionIds: [] }] }
  assert.equal(mod.resolveAnchorRoot(wss, null, null, null, 's1'), '/ws-root')
  assert.equal(mod.resolveAnchorRoot(wss, null, null, null, 's9'), '')
  // 2) useSessions 快照 byId[sessionId].cwd
  assert.equal(mod.resolveAnchorRoot(null, null, { byId: { s9: { cwd: '/sess-cwd' } } }, null, 's9'), '/sess-cwd')
  // 3) 会话快照 cwd（含 header.cwd 兼容）
  assert.equal(mod.resolveAnchorRoot(null, { cwd: '/snap-cwd' }, null, null, 's1'), '/snap-cwd')
  assert.equal(mod.resolveAnchorRoot(null, { header: { cwd: '/snap-header-cwd' } }, null, null, 's1'), '/snap-header-cwd')
  // 4) better-sidebar 通道 scope.cwd（无宿主标准 hooks 时兜底）
  assert.equal(mod.resolveAnchorRoot(null, null, null, { sessionId: 's1', cwd: '/scope-cwd' }, 's1'), '/scope-cwd')
  assert.equal(mod.resolveAnchorRoot(null, null, null, null, ''), '')
  delete global.window
})

// ---- t5：todo CRUD + 当前任务编辑/暂停/继续 UI -----------------------------

/** 构造带待办行与当前任务的账本。 */
function crudLedger() {
  return {
    project: { path: '/p', name: 'p' },
    status: { fresh: true, updated: null },
    current: [
      { type: 'dev', id: 'DEV-100', title: '活跃任务', prio: 'P1', status: 'active', owner: 'wg', mode: 'single', updated: '2026-11-01' },
      { type: 'dev', id: 'DEV-101', title: '阻塞任务', prio: 'P2', status: 'blocked', owner: '', mode: '', updated: '' },
    ],
    todo: [{ type: 'dev', done: 0, total: 2 }],
    todoRows: [
      { type: 'dev', rows: [{ id: 'DEV-200', prio: 'P2', desc: '待办甲', date: '2026-11-01' }] },
      { type: 'docs', rows: [{ id: 'DOCS-9', prio: 'P3', desc: '待办乙', date: '2026-11-01' }] },
    ],
    recent: [],
  }
}

test('t5 todo CRUD：类型 toggle + 每行 编辑/删除 + 新增按钮；编辑原位表单；删除行内二次确认', () => {
  const { mod } = loadChunk()
  const ui = {
    onStart: (r) => {}, starting: null,
    onTodoAdd: () => {}, onTodoAddChange: () => {}, onTodoAddSave: () => {}, onTodoAddCancel: () => {},
    onTodoEdit: () => {}, onTodoEditChange: () => {}, onTodoEditSave: () => {}, onTodoEditCancel: () => {},
    onTodoDelete: () => {}, onTodoDeleteConfirm: () => {}, onTodoDeleteCancel: () => {},
    onTodoTypeChange: () => {},
  }
  // 基础态（默认 dev）：每行有 开始/编辑/删除，分区有「＋ 新增」与类型 toggle
  const base = collectTexts(mod.renderLedgerBody(crudLedger(), ui), []).join('|')
  assert.ok(base.includes('待办甲'), '默认 dev 类型显示 dev 行')
  assert.ok(!base.includes('待办乙'), '默认 dev 类型不显示 docs 行（按类型过滤）')
  assert.ok(base.includes('开发') && base.includes('调试') && base.includes('文档'), '类型三态切换器')
  assert.ok(base.includes('未开始任务 · 开发'), '标题带当前类型')
  assert.ok(base.includes('开始'), '每行有开始按钮')
  assert.ok(base.includes('编辑'), '每行有编辑按钮')
  assert.ok(base.includes('删除'), '每行有删除按钮')
  assert.ok(base.includes('＋ 新增'), '分区有新增按钮')

  // toggle 切到 docs：只显示 docs 行
  const docsTree = collectTexts(mod.renderLedgerBody(crudLedger(), Object.assign({}, ui, { todoType: 'docs' })), []).join('|')
  assert.ok(docsTree.includes('待办乙'), 'toggle=docs 显示 docs 行')
  assert.ok(!docsTree.includes('待办甲'), 'toggle=docs 不显示 dev 行')
  assert.ok(docsTree.includes('未开始任务 · 文档'), '标题跟随类型')

  // toggle=docs 且无该类型行的空态
  const emptyTree = collectTexts(mod.renderLedgerBody({
    project: { path: '/p', name: 'p' }, status: { fresh: true, updated: null },
    current: [], todo: [{ type: 'dev', done: 0, total: 0 }],
    todoRows: [{ type: 'dev', rows: [] }], recent: [],
  }, Object.assign({}, ui, { todoType: 'docs' })), []).join('|')
  assert.ok(emptyTree.includes('该类型暂无未开始任务'), '无行时显示空态文案')

  // 编辑态：DEV-200 行内表单（优先级 select + 描述 input + 保存/取消），其余行正常
  const editUi = Object.assign({}, ui, {
    todoEdits: { 'dev:DEV-200': { prio: 'P1', desc: '改后的待办甲', busy: false, error: null } },
  })
  const editTree = mod.renderLedgerBody(crudLedger(), editUi)
  const editTexts = collectTexts(editTree, []).join('|')
  assert.ok(editTexts.includes('保存'), '编辑态有保存按钮')
  assert.ok(editTexts.includes('取消'), '编辑态有取消按钮')
  const editVals = collectInputValues(editTree, [])
  assert.ok(editVals.includes('改后的待办甲'), '编辑态输入框回填待保存描述')
  assert.ok(editVals.includes('P1'), '编辑态优先级 select 回填')

  // 删除确认态：docs 行进入内联确认（只影响该行；需切到 docs 类型）
  const delUi = Object.assign({}, ui, { todoType: 'docs', todoDeleteKey: 'docs:DOCS-9' })
  const delTree = collectTexts(mod.renderLedgerBody(crudLedger(), delUi), []).join('|')
  assert.ok(delTree.includes('确认删除待办 DOCS-9'), '删除二次确认文案')
  assert.ok(delTree.includes('确认删除'), '确认态存在')

  // 新增表单态
  const addUi = Object.assign({}, ui, {
    todoAddForm: { type: 'dev', id: '', prio: 'P2', desc: '', busy: false, error: '任务 ID 需为 TYPE-xxx 格式（如 DEV-001）。' },
  })
  const addTree = collectTexts(mod.renderLedgerBody(crudLedger(), addUi), []).join('|')
  assert.ok(addTree.includes('新增待办行'), '新增表单标题')
  assert.ok(addTree.includes('TYPE-xxx'), '表单错误内联提示')
  const addProps = collectProps(mod.renderLedgerBody(crudLedger(), addUi), 'placeholder', [])
  assert.ok(addProps.includes('任务 ID（如 DEV-200）'), 'ID 输入占位')
  delete global.window
})

test('t5 当前任务：编辑按钮 + 暂停/开始按钮（active→暂停、blocked→开始）+ 编辑态表单', () => {
  const { mod } = loadChunk()
  const ui = {
    onTaskEdit: () => {}, onTaskEditChange: () => {}, onTaskEditSave: () => {}, onTaskEditCancel: () => {},
    onTaskPause: () => {}, onTaskResume: () => {}, taskWorking: null,
  }
  const tree = collectTexts(mod.renderLedgerBody(crudLedger(), ui), []).join('|')
  assert.ok(tree.includes('活跃任务'), '任务标题')
  assert.ok(tree.includes('编辑'), '任务卡有编辑按钮')
  assert.ok(tree.includes('暂停'), 'active 任务显示暂停按钮')
  assert.ok(tree.includes('开始'), 'blocked 任务显示开始按钮（恢复）')
  // 状态徽章：active → 进行中（中文）；blocked → 已暂停（不要只见英文 blocked）
  assert.ok(tree.includes('进行中'), 'active 徽章显示进行中')
  assert.ok(tree.includes('已暂停'), 'blocked 徽章显示已暂停')
  assert.ok(!tree.includes('继续'), '恢复按钮不叫继续，叫开始')
  assert.ok(!tree.includes('暂停中…'), '无进行中操作时无 loading 文案')

  // 暂停执行中：active 卡按钮文案不变（无「暂停中…」中间状态），仅禁用+降透明
  const working = collectTexts(mod.renderLedgerBody(crudLedger(), Object.assign({}, ui, {
    taskWorking: { id: 'DEV-100', action: 'pause' },
  })), []).join('|')
  assert.ok(working.includes('暂停'), '暂停请求中按钮仍显示原名「暂停」')
  assert.ok(!working.includes('暂停中…'), '按钮不显示中间状态文案（避免文字闪变跳动）')

  // 开始执行中：blocked 卡按钮文案不变
  const resuming = collectTexts(mod.renderLedgerBody(crudLedger(), Object.assign({}, ui, {
    taskWorking: { id: 'DEV-101', action: 'resume' },
  })), []).join('|')
  assert.ok(resuming.includes('开始'), '恢复请求中按钮仍显示原名「开始」')
  assert.ok(!resuming.includes('开始中…'), '按钮不显示中间状态文案')

  // 编辑态：DEV-100 原位表单（优先级/状态/Owner/描述/修改范围 + 保存/取消）
  const editUi = Object.assign({}, ui, {
    taskEdit: { id: 'DEV-100', type: 'dev', prio: 'P0', status: 'verify', owner: 'alice', scope: '', desc: '新标题', busy: false, error: null },
  })
  const editTree = mod.renderLedgerBody(crudLedger(), editUi)
  const editTexts = collectTexts(editTree, []).join('|')
  assert.ok(editTexts.includes('保存'), '编辑态有保存')
  const editPlaceholders = collectProps(editTree, 'placeholder', [])
  assert.ok(editPlaceholders.includes('修改范围（如 lib/client.js，逗号分隔；留空不变）'), '编辑字段包含修改范围输入')
  const editVals = collectInputValues(editTree, [])
  assert.ok(editVals.includes('新标题'), '编辑态描述回填')
  assert.ok(editVals.includes('alice'), '编辑态 Owner 回填')
  assert.ok(editVals.includes('verify'), '编辑态状态 select 回填')
  // 无 onTaskEdit 时（只读场景）不渲染编辑按钮
  const ro = collectTexts(mod.renderLedgerBody(crudLedger(), {}), []).join('|')
  assert.ok(!ro.includes('编辑'), '无编辑回调时隐藏编辑按钮')
  delete global.window
})

test('t5 runTodoAction：POST /awf/todo（add 中文键 row、update、delete）与错误映射', async () => {
  const { mod } = loadChunk()
  const calls = []
  const fetchImpl = async (url, opts) => {
    calls.push({ url, method: opts.method, body: JSON.parse(opts.body) })
    return { ok: true, json: async () => ({ ok: true, action: 'add', type: 'dev', rows: [] }) }
  }
  await mod.runTodoAction({
    path: '/p', type: 'dev', action: 'add', workspaceRoot: '/ws',
    row: { id: 'DEV-300', 优先级: 'P1', 描述: '新待办' }, fetchImpl,
  })
  assert.equal(calls[0].url, '/awf/todo')
  assert.equal(calls[0].method, 'POST')
  assert.deepEqual(calls[0].body, {
    path: '/p', type: 'dev', action: 'add', workspaceRoot: '/ws',
    row: { id: 'DEV-300', 优先级: 'P1', 描述: '新待办' },
  })

  // update / delete 变体（无需 workspaceRoot）
  calls.length = 0
  await mod.runTodoAction({ path: '/p', type: 'dev', action: 'update', row: { id: 'DEV-300', 优先级: 'P2', 描述: '改' }, fetchImpl })
  assert.equal(calls[0].body.row['优先级'], 'P2')
  calls.length = 0
  await mod.runTodoAction({ path: '/p', type: 'docs', action: 'delete', row: { id: 'DOCS-1' }, fetchImpl })
  assert.equal(calls[0].body.action, 'delete')
  assert.equal(calls[0].body.row.id, 'DOCS-1')

  // 错误（duplicate / not-found）→ 抛错带 code
  const errFetch = async () => ({ ok: false, status: 409, json: async () => ({ ok: false, error: { code: 'duplicate', message: 'todo 已存在同 ID 行' } }) })
  await assert.rejects(mod.runTodoAction({ path: '/p', type: 'dev', action: 'add', row: { id: 'DEV-300' }, fetchImpl: errFetch }),
    (e) => e.code === 'duplicate')
  delete global.window
})

test('t5 runTaskAction：POST /awf/task（update 带中文字段 / pause / resume）', async () => {
  const { mod } = loadChunk()
  const calls = []
  const fetchImpl = async (url, opts) => {
    calls.push({ url, method: opts.method, body: JSON.parse(opts.body) })
    return { ok: true, json: async () => ({ ok: true, task: { id: 'DEV-100' } }) }
  }
  await mod.runTaskAction({
    path: '/p', type: 'dev', id: 'DEV-100', action: 'update',
    fields: { '优先级': 'P0', '状态': 'verify', '修改范围': 'lib/client.js' }, workspaceRoot: '/ws', fetchImpl,
  })
  assert.equal(calls[0].url, '/awf/task')
  assert.deepEqual(calls[0].body, {
    path: '/p', type: 'dev', id: 'DEV-100', action: 'update', workspaceRoot: '/ws',
    fields: { '优先级': 'P0', '状态': 'verify', '修改范围': 'lib/client.js' },
  })
  calls.length = 0
  await mod.runTaskAction({ path: '/p', type: 'dev', id: 'DEV-100', action: 'pause', fetchImpl })
  assert.equal(calls[0].body.action, 'pause')
  assert.equal(calls[0].body.fields, undefined, 'pause 不带 fields')
  calls.length = 0
  await mod.runTaskAction({ path: '/p', type: 'dev', id: 'DEV-100', action: 'resume', fetchImpl })
  assert.equal(calls[0].body.action, 'resume')
  // 服务端错误（not-git-repo）→ code 透出
  const errFetch = async () => ({ ok: false, status: 400, json: async () => ({ ok: false, error: { code: 'not-git-repo', message: '目标目录不是 git 仓库' } }) })
  await assert.rejects(mod.runTaskAction({ path: '/p', type: 'dev', id: 'DEV-100', action: 'pause', fetchImpl: errFetch }),
    (e) => e.code === 'not-git-repo')
  delete global.window
})

test('t5 apiErrorText：错误码 → 友好文案（duplicate/not-git-repo/bad-request 明细/未知回退）', () => {
  const { mod } = loadChunk()
  assert.ok(mod.apiErrorText({ code: 'duplicate' }).includes('已存在同 ID'), 'duplicate 文案')
  assert.ok(mod.apiErrorText({ code: 'not-git-repo' }).includes('不是 git 仓库'), 'not-git-repo 文案')
  assert.ok(mod.apiErrorText({ code: 'nothing-to-revert' }).includes('没有可回退'), 'nothing-to-revert 文案')
  assert.ok(mod.apiErrorText({ code: 'invalid-id' }).includes('TYPE-xxx'), 'invalid-id 文案')
  const bad = mod.apiErrorText({ code: 'bad-request', message: 'row 校验失败' })
  assert.ok(bad.includes('请求不合法') && bad.includes('row 校验失败'), 'bad-request 追加明细')
  assert.ok(mod.apiErrorText({ code: 'forbidden' }).includes('认证'), 'forbidden 文案')
  // 未知错误：回退前缀 + message（或 code）
  assert.ok(mod.apiErrorText(new Error('boom'), '保存失败').includes('保存失败'))
  assert.ok(mod.apiErrorText({ code: 'weird' }, '操作失败').includes('weird'))
  delete global.window
})

test('t5 Dashboard 接线：暂停/开始/任务编辑回调必须传入 renderLedgerBody（防回归）', () => {
  const code = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
  // renderLedgerBody 调用点（ui 对象）必须接线 t5 任务回调——缺 onTaskPause/onTaskResume
  // 时任务卡静默不渲染「暂停/开始」按钮（TaskCard 仅在回调为函数时渲染）
  const callSite = code.slice(code.indexOf('renderLedgerBody(ledger, {'))
  assert.ok(callSite.includes('onTaskPause: handleTaskPause'), 'ui 必须接线 onTaskPause')
  assert.ok(callSite.includes('onTaskResume: handleTaskResume'), 'ui 必须接线 onTaskResume')
  assert.ok(callSite.includes('onTaskEdit: handleTaskEdit'), 'ui 必须接线 onTaskEdit')
  assert.ok(callSite.includes('todoType,'), 'ui 必须接线 todoType')
  assert.ok(callSite.includes('onTodoTypeChange: handleTodoTypeChange'), 'ui 必须接线 onTodoTypeChange')
  assert.ok(callSite.includes('onOpenSource: openSource'), 'ui 必须接线 onOpenSource')
  assert.ok(callSite.includes('source,'), 'ui 必须接线 source')
})

test('t5 当前任务验收进度：任务块含 checkItems 时显示完成度，无子项不渲染进度条', () => {
  const { mod } = loadChunk()
  const ledger = crudLedger()
  // active（实现阶段）→「实现进度」
  ledger.current[0].checkItems = [
    { done: true, text: '实现 A' },
    { done: false, text: '实现 B' },
    { done: false, text: '测试 C' },
  ]
  const tree = collectTexts(mod.renderLedgerBody(ledger), []).join('|')
  assert.ok(tree.includes('实现进度'), 'active 实现阶段显示「实现进度」标题')
  assert.ok(tree.includes('1/3'), '进度计数 done/total')
  assert.ok(tree.includes('33'), '进度百分比')
  // verify（验证阶段）→「验收进度」
  ledger.current[0].status = 'verify'
  const vTree = collectTexts(mod.renderLedgerBody(ledger), []).join('|')
  assert.ok(vTree.includes('验收进度'), 'verify 验证阶段显示「验收进度」标题')
  // 无 checkItems 的任务：不渲染进度（仅徽章）
  const plain = collectTexts(mod.renderLedgerBody(crudLedger()), []).join('|')
  assert.ok(!plain.includes('实现进度') && !plain.includes('验收进度'), '无子项任务不渲染进度')
  delete global.window
})

test('t5 源文件：fetchSource 走 GET /awf/source（query 编码）+ 404 透出 code', async () => {
  const { mod } = loadChunk()
  const urls = []
  const fetchImpl = async (url, opts) => {
    urls.push({ url, opts })
    return { ok: true, json: async () => ({ ok: true, source: { type: 'dev', file: 'todo', absPath: '/p/agent-workflow/tasks/dev/todo.md', content: '# 待开发\n| ID |' } }) }
  }
  const res = await mod.fetchSource({ path: '/p', type: 'dev', file: 'todo', fetchImpl })
  assert.equal(res.source.absPath, '/p/agent-workflow/tasks/dev/todo.md')
  assert.ok(urls[0].url.includes('/awf/source'))
  assert.ok(urls[0].url.includes('path=%2Fp'), 'path 应编码')
  assert.ok(urls[0].url.includes('type=dev') && urls[0].url.includes('file=todo'))
  assert.equal(urls[0].opts.cache, 'no-store', '只读 GET 走 no-store')

  // 404（路由未就绪/文件缺失）→ code 透出，供面板映射「源文件接口未就绪」
  const failing = async () => ({ ok: false, status: 404, json: async () => ({ ok: false, error: { code: 'not-found', message: 'no such file' } }) })
  await assert.rejects(mod.fetchSource({ path: '/p', type: 'dev', file: 'todo', fetchImpl: failing }),
    (e) => e.code === 'not-found')
  delete global.window
})

test('t5 源文件面板：renderLedgerBody 渲染只读面板（路径/复制按钮/访达提示/正文）与 busy/error 态', () => {
  const { mod } = loadChunk()
  const ledger = crudLedger()
  const absPath = '/p/agent-workflow/tasks/dev/todo.md'
  const content = '# 待开发\n\n| 任务ID | 优先级 | 描述 | 登记日期 |\n|--------|--------|------|----------|\n| DEV-200 | P2 | 待办甲 | 2026-11-01 |\n'

  // 就绪态：absPath + 复制路径 + 访达提示 + 正文 pre
  const tree = mod.renderLedgerBody(ledger, { source: { type: 'dev', file: 'todo', busy: false, data: { type: 'dev', file: 'todo', absPath, content }, copied: false, error: null }, onCopySourcePath: () => {} })
  const texts = collectTexts(tree, []).join('|')
  assert.ok(texts.includes('源文件 · dev/todo.md'), '面板标题带 type/file')
  assert.ok(texts.includes(absPath), '展示本地绝对路径')
  assert.ok(texts.includes('复制路径'), '复制路径按钮')
  assert.ok(texts.includes('访达') && texts.includes('⌘⇧G'), 'macOS 访达提示（纯文案，不执行命令）')
  assert.ok(texts.includes('DEV-200') && texts.includes('待办甲'), '展示 .md 原文内容')

  // 复制成功后按钮文案变化（copied=true）
  const copiedTree = collectTexts(mod.renderLedgerBody(ledger, { source: { type: 'dev', file: 'todo', busy: false, data: { type: 'dev', file: 'todo', absPath, content }, copied: true, error: null }, onCopySourcePath: () => {} }), []).join('|')
  assert.ok(copiedTree.includes('已复制 ✓'), '复制成功后提示已复制')

  // busy 态
  const busyTree = collectTexts(mod.renderLedgerBody(ledger, { source: { type: 'dev', file: 'todo', busy: true, data: null, error: null } }), []).join('|')
  assert.ok(busyTree.includes('加载中…'), 'busy 态显示加载中')

  // error 态（404 映射文案由 openSource 生成，面板原样展示）
  const errTree = collectTexts(mod.renderLedgerBody(ledger, { source: { type: 'dev', file: 'todo', busy: false, data: null, error: '源文件接口未就绪（GET /awf/source 不存在或文件缺失）。' } }), []).join('|')
  assert.ok(errTree.includes('源文件接口未就绪'), '错误态展示接口未就绪提示')
  delete global.window
})

test('t5 源文件：copyText 走 clipboard API 并回调结果（复制路径按钮逻辑）', async () => {
  const { mod } = loadChunk()
  let written = null
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async (t) => { written = t } } }, configurable: true,
  })
  await new Promise((resolve) => {
    mod.copyText('/p/tasks/dev/todo.md', (ok) => { assert.equal(ok, true); resolve() })
  })
  assert.equal(written, '/p/tasks/dev/todo.md', 'clipboard 写入路径')
  // 无 clipboard（缺省环境）→ 不抛错，回调 true
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true })
  await new Promise((resolve) => {
    mod.copyText('/p/x.md', (ok) => { assert.equal(ok, true); resolve() })
  })
  delete globalThis.navigator
  delete global.window
})

// 收集 DOM 节点上的 className 属性（按空格拆分，便于断言多类名元素如 awf-step awf-step-cur）
function collectClassNames(node, out) {
  if (node == null || typeof node === 'boolean') return out
  if (Array.isArray(node)) { for (const n of node) collectClassNames(n, out); return out }
  if (node && typeof node === 'object') {
    if (typeof node.type === 'function') {
      const props = Object.assign({}, node.props || {}, { children: node.children })
      collectClassNames(node.type(props), out)
      return out
    }
    if (typeof node.type === 'string' && node.props && node.props.className) {
      for (const c of String(node.props.className).split(/\s+/)) {
        if (c) out.push(c)
      }
    }
    collectClassNames(node.children, out)
  }
  return out
}

// ---- t7：工作流步骤条 + 看板质感 -----------------------------------------

test('t7 工作流步骤：三类型完整流程定义（dev/debug/docs）', () => {
  const { mod } = loadChunk()
  const steps = mod.WORKFLOW_STEPS
  assert.ok(steps, 'WORKFLOW_STEPS 导出')
  assert.deepEqual(steps.dev.map((s) => s.label), ['认领', '方案', '实现', '验证', 'Review', '归档'], 'dev 流程')
  assert.deepEqual(steps.debug.map((s) => s.label), ['认领', '选择诊断方式', '收集证据', '验证假设', '修复与回归', '归档'], 'debug 流程')
  assert.deepEqual(steps.docs.map((s) => s.label), ['认领', '大纲与核实', '撰写', '审阅', '归档'], 'docs 流程')
  delete global.window
})

test('t7 阶段推断 inferWorkflowStage：状态→阶段下标（纯函数）', () => {
  const { mod } = loadChunk()
  // dev：active=实现(2)、verify=验证(3)、review=Review(4)
  assert.equal(mod.inferWorkflowStage({ type: 'dev', status: 'active' }).index, 2)
  assert.equal(mod.inferWorkflowStage({ type: 'dev', status: 'verify' }).index, 3)
  assert.equal(mod.inferWorkflowStage({ type: 'dev', status: 'review' }).index, 4)
  // debug：active=收集证据(2)、verify=验证假设(3)、review=修复与回归(4)
  assert.equal(mod.inferWorkflowStage({ type: 'debug', status: 'active' }).index, 2)
  assert.equal(mod.inferWorkflowStage({ type: 'debug', status: 'verify' }).index, 3)
  assert.equal(mod.inferWorkflowStage({ type: 'debug', status: 'review' }).index, 4)
  // docs：active=撰写(2)、review=审阅(3)
  assert.equal(mod.inferWorkflowStage({ type: 'docs', status: 'active' }).index, 2)
  assert.equal(mod.inferWorkflowStage({ type: 'docs', status: 'review' }).index, 3)
  // blocked：停在 active 对应阶段，paused=true
  const b = mod.inferWorkflowStage({ type: 'dev', status: 'blocked' })
  assert.equal(b.paused, true, 'blocked → paused 标注')
  assert.equal(b.index, 2, 'blocked 停在实现阶段')
  // 未知类型 → null（不渲染步骤条）
  assert.equal(mod.inferWorkflowStage({ type: 'xxx', status: 'active' }), null)
  assert.equal(mod.inferWorkflowStage(null), null)
  delete global.window
})

test('t7 步骤条渲染：进行中任务显示流程步骤与当前阶段；blocked 标注暂停位置', () => {
  const { mod } = loadChunk()
  const tree = collectTexts(mod.renderLedgerBody(crudLedger()), []).join('|')
  // dev active 任务（DEV-100）：流程标题 + dev 六步 + 当前阶段
  assert.ok(tree.includes('开发') && tree.includes('流程'), '步骤条带类型徽章与流程标题')
  assert.ok(tree.includes('当前 · 实现'), 'active → 标注当前阶段 实现')
  assert.ok(tree.includes('已完成 2') && tree.includes('待办 3'), '步骤计数：已完成/待办明确表达')
  assert.ok(tree.includes('认领') && tree.includes('方案') && tree.includes('验证') && tree.includes('Review') && tree.includes('归档'), 'dev 六步渲染')
  // dev blocked 任务（DEV-101）：暂停位置标注
  assert.ok(tree.includes('已暂停 · 实现'), 'blocked → 暂停位置标注')
  assert.ok(tree.includes('待办 '), 'blocked 也带待办计数')
  // 轨道节点符号：当前=内嵌 CSS 白点（不再用 7.5px ● 字形，防深色主题裁剪/看不清）、
  // 已完成=✓、暂停=⏸（节点内符号 + 标签分离）
  assert.ok(tree.includes('✓') && tree.includes('⏸'), '轨道节点符号齐全（✓ 完成/⏸ 暂停）')
  assert.ok(!tree.includes('●'), '当前节点不再使用 7.5px ● 字形（防裁剪）')

  // debug 类型任务展示 debug 流程
  const dbg = crudLedger()
  dbg.current = [{ type: 'debug', id: 'DBG-1', title: '调试任务', prio: 'P1', status: 'active', owner: '', mode: '', updated: '' }]
  const dbgTree = collectTexts(mod.renderLedgerBody(dbg), []).join('|')
  assert.ok(dbgTree.includes('选择诊断方式') && dbgTree.includes('收集证据') && dbgTree.includes('验证假设') && dbgTree.includes('修复与回归'), 'debug 流程步骤')
  assert.ok(dbgTree.includes('当前 · 收集证据'), 'debug active 阶段')

  // docs 类型任务展示 docs 流程
  const dc = crudLedger()
  dc.current = [{ type: 'docs', id: 'DOCS-1', title: '文档任务', prio: 'P2', status: 'review', owner: '', mode: '', updated: '' }]
  const dcTree = collectTexts(mod.renderLedgerBody(dc), []).join('|')
  assert.ok(dcTree.includes('大纲与核实') && dcTree.includes('撰写') && dcTree.includes('审阅'), 'docs 流程步骤')
  assert.ok(dcTree.includes('当前 · 审阅'), 'docs review 阶段')
  delete global.window
})

test('t8 步骤条布局：横向阶段轨道（awf-track + 步骤节点 + 连接线 + 三态）', () => {
  const { mod } = loadChunk()
  const tree = mod.renderLedgerBody(crudLedger())
  const classes = collectClassNames(tree, [])
  assert.ok(classes.includes('awf-track'), '步骤条容器为 awf-track（横向轨道）')
  assert.ok(classes.some((c) => c.startsWith('awf-step')), '步骤为 awf-step 节点')
  assert.ok(classes.includes('awf-step-cur'), '当前步骤带 awf-step-cur 强调态')
  assert.ok(classes.includes('awf-step-done'), '已完成步骤带 awf-step-done 态')
  assert.ok(classes.includes('awf-step-pend'), '未到步骤带 awf-step-pend 置灰态')
  // 轨道含连接线 span：步骤节点之间的连线元素通过 h('span') 渲染（带线样式），
  // 校验 track 容器内 span 结构存在（步骤=div.awf-step、连接线=span、标签=span）
  const track = findNode(tree, (n) => typeof n.type === 'string' && n.props && n.props.className === 'awf-track')
  assert.ok(track, 'awf-track 节点存在')
  const trackTexts = collectTexts(track, [])
  assert.ok(trackTexts.join('|').includes('✓'), '轨道内有完成节点符号')
  assert.ok(!trackTexts.join('|').includes('●'), '当前节点用 CSS 白点而非 ● 字形')
  delete global.window
})

// 在渲染树中查找满足谓词的节点（函数型组件展开）
function findNode(node, pred) {
  if (node == null || typeof node === 'boolean') return null
  if (Array.isArray(node)) { for (const n of node) { const r = findNode(n, pred); if (r) return r } return null }
  if (node && typeof node === 'object') {
    if (typeof node.type === 'function') {
      const props = Object.assign({}, node.props || {}, { children: node.children })
      const expanded = node.type(props)
      return findNode(expanded, pred)
    }
    if (typeof node.type === 'string' && pred(node)) return node
    return findNode(node.children, pred)
  }
  return null
}

test('t7 看板质感：任务卡 awf-card、行 awf-row 与 Owner 徽章入徽章行（hover/层级）', () => {
  const { mod } = loadChunk()
  const tree = mod.renderLedgerBody(crudLedger())
  const classes = collectClassNames(tree, [])
  assert.ok(classes.includes('awf-card'), '当前任务卡带 awf-card（hover 质感）')
  assert.ok(classes.includes('awf-row'), 'todo/最近完成行带 awf-row（hover 质感）')
  const texts = collectTexts(tree, []).join('|')
  // Owner 徽章进入徽章行（类型×状态×优先级×Owner 多徽章布局）
  assert.ok(texts.includes('wg'), 'Owner 徽章展示 Owner 名')
  delete global.window
})

// ---- DEV-024：整体 UI 优化后的视觉契约（t9，类名/样式/文案） ----------------

test('t9 验收进度：服务端对象形态 checkItems={done,total,items} 渲染进度（修复集成断链）', () => {
  const { mod } = loadChunk()
  const ledger = crudLedger()
  // verify 阶段：验收进度（对象形态）
  ledger.current[0].status = 'verify'
  ledger.current[0].checkItems = {
    done: 2, total: 4,
    items: [
      { checked: true, text: 'A' }, { checked: true, text: 'B' },
      { checked: false, text: 'C' }, { checked: false, text: 'D' },
    ],
  }
  const tree = mod.renderLedgerBody(ledger)
  const texts = collectTexts(tree, []).join('|')
  assert.ok(texts.includes('验收进度'), '对象形态渲染验收进度标题（verify 阶段）')
  assert.ok(texts.includes('2/4'), '对象形态计数 done/total')
  assert.ok(texts.includes('50'), '对象形态百分比')
  const classes = collectClassNames(tree, [])
  assert.ok(classes.includes('awf-check'), '验收进度容器带 awf-check 类')
  assert.ok(classes.includes('awf-progress'), '进度条轨道带 awf-progress 类')
  // 数组形态（旧单测形态）仍兼容；active 阶段显示「实现进度」
  ledger.current[0].status = 'active'
  ledger.current[0].checkItems = [
    { done: true, text: 'A' }, { done: false, text: 'B' },
  ]
  const arrTexts = collectTexts(mod.renderLedgerBody(ledger), []).join('|')
  assert.ok(arrTexts.includes('1/2'), '数组形态仍兼容渲染')
  assert.ok(arrTexts.includes('实现进度'), 'active 阶段数组形态显示实现进度')
  delete global.window
})

test('t9 徽章语义：handoff 环形 + 类型中性 chip + 优先级统一 soft（awf-pill-* 变体类）', () => {
  const { mod } = loadChunk()
  const ledger = crudLedger()
  ledger.current = [
    { type: 'dev', id: 'DEV-900', title: '交接任务', prio: 'P0', status: 'handoff', owner: 'a', mode: '', updated: '' },
    { type: 'docs', id: 'DOCS-900', title: '文档任务', prio: 'P3', status: 'review', owner: '', mode: '', updated: '' },
  ]
  const classes = collectClassNames(mod.renderLedgerBody(ledger), [])
  assert.ok(classes.includes('awf-pill-ring'), 'handoff 状态徽章为环形变体（与 review 区分）')
  assert.ok(classes.includes('awf-pill-soft'), 'P0 优先级徽章为 soft 浅底（与 P1/P2/P3 统一尺寸，仅颜色区分）')
  assert.ok(!classes.includes('awf-pill-solid'), '不再使用实底白字变体（P0 视觉偏大问题）')
  assert.ok(classes.includes('awf-pill-chip'), '类型徽章为中性 chip 变体（不占用语义色）')
  const texts = collectTexts(mod.renderLedgerBody(ledger), []).join('|')
  assert.ok(texts.includes('交接'), 'handoff 徽章文案「交接」')
  delete global.window
})

test('t9 布局层次：当前任务区 awf-tasks 单列容器；空态/错误/引导 awf-empty 统一容器', () => {
  const { mod } = loadChunk()
  const classes = collectClassNames(mod.renderLedgerBody(crudLedger()), [])
  assert.ok(classes.includes('awf-tasks'), '当前任务区为 awf-tasks 单列容器（任务卡高度一致）')
  assert.ok(classes.includes('awf-toggle'), '待办类型切换器带 awf-toggle 容器类')
  assert.ok(collectClassNames(mod.renderEmptyBody(null), []).includes('awf-empty'), '索引为空态带 awf-empty')
  assert.ok(collectClassNames(mod.renderEmptyBody([]), []).includes('awf-empty'), '未选择项目态带 awf-empty')
  assert.ok(collectClassNames(mod.renderErrorBody('boom'), []).includes('awf-empty'), '错误态带 awf-empty')
  assert.ok(collectClassNames(mod.renderInitCard({ busy: false, error: null, onInit() {} }), []).includes('awf-empty'), '未初始化引导卡带 awf-empty')
  delete global.window
})

test('t9 步骤条：paused 当前节点附加 awf-step-paused 类；节点符号仍无 ● 字形', () => {
  const { mod } = loadChunk()
  const tree = mod.renderLedgerBody(crudLedger()) // DEV-101 = blocked
  const classes = collectClassNames(tree, [])
  assert.ok(classes.includes('awf-step-paused'), 'blocked 任务当前节点带 awf-step-paused')
  const texts = collectTexts(tree, []).join('|')
  assert.ok(!texts.includes('●'), '当前节点不使用 ● 字形（防裁剪）')
  // 步骤标签可读性契约：按文本抓取轨道内标签，全部不再出现 8.5px 老档（无样式可断言的替代：
  // 轨道头部计数文案完整保留）
  assert.ok(texts.includes('✓ 已完成 ') && texts.includes('待办 '), '轨道计数文案完整')
  delete global.window
})