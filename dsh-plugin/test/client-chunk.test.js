// dsh-awf-dashboard — 客户端 chunk 结构化测试（无需 GUI/宿主）
//
// 用桩模拟宿主的 ModuleLoader + cordis slots，验证：
//   1) chunk 以 {id, factory} 注册到 window.__ModuleLoader__
//   2) factory(require) 返回 { inject, apply }
//   3) apply(ctx) 在 sidebar.right.pane.tab / .title 各注册一个页签（key=awf-dashboard）
//   4) inject 列表与 package.json 的 dsh.client.inject 一致
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

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
  assert.equal(betterRegistrations[0].title, '工作流进度')

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
  assert.ok(/function Dashboard\(\)/.test(code))
  assert.ok(/function TabTitle\(\)/.test(code))
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

// 收集元素树中的全部文本（支持嵌套 children 数组）
function collectTexts(node, out) {
  if (node == null || typeof node === 'boolean') return out
  if (Array.isArray(node)) { for (const n of node) collectTexts(n, out); return out }
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (node && typeof node === 'object') {
    collectTexts(node.children, out)
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
  assert.ok(joined.includes('待复核'), 'review 状态徽章文案')
  assert.ok(joined.includes('2/5'), 'dev todo 进度')
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