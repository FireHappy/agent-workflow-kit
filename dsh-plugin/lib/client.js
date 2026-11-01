// dsh-awf-dashboard — 客户端（ModuleLoader chunk）
//
// 挂载：右侧边栏「工作流进度」页签。数据来自服务端只读路由
//   /awf/projects（项目索引）与 /awf/ledger?path=...（账本看板）。
// 纯手写 chunk（无构建步骤）：factory(require) 只 require 宿主提供的外部模块。
window.__ModuleLoader__.load({
  id: 'dsh-awf-dashboard',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const { createElement: h, useEffect, useState, useCallback, useRef } = React

    // ---- 常量与工具 -------------------------------------------------------

    const POLL_MS = 15000
    const LS_KEY = 'dsh-awf-dashboard.project'

    const TYPE_LABEL = { dev: '开发', debug: '调试', docs: '文档', review: '复核' }
    const STATUS_STYLE = {
      active: { label: '进行中', color: 'var(--dsl-g-accent, #4f8ef7)' },
      review: { label: '待复核', color: '#a78bfa' },
      verify: { label: '验证', color: 'var(--dsw-alias-state-success-primary, #3ecf8e)' },
      blocked: { label: '阻塞', color: 'var(--dsw-alias-state-error-primary, #ff6b6b)' },
      handoff: { label: '交接', color: 'var(--dsw-alias-state-warn-primary, #f5b83d)' },
      archived: { label: '已归档', color: '#9aa0a6' },
    }
    const D = (v, fb) => (v === undefined || v === null ? fb : v)

    const s = {
      row: { display: 'flex', alignItems: 'center', gap: 6 },
      muted: { color: 'var(--dsw-alias-label-secondary, #9aa0a6)', fontSize: 12 },
      badge: (color) => ({
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '1px 7px', borderRadius: 999, fontSize: 11, fontWeight: 600,
        color, background: 'color-mix(in srgb, ' + color + ' 16%, transparent)',
        border: '1px solid color-mix(in srgb, ' + color + ' 45%, transparent)',
        whiteSpace: 'nowrap',
      }),
      card: {
        border: '1px solid var(--dsl-g-border, #33363d)', borderRadius: 10,
        padding: 10, marginBottom: 10, background: 'var(--dsl-g-surface, transparent)',
      },
      section: { fontWeight: 650, fontSize: 12, margin: '12px 0 6px', color: 'var(--dsw-alias-label-primary, #e6e6e6)' },
      mono: { fontFamily: 'var(--dsl-g-font-mono, ui-monospace, monospace)', fontSize: 12 },
    }

    function fmtTime(iso) {
      if (!iso) return '—'
      const d = new Date(iso)
      const p = (n) => String(n).padStart(2, '0')
      return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
    }

    async function getJson(url) {
      const r = await fetch(url, { cache: 'no-store' })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const data = await r.json()
      if (data && data.ok === false) throw new Error((data.error && data.error.message) || '请求失败')
      return data
    }

    // ---- 组件 -------------------------------------------------------------

    function StatusBadge({ status }) {
      const st = STATUS_STYLE[status] || { label: status || '未设', color: '#9aa0a6' }
      return h('span', { style: s.badge(st.color) }, st.label)
    }

    function TodoBar({ label, done, total }) {
      const pct = total > 0 ? Math.round((done / total) * 100) : 0
      return h('div', { style: { marginBottom: 6 } },
        h('div', { style: { ...s.row, justifyContent: 'space-between' } },
          h('span', { style: { fontSize: 12 } }, label),
          h('span', { style: s.muted }, `${done}/${total}`)),
        h('div', {
          style: {
            height: 5, borderRadius: 3, marginTop: 3,
            background: 'var(--dsl-g-border, #33363d)', overflow: 'hidden',
          },
        }, h('div', {
          style: {
            width: pct + '%', height: '100%',
            background: pct === 100
              ? 'var(--dsw-alias-state-success-primary, #3ecf8e)'
              : 'var(--dsl-g-accent, #4f8ef7)',
            transition: 'width .25s ease',
          },
        })))
    }

    function Dashboard() {
      const [projects, setProjects] = useState(null)
      const [selected, setSelected] = useState(() => {
        try { return localStorage.getItem(LS_KEY) || '' } catch { return '' }
      })
      const [ledger, setLedger] = useState(null)
      const [error, setError] = useState(null)
      const [loading, setLoading] = useState(false)
      const pollRef = useRef(null)

      useEffect(() => {
        let alive = true
        getJson('/awf/projects')
          .then((data) => { if (alive) setProjects(data.projects || []) })
          .catch((e) => { if (alive) setError(String(e.message || e)) })
        return () => { alive = false }
      }, [])

      const loadLedger = useCallback(() => {
        if (!selected) return
        let alive = true
        setLoading(true)
        getJson('/awf/ledger?path=' + encodeURIComponent(selected))
          .then((data) => { if (alive) { setLedger(data.ledger); setError(null) } })
          .catch((e) => { if (alive) setError(String(e.message || e)) })
          .finally(() => { if (alive) setLoading(false) })
        return () => { alive = false }
      }, [selected])

      useEffect(() => {
        loadLedger()
        const t = setInterval(loadLedger, POLL_MS)
        return () => { clearInterval(t) }
      }, [loadLedger])

      const onSelect = (e) => {
        const v = e.target.value
        setSelected(v)
        try { localStorage.setItem(LS_KEY, v) } catch { /* 忽略 */ }
      }

      // 头部
      const header = h('div', { style: { ...s.row, justifyContent: 'space-between', marginBottom: 8 } },
        h('span', { style: { fontWeight: 700, fontSize: 13 } }, '工作流进度'),
        h('button', {
          onClick: loadLedger,
          style: {
            fontSize: 11, padding: '2px 10px', borderRadius: 999, cursor: 'pointer',
            border: '1px solid var(--dsl-g-border, #33363d)',
            background: 'var(--dsl-g-surface, transparent)',
            color: 'var(--dsw-alias-label-primary, #e6e6e6)',
          },
        }, loading ? '刷新中…' : '刷新'))

      // 项目选择
      const selector = h('select', {
        value: selected,
        onChange: onSelect,
        style: {
          width: '100%', padding: '4px 6px', marginBottom: 10, fontSize: 12,
          background: 'var(--dsl-g-surface, #1e1f24)',
          color: 'var(--dsw-alias-label-primary, #e6e6e6)',
          border: '1px solid var(--dsl-g-border, #33363d)', borderRadius: 8,
        },
      },
        h('option', { value: '', disabled: true }, projects ? '选择项目…' : '加载索引…'),
        (projects || []).map((p) => h('option', { key: p.path, value: p.path },
          `${p.id}（${p.path}）`)))

      const body = error
        ? renderErrorBody(error)
        : ledger
          ? renderLedgerBody(ledger)
          : renderEmptyBody(projects)

      return h('div', { style: { fontSize: 13 } }, header, selector, body)
    }

    // ---- 纯渲染函数（导出于 module.exports，供测试直接调用） ----------------

    function renderErrorBody(error) {
      return h('div', { style: s.card },
        h('div', { style: s.badge('var(--dsw-alias-state-error-primary, #ff6b6b)') }, '读取失败'),
        h('div', { style: { ...s.muted, marginTop: 6, wordBreak: 'break-all' } }, String(error)))
    }

    function renderEmptyBody(projects) {
      return h('div', { style: { ...s.card, ...s.muted } }, projects
        ? '未选择项目'
        : '索引为空：先运行 awf register 登记项目')
    }

    function renderLedgerBody(ledger) {
      const items = []
      // 项目卡
      const freshLabel = ledger.status.fresh ? '账本新鲜' : '账本过期'
      const freshColor = ledger.status.fresh
        ? 'var(--dsw-alias-state-success-primary, #3ecf8e)'
        : 'var(--dsw-alias-state-warn-primary, #f5b83d)'
      items.push(h('div', { key: 'proj', style: s.card },
        h('div', { style: { ...s.row, justifyContent: 'space-between', marginBottom: 4 } },
          h('span', { style: { fontWeight: 700, fontSize: 13 } }, ledger.project.name || '未命名项目'),
          h('span', { style: s.badge(freshColor) }, freshLabel)),
        h('div', { style: { ...s.muted, wordBreak: 'break-all', marginBottom: 2 } }, ledger.project.path),
        ledger.project.purpose
          ? h('div', { style: { ...s.muted, wordBreak: 'break-word' } }, ledger.project.purpose)
          : null,
        h('div', { style: { ...s.muted, marginTop: 4 } },
          `status.md 更新于 ${fmtTime(ledger.status.updated)}` +
          (ledger.status.fresh ? '' : ' → 请运行 awf status'))))

      // 当前任务
      if (ledger.current.length > 0) {
        items.push(h('div', { key: 'cur-h', style: s.section }, '当前任务'))
        ledger.current.forEach((t, i) => {
          items.push(h('div', { key: 'cur-' + i, style: { ...s.card, padding: 8 } },
            h('div', { style: { ...s.row, justifyContent: 'space-between', marginBottom: 3 } },
              h('span', { style: { ...s.mono, fontWeight: 600 } }, t.id),
              h('div', { style: { ...s.row, gap: 4 } },
                h('span', { style: s.badge('#9aa0a6') }, TYPE_LABEL[t.type] || t.type),
                StatusBadge({ status: t.status }))),
            h('div', { style: { fontSize: 12, marginBottom: 3 } }, t.title || '(无标题)'),
            h('div', { style: s.muted },
              [t.prio || '—', t.owner ? 'Owner: ' + t.owner : null, t.updated ? '更新 ' + t.updated : null]
                .filter(Boolean).join(' · '))))
        })
      } else {
        items.push(h('div', { key: 'cur-none', style: { ...s.card, ...s.muted } }, '当前无进行中任务'))
      }

      // todo 进度
      if (ledger.todo.length > 0) {
        items.push(h('div', { key: 'todo-h', style: s.section }, '待办进度'))
        items.push(h('div', { key: 'todo', style: s.card },
          ledger.todo.map((t) => TodoBar({
            key: t.type, label: TYPE_LABEL[t.type] || t.type,
            done: t.done, total: t.total,
          }))))
      }

      // 最近完成
      if (ledger.recent.length > 0) {
        items.push(h('div', { key: 'recent-h', style: s.section }, '最近完成'))
        ledger.recent.forEach((r, i) => {
          items.push(h('div', { key: 'recent-' + i, style: { ...s.row, alignItems: 'flex-start', marginBottom: 4 } },
            h('span', { style: { ...s.mono, color: '#9aa0a6', flexShrink: 0 } }, r.date),
            h('span', { style: { ...s.mono, fontWeight: 600, flexShrink: 0, marginLeft: 6 } }, r.id),
            h('span', {
              style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary, #9aa0a6)', marginLeft: 6,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
            }, r.desc)))
        })
      }

      items.push(h('div', { key: 'foot', style: { ...s.muted, marginTop: 8 } },
        '数据来自 agent-workflow/tasks/*（只读，每 ' + (POLL_MS / 1000) + 's 自动刷新）'))
      return h('div', {}, items)
    }

    function TabTitle() {
      return h('span', { style: { fontWeight: 600, fontSize: 12 } }, '工作流进度')
    }

    // ---- 插件体 -----------------------------------------------------------
    //
    // 注意：这里是 cordis **服务注入**（ctx.get 可取的键），不是包名！
    //   web boot 的 pending 检测 = fiber.ctx.get(inject 里的键)，包名取不到
    //   会一直 pending（参考 dsh-better-sidebar 的 chunk exports.inject 用
    //   ["slots", "sessions", "locale", ...] 服务键）。本插件只用 ctx.slots。

    const inject = [
      'slots',
    ]

    function apply(ctx) {
      ctx.effect(() => {
        const disposers = []
        // 通道 1：宿主原生 rightbar（未装 better-sidebar 的环境可见）
        disposers.push(ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: 'awf-dashboard',
          inject: (sessionId) => ({ sessionId }),
        }, Dashboard)))
        disposers.push(ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab.title',
          key: 'awf-dashboard',
          inject: (sessionId) => ({ sessionId }),
        }, TabTitle)))

        // 通道 2：better-sidebar 接管右侧边栏时（本 profile 已装），把页签注册进它的
        // registerTab 服务，用户才看得到。注意必须用 ctx.inject(['betterSidebar'], cb)
        // **动态注入**，而不是 apply 时 ctx.get('betterSidebar')：ctx.get 是**非响应式**
        // 读取（cordis 只对 declared inject deps 重算），服务若在我们插件 apply 之后才
        // provide（插件激活顺序不保证），静态读取永远拿不到，registerTab 静默不注册。
        // ctx.inject 的服务一出现/重新出现就重跑回调（dsh-better-sidebar 自己对接宿主的
        // sidebarRightTabs 就是这种 seat 写法）。未安装 better-sidebar 时回调永不触发、
        // 不阻塞 boot（exports.inject 只声明了 'slots'）。
        disposers.push(ctx.inject(['betterSidebar'], (injected) => {
          const better = injected.get('betterSidebar')
          if (!better || typeof better.registerTab !== 'function') return () => {}
          try {
            const end = better.registerTab({
              id: 'awf-dashboard',
              title: '工作流进度',
              description: 'agent-workflow 账本可视化：当前任务 / todo 进度 / 最近完成 / 新鲜度',
              single: true,
              component: () => h(Dashboard),
            })
            return () => { try { end() } catch { /* 忽略 */ } }
          } catch { return () => {} }
        }))

        return () => disposers.forEach((d) => { try { d() } catch { /* 忽略 */ } })
      })
    }

    exports.inject = inject
    exports.apply = apply
    exports.renderLedgerBody = renderLedgerBody
    exports.renderErrorBody = renderErrorBody
    exports.renderEmptyBody = renderEmptyBody
    return module.exports
  },
})
