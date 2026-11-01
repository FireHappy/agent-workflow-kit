// dsh-awf-dashboard — 客户端（ModuleLoader chunk）
//
// 挂载：右侧边栏「工作流进度」页签。数据来自服务端只读路由
//   /awf/projects（项目索引）与 /awf/ledger?path=...（账本看板）。
// 纯手写 chunk（无构建步骤）：factory(require) 只 require 宿主提供的外部模块。
//
// 默认锚定（DEV-019）：
//   宿主 sidebar.right.pane.tab 槽位（session 作用域）会向注册组件注入标准 props
//   —— useWorkspaces / useSession / useSessions / sessionId（宿主 slot 目录的
//   standardProps 契约）。组件据此解析「当前会话所属工作区根目录」：
//     1) useWorkspaces 快照 items[].sessionIds 命中 sessionId → item.path（工作区根）
//     2) useSessions.byId[sessionId].cwd（会话工作目录）
//     3) 会话快照 cwd / better-sidebar 通道注入的 scope.cwd
//   再把根目录与 /awf/projects 索引的 path 匹配（精确或最长前缀）自动选中并加载
//   账本。localStorage 中的用户手动选择（dsh-awf-dashboard.project）优先于自动检测。
//
// UI 约束：纯 h() 手写、无外部依赖、颜色全部使用 DSH 主题变量（--dsw-alias-* 与
//   --dsl-*，白天/暗色自动跟随），不引入构建步骤。
window.__ModuleLoader__.load({
  id: 'dsh-awf-dashboard',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const { createElement: h, useEffect, useState, useCallback } = React

    // ---- 常量与 DSH 主题令牌 ----------------------------------------------

    const POLL_MS = 15000
    const LS_KEY = 'dsh-awf-dashboard.project'

    // DSH 主题令牌：宿主 Web 均定义。带回退值（缺令牌时仍可用），白天/暗色自动跟随。
    const C = {
      text: 'var(--dsw-alias-label-primary, #2c3138)',
      sub: 'var(--dsw-alias-label-secondary, #8a919c)',
      faint: 'var(--dsw-alias-label-tertiary, #b3bac4)',
      dim: 'var(--dsw-alias-label-dimmed, #9aa0a6)',
      surface: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,0.05))',
      raised: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.10))',
      border: 'var(--dsw-alias-border-l1, rgba(127,127,127,0.16))',
      hairline: 'var(--dsw-alias-hairline, rgba(127,127,127,0.10))',
      accent: 'var(--dsw-alias-brand-primary, #4f8ef7)',
      success: 'var(--dsw-alias-state-success-primary, #3ecf8e)',
      warn: 'var(--dsw-alias-state-warn-primary, #e8a33d)',
      error: 'var(--dsw-alias-state-error-primary, #e5484d)',
      business: 'var(--dsw-alias-state-business-primary, #4f8ef7)',
      hover: 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.08))',
      radius: 'var(--dsl-web-radius, 10px)',
      mono: 'var(--dsl-terminal-font, ui-monospace, SFMono-Regular, Menlo, monospace)',
    }

    const TYPE_STYLE = {
      dev: { label: '开发', color: 'var(--dsw-alias-state-business-primary, #4f8ef7)' },
      debug: { label: '调试', color: 'var(--dsw-alias-state-warn-primary, #e8a33d)' },
      docs: { label: '文档', color: 'var(--dsw-alias-state-success-primary, #3ecf8e)' },
      review: { label: '复核', color: '#a78bfa' },
    }
    const STATUS_STYLE = {
      active: { label: '进行中', color: 'var(--dsw-alias-state-business-primary, #4f8ef7)' },
      review: { label: '待复核', color: 'var(--dsw-alias-state-warn-primary, #e8a33d)' },
      verify: { label: '验证', color: 'var(--dsw-alias-state-success-primary, #3ecf8e)' },
      blocked: { label: '阻塞', color: 'var(--dsw-alias-state-error-primary, #e5484d)' },
      handoff: { label: '交接', color: 'var(--dsw-alias-state-warn-primary, #e8a33d)' },
      archived: { label: '已归档', color: 'var(--dsw-alias-label-tertiary, #b3bac4)' },
    }
    const PRIO_COLOR = {
      P0: 'var(--dsw-alias-state-error-primary, #e5484d)',
      P1: 'var(--dsw-alias-state-warn-primary, #e8a33d)',
      P2: 'var(--dsw-alias-state-business-primary, #4f8ef7)',
    }

    const D = (v, fb) => (v === undefined || v === null ? fb : v)

    // ---- 工具 -------------------------------------------------------------

    const row = (extra) => Object.assign({ display: 'flex', alignItems: 'center', gap: 6 }, extra || {})
    const muted = (extra) => Object.assign({ color: C.dim, fontSize: 11.5, lineHeight: 1.5 }, extra || {})

    const cardStyle = {
      border: '1px solid ' + C.border,
      borderRadius: C.radius,
      padding: '10px 12px',
      background: C.surface,
      marginBottom: 8,
    }

    const buttonStyle = (primary) => ({
      fontSize: 11, padding: '3px 12px', borderRadius: 999, cursor: 'pointer',
      border: '1px solid ' + (primary ? 'color-mix(in srgb, ' + C.accent + ' 55%, transparent)' : C.border),
      background: primary ? 'color-mix(in srgb, ' + C.accent + ' 14%, transparent)' : C.surface,
      color: primary ? C.accent : C.sub,
      fontWeight: 600, lineHeight: '16px', whiteSpace: 'nowrap',
      transition: 'background .15s ease, border-color .15s ease',
    })

    /** 语义色胶囊：彩色文字 + 同色系淡底 + 描边；可选前置圆点。 */
    function Pill({ color, children, dot }) {
      return h('span', {
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
          color, whiteSpace: 'nowrap', lineHeight: '16px',
          background: 'color-mix(in srgb, ' + color + ' 13%, transparent)',
          border: '1px solid color-mix(in srgb, ' + color + ' 34%, transparent)',
        },
      },
        dot
          ? h('span', { style: { width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 } })
          : null,
        children)
    }

    function StatusBadge({ status }) {
      const st = STATUS_STYLE[status] || { label: status || '未设', color: C.faint }
      return h(Pill, { color: st.color, dot: true }, st.label)
    }

    /** 分区标题：渐变短竖条 + 标签 + 可选计数。 */
    function SectionTitle({ label, count }) {
      return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 8px' } },
        h('span', {
          style: {
            width: 3, height: 13, borderRadius: 2, flexShrink: 0,
            background: 'linear-gradient(180deg, ' + C.accent + ', ' + C.success + ')',
          },
        }),
        h('span', { style: { fontSize: 12.5, fontWeight: 700, letterSpacing: '.02em', color: C.text } }, label),
        count != null
          ? h('span', { style: { fontSize: 11, color: C.faint, background: C.hover, padding: '0 6px', borderRadius: 999, lineHeight: '15px' } }, String(count))
          : null)
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

    function readLocalSelection() {
      try { return localStorage.getItem(LS_KEY) || '' } catch { return '' }
    }

    // ---- 默认锚定（纯函数，导出供测试） ------------------------------------

    /**
     * 把「当前会话工作区根路径」匹配到项目索引：
     *   - 精确相等优先；
     *   - 否则取项目路径是根路径之最长前缀者（项目根下的子目录 cwd）；
     *   - 若根路径是容器目录，仅当恰好一个项目挂在其下时才选中（避免歧义）。
     * @param {Array<{path:string}>|null} projects /awf/projects 索引
     * @param {string} root 工作区根路径（cwd / workspace root）
     * @returns {string} 选中的项目 path；无可信匹配返回 ''
     */
    function resolveDefaultProject(projects, root) {
      if (!root || !Array.isArray(projects) || projects.length === 0) return ''
      const r = String(root)
      const list = projects.filter((p) => p && typeof p.path === 'string' && p.path)
      if (list.some((p) => p.path === r)) return r // 精确匹配
      let best = ''
      for (const p of list) {
        const pp = p.path
        if (r.length > pp.length && r.startsWith(pp) && (pp === '/' || r[pp.length] === '/')) {
          if (pp.length > best.length) best = pp // 最长前缀（项目根是 cwd 的祖先）
        }
      }
      if (best) return best
      // cwd 是容器目录：唯一归属时才自动选中
      const under = list.filter((p) => p.path.length > r.length && p.path.startsWith(r) && p.path[r.length] === '/')
      return under.length === 1 ? under[0].path : ''
    }

    /**
     * 从宿主注入的会话/工作区信息解析当前工作区根路径（优先级从高到低）：
     *   1) useWorkspaces 快照：items[].sessionIds 含当前 sessionId 的 workspace.path
     *   2) useSessions 快照：byId[sessionId].cwd
     *   3) 会话快照 cwd（兼容宿主版本差异，含 header.cwd）
     *   4) better-sidebar 通道注入的 scope.cwd
     * @returns {string} 工作区根路径，未知返回 ''
     */
    function resolveAnchorRoot(workspacesSnap, sessionSnap, sessionsSnap, scope, sessionId) {
      if (workspacesSnap && Array.isArray(workspacesSnap.items) && sessionId) {
        const ws = workspacesSnap.items.find(
          (it) => it && Array.isArray(it.sessionIds) && it.sessionIds.indexOf(sessionId) !== -1)
        if (ws && ws.path) return ws.path
      }
      if (sessionsSnap && sessionsSnap.byId && sessionId) {
        const row = sessionsSnap.byId[sessionId]
        if (row && row.cwd) return row.cwd
      }
      if (sessionSnap && sessionSnap.cwd) return sessionSnap.cwd
      if (sessionSnap && sessionSnap.header && sessionSnap.header.cwd) return sessionSnap.header.cwd
      if (scope && scope.cwd) return scope.cwd
      return ''
    }

    /** 读取宿主标准 props（sidebar.right.pane.tab 槽位契约）解析工作区根。 */
    function useAnchorRoot(props) {
      const workspacesSnap = typeof props.useWorkspaces === 'function'
        ? props.useWorkspaces((s) => s || null)
        : null
      const sessionSnap = typeof props.useSession === 'function'
        ? props.useSession((s) => s || null)
        : null
      const sessionsSnap = typeof props.useSessions === 'function'
        ? props.useSessions((s) => s || null)
        : null
      const sessionId = props.sessionId || (props.scope && props.scope.sessionId) || ''
      return resolveAnchorRoot(workspacesSnap, sessionSnap, sessionsSnap, props.scope || null, sessionId)
    }

    // ---- 看板组件 ---------------------------------------------------------

    /** todo 进度条：圆角轨道 + 渐变填充；100% 完成态换成功渐变并带 ✓。 */
    function TodoBar({ label, done, total }) {
      const pct = total > 0 ? Math.round((done / total) * 100) : 0
      const complete = total > 0 && done >= total
      const fill = complete
        ? 'linear-gradient(90deg, ' + C.success + ', var(--dsw-alias-state-success-secondary, #5ee6a8))'
        : 'linear-gradient(90deg, ' + C.accent + ', ' + C.success + ')'
      return h('div', { style: { marginBottom: 10 } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 } },
          h('span', { style: { fontSize: 12, fontWeight: 600, color: C.text, display: 'inline-flex', alignItems: 'center', gap: 5 } },
            complete ? h('span', { style: { color: C.success, fontWeight: 800, fontSize: 11 } }, '✓') : null,
            label),
          h('span', { style: { fontSize: 11, color: complete ? C.success : C.dim, fontWeight: 600, fontFamily: C.mono } },
            `${done}/${total} · ${pct}%`)),
        h('div', {
          style: {
            height: 7, borderRadius: 999,
            background: C.hover, border: '1px solid ' + C.hairline, overflow: 'hidden',
          },
        }, h('div', {
          style: {
            width: pct + '%', height: '100%', borderRadius: 999, background: fill,
            transition: 'width .3s ease',
            boxShadow: complete ? '0 0 8px color-mix(in srgb, ' + C.success + ' 55%, transparent)' : undefined,
          },
        })))
    }

    /** 当前任务卡：ID / 类型·状态·优先级徽章 / 标题 / Owner / 更新。 */
    function TaskCard({ t }) {
      const type = TYPE_STYLE[t.type] || { label: t.type || '任务', color: C.faint }
      const prioColor = PRIO_COLOR[t.prio] || C.faint
      return h('div', { style: cardStyle },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 5 } },
          h('span', { style: { fontFamily: C.mono, fontWeight: 700, fontSize: 12, color: C.text } }, t.id || '?'),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' } },
            h(Pill, { color: type.color }, type.label),
            StatusBadge({ status: t.status }),
            t.prio ? h(Pill, { color: prioColor }, t.prio) : null)),
        h('div', { style: { fontSize: 12.5, fontWeight: 600, color: C.text, marginBottom: 5, lineHeight: 1.45 } },
          t.title || '（无标题）'),
        h('div', { style: Object.assign(row({ gap: 8 }), { flexWrap: 'wrap', fontSize: 11, color: C.dim }) },
          t.owner
            ? h('span', { style: row({ gap: 4 }) },
                h('span', {
                  style: {
                    width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                    background: 'color-mix(in srgb, ' + C.accent + ' 22%, transparent)',
                    color: C.accent, fontSize: 9, fontWeight: 700, display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center',
                  },
                }, (t.owner[0] || '?').toUpperCase()),
                h('span', {}, 'Owner · ' + t.owner))
            : null,
          t.updated ? h('span', { style: row({ gap: 4 }) },
            h('span', { style: { color: C.faint } }, '↻'), h('span', {}, '更新 ' + t.updated)) : null,
          t.mode ? h('span', { style: { color: C.faint } }, t.mode) : null))
    }

    /** 最近完成行：完成标记 / 日期 / ID / 描述，hairline 分隔。 */
    function RecentRow({ r }) {
      return h('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px',
          borderBottom: '1px solid ' + C.hairline, fontSize: 12,
        },
      },
        h('span', { style: { color: C.success, fontSize: 11, flexShrink: 0, fontWeight: 700 } }, '✓'),
        h('span', { style: { fontFamily: C.mono, fontSize: 11, color: C.faint, flexShrink: 0 } }, r.date),
        h('span', { style: { fontFamily: C.mono, fontWeight: 700, fontSize: 11, color: C.text, flexShrink: 0 } }, r.id),
        h('span', {
          style: {
            color: C.dim, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', flex: 1, minWidth: 0,
          },
        }, r.desc || '—'))
    }

    // ---- 看板主体 ---------------------------------------------------------

    function Dashboard(p) {
      const props = p || {}
      const anchorRoot = useAnchorRoot(props)

      const [projects, setProjects] = useState(null)
      const [indexReady, setIndexReady] = useState(false)
      const [selected, setSelected] = useState('')
      const [auto, setAuto] = useState(false) // 当前选中是否来自自动锚定
      const [ledger, setLedger] = useState(null)
      const [error, setError] = useState(null)
      const [loading, setLoading] = useState(false)

      // 1) 项目索引（只读）
      useEffect(() => {
        let alive = true
        getJson('/awf/projects')
          .then((data) => {
            if (!alive) return
            setProjects(data.projects || [])
            setIndexReady(true)
          })
          .catch((e) => {
            if (!alive) return
            setError(String((e && e.message) || e))
            setIndexReady(true)
          })
        return () => { alive = false }
      }, [])

      // 2) 默认锚定：localStorage 用户手动选择优先；否则按工作区根匹配索引
      useEffect(() => {
        if (!indexReady) return
        const manual = readLocalSelection()
        if (manual && projects && projects.some((pr) => pr && pr.path === manual)) {
          setSelected((prev) => (prev === manual ? prev : manual))
          setAuto(false) // 用户选择优先，保持原样
          return
        }
        const autoPath = resolveDefaultProject(projects || [], anchorRoot)
        if (autoPath) {
          setSelected((prev) => (prev === autoPath ? prev : autoPath))
          setAuto(true) // 自动锚定不写 localStorage（保持动态跟随）
        } else {
          setAuto(false)
        }
      }, [indexReady, projects, anchorRoot])

      // 3) 账本加载：只在索引就绪且已有选中项目时工作；15s 自动刷新
      const loadLedger = useCallback(() => {
        if (!selected || !indexReady) return
        let alive = true
        setLoading(true)
        getJson('/awf/ledger?path=' + encodeURIComponent(selected))
          .then((data) => { if (alive) { setLedger(data.ledger); setError(null) } })
          .catch((e) => { if (alive) setError(String((e && e.message) || e)) })
          .finally(() => { if (alive) setLoading(false) })
        return () => { alive = false }
      }, [selected, indexReady])

      useEffect(() => {
        loadLedger()
        const t = setInterval(loadLedger, POLL_MS)
        return () => { clearInterval(t) }
      }, [loadLedger])

      // 4) 用户手动切换项目：写入 localStorage（优先于自动检测）
      const onSelect = (e) => {
        const v = e.target.value
        setSelected(v)
        setAuto(false)
        try { localStorage.setItem(LS_KEY, v) } catch { /* 忽略 */ }
      }

      const header = h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 } },
        h('div', { style: { minWidth: 0 } },
          h('div', { style: { fontWeight: 800, fontSize: 14, color: C.text } }, '工作流进度'),
          h('div', { style: { fontSize: 10.5, color: C.faint, marginTop: 1, letterSpacing: '.02em' } }, 'agent-workflow 账本 · 只读')),
        h('button', {
          onClick: loadLedger,
          disabled: loading,
          style: Object.assign(buttonStyle(), { opacity: loading ? 0.6 : 1, cursor: loading ? 'default' : 'pointer' }),
        }, loading ? '刷新中' : '刷新'))

      const selector = h('div', { style: { marginBottom: 8 } },
        h('div', { style: row({ gap: 8, marginBottom: 4 }) },
          h('span', { style: { fontSize: 11, fontWeight: 700, color: C.sub, letterSpacing: '.05em' } }, '项目'),
          auto && selected
            ? h(Pill, { color: C.success }, '已锚定当前会话')
            : null),
        h('select', {
          value: selected,
          onChange: onSelect,
          style: {
            width: '100%', padding: '5px 8px', fontSize: 12,
            background: C.surface, color: C.text,
            border: '1px solid ' + C.border, borderRadius: 8, outline: 'none',
          },
        },
          h('option', { value: '', disabled: true }, projects ? '选择项目…' : '加载索引…'),
          (projects || []).map((pr) => h('option', { key: pr.path, value: pr.path },
            `${pr.id}（${pr.path}）`))))

      const body = error
        ? renderErrorBody(error, loadLedger)
        : ledger
          ? renderLedgerBody(ledger)
          : renderEmptyBody(projects)

      return h('div', {
        style: {
          fontSize: 13, color: C.text, height: '100%', overflowY: 'auto',
          padding: '12px 12px 20px', boxSizing: 'border-box',
        },
      }, header, selector, body)
    }

    // ---- 纯渲染函数（导出于 module.exports，供测试直接调用） ----------------

    function renderErrorBody(error, onRetry) {
      const msg = String(error || '')
      return h('div', {
        style: {
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '16px 14px', borderRadius: C.radius, textAlign: 'center',
          border: '1px solid color-mix(in srgb, ' + C.error + ' 40%, transparent)',
          background: 'color-mix(in srgb, ' + C.error + ' 7%, transparent)',
        },
      },
        h('span', { style: { fontSize: 22, lineHeight: 1 } }, '⚠️'),
        h('div', { style: { fontWeight: 700, fontSize: 13, color: C.error, marginTop: 8 } }, '账本读取失败'),
        msg
          ? h('div', { style: muted({ marginTop: 6, wordBreak: 'break-all' }) }, msg)
          : null,
        typeof onRetry === 'function'
          ? h('button', { onClick: onRetry, style: Object.assign(buttonStyle(true), { marginTop: 10 }) }, '重试')
          : null)
    }

    function renderEmptyBody(projects) {
      if (Array.isArray(projects) && projects.length === 0) {
        return h('div', {
          style: {
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '18px 14px', borderRadius: C.radius, textAlign: 'center',
            border: '1px dashed ' + C.border, background: C.surface,
          },
        },
          h('span', { style: { fontSize: 24, lineHeight: 1 } }, '🗂️'),
          h('div', { style: { fontWeight: 700, fontSize: 13, color: C.text, marginTop: 10 } }, '未选择项目'),
          h('div', { style: muted({ marginTop: 6, maxWidth: 240 }), color: C.sub },
            '当前会话未命中任何已登记项目。请从上方下拉选择一个项目查看账本。'))
      }
      return h('div', {
        style: {
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '18px 14px', borderRadius: C.radius, textAlign: 'center',
          border: '1px dashed ' + C.border, background: C.surface,
        },
      },
        h('span', { style: { fontSize: 24, lineHeight: 1 } }, '📭'),
        h('div', { style: { fontWeight: 700, fontSize: 13, color: C.text, marginTop: 10 } }, '项目索引为空'),
        h('div', { style: muted({ marginTop: 6, maxWidth: 240 }) },
          '先运行 `awf register` 登记项目，再回来查看工作流进度。'))
    }

    function renderLedgerBody(ledger) {
      const items = []

      // ---- 项目卡：名称 / 路径 / purpose / 新鲜度徽章 / 更新提示
      const fresh = ledger.status && ledger.status.fresh
      const freshLabel = fresh ? '账本新鲜' : '账本过期'
      const freshColor = fresh ? C.success : C.warn
      const proj = ledger.project || {}
      items.push(h('div', {
        key: 'proj',
        style: Object.assign({}, cardStyle, {
          padding: '12px 14px', marginBottom: 0,
          background: 'linear-gradient(180deg, ' + C.raised + ', ' + C.surface + ')',
        }),
      },
        h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 } },
          h('div', { style: { minWidth: 0 } },
            h('div', { style: { fontSize: 15, fontWeight: 800, color: C.text, lineHeight: 1.3 } },
              proj.name || '未命名项目'),
            h('div', { style: { fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 3, wordBreak: 'break-all' } },
              proj.path || '')),
          h(Pill, { color: freshColor, dot: true }, freshLabel)),
        proj.purpose
          ? h('div', {
              style: {
                marginTop: 9, fontSize: 11.5, color: C.sub, lineHeight: 1.5,
                background: 'color-mix(in srgb, ' + C.accent + ' 7%, transparent)',
                border: '1px solid ' + C.hairline, borderRadius: 8,
                padding: '6px 9px', wordBreak: 'break-word',
              },
            }, '🎯 ' + proj.purpose)
          : null,
        h('div', {
          style: row({ gap: 6, marginTop: 9 }),
          color: fresh ? C.dim : 'color-mix(in srgb, ' + C.warn + ' 75%, transparent)',
        },
          h('span', { style: { width: 5, height: 5, borderRadius: '50%', background: fresh ? C.success : C.warn, display: 'inline-block', flexShrink: 0 } }),
          h('span', { style: { fontSize: 11 } },
            `status.md 更新于 ${fmtTime(ledger.status && ledger.status.updated)}` +
            (fresh ? '' : ' → 请运行 awf status')))))

      // ---- 当前任务
      items.push(h(SectionTitle, { key: 'cur-h', label: '当前任务', count: ledger.current.length }))
      if (ledger.current.length > 0) {
        ledger.current.forEach((t, i) => {
          items.push(h(TaskCard, { key: 'cur-' + i, t }))
        })
      } else {
        items.push(h('div', {
          key: 'cur-none',
          style: { ...cardStyle, color: C.dim, fontSize: 12, textAlign: 'center', padding: '12px' },
        }, '当前无进行中任务 · 全部空闲'))
      }

      // ---- 待办进度
      if (ledger.todo.length > 0) {
        items.push(h(SectionTitle, { key: 'todo-h', label: '待办进度' }))
        items.push(h('div', { key: 'todo', style: cardStyle },
          h('div', { style: { paddingTop: 2 } },
            ledger.todo.map((t) => TodoBar({
              key: t.type, label: TYPE_LABEL(t.type), done: t.done, total: t.total,
            })))))
      }

      // ---- 最近完成
      if (ledger.recent.length > 0) {
        items.push(h(SectionTitle, { key: 'recent-h', label: '最近完成', count: ledger.recent.length }))
        items.push(h('div', { key: 'recent', style: Object.assign({}, cardStyle, { padding: '4px 12px', marginBottom: 0 }) },
          ledger.recent.map((r, i) => h(RecentRow, { key: 'recent-' + i, r }))))
      }

      items.push(h('div', {
        key: 'foot',
        style: Object.assign(muted({ marginTop: 10 }), { textAlign: 'center' }),
      },
        `数据来自 agent-workflow/tasks/*（只读，每 ${POLL_MS / 1000}s 自动刷新）`))

      return h('div', { style: { marginTop: 6 } }, items)
    }

    function TYPE_LABEL(type) {
      const s = TYPE_STYLE[type]
      return s ? s.label : (type || '其他')
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
        // 通道 1：宿主原生 rightbar（未装 better-sidebar 的环境可见）。
        // sidebar.right.pane.tab 是 session 作用域槽位，宿主注入标准 props
        // （useWorkspaces/useSession/useSessions/sessionId），Dashboard 据此
        // 自动锚定当前会话项目。
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
        // 组件透传 TabComponentProps（含 scope.sessionId / scope.cwd），供默认锚定使用。
        disposers.push(ctx.inject(['betterSidebar'], (injected) => {
          const better = injected.get('betterSidebar')
          if (!better || typeof better.registerTab !== 'function') return () => {}
          try {
            const end = better.registerTab({
              id: 'awf-dashboard',
              title: '工作流进度',
              description: 'agent-workflow 账本可视化：当前任务 / todo 进度 / 最近完成 / 新鲜度',
              single: true,
              component: (tabProps) => h(Dashboard, tabProps || {}),
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
    exports.resolveDefaultProject = resolveDefaultProject
    exports.resolveAnchorRoot = resolveAnchorRoot
    return module.exports
  },
})