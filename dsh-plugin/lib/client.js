// dsh-awf-dashboard — 客户端（ModuleLoader chunk）
//
// 挂载：右侧边栏「Agent Workflow」页签。数据来自服务端路由
//   GET  /awf/projects（项目索引）与 /awf/ledger?path=...（账本看板）
//   POST /awf/init（未初始化引导）、POST /awf/task/start（开始任务）
//   GET  /awf/archive?path=...&id=...（归档只读查看）
//   POST /awf/task/delete/dry-run / POST /awf/task/delete/execute（删除回退，二次确认）
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
//   锚定结果（workspaceRoot）随写接口上报：未初始化项目不在全局索引里，靠它放行。
//
// 写接口（安全）：全部走服务端认证围栏 + 路径白名单（绝对路径 ∧（全局索引 ∨
//   workspaceRoot）），服务端零外部命令。删除任务必须弹框二次确认后才调 execute。
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
    // DEV-024 扩展：idle=流转中状态（handoff）、bgMask=模态遮罩、radiusSm=小控件圆角、
    // *T=主题自带语义色淡底变体令牌（替代手调 color-mix 配方）、hoverAccent=强调悬停底。
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
      idle: 'var(--dsw-alias-state-idle-primary, #9aa0a6)',
      hover: 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.08))',
      hoverAccent: 'var(--dsw-alias-interactive-bg-hover-accent, color-mix(in srgb, #4f8ef7 16%, transparent))',
      bgMask: 'var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.45))',
      radius: 'var(--dsl-web-radius, 10px)',
      radiusSm: 6,
      businessT: 'var(--dsw-alias-state-business-tertiary, color-mix(in srgb, #4f8ef7 13%, transparent))',
      successT: 'var(--dsw-alias-state-success-tertiary, color-mix(in srgb, #3ecf8e 13%, transparent))',
      warnT: 'var(--dsw-alias-state-warn-tertiary, color-mix(in srgb, #e8a33d 13%, transparent))',
      errorT: 'var(--dsw-alias-state-error-tertiary, color-mix(in srgb, #e5484d 13%, transparent))',
      // 复核（review）类型专属色：DSH 无紫色业务令牌，集中在此、浅底由 tintOf 派生
      typeReview: '#a78bfa',
      mono: 'var(--dsl-terminal-font, ui-monospace, SFMono-Regular, Menlo, monospace)',
    }

    // 类型徽章：dev/debug/docs 中性化（不再占用语义色，状态/优先级独占色系；
    // color 仍保留给步骤条头部类型标签的强调色）。
    const TYPE_STYLE = {
      dev: { label: '开发', color: 'var(--dsw-alias-state-business-primary, #4f8ef7)' },
      debug: { label: '调试', color: 'var(--dsw-alias-state-warn-primary, #e8a33d)' },
      docs: { label: '文档', color: 'var(--dsw-alias-state-success-primary, #3ecf8e)' },
      review: { label: '复核', color: C.typeReview },
    }
    // 状态徽章语义（DEV-024）：active=蓝 / verify=绿 / review=琥珀 / blocked=红 /
    // handoff=中性流转（idle + ring 环形样式，与 review 彻底区分，不再同色）。
    const STATUS_STYLE = {
      active: { label: '进行中', color: 'var(--dsw-alias-state-business-primary, #4f8ef7)' },
      review: { label: '复核中', color: 'var(--dsw-alias-state-warn-primary, #e8a33d)' },
      verify: { label: '验证', color: 'var(--dsw-alias-state-success-primary, #3ecf8e)' },
      blocked: { label: '已暂停', color: 'var(--dsw-alias-state-error-primary, #e5484d)' },
      handoff: { label: '交接', color: C.idle, ring: true },
      archived: { label: '已归档', color: 'var(--dsw-alias-label-tertiary, #b3bac4)' },
    }
    // 优先级（DEV-024）：P0/P1/P2 全部走统一 soft 浅底（仅颜色区分等级，不再实底——
    // 用户反馈实底白字视觉偏大；同尺寸、同内边距、仅色相不同），P3 中性浅底。
    const PRIO_STYLE = {
      P0: { color: 'var(--dsw-alias-state-error-primary, #e5484d)' },
      P1: { color: 'var(--dsw-alias-state-warn-primary, #e8a33d)' },
      P2: { color: 'var(--dsw-alias-state-business-primary, #4f8ef7)' },
      P3: { color: 'var(--dsw-alias-label-tertiary, #b3bac4)' },
    }

    // ---- 工作流步骤条（前端静态定义，纯展示；后端不动） ----------------------
    // 各类型的真实流程步骤（与 agent-workflow/workflows/{dev,debug,docs}.md 对应）
    const WORKFLOW_STEPS = {
      dev: [
        { key: 'claimed', label: '认领' },
        { key: 'plan', label: '方案' },
        { key: 'impl', label: '实现' },
        { key: 'verify', label: '验证' },
        { key: 'review', label: 'Review' },
        { key: 'archived', label: '归档' },
      ],
      debug: [
        { key: 'claimed', label: '认领' },
        { key: 'diagnose', label: '选择诊断方式' },
        { key: 'collect', label: '收集证据' },
        { key: 'hypothesis', label: '验证假设' },
        { key: 'fix', label: '修复与回归' },
        { key: 'archived', label: '归档' },
      ],
      docs: [
        { key: 'claimed', label: '认领' },
        { key: 'outline', label: '大纲与核实' },
        { key: 'write', label: '撰写' },
        { key: 'review', label: '审阅' },
        { key: 'archived', label: '归档' },
      ],
    }

    // 状态 → 阶段 key（按类型；active=主工作阶段、review=Review/审阅、verify=验证等）
    const STATUS_STAGE = {
      active: { dev: 'impl', debug: 'collect', docs: 'write' },
      verify: { dev: 'verify', debug: 'hypothesis', docs: 'review' },
      review: { dev: 'review', debug: 'fix', docs: 'review' },
      handoff: { dev: 'review', debug: 'fix', docs: 'review' },
      // blocked：无独立阶段，停在 active 对应阶段并标注「暂停」
    }

    /**
     * 由任务字段推断当前所在工作流阶段（纯函数，可单测）。
     * @returns {null | {steps, index, paused}} steps=该类型步骤数组、
     *   index=当前阶段下标（0..len-1）、paused=是否处于暂停（blocked）
     */
    function inferWorkflowStage(t) {
      const type = t && t.type
      const steps = WORKFLOW_STEPS[type]
      if (!steps || !steps.length) return null
      const status = (t && t.status) || 'active'
      const map = STATUS_STAGE[status] || STATUS_STAGE.active
      const key = (map && map[type]) || STATUS_STAGE.active[type]
      const index = steps.findIndex((s) => s.key === key)
      return {
        steps,
        index: index < 0 ? 0 : index,
        paused: status === 'blocked',
        status,
      }
    }

    // 卡片/行 hover 质感 + 交互反馈（DEV-024）：:focus-visible 键盘焦点、:active 按压回弹、
    // 按钮统一过渡。纯手写 h() 下用静态 <style> 注入一次（inline style 无 :hover/:focus 能力）
    const AWF_HOVER_CSS =
      '.awf-card{transition:border-color .15s ease,box-shadow .15s ease,transform .12s ease}' +
      '.awf-card:hover{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#5b8cff) 45%,transparent);' +
      'box-shadow:0 4px 14px color-mix(in srgb,rgba(8,12,22,.16) 60%,transparent);transform:translateY(-1px)}' +
      '.awf-row{transition:background .12s ease}' +
      '.awf-row:hover{background:color-mix(in srgb,var(--dsw-alias-interactive-bg-hover,rgba(120,126,140,.08)) 60%,transparent)}' +
      '.awf-badge-row{transition:gap .12s ease}' +
      '.awf-card button,.awf-row button{transition:background .15s ease,border-color .15s ease,color .15s ease,transform .08s ease}' +
      '.awf-card button:active:not(:disabled),.awf-row button:active:not(:disabled){transform:translateY(1px)}' +
      '.awf-card :is(button,select,input):focus-visible,.awf-row :is(button,select,input):focus-visible,' +
      '.awf-toggle-btn:focus-visible,.awf-toolbar :is(button,select):focus-visible,' +
      '.awf-empty button:focus-visible{outline:2px solid var(--dsw-alias-interactive-bg-hover-accent,#5b8cff);outline-offset:1px}'

    // 统一基础样式类（DEV-024 收敛零散 inline style 的根源）：
    // 所有组件只挂类名 + 少量主题变量，尺寸/圆角/间距走同一体系，杜绝「裁切/大小不一致」。
    const AWF_UI_CSS =
      // 步骤条：节点 16px 圆（比 15px 更稳）、标签统一 11px、连线 2px 高
      '.awf-step-node{width:16px;height:16px;border-radius:50%;flex-shrink:0;box-sizing:border-box;' +
      'display:inline-flex;align-items:center;justify-content:center;position:relative;' +
      'font-size:10px;font-weight:800;line-height:1;overflow:visible}' +
      '.awf-step-node .awf-dot{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
      'width:7px;height:7px;border-radius:50%;display:block}' +
      '.awf-step-label{margin-top:5px;font-size:11px;white-space:nowrap;line-height:14px}' +
      // 关键修复（用户反馈「进行中的状态被裁剪」）：overflowX:auto 会强制 overflowY 也 auto，
      // 纵向溢出的节点/光圈就被父容器裁掉。改为 overflow:visible，节点永不裁剪；
      // 横向由 flex-shrink + 最小宽度控制，超出时节点压缩而不是裁剪。
      '.awf-track-body{display:flex;align-items:flex-start;overflow:visible;padding-bottom:4px;min-width:0}' +
      '.awf-step{flex:0 1 auto;min-width:0}' +
      '.awf-step-line{flex:1 1 10px;min-width:6px;height:2px;border-radius:99px;align-self:flex-start;margin-top:7px}' +
      // 徽章统一尺寸：所有优先级/状态 Pill 同高同字号，仅用颜色/边框区分等级
      '.awf-pill{display:inline-flex;align-items:center;gap:4px;border-radius:999px;' +
      'font-size:11px;font-weight:600;line-height:16px;padding:1px 8px;white-space:nowrap;box-sizing:border-box}' +
      '.awf-pill .awf-dot{width:5px;height:5px;border-radius:50%;display:inline-block;flex-shrink:0}' +
      // 优先级徽章用等宽数字：P0/P1/P2/P3 物理宽度完全一致（消除「0 比 1 大」的字体宽度差异）
      '.awf-pill[data-prio]{font-variant-numeric:tabular-nums;font-family:var(--dsl-terminal-font,ui-monospace,SFMono-Regular,Menlo,monospace);min-width:26px;text-align:center;justify-content:center}' +
      // 按钮统一 22px 档位
      '.awf-btn{font-size:11px;line-height:16px;padding:3px 12px;border-radius:999px;cursor:pointer;' +
      'font-weight:600;white-space:nowrap;box-sizing:border-box}' +
      '.awf-btn-sm{font-size:11px;line-height:16px;padding:2px 10px;border-radius:999px;cursor:pointer;' +
      'font-weight:600;white-space:nowrap;box-sizing:border-box}' +
      // 进度条统一 4px 轨道
      '.awf-progress{height:4px;border-radius:99px;overflow:hidden;margin-top:3px}' +
      '.awf-progress-fill{height:100%;border-radius:99px;transition:width .3s ease}'

    // 回退文件改动状态徽标（dry-run 返回 {path, status}）
    const FILE_STATUS_STYLE = {
      modified: { label: '已修改', color: 'var(--dsw-alias-state-warn-primary, #e8a33d)' },
      untracked: { label: '未跟踪', color: 'var(--dsw-alias-brand-primary, #4f8ef7)' },
      added: { label: '新增', color: 'var(--dsw-alias-state-success-primary, #3ecf8e)' },
      deleted: { label: '已删除', color: 'var(--dsw-alias-state-error-primary, #e5484d)' },
      staged: { label: '已暂存', color: 'var(--dsw-alias-state-success-primary, #3ecf8e)' },
      unmodified: { label: '未修改', color: 'var(--dsw-alias-label-tertiary, #b3bac4)' },
    }

    // 无法回退的说明文案（dry-run reason → 用户可读）
    const DELETE_REASON_TEXT = {
      'not-git': '该项目不是 git 仓库，无法回退未提交修改。',
      'no-scope': '任务块未记录修改范围，无法确定需要回退的文件。',
      'clean': '修改范围内没有未提交的修改，无需回退。',
    }

    const D = (v, fb) => (v === undefined || v === null ? fb : v)

    // ---- 工具 -------------------------------------------------------------

    const row = (extra) => Object.assign({ display: 'flex', alignItems: 'center', gap: 6 }, extra || {})
    const muted = (extra) => Object.assign({ color: C.dim, fontSize: 12, lineHeight: 1.5 }, extra || {})

    const cardStyle = {
      border: '1px solid ' + C.border,
      borderRadius: C.radius,
      padding: '12px 14px 11px',
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

    /** 危险实心按钮：删除并回退修改（destroy 语义）。 */
    const dangerSolid = {
      fontSize: 12, padding: '5px 14px', borderRadius: C.radiusSm, cursor: 'pointer',
      border: '1px solid ' + C.error, background: C.error, color: '#fff',
      fontWeight: 700, lineHeight: '18px', whiteSpace: 'nowrap',
      transition: 'opacity .15s ease',
    }

    /** 危险文字按钮：当前任务卡上的「删除」。 */
    const dangerTextStyle = {
      fontSize: 11, padding: '2px 10px', borderRadius: 999, cursor: 'pointer',
      border: '1px solid color-mix(in srgb, ' + C.error + ' 45%, transparent)',
      background: 'color-mix(in srgb, ' + C.error + ' 8%, transparent)',
      color: C.error, fontWeight: 600, lineHeight: '16px', whiteSpace: 'nowrap',
    }

    /** 表单输入（含 select）：主题令牌 + 紧凑尺寸。 */
    const inputStyle = {
      fontSize: 12, padding: '3px 8px', borderRadius: C.radiusSm,
      background: C.surface, color: C.text,
      border: '1px solid ' + C.border, outline: 'none',
    }

    /** 卡片内小型文字操作按钮（编辑 / 暂停 / 继续）。DEV-024：统一 11px/22px 档位。
     * 暂停/开始按钮固定最小宽度 + busy 文字用同宽占位，避免「暂停」→「暂停中…」
     * 文字变长导致按钮变宽、卡片底部行 layout 跳动（用户反馈「背景文字跳动」）。 */
    const tinyBtn = (busy) => Object.assign(buttonStyle(), {
      fontSize: 11, padding: '2px 10px', minWidth: 68,
      opacity: busy ? 0.55 : 1, cursor: busy ? 'default' : 'pointer',
    })

    const overlayStyle = {
      position: 'fixed', inset: 0, zIndex: 9999,
      background: C.bgMask,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, boxSizing: 'border-box',
    }

    /** 语义色对应的主题淡底变体令牌（替代手调 color-mix 13% 配方；未知色回退 color-mix）。 */
    function tintOf(color) {
      const k = String(color || '')
      const map = {
        'var(--dsw-alias-state-error-primary': C.errorT,
        'var(--dsw-alias-state-warn-primary': C.warnT,
        'var(--dsw-alias-state-success-primary': C.successT,
        'var(--dsw-alias-state-business-primary': C.businessT,
      }
      for (const prefix of Object.keys(map)) {
        if (k.indexOf(prefix) === 0) return map[prefix]
      }
      return 'color-mix(in srgb, ' + color + ' 13%, transparent)'
    }

    /**
     * 语义色胶囊（DEV-024）：variant 四态——
     *   soft=浅底+描边+可选圆点（默认）；solid=实底白字（P0 优先级）；
     *   ring=透明底+描边+圆点（handoff，与 review 区分）；chip=中性类型牌（无彩底）。
     * 尺寸统一走集中类 .awf-pill（同高/同字号/同内边距），仅颜色与边框差异表达等级，
     * 不再出现 P0 实底撑大的尺寸不一致（用户反馈）。
     * 类名 awf-pill awf-pill-<variant> 供单测断言。
     */
    function Pill({ color, children, dot, variant, dataPrio }) {
      const v = variant === 'solid' || variant === 'ring' || variant === 'chip' ? variant : 'soft'
      const style = {}
      if (v === 'chip') {
        style.color = C.sub
        style.background = 'transparent'
        style.border = '1px solid ' + C.border
      } else if (v === 'solid') {
        style.color = '#fff'
        style.background = color
        style.border = '1px solid ' + color
      } else {
        style.color = color
        style.background = v === 'ring' ? 'transparent' : tintOf(color)
        style.border = v === 'ring'
          ? '1px solid ' + color
          : '1px solid color-mix(in srgb, ' + color + ' 34%, transparent)'
      }
      return h('span', Object.assign(
        { className: 'awf-pill awf-pill-' + v, style },
        dataPrio ? { 'data-prio': dataPrio } : {}),
        dot && v !== 'chip'
          ? h('span', { className: 'awf-dot', style: { background: color } })
          : null,
        children)
    }

    function StatusBadge({ status }) {
      const st = STATUS_STYLE[status] || { label: status || '未设', color: C.faint }
      return h(Pill, { color: st.color, variant: st.ring ? 'ring' : 'soft', dot: true }, st.label)
    }

    /** 分区标题：渐变短竖条 + 标签 + 可选计数（DEV-024：间距与字号统一 12px 档）。 */
    function SectionTitle({ label, count }) {
      return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 10px' } },
        h('span', {
          style: {
            width: 3, height: 13, borderRadius: 2, flexShrink: 0,
            background: 'linear-gradient(180deg, ' + C.accent + ', ' + C.success + ')',
          },
        }),
        h('span', { style: { fontSize: 12, fontWeight: 700, letterSpacing: '.02em', color: C.text } }, label),
        count != null
          ? h('span', { style: { fontSize: 11, color: C.faint, background: C.hover, padding: '0 6px', borderRadius: 999, lineHeight: '16px' } }, String(count))
          : null)
    }

    /** 模态弹层外壳：遮罩 + 居中卡片 + 标题栏 + 关闭按钮。 */
    function ModalShell({ title, onClose, children, width }) {
      return h('div', {
        style: overlayStyle,
        onClick: (e) => { if (e.target === e.currentTarget && typeof onClose === 'function') onClose() },
      },
        h('div', {
          style: {
            width: width || 460, maxWidth: 'calc(100vw - 40px)', maxHeight: '80vh',
            display: 'flex', flexDirection: 'column',
            background: 'var(--dsw-alias-bg-layer-3, #ffffff)',
            border: '1px solid ' + C.border, borderRadius: C.radius,
            boxShadow: '0 12px 40px rgba(0,0,0,0.35)', overflow: 'hidden',
          },
        },
          h('div', {
            style: {
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              padding: '9px 14px', borderBottom: '1px solid ' + C.hairline, flexShrink: 0,
            },
          },
            h('div', { style: { fontSize: 13, fontWeight: 800, color: C.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, title),
            h('button', {
              onClick: onClose,
              style: Object.assign(buttonStyle(), {
                padding: '0 7px', fontSize: 11, lineHeight: '17px', flexShrink: 0,
                background: 'transparent', borderColor: 'transparent',
              }),
            }, '✕')),
          h('div', {
            style: { padding: '12px 14px', overflowY: 'auto', fontSize: 12, color: C.text },
          }, children)))
    }

    function fmtTime(iso) {
      if (!iso) return '—'
      const d = new Date(iso)
      const p = (n) => String(n).padStart(2, '0')
      return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
    }

    // ---- 请求封装（fetchImpl 可注入，供测试 mock） --------------------------

    /**
     * 解析 fetch 响应：HTTP 非 2xx 或 {ok:false} 一律抛错。
     * 错误对象带 .code / .status / .message（优先取 body error 字段，回退 HTTP 状态）。
     */
    async function parseResponse(r) {
      let data = null
      try { data = await r.json() } catch { /* 非 JSON 响应 */ }
      if (!r.ok || (data && data.ok === false)) {
        const info = (data && data.error) || {}
        const err = new Error(info.message || info.code || 'HTTP ' + r.status)
        err.code = info.code || ''
        err.status = r.status
        throw err
      }
      return data
    }

    async function getJson(url, fetchImpl) {
      const f = fetchImpl || fetch
      const r = await f(url, { cache: 'no-store' })
      return parseResponse(r)
    }

    async function postJson(url, body, fetchImpl) {
      const f = fetchImpl || fetch
      const r = await f(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
        cache: 'no-store',
      })
      return parseResponse(r)
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

    // ---- 未初始化判定 / todo 行 / 删除回退视图（纯函数，导出供测试） --------

    /**
     * 判定项目是否未初始化：
     *   - ledger 响应带 uninitialized / doesNotExist 标识（后端契约）；
     *   - 否则缺省回退：/awf/ledger 报错且错误含 project.yaml / 未初始化 字样
     *     （服务端对非项目根目录的 400 bad-request）。
     * @param {object|null} data /awf/ledger 的 ok 响应体
     * @param {object|null} err getJson 抛出的错误
     * @returns {boolean}
     */
    function detectNotInitialized(data, err) {
      if (data) {
        const L = data.ledger
        if (L && (L.uninitialized === true || L.doesNotExist === true)) return true
        if (data.uninitialized === true || data.doesNotExist === true) return true
      }
      if (err) {
        const code = err.code || ''
        const msg = String(err.message || '')
        if (code === 'not-initialized' || code === 'uninitialized') return true
        if (msg.indexOf('project.yaml') !== -1 || msg.indexOf('未初始化') !== -1) return true
      }
      return false
    }

    /**
     * 收集「未开始任务」可操作列表（todo 表格行）。
     * 优先读 ledger.todoRows（[{type, rows:[{id,prio,desc,date}]}]，后端契约）；
     * 缺省回退读 ledger.todo[i].rows；都没有则返回空数组（渲染时仅保留进度条）。
     * @param {object|null} ledger
     * @returns {Array<{type:string,id:string,prio:string,desc:string,date:string}>}
     */
    function collectTodoRows(ledger) {
      const out = []
      const push = (type, rows) => {
        if (!Array.isArray(rows)) return
        for (const r of rows) {
          if (!r || typeof r.id !== 'string' || !r.id) continue
          out.push({
            type: (type || '') + '',
            id: r.id,
            prio: r.prio || '',
            desc: r.desc || '',
            date: r.date || '',
          })
        }
      }
      if (!ledger) return out
      if (Array.isArray(ledger.todoRows)) {
        for (const item of ledger.todoRows) push(item && item.type, item && item.rows)
        return out
      }
      if (Array.isArray(ledger.todo)) {
        for (const item of ledger.todo) push(item && item.type, item && item.rows)
      }
      return out
    }

    /**
     * 把 dry-run 响应规整为删除确认框视图模型：
     *   {rollbackable:boolean, files:[{path,status}], reason:string}
     * files 只保留有 path 的条目；rollbackable 缺省 = 有文件且服务端未否定。
     * @param {object|null} dryRun /awf/task/delete/dry-run 的 dryRun 字段
     */
    function buildDeleteView(dryRun) {
      const d = dryRun || {}
      const files = (Array.isArray(d.files) ? d.files : [])
        .filter((f) => f && typeof f.path === 'string' && f.path)
        .map((f) => ({ path: f.path, status: String(f.status || 'modified') }))
      const rollbackable = !!(d.rollbackable && files.length > 0)
      let reason = ''
      if (!rollbackable) {
        reason = d.reason || (files.length === 0 ? 'no-scope' : 'unknown')
      }
      return { rollbackable, files, reason }
    }

    /** 无法回退原因 → 用户可读文案。 */
    function deleteReasonText(reason) {
      if (reason && DELETE_REASON_TEXT[reason]) return DELETE_REASON_TEXT[reason]
      return reason
        ? '无法自动回退未提交修改：' + reason + '。'
        : '无法自动回退未提交修改。'
    }

    /** 文件改动状态徽标文案。 */
    function fileStatusLabel(status) {
      const st = FILE_STATUS_STYLE[status]
      return st ? st.label : (status || '已修改')
    }

    /**
     * 删除任务回退流程（前端契约，fetchImpl 可注入）：
     *   1) POST /awf/task/delete/dry-run → {ok, dryRun:{rollbackable, files:[{path,status}], reason}}
     *   2) 把 dryRun 交给 confirm 回调（UI 展示确认框），用户返回
     *      'rollback' | 'ledger-only' | null（取消）
     *   3) 仅当用户确认（非 null）后才 POST /awf/task/delete/execute（mode=用户选择）
     * @param {object} o {path, type, id, workspaceRoot?, confirm, fetchImpl?}
     * @returns {Promise<{cancelled:boolean, dryRun?:object, result?:object}>}
     */
    async function runDeleteFlow(o) {
      const { path, type, id, workspaceRoot, confirm, fetchImpl } = o || {}
      const dryRunResp = await postJson('/awf/task/delete/dry-run',
        { path, type, id, workspaceRoot }, fetchImpl)
      const dryRun = (dryRunResp && dryRunResp.dryRun) || {}
      const choice = typeof confirm === 'function' ? await confirm(dryRun) : null
      if (!choice) return { cancelled: true, dryRun }
      const result = await postJson('/awf/task/delete/execute',
        { path, type, id, mode: choice, workspaceRoot }, fetchImpl)
      return { cancelled: false, dryRun, result }
    }

    // ---- t5：todo / 当前任务 CRUD 纯函数（导出供测试） -----------------------

    /** 任务状态可选值（铁律：只写 active/blocked/review/verify/handoff）。 */
    const STATUS_OPTIONS = ['active', 'blocked', 'review', 'verify', 'handoff']

    /** 服务端错误码 → 用户可读文案（code → 前缀；bad-request/internal 追加服务端明细）。 */
    const ERROR_COPY = {
      'not-found': '未找到目标（可能已被移除，请刷新后重试）。',
      'duplicate': '已存在同 ID 的待办行，请换一个 ID。',
      'invalid-id': '任务 ID 需为 TYPE-xxx 格式（如 DEV-001）。',
      'invalid-prio': '优先级需为 P0–P3。',
      'not-git-repo': '该目录不是 git 仓库，无法查询/回退修改。',
      'nothing-to-revert': '修改范围为空或无未提交改动，没有可回退的文件。',
      'path-not-allowed': '路径不在白名单：必须位于全局项目索引或当前工作区根。',
      'forbidden': '无权限：认证未通过，请先登录。',
      'already-initialized': '该项目已初始化过工作流，无需重复初始化。',
      'bad-request': '请求不合法：',
      'internal': '服务端处理失败：',
    }

    /**
     * 错误 → 友好文案。已知错误码用 ERROR_COPY，未知回退 fallback + message。
     * @param {Error} e getJson/postJson 抛出的错误（带 .code/.message）
     * @param {string} [fallback] 未知错误的前缀
     */
    function apiErrorText(e, fallback) {
      const code = e && e.code
      const msg = String((e && e.message) || '').trim()
      if (code && ERROR_COPY[code]) {
        const base = ERROR_COPY[code]
        if (code === 'bad-request' || code === 'internal') return base + msg
        if (msg) return base + '（' + msg + '）'
        return base
      }
      return (fallback || '操作失败') + '：' + (msg || code || String(e))
    }

    /**
     * 调用 POST /awf/todo（todo CRUD）。
     * body: {path, type, action: add|update|delete, row:{id, 优先级?, 描述?, date?}, workspaceRoot?}
     */
    async function runTodoAction(o) {
      const { path, type, action, row, workspaceRoot, fetchImpl } = o || {}
      return postJson('/awf/todo',
        { path, type, action, row: row || {}, workspaceRoot }, fetchImpl)
    }

    /**
     * 调用 POST /awf/task（当前任务 update/pause/resume）。
     * body: {path, type, id, action, fields?, workspaceRoot?}；update 必须带非空 fields。
     */
    async function runTaskAction(o) {
      const { path, type, id, action, fields, workspaceRoot, fetchImpl } = o || {}
      const body = { path, type, id, action, workspaceRoot }
      if (action === 'update') body.fields = fields || {}
      return postJson('/awf/task', body, fetchImpl)
    }

    /**
     * 调用 GET /awf/source（只读 .md 源文件）。
     * 返回 {ok:true, source:{type,file,absPath,content}}；路由未就绪（404）抛错
     * code='not-found'，由调用方映射「源文件接口未就绪」。
     */
    async function fetchSource(o) {
      const { path, type, file, fetchImpl } = o || {}
      const q = new URLSearchParams({ path: path || '', type: type || '', file: file || '' }).toString()
      return getJson('/awf/source?' + q, fetchImpl)
    }

    /** 复制文本：优先 clipboard API，缺省（测试/非安全上下文）回退无操作并置 copied。 */
    function copyText(text, onDone) {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(String(text || '')).then(
          () => onDone && onDone(true),
          () => onDone && onDone(false))
        return
      }
      onDone && onDone(true)
    }

    // ---- 看板组件 ---------------------------------------------------------

    /**
     * 当前任务卡：徽章行 / 标题 / Owner·更新 / 操作按钮（编辑 · 暂停/继续 · 删除）。
     * 编辑时原位展开表单改字段（优先级/状态/Owner/修改范围/描述）。
     * DEV-024：flush=true 时去掉底部 margin（两列网格容器内用 gap 撑间距）。
     */
    function TaskCard({ t, onDelete, deleting, onEdit, editing, editForm, onEditChange, onEditSave, onEditCancel, onPause, onResume, working, onOpenSource, flush }) {
      const type = TYPE_STYLE[t.type] || { label: t.type || '任务', color: C.faint }
      const pst = PRIO_STYLE[t.prio] || { color: C.faint }
      const delBusy = !!deleting
      const work = working || {}
      const busy = delBusy || (work.id === t.id)
      const blocked = t.status === 'blocked'
      const ef = editForm || {}
      const editBusy = !!ef.busy
      const cardCls = Object.assign({}, cardStyle, flush ? { marginBottom: 0 } : {})

      // 徽章行：类型=中性 chip / 状态=语义 Pill / 优先级=实底或浅底 / Owner=accent 浅底
      const badgeRow = h('div', { className: 'awf-badge-row', style: { display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' } },
        h(Pill, { color: type.color, variant: 'chip' }, type.label),
        StatusBadge({ status: t.status }),
        t.prio ? h(Pill, { color: pst.color, variant: 'soft', dataPrio: t.prio }, t.prio) : null,
        // Owner 也入徽章行：类型 × 状态 × 优先级 × Owner 多徽章布局（AgentTeams 风格）
        t.owner
          ? h(Pill, { color: C.accent, dot: true },
              h('span', { title: 'Owner', style: { maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis' } }, t.owner))
          : null)

      // ---- 编辑模式：原位表单（优先级 / 状态 / Owner / 描述 / 修改范围）
      if (editing) {
        return h('div', { className: 'awf-card', style: cardCls },
          h('div', {
            style: {
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
              paddingBottom: 6, marginBottom: 7,
              borderBottom: '1px solid ' + C.hairline,
            },
          },
            h('span', { style: { fontFamily: C.mono, fontWeight: 700, fontSize: 12, color: C.text } }, t.id || '?'),
            badgeRow),
          h('div', { style: row({ gap: 6, flexWrap: 'wrap' }) },
            h('select', {
              value: ef.prio || t.prio || 'P2', disabled: editBusy,
              onChange: (e) => onEditChange('prio', e.target.value), style: inputStyle,
            }, ['P0', 'P1', 'P2', 'P3'].map((p) => h('option', { key: p, value: p }, p))),
            h('select', {
              value: ef.status || t.status || 'active', disabled: editBusy,
              onChange: (e) => onEditChange('status', e.target.value), style: inputStyle,
            }, STATUS_OPTIONS.map((s) => h('option', { key: s, value: s }, s))),
            h('input', {
              value: ef.owner || '', placeholder: 'Owner', disabled: editBusy,
              onChange: (e) => onEditChange('owner', e.target.value),
              style: Object.assign({}, inputStyle, { width: 96 }),
            })),
          h('input', {
            value: ef.desc || '', placeholder: '描述（任务块标题）', disabled: editBusy,
            onChange: (e) => onEditChange('desc', e.target.value),
            style: Object.assign({}, inputStyle, { width: '100%', marginTop: 6, boxSizing: 'border-box' }),
          }),
          h('input', {
            value: ef.scope || '', placeholder: '修改范围（如 lib/client.js，逗号分隔；留空不变）', disabled: editBusy,
            onChange: (e) => onEditChange('scope', e.target.value),
            style: Object.assign({}, inputStyle, { width: '100%', marginTop: 6, boxSizing: 'border-box' }),
          }),
          ef.error
            ? h('div', { style: { marginTop: 6, fontSize: 11, color: C.error, wordBreak: 'break-all' } }, '⚠️ ' + ef.error)
            : null,
          h('div', { style: row({ gap: 6, justifyContent: 'flex-end', marginTop: 8 }) },
            typeof onOpenSource === 'function'
              ? h('button', {
                  onClick: onOpenSource, disabled: editBusy, title: '只读查看 current.md 源文件',
                  style: tinyBtn(editBusy),
                }, '打开源文件')
              : null,
            h('button', {
              onClick: editBusy ? undefined : onEditSave, disabled: editBusy,
              style: Object.assign(buttonStyle(true), { opacity: editBusy ? 0.55 : 1, cursor: editBusy ? 'default' : 'pointer' }),
            }, '保存'),
            h('button', { onClick: onEditCancel, disabled: editBusy, style: buttonStyle() }, '取消')))
      }

      // ---- 正常模式
      return h('div', { className: 'awf-card', style: cardCls },
        h('div', {
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
            paddingBottom: 6, marginBottom: 6,
            borderBottom: '1px solid ' + C.hairline,
          },
        },
          h('span', { style: { fontFamily: C.mono, fontWeight: 700, fontSize: 12, color: C.text } }, t.id || '?'),
          badgeRow),
        h('div', { style: { fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6, lineHeight: 1.45 } },
          t.title || '（无标题）'),
        h(TaskCheckProgress, { items: t.checkItems, status: t.status }),
        h(WorkflowSteps, { t }),
        h('div', {
          style: Object.assign(
            { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
            { flexWrap: 'wrap' }),
        },
          h('div', { style: row({ gap: 8, flexWrap: 'wrap', fontSize: 11, color: C.dim }) },
            t.owner
              ? h('span', { title: 'Owner · ' + t.owner, style: row({ gap: 4 }) },
                  h('span', {
                    style: {
                      width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                      background: 'color-mix(in srgb, ' + C.accent + ' 22%, transparent)',
                      color: C.accent, fontSize: 9, fontWeight: 700, display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center',
                    },
                  }, (t.owner[0] || '?').toUpperCase()))
              : null,
            t.updated ? h('span', { style: row({ gap: 4 }) },
              h('span', { style: { color: C.faint } }, '↻'), h('span', {}, '更新 ' + t.updated)) : null,
            t.mode ? h('span', { style: { color: C.faint } }, t.mode) : null),
          h('div', { style: row({ gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }) },
            typeof onEdit === 'function'
              ? h('button', {
                  onClick: busy ? undefined : () => onEdit(t),
                  disabled: busy,
                  title: '编辑任务字段',
                  style: tinyBtn(busy),
                }, '编辑')
              : null,
            blocked
              ? (typeof onResume === 'function' ? h('button', {
                  onClick: busy ? undefined : () => onResume(t),
                  disabled: busy,
                  title: '开始（恢复进行中，状态 → active）',
                  style: tinyBtn(busy),
                }, '开始') : null)
              : (typeof onPause === 'function' ? h('button', {
                  onClick: busy ? undefined : () => onPause(t),
                  disabled: busy,
                  title: '暂停（状态 → blocked）',
                  style: tinyBtn(busy),
                }, '暂停') : null),
            typeof onDelete === 'function'
              ? h('button', {
                  onClick: busy ? undefined : () => onDelete(t),
                  disabled: busy,
                  title: '删除任务（回退修改需二次确认）',
                  style: Object.assign(dangerTextStyle, { opacity: busy ? 0.55 : 1, cursor: busy ? 'default' : 'pointer' }),
                }, '删除')
              : null)))
    }

    /** 最近完成行：完成标记 / 日期 / ID / 描述，可点击查看归档。 */
    function RecentRow({ r, onOpen }) {
      const clickable = typeof onOpen === 'function'
      return h('div', {
        className: 'awf-row',
        onClick: clickable ? () => onOpen(r) : undefined,
        title: clickable ? '点击查看归档' : undefined,
        style: {
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px',
          borderBottom: '1px solid ' + C.hairline, fontSize: 12,
          cursor: clickable ? 'pointer' : 'default',
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
        }, r.desc || '—'),
        clickable ? h('span', { style: { color: C.faint, fontSize: 12, flexShrink: 0 } }, '›') : null)
    }

    /**
     * 待办行（含 CRUD）：开始 / 编辑（原位表单）/ 删除（行内二次确认）。
     * 参数：{row, onStart, starting} 基础；编辑态 {editing, editForm, onEditChange, onEditSave, onEditCancel}；
     *      删除确认态 {deleting, onDeleteConfirm, onDeleteCancel, busy}。
     */
    function TodoRow({ row, onStart, starting, onEdit, editing, editForm, onEditChange, onEditSave, onEditCancel, onDelete, deleting, onDeleteConfirm, onDeleteCancel, busy, onOpenSource }) {
      const key = row.type + ':' + row.id
      const startBusy = !!(starting && starting.key === key)
      const rowBusy = !!busy // 删除执行中
      const anyBusy = startBusy || rowBusy
      const typeStyle = TYPE_STYLE[row.type] || { color: C.faint }

      // ---- 编辑模式：原位表单（优先级 select + 描述 input + 保存/取消）
      if (editing) {
        const f = editForm || {}
        const editBusy = !!f.busy
        return h('div', {
          className: 'awf-row',
          style: {
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
            padding: '6px 0', borderBottom: '1px solid ' + C.hairline, fontSize: 12,
          },
        },
          h(Pill, { color: typeStyle.color, variant: 'chip' }, TYPE_LABEL(row.type)),
          h('span', { style: { fontFamily: C.mono, fontWeight: 700, fontSize: 11, color: C.faint, flexShrink: 0 } }, row.id),
          h('select', {
            value: f.prio || row.prio || 'P2', disabled: editBusy,
            onChange: (e) => onEditChange('prio', e.target.value), style: inputStyle,
          }, ['P0', 'P1', 'P2', 'P3'].map((p) => h('option', { key: p, value: p }, p))),
          h('input', {
            value: f.desc || '', placeholder: '描述', disabled: editBusy,
            onChange: (e) => onEditChange('desc', e.target.value),
            style: Object.assign({}, inputStyle, { flex: '1 1 130px', minWidth: 0 }),
          }),
          h('button', {
            onClick: editBusy ? undefined : onEditSave, disabled: editBusy,
            style: Object.assign(buttonStyle(true), { opacity: editBusy ? 0.55 : 1, cursor: editBusy ? 'default' : 'pointer' }),
          }, '保存'),
          h('button', { onClick: onEditCancel, disabled: editBusy, style: buttonStyle() }, '取消'),
          typeof onOpenSource === 'function'
            ? h('button', {
                onClick: onOpenSource, disabled: editBusy,
                title: '只读查看该类型 todo.md 源文件',
                style: tinyBtn(editBusy),
              }, '打开源文件')
            : null,
          f.error
            ? h('span', { style: { width: '100%', fontSize: 11, color: C.error, wordBreak: 'break-all' } }, '⚠️ ' + f.error)
            : null)
      }

      // ---- 删除二次确认：行内警示 + 删除/取消
      if (deleting) {
        return h('div', {
          className: 'awf-row',
          style: {
            display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px 5px 8px',
            borderBottom: '1px solid ' + C.hairline, fontSize: 12,
            borderLeft: '3px solid ' + C.error, marginLeft: 1,
          },
        },
          h('span', { style: { color: C.error, fontWeight: 700, fontSize: 11, flex: 1, minWidth: 0 } },
            '确认删除待办 ' + row.id + '？'),
          h('button', {
            onClick: rowBusy ? undefined : onDeleteConfirm, disabled: rowBusy,
            style: Object.assign(dangerTextStyle, { opacity: rowBusy ? 0.55 : 1, cursor: rowBusy ? 'default' : 'pointer' }),
          }, '删除'),
          h('button', { onClick: onDeleteCancel, disabled: rowBusy, style: buttonStyle() }, '取消'))
      }

      // ---- 正常模式
      return h('div', {
        className: 'awf-row',
        style: {
          display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0 5px 2px',
          borderBottom: '1px solid ' + C.hairline, fontSize: 12,
        },
      },
        h(Pill, { color: typeStyle.color, variant: 'chip' }, TYPE_LABEL(row.type)),
        h('span', { style: { fontFamily: C.mono, fontWeight: 700, fontSize: 11, color: C.text, flexShrink: 0 } }, row.id),
        h('span', {
          style: {
            color: C.dim, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', flex: 1, minWidth: 0,
          },
        }, row.desc || '—'),
        row.prio ? h(Pill, { color: (PRIO_STYLE[row.prio] || { color: C.faint }).color, variant: 'soft', dataPrio: row.prio }, row.prio) : null,
        typeof onStart === 'function'
          ? h('button', {
              onClick: anyBusy ? undefined : () => onStart(row),
              disabled: anyBusy,
              style: Object.assign(buttonStyle(true), { opacity: anyBusy ? 0.55 : 1, cursor: anyBusy ? 'default' : 'pointer' }),
            }, '开始')
          : null,
        typeof onEdit === 'function'
          ? h('button', {
              onClick: anyBusy ? undefined : () => onEdit(row),
              disabled: anyBusy,
              style: tinyBtn(anyBusy),
            }, '编辑')
          : null,
        typeof onDelete === 'function'
          ? h('button', {
              onClick: anyBusy ? undefined : () => onDelete(row),
              disabled: anyBusy,
              style: Object.assign(dangerTextStyle, { opacity: anyBusy ? 0.55 : 1, cursor: anyBusy ? 'default' : 'pointer' }),
            }, '删除')
          : null)
    }

    /**
     * 待办类型三态切换器（dev/debug/docs）。todo.md 是表格行格式、无 checkbox，
     * 不再渲染进度条；各类型按 toggle 展示自己的未开始任务行。
     * DEV-024：24px 控件高度，选中态用 hoverAccent 底 + accent 描边（对齐宿主 kit chipActive）。
     */
    function TypeToggle({ value, onChange }) {
      const items = [['dev', '开发'], ['debug', '调试'], ['docs', '文档']]
      return h('div', {
        className: 'awf-toggle',
        style: {
          display: 'inline-flex', padding: 2, borderRadius: 8,
          background: 'color-mix(in srgb, ' + C.raised + ' 55%, transparent)',
          border: '1px solid ' + C.hairline, gap: 2,
        },
      },
        items.map(([v, label]) => h('button', {
          key: v,
          className: 'awf-toggle-btn' + (value === v ? ' awf-toggle-btn-active' : ''),
          onClick: () => onChange(v),
          style: {
            fontSize: 11, padding: '3px 14px', borderRadius: 6, cursor: 'pointer',
            border: '1px solid ' + (value === v ? 'color-mix(in srgb, ' + C.accent + ' 45%, transparent)' : 'transparent'),
            background: value === v ? C.hoverAccent : 'transparent',
            color: value === v ? C.text : C.sub,
            fontWeight: value === v ? 700 : 500,
          },
        }, label)))
    }

    /**
     * 当前任务块内的验收勾选框进度（仅当后端/账本提供 checkItems 时渲染；无则纯徽章）。
     * DEV-024 修复：服务端契约产出对象形态 {done,total,items:[…]}（src/ledger.js ledgerOf），
     * 同时兼容单测注入的数组形态 —— 此前只按数组消费导致真实面板永不渲染。
     * 容器带 awf-check 类供单测断言。
     * 语义（用户反馈）：active/blocked=实现阶段 →「实现进度」；
     * verify/review/handoff=验收与交接阶段 →「验收进度」。
     */
    function TaskCheckProgress({ items, status }) {
      if (!items) return null
      const list = Array.isArray(items) ? items : (items.items || [])
      if (!list.length) return null
      const done = Array.isArray(items) ? list.filter((i) => i && i.done).length : Math.max(0, Number(items.done) || 0)
      const total = Array.isArray(items) ? list.length : (Number(items.total) > 0 ? Number(items.total) : list.length)
      const pct = total > 0 ? Math.round((done / total) * 100) : 0
      const label = (status === 'verify' || status === 'review' || status === 'handoff') ? '验收进度' : '实现进度'
      return h('div', { className: 'awf-check', style: { marginBottom: 6 } },
        h('div', { style: row({ gap: 6, fontSize: 11, color: C.sub }) },
          h('span', { style: { fontWeight: 600, color: C.text } }, label),
          h('span', {}, String(done) + '/' + String(total) + ' · ' + String(pct) + '%')),
        h('div', {
          className: 'awf-progress',
          style: {
            background: 'color-mix(in srgb, ' + C.faint + ' 22%, transparent)',
          },
        },
          h('div', {
            className: 'awf-progress-fill',
            style: {
              width: pct + '%',
              background: pct >= 100 ? C.success : C.accent,
            },
          })))
    }

    /**
     * 工作流步骤条（AgentTeams 面板视觉语言，t8 重构）：
     * 横向阶段轨道——圆形状态节点（完成=实心填充+✓、当前=强调色+光圈、未到=空心置灰）
     * + 连接线（已完成段强调色、未到段灰）+ 节点下方标签；按任务类型（dev/debug/docs）展示，
     * 当前阶段由状态推断；blocked 在当前位置标注「暂停」。
     */
    function WorkflowSteps({ t }) {
      const info = inferWorkflowStage(t)
      if (!info || !info.steps || info.steps.length < 2) return null
      const type = TYPE_STYLE[t.type] || { label: t.type || '任务', color: C.faint }
      const { steps, index, paused } = info
      const activeStep = steps[Math.min(index, steps.length - 1)] || steps[0]

      const nodeStyle = (i) => {
        const done = i < index
        const cur = i === index
        const base = {
          // 集中类 awf-step-node 提供 16px 圆 + 相对定位；这里只给状态色/边框
          border: '1px solid ',
        }
        if (cur) {
          return Object.assign(base, {
            background: C.accent, borderColor: C.accent, color: '#fff',
            // DEV-024：光圈 2px，紧凑布局减小「被裁剪」观感
            boxShadow: '0 0 0 2px color-mix(in srgb, ' + C.accent + ' 22%, transparent)',
          })
        }
        if (done) {
          return Object.assign(base, {
            background: 'color-mix(in srgb, ' + C.accent + ' 22%, transparent)',
            borderColor: 'color-mix(in srgb, ' + C.accent + ' 55%, transparent)',
            color: C.accent,
          })
        }
        return Object.assign(base, {
          background: 'transparent',
          borderColor: 'color-mix(in srgb, ' + C.faint + ' 45%, transparent)',
          color: C.faint,
        })
      }
      // 节点内 icon：CSS 绘制——当前=白色实心圆点（绝对定位居中，永不裁剪）、
      // 完成=✓、暂停=⏸、未到=空。集中类 awf-step-node 保证容器不设 overflow 裁剪。
      const nodeIcon = (i) => {
        const done = i < index
        const cur = i === index
        if (cur && !paused) {
          // 当前激活：绝对定位白点，translate(-50%,-50%) 严格居中，不依赖行高
          return h('span', { className: 'awf-dot', style: { background: '#fff' } })
        }
        if (cur && paused) {
          return h('span', { style: { fontSize: 11, fontWeight: 900, lineHeight: 1 } }, '⏸')
        }
        if (done) {
          return h('span', { style: { fontSize: 11, fontWeight: 900, lineHeight: 1 } }, '✓')
        }
        // 未到：空心节点不放内容
        return null
      }
      const lineStyle = (i) => ({
        background: i < index
          ? 'color-mix(in srgb, ' + C.accent + ' 50%, transparent)'
          : 'color-mix(in srgb, ' + C.faint + ' 24%, transparent)',
      })

      const trackChildren = []
      steps.forEach((s, i) => {
        const done = i < index
        const cur = i === index
        if (i > 0) trackChildren.push(h('span', { key: 'ln' + i, className: 'awf-step-line', style: lineStyle(i - 1) }))
        trackChildren.push(h('div', {
          key: s.key,
          className: 'awf-step' + (cur ? ' awf-step-cur' + (paused ? ' awf-step-paused' : '') : done ? ' awf-step-done' : ' awf-step-pend'),
          style: { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 1 auto', minWidth: 0 },
        },
          h('span', { className: 'awf-step-node', style: nodeStyle(i), title: s.label }, nodeIcon(i)),
          h('span', {
            className: 'awf-step-label',
            style: {
              fontWeight: cur ? 700 : 600,
              color: cur ? C.accent : done ? C.sub : C.faint,
            },
          }, s.label)))
      })

      return h('div', {
        className: 'awf-track',
        style: {
          marginTop: 10, padding: '10px 12px', borderRadius: C.radius,
          background: 'color-mix(in srgb, ' + C.surface + ' 45%, transparent)',
          border: '1px solid ' + C.hairline,
        },
      },
        h('div', { style: Object.assign({ justifyContent: 'space-between' }, row({ marginBottom: 8 })) },
          h('span', { style: row({ gap: 6, fontSize: 11, fontWeight: 700, color: C.dim }) },
            h('span', { style: { color: type.color } }, type.label),
            h('span', {}, '流程')),
          h('span', { style: row({ gap: 8, fontSize: 11 }) },
            h('span', { style: { color: C.success, fontWeight: 600, whiteSpace: 'nowrap' } },
              '✓ 已完成 ' + index),
            paused
              ? h('span', { style: { fontSize: 11, fontWeight: 600, color: C.warn, whiteSpace: 'nowrap' } },
                  '已暂停 · ' + activeStep.label)
              : h('span', { style: { fontSize: 11, color: C.accent, fontWeight: 600, whiteSpace: 'nowrap' } },
                  '当前 · ' + activeStep.label),
            h('span', { style: { color: C.faint, fontWeight: 600, whiteSpace: 'nowrap' } },
              '待办 ' + Math.max(0, steps.length - index - 1)))),
        h('div', { className: 'awf-track-body', style: { display: 'flex', alignItems: 'flex-start', paddingBottom: 4, minWidth: 0 } },
          trackChildren))
    }

    /**
     * 新增待办行表单（todo CRUD add）。form: {type, id, prio, desc, busy, error}。
     */
    function TodoAddForm({ form, onChange, onSave, onCancel }) {
      const f = form || {}
      const busy = !!f.busy
      return h('div', {
        style: {
          marginTop: 8, padding: '9px 11px', borderRadius: 8,
          border: '1px dashed ' + C.accent,
          background: 'color-mix(in srgb, ' + C.accent + ' 6%, transparent)',
        },
      },
        h('div', { style: { fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 7 } }, '＋ 新增待办行'),
        h('div', { style: row({ gap: 6, flexWrap: 'wrap' }) },
          h('select', {
            value: f.type || 'dev', disabled: busy,
            onChange: (e) => onChange('type', e.target.value), style: inputStyle,
          }, ['dev', 'debug', 'docs'].map((t) => h('option', { key: t, value: t }, TYPE_LABEL(t)))),
          h('input', {
            value: f.id || '', placeholder: '任务 ID（如 DEV-200）', disabled: busy,
            onChange: (e) => onChange('id', e.target.value),
            style: Object.assign({}, inputStyle, { width: 128 }),
          }),
          h('select', {
            value: f.prio || 'P2', disabled: busy,
            onChange: (e) => onChange('prio', e.target.value), style: inputStyle,
          }, ['P0', 'P1', 'P2', 'P3'].map((p) => h('option', { key: p, value: p }, p)))),
        h('input', {
          value: f.desc || '', placeholder: '描述（可留空，默认与 ID 一致）', disabled: busy,
          onChange: (e) => onChange('desc', e.target.value),
          style: Object.assign({}, inputStyle, { width: '100%', marginTop: 6, boxSizing: 'border-box' }),
        }),
        f.error
          ? h('div', { style: { marginTop: 6, fontSize: 11, color: C.error, wordBreak: 'break-all' } }, '⚠️ ' + f.error)
          : null,
        h('div', { style: row({ gap: 6, justifyContent: 'flex-end', marginTop: 8 }) },
          h('button', {
            onClick: busy ? undefined : onSave, disabled: busy,
            style: Object.assign(buttonStyle(true), { opacity: busy ? 0.55 : 1, cursor: busy ? 'default' : 'pointer' }),
          }, '保存'),
          h('button', { onClick: onCancel, disabled: busy, style: buttonStyle() }, '取消')))
    }

    /**
     * 源文件查看面板（只读）：README/任务字段编辑态的「打开源文件」目标。
     * 展示本地绝对路径（可复制）+ macOS「在访达显示」提示 + .md 原文（等宽、可滚动）。
     * src: {type, file, busy, data:{absPath,content}, error}
     */
    function SourcePanel({ src, onClose, onCopy }) {
      const s = src || {}
      const data = s.data || null
      return h(ModalShell, {
        title: '源文件 · ' + (s.type || '') + '/' + (s.file || '') + '.md',
        onClose, width: 520,
      },
        s.busy
          ? h('div', { style: { padding: '16px 0', textAlign: 'center', color: C.dim, fontSize: 12 } }, '加载中…')
          : s.error
            ? h('div', { style: { padding: '12px', color: C.error, fontSize: 12, wordBreak: 'break-all' } }, '⚠️ ' + s.error)
            : data
              ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
                  h('div', {
                    style: {
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                      padding: '6px 9px', borderRadius: 6,
                      background: 'color-mix(in srgb, ' + C.surface + ' 70%, transparent)',
                      border: '1px solid ' + C.hairline, flexWrap: 'wrap',
                    },
                  },
                    h('span', {
                      style: {
                        fontFamily: C.mono, fontSize: 11, color: C.dim,
                        wordBreak: 'break-all', minWidth: 0, flex: 1,
                      },
                    }, data.absPath || ''),
                    h('button', {
                      onClick: () => onCopy && onCopy(data.absPath),
                      title: '复制绝对路径到剪贴板，供系统编辑器打开',
                      style: tinyBtn(false),
                    }, s.copied ? '已复制 ✓' : '复制路径')),
                  h('div', {
                    style: {
                      fontSize: 11, color: C.faint, lineHeight: 1.5,
                      padding: '0 2px',
                    },
                  }, '提示：复制路径后在访达（Finder）按 ⌘⇧G 粘贴直达，或粘贴到任意编辑器打开查看。'),
                  h('pre', {
                    style: {
                      margin: 0, padding: '10px 12px', borderRadius: 6,
                      fontFamily: C.mono, fontSize: 11, lineHeight: 1.6,
                      color: 'var(--dsw-alias-label-primary, #2c3138)',
                      background: 'color-mix(in srgb, ' + C.surface + ' 45%, transparent)',
                      border: '1px solid ' + C.hairline,
                      maxHeight: '46vh', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    },
                  }, data.content || ''))
              : h('div', { style: { padding: '12px', color: C.dim, fontSize: 12 } }, '无内容'))
    }

    /** 删除任务二次确认弹框。state: {task, view, busy, error}；handlers: {onRollback, onLedgerOnly, onCancel}。 */
    function renderDeleteModal(state, handlers) {
      const s = state || {}
      const H = handlers || {}
      const task = s.task || {}
      const view = s.view
      const busy = !!s.busy

      const errorLine = s.error
        ? h('div', { key: 'err', style: { fontSize: 12, color: C.error, marginTop: 10, wordBreak: 'break-all' } }, '⚠️ ' + s.error)
        : null

      const actionButtons = (withRollback) => h('div', {
        style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' },
      },
        withRollback
          ? h('button', {
              onClick: busy ? undefined : H.onRollback,
              disabled: busy,
              autoFocus: false,
              style: Object.assign(dangerSolid, { opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }),
            }, '删除并回退修改')
          : null,
        h('button', {
          onClick: busy ? undefined : H.onLedgerOnly,
          disabled: busy,
          style: Object.assign(buttonStyle(), { opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }),
        }, '仅删除账本'),
        h('button', {
          onClick: H.onCancel,
          disabled: busy,
          autoFocus: true, // 默认聚焦取消，防止误触危险动作
          style: buttonStyle(true),
        }, '取消'))

      let body
      if (!view) {
        // dry-run 失败（如后端路由未就绪 / 服务端报错）：只给「取消」
        body = h('div', {},
          h('div', {
            style: {
              display: 'flex', gap: 8, alignItems: 'center', padding: '9px 11px', borderRadius: 8,
              border: '1px solid color-mix(in srgb, ' + C.error + ' 45%, transparent)',
              background: 'color-mix(in srgb, ' + C.error + ' 8%, transparent)',
            },
          },
            h('span', { style: { fontSize: 15 } }, '⚠️'),
            h('span', { style: { fontSize: 12.5, color: C.error, fontWeight: 600 } }, '无法获取回退文件清单')),
          errorLine,
          h('div', { style: { textAlign: 'center', marginTop: 14 } },
            h('button', { onClick: H.onCancel, style: buttonStyle() }, '取消')))
      } else if (view.rollbackable) {
        body = h('div', {},
          h('div', {
            style: {
              display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 11px', borderRadius: 8,
              border: '1px solid color-mix(in srgb, ' + C.error + ' 50%, transparent)',
              background: 'color-mix(in srgb, ' + C.error + ' 10%, transparent)',
            },
          },
            h('span', { style: { fontSize: 15 } }, '⚠️'),
            h('span', {
              style: { fontSize: 12.5, color: C.error, fontWeight: 700, lineHeight: 1.5 },
            }, '删除后将回退这些文件的未提交修改，不可恢复')),
          h('div', { style: { fontSize: 12, color: C.sub, margin: '10px 0 6px' } },
            '将回退以下 ' + view.files.length + ' 个文件：'),
          h('div', { style: { border: '1px solid ' + C.border, borderRadius: 8, overflow: 'hidden' } },
            view.files.map((f, i) => {
              const st = FILE_STATUS_STYLE[f.status] || { color: C.faint }
              return h('div', {
                key: i,
                style: {
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 9px', fontSize: 12,
                  borderBottom: i < view.files.length - 1 ? '1px solid ' + C.hairline : 'none',
                  background: C.surface,
                },
              },
                h(Pill, { color: st.color }, fileStatusLabel(f.status)),
                h('span', {
                  style: {
                    fontFamily: C.mono, fontSize: 11, color: C.text,
                    wordBreak: 'break-all', flex: 1, minWidth: 0,
                  },
                }, f.path))
            })),
          errorLine,
          actionButtons(true))
      } else {
        body = h('div', {},
          h('div', {
            style: {
              display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 11px', borderRadius: 8,
              border: '1px solid color-mix(in srgb, ' + C.warn + ' 50%, transparent)',
              background: 'color-mix(in srgb, ' + C.warn + ' 10%, transparent)',
            },
          },
            h('span', { style: { fontSize: 15 } }, '⚠️'),
            h('div', {},
              h('div', { style: { fontSize: 12.5, color: C.warn, fontWeight: 700 } }, '无法回退未提交修改'),
              h('div', { style: { fontSize: 12, color: C.sub, marginTop: 3, lineHeight: 1.5 } },
                deleteReasonText(view.reason)))),
          h('div', { style: { fontSize: 12, color: C.sub, marginTop: 10, lineHeight: 1.5 } },
            '仍可「仅删除账本」：跳过回退，只从账本中移除该任务块（done.md 记「已撤销」）。'),
          errorLine,
          actionButtons(false))
      }

      return h(ModalShell, { title: '删除任务确认 · ' + (task.id || ''), onClose: H.onCancel, width: 480 }, body)
    }

    /** 归档查看弹层。state: {id, busy, data:{type,row,block}, error}。 */
    function renderArchiveModal(state, onClose) {
      const s = state || {}
      let body
      if (s.busy) {
        body = h('div', { style: { textAlign: 'center', color: C.dim, padding: '14px 0' } }, '加载归档…')
      } else if (s.error) {
        body = h('div', { style: { textAlign: 'center', color: C.error, padding: '10px 0' } },
          h('div', { style: { fontSize: 13, fontWeight: 700 } }, '归档读取失败'),
          h('div', { style: muted({ marginTop: 6, wordBreak: 'break-all' }) }, s.error))
      } else if (s.data) {
        const doneRow = s.data.row || {}
        const typeStyle = TYPE_STYLE[s.data.type] || { color: C.faint }
        body = h('div', {},
          h('div', { style: row({ gap: 8, flexWrap: 'wrap' }) },
            h(Pill, { color: typeStyle.color, variant: 'chip' }, TYPE_LABEL(s.data.type)),
            doneRow.prio ? h(Pill, { color: (PRIO_STYLE[doneRow.prio] || { color: C.faint }).color, variant: 'soft', dataPrio: doneRow.prio }, doneRow.prio) : null,
            doneRow.date ? h('span', { style: Object.assign({ fontFamily: C.mono }, muted({})) }, '完成于 ' + doneRow.date) : null),
          h('div', { style: { fontSize: 13, fontWeight: 700, color: C.text, marginTop: 8, lineHeight: 1.5 } },
            doneRow.desc || '（无描述）'),
          h('div', { style: { fontSize: 12, fontWeight: 700, color: C.sub, margin: '12px 0 6px', letterSpacing: '.03em' } },
            '任务块原文（markdown）'),
          h('pre', {
            style: {
              margin: 0, padding: '10px 12px', borderRadius: 8, overflow: 'auto', maxHeight: 320,
              background: C.raised, border: '1px solid ' + C.hairline,
              fontFamily: C.mono, fontSize: 12, lineHeight: 1.55,
              color: C.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            },
          }, s.data.block || '（该任务归档时未保留详细任务块，仅摘要）'),
          h('div', { style: { textAlign: 'center', marginTop: 12 } },
            h('button', { onClick: onClose, style: buttonStyle() }, '关闭')))
      } else {
        body = h('div', { style: { textAlign: 'center', color: C.dim, padding: '14px 0' } }, '（无归档数据）')
      }
      return h(ModalShell, { title: '归档查看' + (s.id ? ' · ' + s.id : ''), onClose, width: 520 }, body)
    }

    /**
     * 统一空态/错误/引导卡（DEV-024）：dashed 边框 + 语义底色 + 图标 + 主/副文案 + 可选动作。
     * tone: 'error'（红）| 'accent'（引导）| 其他（中性）；容器带 awf-empty 类供单测断言。
     */
    function EmptyState({ icon, title, desc, tone, action, extra }) {
      const err = tone === 'error'
      const accentTone = tone === 'accent'
      return h('div', {
        className: 'awf-empty',
        style: {
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
          padding: '18px 16px', borderRadius: C.radius,
          border: '1px dashed ' + (err
            ? 'color-mix(in srgb, ' + C.error + ' 40%, transparent)'
            : accentTone ? 'color-mix(in srgb, ' + C.accent + ' 45%, transparent)' : C.border),
          background: err
            ? 'color-mix(in srgb, ' + C.error + ' 7%, transparent)'
            : accentTone ? 'color-mix(in srgb, ' + C.accent + ' 5%, transparent)' : C.surface,
        },
      },
        h('span', { style: { fontSize: 24, lineHeight: 1 } }, icon),
        h('div', { style: { fontWeight: 800, fontSize: 13, color: C.text, marginTop: 10 } }, title),
        desc ? h('div', { style: muted({ marginTop: 6, maxWidth: 260 }) }, desc) : null,
        extra || null,
        action || null)
    }

    /** 未初始化引导卡：图标 + 文案 + 「初始化工作流」按钮（EmptyState accent 形态）。 */
    function renderInitCard({ busy, error, onInit }) {
      return h(EmptyState, {
        icon: '🚀', tone: 'accent',
        title: '工作流未初始化',
        desc: '该项目尚未初始化 agent-workflow。点击下方按钮生成骨架：project.yaml + tasks/{dev,debug,docs}/{todo,current,done}.md + status.md。',
        action: typeof onInit === 'function'
          ? h('button', {
              onClick: busy ? undefined : onInit,
              disabled: busy,
              style: Object.assign(buttonStyle(true), {
                marginTop: 12, padding: '5px 16px', fontSize: 12,
                opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer',
              }),
            }, '初始化工作流')
          : null,
        extra: error
          ? h('div', { style: { marginTop: 10, fontSize: 12, color: C.error, maxWidth: 280, wordBreak: 'break-all' } },
              '⚠️ ' + error)
          : null,
      })
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
      const [notInit, setNotInit] = useState(false) // 选中项目未初始化 → 引导卡
      const [error, setError] = useState(null)
      const [loading, setLoading] = useState(false)
      const [initBusy, setInitBusy] = useState(false)
      const [initError, setInitError] = useState(null)
      const [starting, setStarting] = useState(null) // {type,id,key} 开始任务中
      const [actionError, setActionError] = useState(null) // 开始/操作失败提示
      const [archive, setArchive] = useState(null) // {id,busy,data,error}
      const [delModal, setDelModal] = useState(null) // 删除二次确认 {task,busy,view,error}

      // t5：todo / 当前任务 CRUD 交互状态
      const [addForm, setAddForm] = useState(null) // 新增待办表单 {type,id,prio,desc,busy,error} | null
      const [todoEdits, setTodoEdits] = useState({}) // key='type:id' → {prio,desc,busy,error}
      const [todoDeleteKey, setTodoDeleteKey] = useState(null) // 行内删除确认中的 key
      const [todoBusyKey, setTodoBusyKey] = useState(null) // 删除执行中的 key
      const [todoType, setTodoType] = useState('dev') // 待办区类型切换（默认 dev）
      const [taskEdit, setTaskEdit] = useState(null) // 当前任务编辑表单 {id,type,prio,status,owner,scope,desc,busy,error} | null
      const [taskWorking, setTaskWorking] = useState(null) // 暂停/继续中 {id, action} | null
      const [source, setSource] = useState(null) // 源文件面板 {type,file,busy,data,copied,error} | null

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
          .then((data) => {
            if (!alive) return
            if (detectNotInitialized(data, null)) {
              setNotInit(true)
              setLedger(null)
            } else {
              setNotInit(false)
              setLedger(data.ledger || null)
            }
            setError(null)
          })
          .catch((e) => {
            if (!alive) return
            if (detectNotInitialized(null, e)) {
              // 缺省回退：400 bad-request（缺 project.yaml）= 未初始化
              setNotInit(true)
              setLedger(null)
              setError(null)
            } else {
              setNotInit(false)
              setError(String((e && e.message) || e))
            }
          })
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
        setNotInit(false)
        setLedger(null)
        setError(null)
        setArchive(null)
        setDelModal(null)
        setAddForm(null)
        setTodoEdits({})
        setTodoDeleteKey(null)
        setTodoBusyKey(null)
        setTodoType('dev')
        setTaskEdit(null)
        setTaskWorking(null)
        setSource(null)
        setActionError(null)
        try { localStorage.setItem(LS_KEY, v) } catch { /* 忽略 */ }
      }

      // 5) 初始化工作流（未初始化引导）
      const handleInit = useCallback(async () => {
        if (!selected || initBusy) return
        setInitBusy(true)
        setInitError(null)
        const row = (projects || []).find((pr) => pr && pr.path === selected)
        try {
          await postJson('/awf/init', {
            path: selected,
            workspaceRoot: anchorRoot || undefined,
            name: (row && row.id) || undefined,
            purpose: (row && row.aliases) || undefined,
          })
          loadLedger() // 成功后重新加载账本，显示正常看板
        } catch (e) {
          if (e.code === 'already-initialized') {
            loadLedger() // 已在别处初始化：直接刷新账本
          } else if (e.code === 'path-not-allowed') {
            setInitError('路径不在白名单：必须位于全局项目索引或当前工作区根。')
          } else if (e.code === 'forbidden') {
            setInitError('无权限：认证未通过，请先登录。')
          } else if (e.code === 'bad-request') {
            setInitError('请求不合法：' + String(e.message || e))
          } else {
            setInitError('初始化失败：' + String((e && e.message) || e))
          }
        } finally {
          setInitBusy(false)
        }
      }, [selected, initBusy, anchorRoot, projects, loadLedger])

      // 6) 开始任务（todo 行 → current.md）
      const handleStart = useCallback(async (row) => {
        if (!selected || !row || !row.id || !row.type) return
        const key = row.type + ':' + row.id
        if (starting && starting.key === key) return
        setStarting({ type: row.type, id: row.id, key })
        setActionError(null)
        try {
          await postJson('/awf/task/start', {
            path: selected, type: row.type, id: row.id,
            workspaceRoot: anchorRoot || undefined,
          })
          loadLedger()
        } catch (e) {
          if (e.code === 'not-found') {
            setActionError('未在 todo.md 中找到该任务：' + row.id + '（可能已被移除，请刷新）')
          } else if (e.code === 'path-not-allowed') {
            setActionError('路径不在白名单，无法开始任务。')
          } else {
            setActionError('开始任务失败：' + String((e && e.message) || e))
          }
        } finally {
          setStarting(null)
        }
      }, [selected, starting, anchorRoot, loadLedger])

      // 7) 归档查看
      const handleOpenArchive = useCallback(async (r) => {
        const id = r && r.id
        if (!selected || !id || archive) return
        setArchive({ id, busy: true, data: null, error: null })
        try {
          const data = await getJson('/awf/archive?path=' + encodeURIComponent(selected) + '&id=' + encodeURIComponent(id))
          setArchive({ id, busy: false, data: (data && data.done) || null, error: null })
        } catch (e) {
          setArchive({
            id, busy: false, data: null,
            error: e.code === 'not-found'
              ? '归档中未找到该任务：' + id
              : ('归档读取失败：' + String((e && e.message) || e)),
          })
        }
      }, [selected, archive])

      // 8) 删除任务：先 dry-run 拿回退清单，弹框二次确认后才 execute
      const handleDeleteClick = useCallback(async (t) => {
        if (!selected || !t || !t.id || delModal) return
        setDelModal({ task: t, busy: true, view: null, error: null })
        try {
          const data = await postJson('/awf/task/delete/dry-run', {
            path: selected, type: t.type, id: t.id,
            workspaceRoot: anchorRoot || undefined,
          })
          setDelModal((cur) => (cur ? Object.assign({}, cur, { busy: false, view: buildDeleteView(data && data.dryRun) }) : cur))
        } catch (e) {
          setDelModal((cur) => (cur ? Object.assign({}, cur, {
            busy: false,
            error: '无法获取回退清单：' + String((e && e.message) || e),
          }) : cur))
        }
      }, [selected, anchorRoot, delModal])

      const handleDeleteConfirm = useCallback(async (mode) => {
        const cur = delModal
        if (!cur || !cur.task || cur.busy) return
        setDelModal(Object.assign({}, cur, { busy: true, error: null }))
        try {
          await postJson('/awf/task/delete/execute', {
            path: selected, type: cur.task.type, id: cur.task.id, mode,
            workspaceRoot: anchorRoot || undefined,
          })
          setDelModal(null)
          loadLedger()
        } catch (e) {
          setDelModal((prev) => (prev ? Object.assign({}, prev, {
            busy: false,
            error: '删除失败：' + String((e && e.message) || e),
          }) : prev))
        }
      }, [selected, anchorRoot, delModal, loadLedger])

      // ---- t5：todo CRUD ---------------------------------------------------

      // 新增：打开表单
      const openAddForm = useCallback(() => {
        setAddForm({ type: 'dev', id: '', prio: 'P2', desc: '', busy: false, error: null })
      }, [])
      const onAddFormChange = useCallback((field, value) => {
        setAddForm((f) => (f ? Object.assign({}, f, { [field]: value }) : f))
      }, [])
      const closeAddForm = useCallback(() => setAddForm(null), [])

      // 新增：提交（POST /awf/todo add）
      const handleTodoAddSave = useCallback(async () => {
        const f = addForm
        if (!f || !selected || f.busy) return
        const id = String(f.id || '').trim()
        if (!/^[A-Z]+-[0-9]+$/.test(id)) {
          setAddForm(Object.assign({}, f, { error: '任务 ID 需为 TYPE-xxx 格式（如 DEV-001）。' }))
          return
        }
        setAddForm(Object.assign({}, f, { busy: true, error: null }))
        try {
          await runTodoAction({
            path: selected, type: f.type, action: 'add', workspaceRoot: anchorRoot || undefined,
            row: { id, 优先级: f.prio, 描述: String(f.desc || '').trim() || id },
          })
          setAddForm(null)
          loadLedger()
        } catch (e) {
          setAddForm((cur) => (cur ? Object.assign({}, cur, { busy: false, error: apiErrorText(e, '新增失败') }) : cur))
        }
      }, [addForm, selected, anchorRoot, loadLedger])

      // 编辑：打开原位表单（ID 不可改，仅优先级/描述）
      const handleTodoEdit = useCallback((row) => {
        const key = row.type + ':' + row.id
        setTodoEdits((m) => Object.assign({}, m, {
          [key]: { prio: row.prio || 'P2', desc: row.desc || '', busy: false, error: null },
        }))
      }, [])
      const onTodoEditChange = useCallback((key, field, value) => {
        setTodoEdits((m) => {
          const cur = m[key]
          if (!cur) return m
          return Object.assign({}, m, { [key]: Object.assign({}, cur, { [field]: value }) })
        })
      }, [])
      const closeTodoEdit = useCallback((key) => {
        setTodoEdits((m) => {
          const n = Object.assign({}, m)
          delete n[key]
          return n
        })
      }, [])

      // 编辑：保存（POST /awf/todo update）
      const handleTodoEditSave = useCallback(async (key) => {
        const cur = todoEdits[key]
        if (!cur || !selected || cur.busy) return
        const parts = key.split(':')
        const type = parts[0]
        const id = parts[1]
        setTodoEdits((m) => Object.assign({}, m, { [key]: Object.assign({}, m[key], { busy: true, error: null }) }))
        try {
          await runTodoAction({
            path: selected, type, action: 'update', workspaceRoot: anchorRoot || undefined,
            row: { id, 优先级: cur.prio, 描述: String(cur.desc || '').trim() },
          })
          closeTodoEdit(key)
          loadLedger()
        } catch (e) {
          setTodoEdits((m) => Object.assign({}, m, { [key]: Object.assign({}, m[key], { busy: false, error: apiErrorText(e, '保存失败') }) }))
        }
      }, [todoEdits, selected, anchorRoot, loadLedger, closeTodoEdit])

      // 删除：进入行内二次确认 → 确认后 POST /awf/todo delete
      const handleTodoDeleteAsk = useCallback((row) => {
        setTodoDeleteKey(row.type + ':' + row.id)
      }, [])
      const handleTodoDeleteCancel = useCallback(() => setTodoDeleteKey(null), [])
      const handleTodoDeleteConfirm = useCallback(async (key) => {
        if (!selected || todoBusyKey === key) return
        const parts = key.split(':')
        const type = parts[0]
        const id = parts[1]
        setTodoBusyKey(key)
        setActionError(null)
        try {
          await runTodoAction({ path: selected, type, action: 'delete', row: { id }, workspaceRoot: anchorRoot || undefined })
          setTodoDeleteKey(null)
          loadLedger()
        } catch (e) {
          setActionError('删除待办失败：' + apiErrorText(e, '删除失败'))
          setTodoDeleteKey(null)
        } finally {
          setTodoBusyKey(null)
        }
      }, [selected, todoBusyKey, anchorRoot, loadLedger])

      // ---- t5：当前任务编辑 / 暂停 / 继续 -----------------------------------

      const handleTaskEdit = useCallback((t) => {
        setTaskEdit({
          id: t.id, type: t.type,
          prio: t.prio || 'P2', status: t.status || 'active',
          owner: t.owner || '', scope: '', desc: t.title || '',
          busy: false, error: null,
        })
      }, [])
      const onTaskEditChange = useCallback((field, value) => {
        setTaskEdit((f) => (f ? Object.assign({}, f, { [field]: value }) : f))
      }, [])
      const closeTaskEdit = useCallback(() => setTaskEdit(null), [])

      // 编辑：保存（POST /awf/task update；fields 用中文键，描述→标题）
      const handleTaskEditSave = useCallback(async () => {
        const f = taskEdit
        if (!f || !selected || f.busy) return
        const fields = {}
        if (String(f.prio || '')) fields['优先级'] = f.prio
        if (String(f.status || '')) fields['状态'] = f.status
        if (String(f.owner || '').trim()) fields['Owner'] = String(f.owner).trim()
        if (String(f.scope || '').trim()) fields['修改范围'] = String(f.scope).trim()
        if (String(f.desc || '').trim()) fields['描述'] = String(f.desc).trim()
        if (Object.keys(fields).length === 0) {
          setTaskEdit(Object.assign({}, f, { error: '没有可保存的字段变更。' }))
          return
        }
        setTaskEdit(Object.assign({}, f, { busy: true, error: null }))
        try {
          await runTaskAction({
            path: selected, type: f.type, id: f.id, action: 'update',
            fields, workspaceRoot: anchorRoot || undefined,
          })
          setTaskEdit(null)
          loadLedger()
        } catch (e) {
          setTaskEdit((cur) => (cur ? Object.assign({}, cur, { busy: false, error: apiErrorText(e, '保存失败') }) : cur))
        }
      }, [taskEdit, selected, anchorRoot, loadLedger])

      // 暂停 / 继续（active↔blocked）
      const handleTaskToggle = useCallback(async (t, action) => {
        if (!selected || !t || !t.id || (taskWorking && taskWorking.id === t.id)) return
        setTaskWorking({ id: t.id, action })
        setActionError(null)
        try {
          await runTaskAction({
            path: selected, type: t.type, id: t.id, action,
            workspaceRoot: anchorRoot || undefined,
          })
          loadLedger()
        } catch (e) {
          setActionError((action === 'pause' ? '暂停失败：' : '恢复失败：') + apiErrorText(e, '操作失败'))
        } finally {
          setTaskWorking(null)
        }
      }, [selected, taskWorking, anchorRoot, loadLedger])
      const handleTaskPause = useCallback((t) => handleTaskToggle(t, 'pause'), [handleTaskToggle])
      const handleTaskResume = useCallback((t) => handleTaskToggle(t, 'resume'), [handleTaskToggle])

      // ---- t5：待办类型切换 / 源文件查看 ------------------------------------

      const handleTodoTypeChange = useCallback((v) => {
        setTodoType(v === 'debug' || v === 'docs' ? v : 'dev')
        setAddForm(null)
        setTodoEdits({})
        setTodoDeleteKey(null)
      }, [])

      // 打开源文件面板：GET /awf/source（只读）；404 → 「源文件接口未就绪」
      const openSource = useCallback(async (type, file) => {
        const t = type === 'debug' || type === 'docs' ? type : 'dev'
        const f = (file === 'current' || file === 'done') ? file : 'todo'
        if (!selected) {
          setSource({ type: t, file: f, busy: false, data: null, copied: false, error: '未选择项目，无法读取源文件。' })
          return
        }
        setSource({ type: t, file: f, busy: true, data: null, copied: false, error: null })
        try {
          const res = await fetchSource({ path: selected, type: t, file: f })
          const src = (res && res.source) || null
          if (!src || !src.content) {
            setSource({ type: t, file: f, busy: false, data: null, copied: false, error: '源文件为空或返回异常。' })
            return
          }
          setSource({ type: t, file: f, busy: false, data: src, copied: false, error: null })
        } catch (e) {
          const code = e && e.code
          setSource({
            type: t, file: f, busy: false, data: null, copied: false,
            error: code === 'not-found'
              ? '源文件接口未就绪（GET /awf/source 不存在或文件缺失）。'
              : apiErrorText(e, '读取源文件失败'),
          })
        }
      }, [selected])

      const closeSource = useCallback(() => setSource(null), [])

      const copySourcePath = useCallback((pathStr) => {
        copyText(pathStr, (ok) => {
          setSource((s) => (s ? Object.assign({}, s, { copied: ok }) : s))
        })
      }, [])

      // DEV-024 头部工具条：撤销冗余大标题（页签即标题），一行容纳
      // 项目下拉（主控件）+ 锚定徽章 + 刷新；刷新按钮文案恒定（不再随轮询闪
      // 「刷新中」，busy 只做 disabled+降透明）。
      const header = h('div', {
        className: 'awf-toolbar',
        style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
      },
        h('div', { style: { minWidth: 0, flex: '1 1 180px', maxWidth: 320 } },
          h('select', {
            value: selected,
            onChange: onSelect,
            title: '账本看板 · 选择项目',
            style: {
              width: '100%', padding: '4px 8px', fontSize: 12,
              background: C.surface, color: C.text,
              border: '1px solid ' + C.border, borderRadius: C.radiusSm, outline: 'none',
              textOverflow: 'ellipsis',
            },
          },
            h('option', { value: '', disabled: true }, projects ? '选择项目…' : '加载索引…'),
            (projects || []).map((pr) => h('option', { key: pr.path, value: pr.path },
              `${pr.id}（${pr.path}）`)))),
        auto && selected ? h(Pill, { color: C.success, dot: true }, '已锚定当前会话') : null,
        h('button', {
          onClick: loadLedger,
          disabled: loading,
          title: '刷新账本（每 15s 自动刷新）',
          style: Object.assign(buttonStyle(), { opacity: loading ? 0.6 : 1, cursor: loading ? 'default' : 'pointer' }),
        }, '刷新'))

      const body = notInit
        ? renderInitCard({ busy: initBusy, error: initError, onInit: handleInit })
        : error
          ? renderErrorBody(error, loadLedger)
          : ledger
            ? renderLedgerBody(ledger, {
                onStart: handleStart,
                starting,
                onOpenArchive: handleOpenArchive,
                onDelete: handleDeleteClick,
                deleting: delModal && delModal.task ? delModal.task.id : null,
                actionError,

                // t5：todo CRUD
                onTodoAdd: openAddForm,
                onTodoAddChange: onAddFormChange,
                onTodoAddSave: handleTodoAddSave,
                onTodoAddCancel: closeAddForm,
                todoAddForm: addForm,
                todoType,
                onTodoTypeChange: handleTodoTypeChange,
                onTodoEdit: handleTodoEdit,
                onTodoEditChange: onTodoEditChange,
                onTodoEditSave: handleTodoEditSave,
                onTodoEditCancel: closeTodoEdit,
                todoEdits,
                onTodoDelete: handleTodoDeleteAsk,
                onTodoDeleteConfirm: handleTodoDeleteConfirm,
                onTodoDeleteCancel: handleTodoDeleteCancel,
                todoDeleteKey,
                todoBusyKey,

                // t5：当前任务编辑 / 暂停 / 继续
                onTaskEdit: handleTaskEdit,
                onTaskEditChange: onTaskEditChange,
                onTaskEditSave: handleTaskEditSave,
                onTaskEditCancel: closeTaskEdit,
                onTaskPause: handleTaskPause,
                onTaskResume: handleTaskResume,
                taskEdit,
                taskWorking,

                // t5：源文件查看
                onOpenSource: openSource,
                source,
                onCloseSource: closeSource,
                onCopySourcePath: copySourcePath,
              })
            : renderEmptyBody(projects)

      return h('div', {
        style: {
          fontSize: 13, color: C.text, height: '100%', overflowY: 'auto',
          padding: '12px 12px 20px', boxSizing: 'border-box',
        },
      },
        // 卡片/行 hover 质感 + 焦点/按压反馈 + 统一基础样式：一次性注入静态样式（纯手写 h() 无构建）
        h('style', { key: 'awf-hover-css' }, AWF_HOVER_CSS + AWF_UI_CSS),
        header, body,
        archive ? renderArchiveModal(archive, () => setArchive(null)) : null,
        delModal ? renderDeleteModal(delModal, {
          onRollback: () => handleDeleteConfirm('rollback'),
          onLedgerOnly: () => handleDeleteConfirm('ledger-only'),
          onCancel: () => setDelModal(null),
        }) : null)
    }

    // ---- 纯渲染函数（导出于 module.exports，供测试直接调用） ----------------

    function renderErrorBody(error, onRetry) {
      const msg = String(error || '')
      return h(EmptyState, {
        icon: '⚠️', tone: 'error', title: '账本读取失败',
        desc: msg || null,
        action: typeof onRetry === 'function'
          ? h('button', { onClick: onRetry, style: Object.assign(buttonStyle(true), { marginTop: 10 }) }, '重试')
          : null,
      })
    }

    function renderEmptyBody(projects) {
      if (Array.isArray(projects) && projects.length === 0) {
        return h(EmptyState, {
          icon: '🗂️', title: '未选择项目',
          desc: '当前会话未命中任何已登记项目。请从上方下拉选择一个项目查看账本。',
        })
      }
      return h(EmptyState, {
        icon: '📭', title: '项目索引为空',
        desc: '先运行 `awf register` 登记项目，再回来查看 Agent Workflow 账本。',
      })
    }

    /**
     * 账本看板主体。
     * @param {object} ledger /awf/ledger 的 ledger 字段
     * @param {object} [ui] 交互回调（均可选）：
     *   t2：{onStart, starting, onOpenArchive, onDelete, deleting, actionError}
     *   t5 todo CRUD：{todoType, onTodoTypeChange, onTodoAdd, todoAddForm, onTodoAddChange,
     *                  onTodoAddSave, onTodoAddCancel, onTodoEdit, todoEdits, onTodoEditChange,
     *                  onTodoEditSave, onTodoEditCancel, onTodoDelete, todoDeleteKey, todoBusyKey,
     *                  onTodoDeleteConfirm, onTodoDeleteCancel}
     *   t5 任务 CRUD：{onTaskEdit, taskEdit, onTaskEditChange, onTaskEditSave, onTaskEditCancel,
     *                  onTaskPause, onTaskResume, taskWorking}
     *   t5 源文件：{onOpenSource(type,file), source, onCloseSource, onCopySourcePath}
     */
    function renderLedgerBody(ledger, ui) {
      const items = []
      const U = ui || {}
      const recent = (Array.isArray(ledger.recent) ? ledger.recent : []).slice(0, 5) // DEV-022：只显示最近 5 条
      const todoRows = collectTodoRows(ledger)

      if (U.actionError) {
        items.push(h('div', {
          key: 'action-error',
          style: {
            display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, padding: '7px 10px',
            borderRadius: 8, fontSize: 12, color: C.error, wordBreak: 'break-all',
            border: '1px solid color-mix(in srgb, ' + C.error + ' 40%, transparent)',
            background: 'color-mix(in srgb, ' + C.error + ' 7%, transparent)',
          },
        }, h('span', {}, '⚠️'), h('span', {}, U.actionError)))
      }

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
            h('div', { style: { fontSize: 14, fontWeight: 800, color: C.text, lineHeight: 1.3 } },
              proj.name || '未命名项目'),
            h('div', { style: { fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 3, wordBreak: 'break-all' } },
              proj.path || '')),
          h(Pill, { color: freshColor, dot: true }, freshLabel)),
        proj.purpose
          ? h('div', {
              style: {
                marginTop: 9, fontSize: 12, color: C.sub, lineHeight: 1.5,
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

      // ---- 当前任务（DEV-024：宽面板两列网格，窄面板 auto-fit 自动回退单列）
      items.push(h(SectionTitle, { key: 'cur-h', label: '当前任务', count: ledger.current.length }))
      if (ledger.current.length > 0) {
        const taskCards = []
        ledger.current.forEach((t, i) => {
          const editingThis = !!(U.taskEdit && U.taskEdit.id === t.id)
          taskCards.push(h(TaskCard, {
            key: 'cur-' + i, t, flush: true,
            onDelete: U.onDelete,
            deleting: U.onDelete && U.deleting === t.id,
            onEdit: U.onTaskEdit,
            editing: editingThis,
            editForm: editingThis ? U.taskEdit : null,
            onEditChange: U.onTaskEditChange,
            onEditSave: U.onTaskEditSave,
            onEditCancel: U.onTaskEditCancel,
            onPause: U.onTaskPause,
            onResume: U.onTaskResume,
            working: U.taskWorking,
            onOpenSource: typeof U.onOpenSource === 'function' ? (() => U.onOpenSource(t.type, 'current')) : undefined,
          }))
        })
        items.push(h('div', {
          key: 'cur-grid',
          className: 'awf-tasks',
          style: {
            // 任务卡恢复单列：步骤条、验收进度和操作区内容高度不同，双列会造成行内卡片错位。
            display: 'flex', flexDirection: 'column',
            gap: 10, width: '100%',
          },
        }, taskCards))
      } else {
        items.push(h('div', {
          key: 'cur-none',
          style: { ...cardStyle, color: C.dim, fontSize: 12, textAlign: 'center', padding: '12px' },
        }, '当前无进行中任务 · 全部空闲'))
      }

      // ---- 待办（类型 toggle + 该类型未开始任务行 CRUD；todo.md 是表格行，无进度条）
      if (ledger.todo.length > 0 || todoRows.length > 0) {
        const selType = (U.todoType && (U.todoType === 'dev' || U.todoType === 'debug' || U.todoType === 'docs')) ? U.todoType : 'dev'
        const typeRows = todoRows.filter((r) => r.type === selType)
        items.push(h(SectionTitle, { key: 'todo-h', label: '待办' }))
        const cardChildren = []
        cardChildren.push(h('div', { key: 'toggle', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' } },
          h(TypeToggle, { value: selType, onChange: U.onTodoTypeChange }),
          typeof U.onTodoAdd === 'function'
            ? h('button', {
                onClick: U.todoAddForm ? U.onTodoAddCancel : U.onTodoAdd,
                style: tinyBtn(!!U.todoAddForm),
              }, U.todoAddForm ? '收起' : '＋ 新增')
            : null))
        cardChildren.push(h('div', {
          key: 'rows-title',
          style: {
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 8,
            borderTop: '1px dashed ' + C.hairline,
          },
        },
          h('span', { style: { fontSize: 12, fontWeight: 700, color: C.sub } }, '未开始任务 · ' + TYPE_LABEL(selType)),
          h('span', { style: { fontSize: 11, color: C.faint } }, String(typeRows.length))))
        if (U.todoAddForm) {
          cardChildren.push(h(TodoAddForm, {
            key: 'todo-add-form',
            form: U.todoAddForm,
            onChange: U.onTodoAddChange,
            onSave: U.onTodoAddSave,
            onCancel: U.onTodoAddCancel,
          }))
        }
        if (typeRows.length > 0) {
          cardChildren.push(h('div', { key: 'rows' },
            typeRows.map((r) => {
              const key = r.type + ':' + r.id
              const editing = !!(U.todoEdits && U.todoEdits[key] !== undefined)
              const deleting = !!(U.todoDeleteKey && U.todoDeleteKey === key)
              return h(TodoRow, {
                key, row: r,
                onStart: U.onStart, starting: U.starting,
                onEdit: U.onTodoEdit,
                editing,
                editForm: editing ? U.todoEdits[key] : null,
                onEditChange: U.onTodoEditChange ? ((f, v) => U.onTodoEditChange(key, f, v)) : undefined,
                onEditSave: U.onTodoEditSave ? (() => U.onTodoEditSave(key)) : undefined,
                onEditCancel: U.onTodoEditCancel ? (() => U.onTodoEditCancel(key)) : undefined,
                onDelete: U.onTodoDelete,
                deleting,
                onDeleteConfirm: deleting && U.onTodoDeleteConfirm ? (() => U.onTodoDeleteConfirm(key)) : undefined,
                onDeleteCancel: U.onTodoDeleteCancel,
                busy: U.todoBusyKey === key,
                onOpenSource: typeof U.onOpenSource === 'function'
                  ? (() => U.onOpenSource(selType, 'todo')) : undefined,
              })
            })))
        } else {
          cardChildren.push(h('div', {
            key: 'rows-empty',
            style: {
              marginTop: 8, padding: '14px 0', textAlign: 'center',
              color: C.faint, fontSize: 12,
              border: '1px dashed ' + C.hairline, borderRadius: 8,
            },
          }, '该类型暂无未开始任务' + (typeof U.onTodoAdd === 'function' ? '（可点「＋ 新增」登记）' : '')))
        }
        items.push(h('div', { key: 'todo', className: 'awf-card', style: cardStyle }, cardChildren))
      }

      // ---- 最近完成（仅 5 条，可点击查看归档）
      if (recent.length > 0) {
        items.push(h(SectionTitle, { key: 'recent-h', label: '最近完成', count: recent.length }))
        items.push(h('div', { key: 'recent', className: 'awf-card', style: Object.assign({}, cardStyle, { padding: '4px 12px', marginBottom: 0 }) },
          recent.map((r, i) => h(RecentRow, { key: 'recent-' + i, r, onOpen: U.onOpenArchive }))))
      }

      items.push(h('div', {
        key: 'foot',
        style: Object.assign(muted({ marginTop: 10 }), { textAlign: 'center' }),
      },
        `账本数据来自 agent-workflow/tasks/*，每 ${POLL_MS / 1000}s 自动刷新`))

      // 源文件查看面板（覆盖层；只读 .md 展示 + 复制路径）
      if (U.source) {
        items.push(h(SourcePanel, {
          key: 'source-panel',
          src: U.source,
          onClose: U.onCloseSource,
          onCopy: U.onCopySourcePath,
        }))
      }

      return h('div', { style: { marginTop: 6 } }, items)
    }

    function TYPE_LABEL(type) {
      const s = TYPE_STYLE[type]
      return s ? s.label : (type || '其他')
    }

    function TabTitle() {
      return h('span', { style: { fontWeight: 600, fontSize: 12 } }, 'Agent Workflow')
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
              title: 'Agent Workflow',
              description: 'agent-workflow 账本看板：当前任务 / todo 进度 / 最近完成 / 初始化引导 / 开始任务 / 归档查看',
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
    exports.renderInitCard = renderInitCard
    exports.renderArchiveModal = renderArchiveModal
    exports.renderDeleteModal = renderDeleteModal
    exports.resolveDefaultProject = resolveDefaultProject
    exports.resolveAnchorRoot = resolveAnchorRoot
    exports.detectNotInitialized = detectNotInitialized
    exports.collectTodoRows = collectTodoRows
    exports.buildDeleteView = buildDeleteView
    exports.deleteReasonText = deleteReasonText
    exports.getJson = getJson
    exports.postJson = postJson
    exports.runDeleteFlow = runDeleteFlow
    exports.apiErrorText = apiErrorText
    exports.runTodoAction = runTodoAction
    exports.runTaskAction = runTaskAction
    exports.fetchSource = fetchSource
    exports.copyText = copyText
    exports.WORKFLOW_STEPS = WORKFLOW_STEPS
    exports.inferWorkflowStage = inferWorkflowStage
    return module.exports
  },
})