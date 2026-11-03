// dsh-awf-dashboard — 客户端（ModuleLoader chunk）
//
// 挂载：右侧边栏「Agent Workflow」页签。数据来自服务端路由
//   GET  /awf/projects（项目索引）与 /awf/ledger?path=...（账本看板）
//   POST /awf/init（未初始化引导）、POST /awf/task/start（开始任务）
//   GET  /awf/archive?path=...&id=...（归档只读查看）
//   POST /awf/action/agent / POST /awf/backfill/agent（DEV-039 服务端子代理通道：
//     回填/返回待办/删除优先由宿主 agents 服务创建子代理执行，不经主会话；
//     agents 服务不可用由服务端自动降级注入主对话）
//   POST /awf/agent/act（保留：注入主对话降级路由 / 旧客户端兼容，动作白名单不删）
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
    const { createElement: h, useEffect, useState, useCallback, useRef } = React

    // ---- 常量与 DSH 主题令牌 ----------------------------------------------

    const POLL_MS = 5000
    const LS_KEY = 'dsh-awf-dashboard.project'
    // DEV-108：跟随宿主对话框字体大小——读取宿主根元素 font-size 计算缩放系数。
    //   用户在 DSH 设置里调大/调小字体 → 宿主 root font-size 变化 → 本面板字号等比缩放。
    //   基准按宿主默认 14px；F(n) 返回缩放后字号（保留整数）。
    let HOST_FONT_SCALE = 1
    try {
      const rootFont = typeof window !== 'undefined' && window.getComputedStyle
        ? parseFloat(window.getComputedStyle(document.documentElement).fontSize)
        : NaN
      if (Number.isFinite(rootFont) && rootFont > 0) HOST_FONT_SCALE = rootFont / 14
    } catch { /* 宿主未就绪时保持 1 */ }
    // DEV-108：宿主字体变化时同步（MutationObserver 监听 <html> 属性/子树变化，
    //   宿主调对话框字体大小通常改 root font-size 或 class；变化后重读 scale 并触发重渲染）
    const refreshHostFontScale = () => {
      try {
        const rootFont = window.getComputedStyle
          ? parseFloat(window.getComputedStyle(document.documentElement).fontSize)
          : NaN
        if (Number.isFinite(rootFont) && rootFont > 0) HOST_FONT_SCALE = rootFont / 14
      } catch { /* ignore */ }
    }
    const F = (n) => Math.round(n * HOST_FONT_SCALE)
    // DEV-042：自动回填已停用——面板不再在账本刷新后自动派发回填子代理写开发进度
    //      （用户：开发中的任务无需反复填写进度，完成后归档即可）。保留节流变量仅为
    //      兼容旧客户端代码引用，不再有自动调用。
    let autoBackfillThrottle = { project: null, last: 0 }
    const AUTO_BACKFILL_ENABLED = false

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

    // 状态 → 阶段 key（按类型；active=认领/主工作阶段、review=Review/审阅、verify=验证等）
    // DEV-033 修正：active 映射到「认领」而非「实现」——开始任务只登记账本，还没认领/
    // 方案/实现；具体执行进度由 agent 在任务块「下一步」推进，阶段条只反映账本状态语义。
    const STATUS_STAGE = {
      active: { dev: 'claimed', debug: 'claimed', docs: 'claimed' },
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

    // 交互反馈（DEV-024）：:focus-visible 键盘焦点、:active 按压回弹。
    // 2026-11-02（DEV-026 观察项）：去掉全部 hover 位移/阴影/背景效果——
    // 鼠标移上去卡片上浮/行高亮会让列表布局跳动。保留焦点环（无障碍必需）
    // 与按压反馈（不移动布局）。
    const AWF_HOVER_CSS =
      '.awf-card{transition:border-color .15s ease}' +
      // DEV-043：任务行可点击查看源文件 → hover 背景反馈
      '.awf-row-clickable:hover{background:color-mix(in srgb,var(--dsw-alias-interactive-bg-hover,#00000014) 60%,transparent)!important}' +
      '.awf-row-clickable .awf-source-hint{transition:opacity .15s ease}' +
      '.awf-row-clickable:hover .awf-source-hint{opacity:1!important}' +
      '.awf-card button:disabled,.awf-row button:disabled{opacity:.4!important;cursor:not-allowed!important}' +
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
      // 进度条统一 4px 轨道（position:relative 供 DEV-037 流光 ::after 定位）
      '.awf-progress{height:4px;border-radius:99px;overflow:hidden;margin-top:3px;position:relative}' +
      '.awf-progress-fill{height:100%;border-radius:99px;transition:width .3s ease}' +
      // DEV-044：轻量行风格——最后一个行去掉底部边框（避免列表末行多余横线）；
      // 紧凑 icon 按钮（项目卡路径复制用，替代带 minWidth 的 tinyBtn）。
      '.awf-row:last-child{border-bottom:none!important}' +
      '.awf-icon-btn{display:inline-flex;align-items:center;justify-content:center;' +
      'width:22px;height:22px;padding:0;font-size:12px;line-height:1;flex-shrink:0;' +
      'border:1px solid '+C.border+';border-radius:6px;background:'+C.surface+';color:'+C.dim+';' +
      'cursor:pointer;transition:background .15s ease}' +
      '.awf-icon-btn:hover{background:'+C.hover+';color:'+C.text+'}' +
      '.awf-icon-btn-ok{color:'+C.success+'!important;border-color:color-mix(in srgb,'+C.success+' 45%,transparent)!important}'

    // DEV-037 进行中动画 + 流程质感：纯装饰 CSS，不影响布局，不改变既有类名契约。
    // 动画目标——① 当前步骤节点呼吸光圈（box-shadow 脉动，静态 2px 光圈无缝衔接）；
    // ② 流入当前节点的连线流动高光（背景位置滑动）；③ 进行中徽章圆点呼吸；
    // ④ 未完成进度条流光扫过（轨道内 ::after 滑动高光，利用已有 overflow:hidden 裁剪）；
    // ⑤ 弹层遮罩淡入 + 卡片上浮入场。全部尊重 prefers-reduced-motion。
    // 颜色只用 DSH 主题令牌（白天/暗色自动跟随），依赖现代 Chromium 的 var()+color-mix 支持。
    // 步骤条相关动画统一锚定 brand-primary（与节点/连线静态用色 C.accent 同源，主题下不产生色差）。
    const AWF_MOTION_CSS =
      // 当前节点呼吸：0%/100% 回到静态光圈（2px/20% 透明度），50% 扩张到 5px/9%
      '@keyframes awf-breathe{0%,100%{box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 20%,transparent)}' +
      '50%{box-shadow:0 0 0 5px color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 9%,transparent)}}' +
      '.awf-step-cur:not(.awf-step-paused) .awf-step-node{animation:awf-breathe 2s ease-in-out infinite}' +
      // 流入当前节点的连线：流动渐变（深→亮→深循环），模拟流程向前推进
      '@keyframes awf-flow{0%{background-position:0% 0}100%{background-position:120% 0}}' +
      '.awf-step-line-hot{background-image:linear-gradient(90deg,' +
      'color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 22%,transparent),' +
      'color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 72%,transparent) 50%,' +
      'color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8ef7) 22%,transparent));' +
      'background-size:200% 100%;animation:awf-flow 2.4s linear infinite}' +
      // 徽章圆点 / 头部当前指示点：呼吸透明度（transform 会破坏居中，只动 opacity）
      '@keyframes awf-blip{0%,100%{opacity:1}50%{opacity:.32}}' +
      '.awf-live-dot{width:6px;height:6px;border-radius:50%;' +
      'background:var(--dsw-alias-brand-primary,#4f8ef7);flex-shrink:0;' +
      'animation:awf-blip 1.6s ease-in-out infinite}' +
      '.awf-pill-live .awf-dot{animation:awf-blip 1.6s ease-in-out infinite}' +
      // DEV-041 升级中按钮旋转：引用同文件内其他动画命名风格（awf-* 前缀，跟随主题）
      '@keyframes awf-rot{from{transform:rotate(0)}to{transform:rotate(360deg)}}' +
      '.awf-spin{animation:awf-rot .9s linear infinite!important}' +
      // 未完成进度条流光：白色高光条在轨道内从左滑到右（overflow:hidden 裁剪，不溢出）
      '@keyframes awf-shimmer{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}' +
      '.awf-progress-live::after{content:"";position:absolute;top:0;bottom:0;left:0;width:38%;' +
      'background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent);' +
      'animation:awf-shimmer 2.6s ease-in-out infinite}' +
      // 弹层入场：遮罩淡入 + 卡片上浮（一次挂载触发，不随状态更新重放）
      '@keyframes awf-fade{from{opacity:0}to{opacity:1}}' +
      '@keyframes awf-pop{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}' +
      '.awf-modal-mask{animation:awf-fade .18s ease-out}' +
      '.awf-modal-card{animation:awf-pop .22s cubic-bezier(.18,.8,.28,1)}' +
      // 系统减弱动效：全部装饰动画关闭（静态光圈由 inline boxShadow 兜底，不依赖动画）
      '@media (prefers-reduced-motion:reduce){' +
      '.awf-step-cur:not(.awf-step-paused) .awf-step-node,' +
      '.awf-step-line-hot,.awf-live-dot,.awf-pill-live .awf-dot,' +
      '.awf-progress-live::after,.awf-modal-mask,.awf-modal-card{animation:none}}'

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
    const muted = (extra) => Object.assign({ color: C.dim, fontSize: F(12), lineHeight: 1.5 }, extra || {})

    const cardStyle = {
      border: '1px solid ' + C.border,
      borderRadius: C.radius,
      padding: '12px 14px 11px',
      background: C.surface,
      marginBottom: 8,
    }

    const buttonStyle = (primary) => ({
      fontSize: F(11), padding: '3px 12px', borderRadius: 999, cursor: 'pointer',
      border: '1px solid ' + (primary ? 'color-mix(in srgb, ' + C.accent + ' 55%, transparent)' : C.border),
      background: primary ? 'color-mix(in srgb, ' + C.accent + ' 14%, transparent)' : C.surface,
      color: primary ? C.accent : C.sub,
      fontWeight: 600, lineHeight: '16px', whiteSpace: 'nowrap',
      transition: 'background .15s ease, border-color .15s ease',
    })

    /** 危险实心按钮：删除并回退修改（destroy 语义）。 */
    const dangerSolid = {
      fontSize: F(12), padding: '5px 14px', borderRadius: C.radiusSm, cursor: 'pointer',
      border: '1px solid ' + C.error, background: C.error, color: '#fff',
      fontWeight: 700, lineHeight: '18px', whiteSpace: 'nowrap',
      transition: 'opacity .15s ease',
    }

    /** 危险文字按钮：当前任务卡上的「删除」。 */
    const dangerTextStyle = {
      fontSize: F(11), padding: '2px 10px', borderRadius: 999, cursor: 'pointer',
      border: '1px solid color-mix(in srgb, ' + C.error + ' 45%, transparent)',
      background: 'color-mix(in srgb, ' + C.error + ' 8%, transparent)',
      color: C.error, fontWeight: 600, lineHeight: '16px', whiteSpace: 'nowrap',
    }

    /** 表单输入（含 select）：主题令牌 + 紧凑尺寸。 */
    const inputStyle = {
      fontSize: F(12), padding: '3px 8px', borderRadius: C.radiusSm,
      background: C.surface, color: C.text,
      border: '1px solid ' + C.border, outline: 'none',
    }

    /** 卡片内小型文字操作按钮（编辑 / 暂停 / 继续）。DEV-024：统一 11px/22px 档位。
     * 暂停/开始按钮固定最小宽度 + busy 文字用同宽占位，避免「暂停」→「暂停中…」
     * 文字变长导致按钮变宽、卡片底部行 layout 跳动（用户反馈「背景文字跳动」）。 */
    const tinyBtn = (busy) => Object.assign(buttonStyle(), {
      fontSize: F(11), padding: '2px 10px', minWidth: 68,
      opacity: busy ? 0.4 : 1, cursor: busy ? 'default' : 'pointer',
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
     * live=true（DEV-037）：附加 awf-pill-live 类，进行中状态圆点呼吸闪烁。
     * 类名 awf-pill awf-pill-<variant>（+awf-pill-live）供单测断言。
     */
    function Pill({ color, children, dot, variant, dataPrio, live }) {
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
        { className: 'awf-pill awf-pill-' + v + (live ? ' awf-pill-live' : '') , style },
        dataPrio ? { 'data-prio': dataPrio } : {}),
        dot && v !== 'chip'
          ? h('span', { className: 'awf-dot', style: { background: color } })
          : null,
        children)
    }

    // DEV-037：视为「进行中」的状态——徽章圆点呼吸（blocked/archived 静止，保持暂停/结束语义）
    const LIVE_STATUS = { active: 1, verify: 1, review: 1, handoff: 1 }

    function StatusBadge({ status }) {
      const st = STATUS_STYLE[status] || { label: status || '未设', color: C.faint }
      // DEV-041：纯看板——去掉「进行中」呼吸动画，状态徽章一律静态（dot 保留语义色）
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
        h('span', { style: { fontSize: F(12), fontWeight: 700, letterSpacing: '.02em', color: C.text } }, label),
        count != null
          ? h('span', { style: { fontSize: F(11), color: C.faint, background: C.hover, padding: '0 6px', borderRadius: 999, lineHeight: '16px' } }, String(count))
          : null)
    }

    /** 模态弹层外壳：遮罩 + 居中卡片 + 标题栏 + 关闭按钮。DEV-037：awf-modal-mask/card 入场动画。 */
    function ModalShell({ title, onClose, children, width }) {
      // DEV-108：弹框右下角拖拽调整大小（JS 实现；纯 CSS resize 对 auto 高度无效）
      const [customSize, setCustomSize] = useState(null) // {w, h} | null
      const onResizeStart = (e) => {
        e.preventDefault()
        e.stopPropagation()
        const card = e.currentTarget.parentElement
        if (!card) return
        const startX = e.clientX, startY = e.clientY
        const startW = card.offsetWidth, startH = card.offsetHeight
        const move = (ev) => {
          const w = Math.max(320, startW + ev.clientX - startX)
          const h = Math.max(180, startH + ev.clientY - startY)
          setCustomSize({ w, h })
        }
        const up = () => {
          window.removeEventListener('mousemove', move)
          window.removeEventListener('mouseup', up)
        }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
      }
      // DEV-043：ESC 关闭弹框（源文件/删除确认/归档查看等全部弹框统一生效）
      useEffect(() => {
        if (typeof onClose !== 'function') return undefined
        const onKey = (e) => {
          if (e.key === 'Escape' || e.key === 'Esc') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])
      return h('div', {
        className: 'awf-modal-mask',
        style: overlayStyle,
        onClick: (e) => { if (e.target === e.currentTarget && typeof onClose === 'function') onClose() },
      },
        h('div', {
          className: 'awf-modal-card',
          style: {
            width: customSize ? customSize.w : (width || 640),
            height: customSize ? customSize.h : undefined,
            maxWidth: 'calc(100vw - 40px)', maxHeight: '88vh',
            minWidth: 320, minHeight: 180,
            position: 'relative',
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
            h('div', { style: { fontSize: F(13), fontWeight: 800, color: C.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, title),
            h('button', {
              onClick: onClose,
              style: Object.assign(buttonStyle(), {
                padding: '0 7px', fontSize: F(11), lineHeight: '17px', flexShrink: 0,
                background: 'transparent', borderColor: 'transparent',
              }),
            }, '✕')),
          h('div', {
            style: { padding: '12px 14px', overflowY: 'auto', fontSize: F(12), color: C.text, flex: 1, minHeight: 0 },
          }, children),
          // DEV-108：右下角拖拽手柄（nwse-resize 光标 + 斜纹三角）
          h('div', {
            onMouseDown: onResizeStart,
            title: '拖动调整弹框大小',
            style: {
              position: 'absolute', right: 0, bottom: 0, width: 14, height: 14,
              cursor: 'nwse-resize', zIndex: 2,
              background: 'linear-gradient(135deg, transparent 50%, ' + C.border + ' 50%, ' + C.border + ' 58%, transparent 58%)',
            },
          })))
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

    // DEBUG-002：锁与 React 渲染分离。ref 同步占位，避免同一渲染闭包内重复点击；
    // key 不含 action，使同卡不同动作互斥，但不同项目/类型/任务可并行。
    function taskActionKey(project, task) {
      return JSON.stringify([project || '', task.type || '', task.id || ''])
    }

    function createTaskActionLock(publish) {
      const active = Object.create(null)
      const emit = () => publish && publish(Object.assign({}, active))
      return {
        acquire(project, task, action) {
          const key = taskActionKey(project, task)
          if (active[key]) return null
          const token = { key, action }
          active[key] = token
          emit()
          return token
        },
        release(token) {
          if (!token || active[token.key] !== token) return
          delete active[token.key]
          emit()
        },
        busy(project, task) { return !!active[taskActionKey(project, task)] },
      }
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
        // DEV-041：needs-upgrade（有 agent-workflow/ 文件夹但项目事实不完整）= 半初始化，也走引导卡（升级整理）
        if (code === 'not-initialized' || code === 'uninitialized' || code === 'needs-upgrade') return true
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
     * DEV-039：面板动作 → 服务端子代理通道端点。
     * 回填走 /awf/backfill/agent（专用路由），其余判断型动作走 /awf/action/agent（通用路由）。
     */
    function actionAgentEndpoint(action) {
      return action === 'progress-backfill' ? '/awf/backfill/agent' : '/awf/action/agent'
    }

    /**
     * DEV-039：调服务端子代理通道执行面板动作（回填/返回待办/删除）。
     * 服务端通过宿主 subagents.startActivation 注册可见子代理，继承父预设；
     * delivery=parent 由宿主向父会话汇报。缺服务或 live 父代理直接失败，禁止裸会话降级。
     * 响应：{ok, channel:'agent', action, task, agent?,failed?}
     */
    async function runAgentAction(o) {
      const { action, path, type, id, reason, sessionId, workspaceRoot, fetchImpl } = o || {}
      return postJson(actionAgentEndpoint(action), {
        path, type, id, action,
        reason: reason || undefined,
        sessionId: sessionId || undefined,
        workspaceRoot,
      }, fetchImpl)
    }

    /**
     * DEV-039：把动作子代理响应规整为面板通知对象（channel 感知）。
     * channel='agent' → 服务端子代理执行（成功/失败分色）；'inject' → 曾走降级注入（提示不可用）。
     * 无 channel（旧响应）→ 兼容 {id, prompted} 建队通知语义。
     */
    function agentNotice(id, resp) {
      const r = resp || {}
      if (r.channel === 'agent') {
        if (r.failed || !r.agent) {
          return { id, channel: 'agent', prompted: false, error: (r.agent && r.agent.error) || '子代理执行失败', phases: (r.agent && r.agent.phases) || [] }
        }
        return { id, channel: 'agent', prompted: true, text: String(r.agent.text || '').slice(0, 140) || '已执行', phases: r.agent.phases || [] }
      }
      return { id, channel: 'inject', prompted: !!(r.team && r.team.prompted) }
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
    // ---- DEV-036/DEV-038：置信度行（仅保留 L3 命令类验证按钮；回填提醒 UI 已按用户要求移除）----
    // DISC-2026-11-02：进度由「每阶段启动代理 → 完成 → 填写」驱动，面板不再显示
    // 「账本过期/可能未回填/让 agent 回填/回填指令已发给主对话」等回填催办 UI。
    function FreshnessRow({ t, verifyBusy, onVerifyCmd, verifyNotice }) {
      const list = Array.isArray(t.checkItems) ? t.checkItems : ((t.checkItems && t.checkItems.items) || [])
      const cmdPending = list.some((i) => i && !i.checked && String((i && i.text) || '').startsWith('[cmd]'))
      const showVerify = cmdPending && (t.status === 'verify' || t.status === 'review')
      if (!showVerify) return null
      const vBusy = !!verifyBusy && verifyBusy.id === t.id
      const vn = verifyNotice && verifyNotice.id === t.id ? verifyNotice : null
      return h('div', {
        className: 'awf-freshness',
        style: {
          marginTop: 4, marginBottom: 6, padding: '7px 9px', borderRadius: C.radiusSm,
          border: '1px solid color-mix(in srgb, ' + C.warn + ' 45%, transparent)',
          background: 'color-mix(in srgb, ' + C.warn + ' 7%, transparent)',
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: F(11),
        },
      },
        h('span', { style: row({ gap: 6, alignItems: 'center', flexWrap: 'wrap' }) },
          h('button', {
            onClick: vBusy ? undefined : () => onVerifyCmd(t),
            disabled: vBusy,
            title: '程序运行 [cmd] 命令类验收标准并写入带证据勾选（命令/退出码/时间/摘要，不写判断型内容）',
            style: Object.assign(buttonStyle(true), {
              padding: '2px 9px', fontSize: F(11),
              opacity: vBusy ? 0.4 : 1, cursor: vBusy ? 'default' : 'pointer',
            }),
          }, '⚙ 程序验证命令类标准'),
          vn
            ? h('span', { style: { color: vn.ok ? C.success : C.error } },
                vn.ok ? '✅ ' + vn.message : '⚠️ ' + vn.message)
            : null))
    }

    // DEV-041：面板收敛为纯看板——TaskCard 只读展示（ID/标题/徽章行/更新行），
    // 移除编辑/暂停/删除/放回待办/回填/验证等全部操作交互与进度/步骤条渲染；
    // 状态徽章（进行中/验证等）判断不准，一并移除——徽章行只保留账本事实：类型/优先级/Owner。
    // DEV-043：进行中任务可打开源文件（current.md）并编辑。徽章行只保留账本事实。
    /**
     * 当前任务行（DEV-044 对齐「最近完成」轻量行风格）：无卡片边框、hairline 分隔、
     * 紧凑单行布局。徽章行只保留账本事实：类型 / 优先级 / Owner。
     */
    function TaskCard({ t, flush, onOpenSource }) {
      const type = TYPE_STYLE[t.type] || { label: t.type || '任务', color: C.faint }
      const pst = PRIO_STYLE[t.prio] || { color: C.faint }
      const clickable = typeof onOpenSource === 'function'

      // 徽章行：类型=中性 chip / 优先级=实底或浅底（Owner 进 meta 行，避免重复展示）
      // DEV-043：无图标角标——整行点击直达源文件查看/编辑界面（悬停反馈即可）
      const badgeRow = h('div', { className: 'awf-badge-row', style: { display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' } },
        h(Pill, { color: type.color, variant: 'chip' }, type.label),
        t.prio ? h(Pill, { color: pst.color, variant: 'soft', dataPrio: t.prio }, t.prio) : null)

      // 行头：ID（左）+ 徽章行（右），与最近完成行的紧凑间距一致
      const rowHead = h('div', {
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          marginBottom: 3,
        },
      },
        h('span', { style: { fontFamily: C.mono, fontWeight: 700, fontSize: F(11), color: C.text } }, t.id || '?'),
        badgeRow)

      const meta = h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: F(11), color: C.faint, marginTop: 3 } },
        t.owner
          ? h('span', { style: row({ gap: 4 }) },
              h('span', { style: { color: C.dim } }, '👤'), h('span', {}, t.owner))
          : null,
        t.updated ? h('span', { style: row({ gap: 4 }) },
          h('span', { style: { color: C.faint } }, '↻'), h('span', {}, '更新 ' + t.updated)) : null,
        t.mode ? h('span', { style: { color: C.faint } }, t.mode) : null)

      return h('div', {
        className: 'awf-row' + (clickable ? ' awf-row-clickable' : ''),
        title: clickable ? '点击查看/编辑源文件（' + t.id + ' → ' + (t.type || 'dev') + '/current.md）' : undefined,
        onClick: clickable ? () => onOpenSource(t.type || 'dev', 'current', t) : undefined,
        style: {
          display: 'flex', flexDirection: 'column', gap: 0,
          padding: '7px 2px', borderBottom: '1px solid ' + C.hairline, fontSize: F(12),
          cursor: clickable ? 'pointer' : 'default',
          borderRadius: 6,
          transition: 'background .15s ease',
        },
      },
        rowHead,
        h('div', { style: { fontSize: F(13), fontWeight: 600, color: C.text, lineHeight: 1.45 } },
          t.title || '（无标题）'),
        meta)
    }

    /** 最近完成行：完成标记 / 日期 / ID / 描述，可点击查看归档（DEV-044：无源文件按钮）。 */
    function RecentRow({ r, onOpen }) {
      const clickable = typeof onOpen === 'function'
      return h('div', {
        className: 'awf-row',
        onClick: clickable ? () => onOpen(r) : undefined,
        title: clickable ? '点击查看归档' : undefined,
        style: {
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px',
          borderBottom: '1px solid ' + C.hairline, fontSize: F(12),
          cursor: clickable ? 'pointer' : 'default',
        },
      },
        h('span', { style: { color: C.success, fontSize: F(11), flexShrink: 0, fontWeight: 700 } }, '✓'),
        h('span', { style: { fontFamily: C.mono, fontSize: F(11), color: C.sub, flexShrink: 0 } }, r.date),
        h('span', { style: { fontFamily: C.mono, fontWeight: 700, fontSize: F(11), color: C.text, flexShrink: 0 } }, r.id),
        h('span', {
          style: {
            // DEV-043：描述文字提亮（dim→sub），最近完成行更易读
            color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', flex: 1, minWidth: 0,
          },
        }, r.desc || '—'),
        clickable ? h('span', { style: { color: C.sub, fontSize: F(12), flexShrink: 0 } }, '›') : null)
    }

    /**
     * 待办行（含 CRUD）：开始 / 编辑（原位表单）/ 删除（行内二次确认）。
     * 参数：{row, onStart, starting} 基础；编辑态 {editing, editForm, onEditChange, onEditSave, onEditCancel}；
     *      删除确认态 {deleting, onDeleteConfirm, onDeleteCancel, busy}。
     */
    /**
     * 待办行（DEV-044 对齐「最近完成」轻量行风格）：只读展示 类型/ID/描述/优先级，
     * 无任何操作按钮（含源文件）。
     */
    function TodoRow({ row, onOpen }) {
      const typeStyle = TYPE_STYLE[row.type] || { color: C.faint }
      const clickable = typeof onOpen === 'function'
      return h('div', {
        className: 'awf-row' + (clickable ? ' awf-row-clickable' : ''),
        title: clickable ? '点击查看/编辑源文件（' + row.id + ' → ' + (row.type || 'dev') + '/todo.md）' : undefined,
        onClick: clickable ? () => onOpen(row.type || 'dev', 'todo', row) : undefined,
        style: {
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px',
          borderBottom: '1px solid ' + C.hairline, fontSize: F(12),
          cursor: clickable ? 'pointer' : 'default',
          borderRadius: 6,
          transition: 'background .15s ease',
        },
      },
        h(Pill, { color: typeStyle.color, variant: 'chip' }, TYPE_LABEL(row.type)),
        h('span', { style: { fontFamily: C.mono, fontWeight: 700, fontSize: F(11), color: C.text, flexShrink: 0 } }, row.id),
        h('span', {
          style: {
            // DEV-043：待办描述提亮（dim→sub），与最近完成一致更易读
            color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', flex: 1, minWidth: 0,
          },
        }, row.desc || '—'),
        row.prio ? h(Pill, { color: (PRIO_STYLE[row.prio] || { color: C.faint }).color, variant: 'soft', dataPrio: row.prio }, row.prio) : null)
    }

    /**
     * 待办类型三态切换器（dev/debug/docs）。todo.md 是表格行格式、无 checkbox，
     * 不再渲染进度条；各类型按 toggle 展示自己的未开始任务行。
     * DEV-024：24px 控件高度，选中态用 hoverAccent 底 + accent 描边（对齐宿主 kit chipActive）。
     * DEV-100：counts = {dev,debug,docs} 各类型未开始任务数（取自 ledger.todoRows 过滤计数），
     * 每个 tab 按钮右侧挂数量徽章（选中态 accent 底、未选中中性底；0 也显示，区块常驻）。
     */
    function TypeToggle({ value, onChange, counts }) {
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
            fontSize: F(11), padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 5,
            border: '1px solid ' + (value === v ? 'color-mix(in srgb, ' + C.accent + ' 45%, transparent)' : 'transparent'),
            background: value === v ? C.hoverAccent : 'transparent',
            color: value === v ? C.text : C.sub,
            fontWeight: value === v ? 700 : 500,
          },
        },
          label,
          counts && counts[v] != null
            ? h('span', {
                key: 'count-' + v,
                className: 'awf-toggle-count',
                style: {
                  fontSize: F(10), lineHeight: '15px', fontWeight: 700, minWidth: 16,
                  textAlign: 'center', borderRadius: 999, padding: '0 4px',
                  background: value === v
                    ? 'color-mix(in srgb, ' + C.accent + ' 22%, transparent)'
                    : C.raised,
                  color: value === v ? C.accent : C.sub,
                },
              }, String(counts[v] || 0))
            : null)))
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
      const label = (status === 'verify' || status === 'review' || status === 'handoff') ? '验收进度' : '进度'
      // DEV-037：进行中（active/verify/review/handoff）且未满 100% 时挂流光动画类
      const live = !!(LIVE_STATUS[status]) && pct > 0 && pct < 100
      return h('div', { className: 'awf-check', style: { marginBottom: 6 } },
        h('div', { style: row({ gap: 6, fontSize: F(11), color: C.sub }) },
          h('span', { style: { fontWeight: 600, color: C.text } }, label),
          h('span', {}, String(done) + '/' + String(total) + ' · ' + String(pct) + '%')),
        h('div', {
          className: 'awf-progress' + (live ? ' awf-progress-live' : ''),
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
            // DEV-037 美化：当前节点渐变底（左上偏亮），呼吸光圈由 AWF_MOTION_CSS 动画接管
            background: 'linear-gradient(135deg, ' + C.accent + ', color-mix(in srgb, ' + C.accent + ' 82%, #ffffff))',
            borderColor: C.accent, color: '#fff',
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
          return h('span', { style: { fontSize: F(11), fontWeight: 900, lineHeight: 1 } }, '⏸')
        }
        if (done) {
          return h('span', { style: { fontSize: F(11), fontWeight: 900, lineHeight: 1 } }, '✓')
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
        if (i > 0) trackChildren.push(h('span', {
          key: 'ln' + i,
          // DEV-037：流入当前节点的连线挂 awf-step-line-hot（流动高光动画），paused 静止
          className: 'awf-step-line' + (cur && !paused ? ' awf-step-line-hot' : ''),
          style: lineStyle(i - 1) }))
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
          h('span', { style: row({ gap: 6, fontSize: F(11), fontWeight: 700, color: C.dim }) },
            h('span', { style: { color: type.color } }, type.label),
            h('span', {}, '流程')),
          h('span', { style: row({ gap: 8, fontSize: F(11) }) },
            h('span', { style: { color: C.success, fontWeight: 600, whiteSpace: 'nowrap' } },
              '✓ 已完成 ' + index),
            paused
              ? h('span', { style: { fontSize: F(11), fontWeight: 600, color: C.warn, whiteSpace: 'nowrap' } },
                  '已暂停 · ' + activeStep.label)
              : h('span', { style: row({ gap: 5, fontSize: F(11), color: C.accent, fontWeight: 600, whiteSpace: 'nowrap' }) },
                  // DEV-037：进行中指示点（呼吸），与当前步骤文字联动
                  h('span', { className: 'awf-live-dot' }),
                  h('span', {}, '当前 · ' + activeStep.label)),
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
        h('div', { style: { fontSize: F(12), fontWeight: 700, color: C.text, marginBottom: 7 } }, '＋ 新增待办行'),
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
          ? h('div', { style: { marginTop: 6, fontSize: F(11), color: C.error, wordBreak: 'break-all' } }, '⚠️ ' + f.error)
          : null,
        h('div', { style: row({ gap: 6, justifyContent: 'flex-end', marginTop: 8 }) },
          h('button', {
            onClick: busy ? undefined : onSave, disabled: busy,
            style: Object.assign(buttonStyle(true), { opacity: busy ? 0.4 : 1, cursor: busy ? 'default' : 'pointer' }),
          }, '保存'),
          h('button', { onClick: onCancel, disabled: busy, style: buttonStyle() }, '取消')))
    }

    /** 轻量 markdown → HTML（安全转义，仅支持源文件常见的语法子集）。
     *  支持：# 标题 / ## 任务块标题 / -·或 1. 列表 / **粗体** / `行内代码` /
     *  ``` 代码块 / | 表格 | / [链接](url) / > 引用 / --- 分隔线。
     *  所有原文先转义，再按行规则组块，避免 XSS。 */
    function mdToHtml(md) {
      const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
      const inline = (s) => esc(s)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code style="background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.10));padding:1px 4px;border-radius:4px;font-size:' + F(13) + 'px">$1</code>')
        .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--dsw-alias-brand-primary,#4f8ef7)">$1</a>')
      const lines = String(md == null ? '' : md).split('\n')
      const html = []
      let inCode = false
      let codeBuf = []
      let inTable = false
      let tableBuf = []
      const flushTable = () => {
        if (tableBuf.length === 0) return
        const cellText = (r) => r.split('|').filter((_, i, a) => !(i === 0 || i === a.length - 1 || (i === 1 && a.length === 2))).map((c) => c.trim())
        // 第一行=表头（th），第二行=分隔行（|----|）跳过，其余=数据行
        const first = cellText(tableBuf[0])
        const isSep = (r) => /^[\s|:-]+$/.test(r.replace(/\|/g, '')) && r.includes('-')
        const bodyRows = tableBuf.slice(1).filter((r) => !isSep(r)).map((r) => cellText(r))
        const maxCols = Math.max(first.length, ...bodyRows.map((r) => r.length))
        const tdStyle = 'padding:3px 8px;border:1px solid var(--dsw-alias-hairline,rgba(127,127,127,.16));font-size:' + F(13) + 'px;vertical-align:top'
        const head = '<tr>' + first.map((c, i) => '<th style="' + tdStyle + ';font-weight:700;text-align:left;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.06))">' + inline(c) + '</th>').join('') + '</tr>'
        const rows = bodyRows.map((r) => '<tr>' + Array.from({ length: maxCols }, (_, i) => '<td style="' + tdStyle + (i === 2 ? ';word-break:break-word' : ';white-space:nowrap') + '">' + inline(r[i] || '') + '</td>').join('') + '</tr>').join('')
        // 列宽比例：描述（第3列）最宽，其余按内容自适应（fixed 布局下显式分配）
        const colWidths = [18, 12, 52, 18]
        const colgroup = '<colgroup>' + Array.from({ length: maxCols }, (_, i) => '<col style="width:' + (colWidths[i] || Math.floor(100 / maxCols)) + '%">').join('') + '</colgroup>'
        html.push('<table style="border-collapse:collapse;margin:6px 0;max-width:100%;table-layout:fixed;width:100%">' + colgroup + head + rows + '</table>')
        tableBuf = []
        inTable = false
      }
      for (const raw of lines) {
        const line = raw
        if (inCode) {
          if (/^```/.test(line)) { inCode = false; html.push('<pre style="background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.10));padding:8px 10px;border-radius:6px;overflow:auto;font-size:' + F(13) + 'px;line-height:1.5"><code>' + esc(codeBuf.join('\n')) + '</code></pre>') ; codeBuf = [] }
          else codeBuf.push(line)
          continue
        }
        if (/^```/.test(line)) { flushTable(); inCode = true; codeBuf = []; continue }
        if (/^\|/.test(line)) { if (!inTable) { inTable = true; tableBuf = [] } tableBuf.push(line); continue }
        flushTable()
        if (/^#{1,4}\s/.test(line)) {
          const level = line.match(/^#+/)[0].length
          const text = inline(line.replace(/^#+\s*/, ''))
          html.push(level <= 2
            ? '<div style="font-weight:800;font-size:' + (level === 1 ? F(16) : F(14)) + 'px;color:var(--dsw-alias-label-primary,#2c3138);margin:10px 0 4px">' + text + '</div>'
            : '<div style="font-weight:700;font-size:' + F(13) + 'px;color:var(--dsw-alias-label-secondary,#8a919c);margin:8px 0 3px">' + text + '</div>')
          continue
        }
        if (/^---+\s*$/.test(line)) { html.push('<hr style="border:none;border-top:1px solid var(--dsw-alias-hairline,rgba(127,127,127,.16));margin:8px 0">'); continue }
        if (/^>\s?/.test(line)) { html.push('<blockquote style="margin:6px 0;padding:4px 10px;border-left:3px solid var(--dsw-alias-border-l1,rgba(127,127,127,.16));color:var(--dsw-alias-label-secondary,#8a919c)">' + inline(line.replace(/^>\s?/, '')) + '</blockquote>'); continue }
        if (/^\s*[-*]\s+/.test(line)) { html.push('<div style="padding:1px 0;font-size:' + F(14) + 'px;line-height:1.6">• ' + inline(line.replace(/^\s*[-*]\s+/, '')) + '</div>'); continue }
        if (/^\s*\d+[.)]\s+/.test(line)) { html.push('<div style="padding:1px 0;font-size:' + F(14) + 'px;line-height:1.6">' + inline(line.replace(/^\s*\d+[.)]\s+/, '') ) + '</div>'); continue }
        if (/^\s*$/.test(line)) { continue }
        html.push('<div style="padding:1px 0;font-size:' + F(14) + 'px;line-height:1.6">' + inline(line) + '</div>')
      }
      if (inCode) html.push('<pre style="background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.10));padding:8px 10px;border-radius:6px;overflow:auto;font-size:' + F(13) + 'px;line-height:1.5"><code>' + esc(codeBuf.join('\n')) + '</code></pre>')
      flushTable()
      return html.join('\n')
    }

    /**
     * 源文件查看面板（只读）：README/任务字段编辑态的「打开源文件」目标。
     * 展示本地绝对路径（可复制）+ macOS「在访达显示」提示 + .md 原文（等宽、可滚动）。
     * src: {type, file, busy, data:{absPath,content}, error}
     */
    // DEV-043：源文件面板——查看/编辑一体，信息与样式对齐「归档查看」弹层：
      //   标题带任务 ID、顶部徽章行（类型/优先级/日期）、描述粗体、
      //   「任务块原文（markdown）」小节标题、raised 内容区（编辑态 textarea 保存写回）。
      function SourcePanel({ src, onClose, onCopy, onSave, onEditStart, onEditCancel, onDraftChange }) {
        const s = src || {}
        const data = s.data || null
        const editing = !!s.editing
        const saving = !!s.saving
        // DEV-106：阅读/编辑双模式——viewMode 由 props.editing 推导（编辑态=edit，否则 read），
        // 底部「编辑」按钮进 edit；保存/取消回 read。渲染内容互斥：read=mdToHtml 预览，edit=textarea。
        const viewMode = editing ? 'edit' : 'read'
        // DEV-043：dirty = 草稿与原文不一致（保存按钮默认禁用，修改后激活）
        const dirty = !!data && (s.draft != null ? s.draft !== data.content : false)
        const meta = s.meta || {} // 任务对象（id/prio/title/updated）或归档行（id/prio/desc/date）
        const metaTitle = meta.title || meta.desc || ''
        const metaUpdated = meta.updated || meta.date || ''
        const typeStyle = TYPE_STYLE[s.type] || { color: C.faint }
        const prioStyle = PRIO_STYLE[meta.prio] || { color: C.faint }
        const tabBtn = (label, active, onClick) => h('button', {
          onClick: () => onClick && onClick(),
          style: {
            fontSize: F(12), padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
            border: '1px solid ' + (active ? C.accent : 'transparent'),
            background: active ? C.hoverAccent : 'transparent',
            color: active ? C.text : C.sub,
            fontWeight: active ? 700 : 500,
          },
        }, label)
        return h(ModalShell, {
          title: '源文件 · ' + (meta.id || (s.type || '') + '/' + (s.file || '') + '.md'),
          onClose, width: 720,
        },
          s.busy
            ? h('div', { style: { padding: '16px 0', textAlign: 'center', color: C.dim, fontSize: F(12) } }, '加载中…')
            : s.error
              ? h('div', { style: { padding: '12px', color: C.error, fontSize: F(12), wordBreak: 'break-all' } }, '⚠️ ' + s.error)
              : data
                ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
                    // 顶部徽章行（对齐归档查看）：类型 / 优先级 / 文件名
                    // （不再显示超长「更新于…」备注，避免挤占；任务信息以内容区为准）
                    h('div', { style: row({ gap: 8, flexWrap: 'wrap' }) },
                      h(Pill, { color: typeStyle.color, variant: 'chip' }, TYPE_LABEL(s.type)),
                      meta.prio ? h(Pill, { color: prioStyle.color, variant: 'soft', dataPrio: meta.prio }, meta.prio) : null,
                      h('span', { style: Object.assign({ fontFamily: C.mono }, muted({})) }, s.file + '.md')),
                    // 任务描述（粗体，对齐归档查看）
                    h('div', { style: { fontSize: F(14), fontWeight: 700, color: C.text, lineHeight: 1.5 } },
                      metaTitle || '（无描述）'),
                    // 小节标题：任务块原文（markdown）
                    h('div', { style: { fontSize: F(13), fontWeight: 700, color: C.sub, margin: '2px 0 6px', letterSpacing: '.03em' } },
                      '任务块原文（markdown）' + (editing ? ' · 可编辑' : '')),
                    // DEV-106：阅读/编辑 tab 条
                    h('div', { style: { display: 'flex', gap: 4, marginBottom: 2 } },
                      tabBtn('阅读', viewMode === 'read', () => { if (editing) onEditCancel && onEditCancel() }),
                      tabBtn('编辑', viewMode === 'edit', () => { if (!editing) onEditStart && onEditStart() })),
                    // 内容区（阅读=渲染 / 编辑=textarea，tab 由 viewMode 切换）
                    viewMode === 'read'
                      ? h('div', {
                            style: {
                              margin: 0, padding: '10px 12px', borderRadius: 8, overflow: 'auto', maxHeight: 640, minHeight: 340,
                              background: C.raised, border: '1px solid ' + C.hairline,
                              fontSize: F(14), lineHeight: 1.6, color: C.text, wordBreak: 'break-word',
                            },
                            // 渲染结果以 HTML 注入（mdToHtml 已转义，安全）
                          }, h('span', { dangerouslySetInnerHTML: { __html: mdToHtml(data.content || '') } }))
                      : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                          h('textarea', {
                            value: s.draft != null ? s.draft : data.content,
                            onChange: (e) => onDraftChange && onDraftChange(e.target.value),
                            spellCheck: false,
                            style: {
                              margin: 0, padding: '10px 12px', borderRadius: 8,
                              fontFamily: C.mono, fontSize: F(13), lineHeight: 1.55,
                              color: 'var(--dsw-alias-label-primary, #2c3138)',
                              background: C.raised, border: '1px solid ' + C.hairline,
                              maxHeight: 640, minHeight: 340, overflowY: 'auto',
                              resize: 'vertical', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            },
                          }),
                          h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' } },
                            s.saveError
                              ? h('span', { style: { fontSize: F(11), color: C.error, marginRight: 'auto' } }, '⚠️ ' + s.saveError)
                              : null,
                            h('button', {
                              onClick: onEditCancel,
                              style: buttonStyle(),
                            }, '取消'),
                            h('button', {
                              onClick: saving ? undefined : () => onSave && onSave(s.draft != null ? s.draft : data.content),
                              disabled: saving || !dirty,
                              title: dirty ? '保存修改到 ' + s.file + '.md' : '未修改',
                              style: Object.assign(buttonStyle({ color: C.accent }), { opacity: saving || !dirty ? 0.5 : 1, cursor: saving || !dirty ? 'default' : 'pointer' }),
                            }, saving ? '保存中…' : '保存'))))
                : h('div', { style: { padding: '12px', color: C.dim, fontSize: F(12) } }, '无内容'))
    }

    /** 删除任务二次确认弹框。state: {task, view, busy, error}；handlers: {onRollback, onLedgerOnly, onCancel}。 */
    function renderDeleteModal(state, handlers) {
      const s = state || {}
      const H = handlers || {}
      const task = s.task || {}
      const view = s.view
      const busy = !!s.busy

      const errorLine = s.error
        ? h('div', { key: 'err', style: { fontSize: F(12), color: C.error, marginTop: 10, wordBreak: 'break-all' } }, '⚠️ ' + s.error)
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
            h('span', { style: { fontSize: F(12), color: C.error, fontWeight: 600 } }, '无法获取回退文件清单')),
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
              style: { fontSize: F(12), color: C.error, fontWeight: 700, lineHeight: 1.5 },
            }, '删除后将回退这些文件的未提交修改，不可恢复')),
          h('div', { style: { fontSize: F(12), color: C.sub, margin: '10px 0 6px' } },
            '将回退以下 ' + view.files.length + ' 个文件：'),
          h('div', { style: { border: '1px solid ' + C.border, borderRadius: 8, overflow: 'hidden' } },
            view.files.map((f, i) => {
              const st = FILE_STATUS_STYLE[f.status] || { color: C.faint }
              return h('div', {
                key: i,
                style: {
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 9px', fontSize: F(12),
                  borderBottom: i < view.files.length - 1 ? '1px solid ' + C.hairline : 'none',
                  background: C.surface,
                },
              },
                h(Pill, { color: st.color }, fileStatusLabel(f.status)),
                h('span', {
                  style: {
                    fontFamily: C.mono, fontSize: F(11), color: C.text,
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
              h('div', { style: { fontSize: F(12), color: C.warn, fontWeight: 700 } }, '无法回退未提交修改'),
              h('div', { style: { fontSize: F(12), color: C.sub, marginTop: 3, lineHeight: 1.5 } },
                deleteReasonText(view.reason)))),
          h('div', { style: { fontSize: F(12), color: C.sub, marginTop: 10, lineHeight: 1.5 } },
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
          h('div', { style: { fontSize: F(13), fontWeight: 700 } }, '归档读取失败'),
          h('div', { style: muted({ marginTop: 6, wordBreak: 'break-all' }) }, s.error))
      } else if (s.data) {
        const doneRow = s.data.row || {}
        const typeStyle = TYPE_STYLE[s.data.type] || { color: C.faint }
        body = h('div', {},
          h('div', { style: row({ gap: 8, flexWrap: 'wrap' }) },
            h(Pill, { color: typeStyle.color, variant: 'chip' }, TYPE_LABEL(s.data.type)),
            doneRow.prio ? h(Pill, { color: (PRIO_STYLE[doneRow.prio] || { color: C.faint }).color, variant: 'soft', dataPrio: doneRow.prio }, doneRow.prio) : null,
            doneRow.date ? h('span', { style: Object.assign({ fontFamily: C.mono }, muted({})) }, '完成于 ' + doneRow.date) : null),
          h('div', { style: { fontSize: F(14), fontWeight: 700, color: C.text, marginTop: 8, lineHeight: 1.5 } },
            doneRow.desc || '（无描述）'),
          h('div', { style: { fontSize: F(13), fontWeight: 700, color: C.sub, margin: '12px 0 6px', letterSpacing: '.03em' } },
            '任务块原文（markdown）'),
          // DEV-106：归档查看同样走 md 渲染（与源文件面板阅读态一致）
          h('div', {
            style: {
              margin: 0, padding: '10px 12px', borderRadius: 8, overflow: 'auto', maxHeight: 320,
              background: C.raised, border: '1px solid ' + C.hairline,
              fontSize: F(12), lineHeight: 1.6, color: C.text, wordBreak: 'break-word',
            },
          }, h('span', { dangerouslySetInnerHTML: { __html: mdToHtml(s.data.block || '（该任务归档时未保留详细任务块，仅摘要）') } })),
          h('div', { style: { textAlign: 'center', marginTop: 12 } },
            h('button', { onClick: onClose, style: buttonStyle() }, '关闭')))
      } else {
        body = h('div', { style: { textAlign: 'center', color: C.dim, padding: '14px 0' } }, '（无归档数据）')
      }
      return h(ModalShell, { title: '归档查看' + (s.id ? ' · ' + s.id : ''), onClose, width: 640 }, body)
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
        h('div', { style: { fontWeight: 800, fontSize: F(13), color: C.text, marginTop: 10 } }, title),
        desc ? h('div', {
          // DEV-043：引导卡说明文字提亮（muted/dim→sub），与待办/最近完成/底部提示一致
          style: { color: C.sub, fontSize: F(12), lineHeight: 1.5, marginTop: 6, maxWidth: 260 },
        }, desc) : null,
        extra || null,
        action || null)
    }

    /** 未初始化引导卡：图标 + 文案 + 「初始化工作流」按钮（EmptyState accent 形态）。 */
    /** 未初始化/半初始化引导卡：区分「从未初始化」（初始化骨架）与「已有工作流文件夹但项目事实不完整」（引导升级整理）。 */
    function renderInitCard({ busy, error, onInit, needsUpgrade, onUpgrade }) {
      if (needsUpgrade) {
        // DEV-041+升级中：按钮「更新中…」+ 旋转动画图标 + 禁点（busy=upgrading）
        const spin = busy
          ? h('span', {
              className: 'awf-spin',
              style: {
                display: 'inline-block', width: 10, height: 10, marginRight: 6,
                border: '2px solid ' + C.surface,
                borderTopColor: C.text,
                borderRadius: '50%',
                animation: 'awf-rot 0.9s linear infinite',
                verticalAlign: '-1px',
              },
            })
          : null
        return h(EmptyState, {
          icon: '🔄', tone: 'accent',
          title: '工作流需要更新整理',
          desc: '检测到该项目已有 agent-workflow/ 文件夹但工作流不完整或版本不可读。点击下方按钮进入升级/整理流程：由 agent 合并保留自定义内容并更新框架文件。',
          action: typeof onUpgrade === 'function'
            ? h('button', {
                onClick: busy ? undefined : onUpgrade,
                disabled: busy,
                style: Object.assign(buttonStyle(true), {
                  marginTop: 12, padding: '5px 16px', fontSize: F(12),
                  opacity: busy ? 0.65 : 1, cursor: busy ? 'wait' : 'pointer',
                }),
              }, spin, busy ? '更新中…' : '更新/整理工作流')
            : null,
          extra: error
            ? h('div', { style: { marginTop: 10, fontSize: F(12), color: C.error, maxWidth: 280, wordBreak: 'break-all' } },
                '⚠️ ' + error)
            : null,
        })
      }
      if (busy) {
        const spin = h('span', {
          className: 'awf-spin',
          style: {
            display: 'inline-block', width: 12, height: 12, marginRight: 6,
            border: '2px solid ' + C.surface,
            borderTopColor: C.text,
            borderRadius: '50%',
            animation: 'awf-rot 0.9s linear infinite',
            verticalAlign: '-1px',
          },
        })
        // DEV-103：初始化由 agent 完整配置（读项目上下文生成骨架），子代理运行中
        return h(EmptyState, {
          icon: '🚀', tone: 'accent',
          title: '初始化中…',
          desc: '已派发 agent 子代理为项目生成完整工作流框架（读取项目上下文后配置 project.yaml、工作流文件与初始账本），完成后面板自动刷新。',
          extra: error
            ? h('div', { style: { marginTop: 10, fontSize: F(12), color: C.error, maxWidth: 280, wordBreak: 'break-all' } },
                '⚠️ ' + error)
            : null,
        })
      }
      return h(EmptyState, {
        icon: '🚀', tone: 'accent',
        title: '工作流未初始化',
        desc: '该项目尚未初始化 agent-workflow。点击下方按钮，由 agent 读取项目上下文生成完整框架：project.yaml（项目事实）+ AGENTS.md 入口 + 工作流规范 + 任务账本骨架。',
        action: typeof onInit === 'function'
          ? h('button', {
              onClick: busy ? undefined : onInit,
              disabled: busy,
              style: Object.assign(buttonStyle(true), {
                marginTop: 12, padding: '5px 16px', fontSize: F(12),
                opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer',
              }),
            }, '初始化工作流（agent 配置）')
          : null,
        extra: error
          ? h('div', { style: { marginTop: 10, fontSize: F(12), color: C.error, maxWidth: 280, wordBreak: 'break-all' } },
              '⚠️ ' + error)
          : null,
      })
    }

    // ---- 看板主体 ---------------------------------------------------------

    function Dashboard(p) {
      const props = p || {}
      const anchorRoot = useAnchorRoot(props)

      // DEV-108：跟随宿主字体——root 字号变化时刷新 scale 并强制重渲染
      const [, forceFontTick] = useState(0)
      useEffect(() => {
        refreshHostFontScale()
        if (typeof MutationObserver === 'undefined') return undefined
        const onMut = () => {
          const before = HOST_FONT_SCALE
          refreshHostFontScale()
          if (HOST_FONT_SCALE !== before) forceFontTick((t) => t + 1)
        }
        const obs = new MutationObserver(onMut)
        obs.observe(document.documentElement, { attributes: true, childList: true, subtree: true, attributeFilter: ['class', 'style', 'data-font-size'] })
        return () => obs.disconnect()
      }, [])

      const [projects, setProjects] = useState(null)
      const [indexReady, setIndexReady] = useState(false)
      const [selected, setSelected] = useState('')
      const [auto, setAuto] = useState(false) // 当前选中是否来自自动锚定
      const [ledger, setLedger] = useState(null)
      const [notInit, setNotInit] = useState(false) // 选中项目未初始化 → 引导卡
      const [needsUpgrade, setNeedsUpgrade] = useState(false) // DEV-041：有工作流文件夹但项目事实不完整 → 引导升级
      const [error, setError] = useState(null)
      const [loading, setLoading] = useState(false)
      const [initBusy, setInitBusy] = useState(false)
      const [initError, setInitError] = useState(null)
      // DEV-035：登记当前项目 / 仅本地模式 / 框架版本监测
      const [regBusy, setRegBusy] = useState(false)
      const [regError, setRegError] = useState(null)
      const [regLocal, setRegLocal] = useState(false) // 仅本地（不推送到远端）
      const [versions, setVersions] = useState(null) // {status, installed, scaffold, latestAWF, latestRelease, upgradeTo}
      const [upgrading, setUpgrading] = useState(false) // 升级指令已注入 / 升级进行中
      const [upError, setUpError] = useState(null)
      const [taskActions, setTaskActions] = useState({})
      const taskLocksRef = useRef(null)
      if (!taskLocksRef.current) taskLocksRef.current = createTaskActionLock(setTaskActions)
      const taskLocks = taskLocksRef.current
      const [actionError, setActionError] = useState(null) // 开始/操作失败提示
      const [archive, setArchive] = useState(null) // {id,busy,data,error}

      // t5：todo / 当前任务 CRUD 交互状态
      const [addForm, setAddForm] = useState(null) // 新增待办表单 {type,id,prio,desc,busy,error} | null
      const [todoEdits, setTodoEdits] = useState({}) // key='type:id' → {prio,desc,busy,error}
      const [todoDeleteKey, setTodoDeleteKey] = useState(null) // 行内删除确认中的 key
      const [todoType, setTodoType] = useState('dev') // 待办区类型切换（默认 dev）
      const [taskEdit, setTaskEdit] = useState(null) // 当前任务编辑表单 {id,type,prio,status,owner,scope,desc,busy,error} | null
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

      // 2) 默认锚定（无下拉，只跟随当前会话）：
      //    解析当前会话工作区根 → 优先匹配全局索引（精确/最长前缀）；
      //    未命中索引也直接以该根路径为目标（看板与初始化均支持 workspaceRoot 白名单，
      //    未登记项目同样能初始化/查看）。localStorage 手动选择不再参与（无项目选择器）。
      useEffect(() => {
        if (!indexReady) return
        if (!anchorRoot) {
          setAuto(false)
          setSelected((prev) => (prev === '' ? prev : ''))
          return
        }
        const autoPath = resolveDefaultProject(projects || [], anchorRoot) || anchorRoot
        setSelected((prev) => (prev === autoPath ? prev : autoPath))
        setAuto(true) // 始终自动锚定，跟随当前会话
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
              setNeedsUpgrade(false)
              setLedger(null)
            } else {
              setNotInit(false)
              setNeedsUpgrade(false)
              setLedger(data.ledger || null)
            }
            // DEV-035：版本状态随账本一起刷新；升级完成后自动结束「升级中」态
            if (data && data.versions) {
              setVersions(data.versions)
              if (data.versions.status === 'latest') setUpgrading(false)
            }
            setError(null)
          })
          .catch((e) => {
            if (!alive) return
            if (detectNotInitialized(null, e)) {
              // 缺省回退：400 bad-request（缺 project.yaml）= 未初始化；
              // DEV-041：needs-upgrade（有 agent-workflow/ 文件夹但项目事实不完整）= 半初始化 → 引导升级
              setNotInit(true)
              setNeedsUpgrade(!!(e && e.code === 'needs-upgrade'))
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
        // DEV-033 块 B：SSE 事件驱动刷新（数据状态驱动页面）——
        // 账本文件变化（agent/程序/手动写者）→ 服务端广播 → 匹配项目立即刷新；
        // 15s 轮询保留为兜底降级（SSE 断线/不支持时自动退回轮询）。
        const t = setInterval(loadLedger, POLL_MS)
        let es = null
        try {
          es = new EventSource('/awf/events')
          es.onmessage = (ev) => {
            try {
              const msg = JSON.parse(ev.data || '{}')
              if (msg && msg.projectPath === selected) {
                if (msg.type === 'ledger-changed' || msg.type === 'upgrade-complete') {
                  loadLedger()
                  // DEV-041：完成回调（无论成功/失败）都结束「升级整理中」态，
                  //   失败时 loadLedger 刷新后版本仍 outdated，用户可再次发起升级
                  if (msg.type === 'upgrade-complete') setUpgrading(false)
                }
              }
            } catch (e) { /* 忽略畸形事件 */ }
          }
        } catch (e) { /* EventSource 不可用时纯轮询兜底 */ }
        return () => {
          clearInterval(t)
          if (es) es.close()
        }
      }, [loadLedger, selected])

      // （无项目切换：只跟随当前会话，锚定在步骤 2）

      // 5) 初始化工作流（未初始化引导）
      const handleInit = useCallback(async () => {
        if (!selected || initBusy) return
        setInitBusy(true)
        setInitError(null)
        try {
          // DEV-103：初始化改为 agent 完整配置（读项目上下文生成完整骨架），不再用空模板
          const out = await postJson('/awf/init/agent', {
            path: selected,
            workspaceRoot: anchorRoot || undefined,
            sessionId: props.sessionId || (props.scope && props.scope.sessionId) || undefined,
          })
          if (out && out.channel === 'agent' && out.failed) {
            setInitError('初始化子代理未完成：' + String((out.agent && (out.agent.error || out.agent.code)) || '未知原因'))
          }
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
      }, [selected, initBusy, anchorRoot, loadLedger])

      // DEV-035：重取项目索引（登记成功后 / 手动刷新时，修复索引只在挂载时取一次的陈旧问题）
      const reloadProjects = useCallback(async () => {
        try {
          const data = await getJson('/awf/projects')
          setProjects(data.projects || [])
          setIndexReady(true)
        } catch (e) {
          setError(String((e && e.message) || e))
          setIndexReady(true)
        }
      }, [])

      // DEV-035：面板「登记当前项目」。
      //   已有 agent-workflow/ → 直接登记；没有 → 服务端先初始化骨架再登记。
      //   regLocal=仅本地（不推送远端）：service 写 project.yaml track:false + .gitignore 忽略区块。
      const handleRegister = useCallback(async () => {
        if (!anchorRoot || regBusy) return
        setRegBusy(true)
        setRegError(null)
        try {
          const resp = await postJson('/awf/register', {
            path: anchorRoot,
            workspaceRoot: anchorRoot || undefined,
            local: regLocal,
          })
          await reloadProjects()
          if (resp && resp.project && resp.project.path) {
            setSelected(resp.project.path)
            setAuto(true)
          }
          loadLedger()
        } catch (e) {
          if (e.code === 'path-not-allowed') {
            setRegError('路径不在白名单：必须位于全局项目索引或当前工作区根。')
          } else if (e.code === 'forbidden') {
            setRegError('无权限：认证未通过，请先登录。')
          } else if (e.code === 'bad-request') {
            setRegError('请求不合法：' + String(e.message || e))
          } else if (e.status === 404 || e.status === 405) {
            // 页面已用新客户端，但宿主还加载着旧插件服务端 → 路由未注册
            setRegError('服务端插件路由未加载（HTTP ' + e.status + '）：请重启 DSH 让新路由生效后重试。')
          } else {
            setRegError('登记失败：' + String((e && e.message) || e))
          }
        } finally {
          setRegBusy(false)
        }
      }, [anchorRoot, regBusy, regLocal, reloadProjects, loadLedger])

      // DEV-035：框架版本落后 → 注入升级意图（升级由 agent 执行并跑 awf check）。
      //   面板不执行升级，只监听版本文件/账本变化：versions 变 latest 时自动结束「升级中」态。
      const handleUpgrade = useCallback(async () => {
        if (!selected || upgrading) return
        setUpgrading(true)
        setUpError(null)
        try {
          await postJson('/awf/upgrade', {
            path: selected,
            workspaceRoot: anchorRoot || undefined,
            sessionId: props.sessionId || (props.scope && props.scope.sessionId) || undefined,
          })
          loadLedger() // 触发 versions 刷新
        } catch (e) {
          if (e.code === 'up-to-date') {
            loadLedger()
          } else if (e.status === 404 || e.status === 405) {
            // 页面已用新客户端，但宿主还加载着旧插件服务端 → 路由未注册
            setUpError('服务端插件路由未加载（HTTP ' + e.status + '）：请重启 DSH 让新路由生效后重试。')
            setUpgrading(false)
          } else {
            setUpError('升级指令发送失败：' + String((e && e.message) || e))
            setUpgrading(false)
          }
        }
      }, [selected, upgrading, anchorRoot, loadLedger, props.sessionId, props.scope])

      // 6) 开始任务（managed agent 通道）
      //    调 /awf/team/start：服务端通过宿主托管子代理开始任务。
      //    managed 子代理执行；结果由宿主 parent 汇报，插件仅刷新账本。
      const handleStart = useCallback(async (row) => {
        if (!selected || !row || !row.id || !row.type) return
        const token = taskLocks.acquire(selected, row, 'start')
        if (!token) return
        setActionError(null)
        try {
          await postJson('/awf/team/start', {
            path: selected, type: row.type, id: row.id,
            sessionId: props.sessionId || (props.scope && props.scope.sessionId) || undefined,
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
          taskLocks.release(token)
        }
      }, [selected, anchorRoot, loadLedger, props.sessionId, props.scope])

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

      // 8) 删除任务（DEV-033/DEV-039）：优先服务端子代理通道执行，
      //    程序不再 dry-run/回退——子代理判断能否删除（未提交改动/修改范围/依赖）后
      //    执行并更新账本；agents 服务不可用时服务端自动降级注入主对话。
      const handleDeleteClick = useCallback(async (t) => {
        if (!selected || !t || !t.id) return
        const token = taskLocks.acquire(selected, t, 'delete')
        if (!token) return
        setActionError(null)
        try {
          await runAgentAction({
            action: 'delete', path: selected, type: t.type, id: t.id,
            sessionId: props.sessionId || (props.scope && props.scope.sessionId) || undefined,
            workspaceRoot: anchorRoot || undefined,
          })
          loadLedger()
        } catch (e) {
          setActionError('删除动作执行失败：' + String((e && e.message) || e))
        } finally {
          taskLocks.release(token)
        }
      }, [selected, anchorRoot, loadLedger, props.sessionId, props.scope])

      // ---- DEV-036/DEV-039：回填置信度（L1 按钮 + L3 程序验证 + L2 自动）----

      // L1：「让 agent 回填」——优先服务端子代理通道执行，程序不改账本。
      const [verifyNotice, setVerifyNotice] = useState(null) // {id, ok, message}

      const handleBackfill = useCallback(async (t) => {
        if (!selected || !t || !t.id) return
        const token = taskLocks.acquire(selected, t, 'backfill')
        if (!token) return
        try {
          await runAgentAction({
            action: 'progress-backfill', path: selected, type: t.type, id: t.id,
            reason: (t.freshness && t.freshness.signals && t.freshness.signals.length)
              ? t.freshness.signals.join('/') : undefined,
            sessionId: props.sessionId || (props.scope && props.scope.sessionId) || undefined,
            workspaceRoot: anchorRoot || undefined,
          })
          loadLedger()
        } catch (e) {
          setActionError('回填动作执行失败：' + String((e && e.message) || e))
        } finally {
          taskLocks.release(token)
        }
      }, [selected, anchorRoot, loadLedger, props.sessionId, props.scope])

      // L3：「程序验证命令类标准」——服务端运行 [cmd] 命令并写入带证据勾选（只写机器证据）。
      const handleVerifyCmd = useCallback(async (t) => {
        if (!selected || !t || !t.id) return
        const token = taskLocks.acquire(selected, t, 'verify')
        if (!token) return
        try {
          const resp = await postJson('/awf/verify-evidence', {
            path: selected, type: t.type, id: t.id, workspaceRoot: anchorRoot || undefined,
          })
          loadLedger()
          setVerifyNotice({
            id: t.id, ok: true,
            message: resp && resp.checked > 0
              ? resp.checked + ' 项命令类标准已带证据勾选'
              : '没有未勾选的命令类标准',
          })
        } catch (e) {
          setVerifyNotice({
            id: t.id, ok: false,
            message: e.code === 'verify-failed' ? String((e && e.message) || '验证未通过') : String((e && e.message) || e),
          })
        } finally {
          taskLocks.release(token)
        }
      }, [selected, anchorRoot, loadLedger])

      // DEV-042：L2 自动回填已停用（AUTO_BACKFILL_ENABLED=false），不再在账本刷新后
      //   自动派发回填子代理写开发进度；函数保留供手动触发路径引用（如需恢复置 true）。
      const maybeAutoBackfill = useCallback(() => {
        if (!AUTO_BACKFILL_ENABLED) return
        if (!selected) return
        const sid = props.sessionId || (props.scope && props.scope.sessionId)
        if (!sid) return
        const now = Date.now()
        if (autoBackfillThrottle.project === selected && now - autoBackfillThrottle.last < 60000) return
        autoBackfillThrottle = { project: selected, last: now }
        postJson('/awf/backfill/auto', {
          path: selected, sessionId: sid, workspaceRoot: anchorRoot || undefined,
        }).catch(() => { /* 自动注入失败静默（不打扰） */ })
      }, [selected, anchorRoot, props.sessionId, props.scope])

      // L2 自动触发：每次账本数据刷新（轮询/SSE/手动）后延时评估一次，避免加载风暴。
      useEffect(() => {
        if (!ledger) return
        const t = setTimeout(maybeAutoBackfill, 1500)
        return () => clearTimeout(t)
      }, [ledger, maybeAutoBackfill])

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
        const token = taskLocks.acquire(selected, { type: f.type, id }, 'todo-add')
        if (!token) return
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
        } finally {
          taskLocks.release(token)
        }
      }, [addForm, selected, anchorRoot, loadLedger])

      // 编辑：打开原位表单（ID 不可改，仅优先级/描述）
      const handleTodoEdit = useCallback((row) => {
        if (taskLocks.busy(selected, row)) return
        const key = row.type + ':' + row.id
        setTodoEdits((m) => Object.assign({}, m, {
          [key]: { prio: row.prio || 'P2', desc: row.desc || '', busy: false, error: null },
        }))
      }, [selected, taskLocks])
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
        const token = taskLocks.acquire(selected, { type, id }, 'todo-edit-save')
        if (!token) return
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
        } finally {
          taskLocks.release(token)
        }
      }, [todoEdits, selected, anchorRoot, loadLedger, closeTodoEdit])

      // 删除：进入行内二次确认 → 确认后 POST /awf/todo delete
      const handleTodoDeleteAsk = useCallback((row) => {
        if (taskLocks.busy(selected, row)) return
        setTodoDeleteKey(row.type + ':' + row.id)
      }, [selected, taskLocks])
      const handleTodoDeleteCancel = useCallback(() => setTodoDeleteKey(null), [])
      const handleTodoDeleteConfirm = useCallback(async (key) => {
        if (!selected) return
        const parts = key.split(':')
        const type = parts[0]
        const id = parts[1]
        const token = taskLocks.acquire(selected, { type, id }, 'todo-delete')
        if (!token) return
        setActionError(null)
        try {
          await runTodoAction({ path: selected, type, action: 'delete', row: { id }, workspaceRoot: anchorRoot || undefined })
          setTodoDeleteKey((cur) => cur === key ? null : cur)
          loadLedger()
        } catch (e) {
          setActionError('删除待办失败：' + apiErrorText(e, '删除失败'))
          setTodoDeleteKey((cur) => cur === key ? null : cur)
        } finally {
          taskLocks.release(token)
        }
      }, [selected, anchorRoot, loadLedger])

      // ---- t5：当前任务编辑 / 暂停 / 继续 -----------------------------------

      const handleTaskEdit = useCallback((t) => {
        if (taskLocks.busy(selected, t)) return
        setTaskEdit({
          id: t.id, type: t.type,
          prio: t.prio || 'P2', status: t.status || 'active',
          owner: t.owner || '', scope: '', desc: t.title || '',
          busy: false, error: null,
        })
      }, [selected, taskLocks])
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
        const token = taskLocks.acquire(selected, f, 'edit-save')
        if (!token) return
        setTaskEdit(Object.assign({}, f, { busy: true, error: null }))
        try {
          await runTaskAction({
            path: selected, type: f.type, id: f.id, action: 'update',
            fields, workspaceRoot: anchorRoot || undefined,
          })
          setTaskEdit((cur) => cur && cur.id === f.id && cur.type === f.type ? null : cur)
          loadLedger()
        } catch (e) {
          setTaskEdit((cur) => (cur && cur.id === f.id && cur.type === f.type ? Object.assign({}, cur, { busy: false, error: apiErrorText(e, '保存失败') }) : cur))
        } finally {
          taskLocks.release(token)
        }
      }, [taskEdit, selected, anchorRoot, loadLedger])

      // 暂停 / 继续（active↔blocked）
      // DEV-039：确定性状态字段写入（程序直写 /awf/task，非判断型动作）——保持不经主会话，
      // 不引入子代理开销；判断型动作（回填/返回待办/删除）才走服务端子代理通道。
      const handleTaskToggle = useCallback(async (t, action) => {
        if (!selected || !t || !t.id) return
        const token = taskLocks.acquire(selected, t, action)
        if (!token) return
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
          taskLocks.release(token)
        }
      }, [selected, anchorRoot, loadLedger])
      const handleTaskPause = useCallback((t) => handleTaskToggle(t, 'pause'), [handleTaskToggle])
      const handleTaskResume = useCallback((t) => handleTaskToggle(t, 'resume'), [handleTaskToggle])

      // 放回待办（撤销开始登记 → 恢复 todo.md 行）
      const handleReturnTodo = useCallback(async (t) => {
        if (!selected || !t || !t.id) return
        const token = taskLocks.acquire(selected, t, 'return-todo')
        if (!token) return
        setActionError(null)
        try {
          // DEV-039：优先服务端子代理通道执行；agents 不可用时服务端自动降级注入主对话
          await runAgentAction({
            action: 'return-todo', path: selected, type: t.type, id: t.id,
            sessionId: props.sessionId || (props.scope && props.scope.sessionId) || undefined,
            workspaceRoot: anchorRoot || undefined,
          })
          loadLedger()
        } catch (e) {
          setActionError('返回待办动作执行失败：' + apiErrorText(e, '操作失败'))
        } finally {
          taskLocks.release(token)
        }
      }, [selected, anchorRoot, loadLedger, props.sessionId, props.scope])

      // ---- t5：待办类型切换 / 源文件查看 ------------------------------------

      const handleTodoTypeChange = useCallback((v) => {
        setTodoType(v === 'debug' || v === 'docs' ? v : 'dev')
        setAddForm(null)
        setTodoEdits({})
        setTodoDeleteKey(null)
      }, [])

      // 打开源文件面板：GET /awf/source（只读）；404 → 「源文件接口未就绪」
      const openSource = useCallback(async (type, file, task) => {
        const t = type === 'debug' || type === 'docs' ? type : 'dev'
        const f = (file === 'current' || file === 'done') ? file : 'todo'
        const meta = task || null // DEV-043：携带任务对象（id/prio/date/title），面板徽章行与归档查看一致
        if (!selected) {
          setSource({ type: t, file: f, busy: false, data: null, copied: false, error: '未选择项目，无法读取源文件。', meta })
          return
        }
        setSource({ type: t, file: f, busy: true, data: null, copied: false, error: null, meta })
        try {
          const res = await fetchSource({ path: selected, type: t, file: f })
          const src = (res && res.source) || null
          if (!src || !src.content) {
            setSource({ type: t, file: f, busy: false, data: null, copied: false, error: '源文件为空或返回异常。', meta })
            return
          }
          setSource({
            type: t, file: f, busy: false, data: src, copied: false, error: null, meta,
            // DEV-106：打开默认预览（阅读态），点「编辑」tab 才进入编辑
            editing: false, draft: null, saveError: null,
          })
        } catch (e) {
          const code = e && e.code
          setSource({
            type: t, file: f, busy: false, data: null, copied: false, error: null, meta,
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

      // DEV-044：项目卡路径复制（短暂反馈「已复制」）
      const [pathCopied, setPathCopied] = useState(false)
      const copyProjectPath = useCallback((pathStr) => {
        copyText(pathStr, (ok) => {
          setPathCopied(ok)
          if (ok) setTimeout(() => setPathCopied(false), 1600)
        })
      }, [])

      // ---- DEV-043：源文件编辑（打开并编辑保存）----
      // 编辑态字段：editing（是否编辑中）/ draft（草稿）/ saving（保存中）/ saveError。
      const sourceEditStart = useCallback(() => {
        setSource((s) => {
          if (!s || !s.data) return s
          return Object.assign({}, s, { editing: true, draft: s.data.content, saveError: null })
        })
      }, [])

      const sourceEditCancel = useCallback(() => {
        setSource((s) => (s ? Object.assign({}, s, { editing: false, draft: null, saveError: null }) : s))
      }, [])

      const sourceDraftChange = useCallback((text) => {
        setSource((s) => (s ? Object.assign({}, s, { draft: text }) : s))
      }, [])

      // 保存写回：POST /awf/source-write → 成功刷新账本并关闭面板；失败内联提示
      const sourceSave = useCallback(async (content) => {
        if (!selected || !source) return
        const s = source
        if (typeof content !== 'string') return
        setSource(Object.assign({}, s, { saving: true, saveError: null }))
        try {
          await postJson('/awf/source-write', {
            path: selected, type: s.type, file: s.file, content,
          })
          setSource(null) // 关闭面板
          loadLedger()    // 刷新账本反映新内容
        } catch (e) {
          setSource(Object.assign({}, s, {
            saving: false,
            saveError: (e && e.code === 'not-found')
              ? '账本文件不存在（只允许写回已存在文件）。'
              : apiErrorText(e, '保存源文件失败'),
          }))
        }
      }, [selected, source, loadLedger])

      // DEV-044 头部工具条已移除：项目名/路径/版本由项目卡集中展示，刷新由 SSE + 15s 轮询承担。
      const header = null

      // DEV-044：版本状态条并入项目卡（见 renderLedgerBody 项目卡），此处不再单独渲染。
      const versionBar = null

      const body = notInit
        ? renderInitCard({
            // DEV-041：needsUpgrade 引导卡按钮的 busy 绑定升级中态（upgrading），
            //   点击后变「更新中…」+旋转动画+禁点；未初始化卡仍用 initBusy
            busy: needsUpgrade ? upgrading : initBusy,
            error: needsUpgrade ? upError : initError,
            onInit: handleInit,
            needsUpgrade,
            onUpgrade: needsUpgrade ? handleUpgrade : undefined,
          })
        : error
          ? renderErrorBody(error, loadLedger)
          : ledger
            ? renderLedgerBody(ledger, {
                // DEV-044 纯看板：只读交互（类型 toggle / 项目路径复制）
                // DEV-043：归档查看与源文件面板同步——最近完成行点击打开 done.md 源文件
                //   （复用 SourcePanel：同款徽章行/内容区/保存按钮，可编辑写回 done.md）
                onOpenArchive: (r) => r && openSource(r.type || 'dev', 'done', r),
                onOpenSource: openSource, // DEV-043：任务行点击打开源文件（current.md）查看/编辑
                actionError,
                todoType,
                onTodoTypeChange: handleTodoTypeChange,
                onCopyPath: copyProjectPath,
                pathCopied,
                versions,
                onUpgrade: handleUpgrade,
                upgrading,
                upError,
                source,
                onCloseSource: closeSource,
                onCopySourcePath: copySourcePath,
                onSourceEditStart: sourceEditStart,
                onSourceEditCancel: sourceEditCancel,
                onSourceDraftChange: sourceDraftChange,
                onSourceSave: sourceSave,
              })
            : renderEmptyBody(projects, {
                onRegister: anchorRoot ? handleRegister : null,
                regBusy,
                regError,
                regLocal,
                onRegLocalToggle: setRegLocal,
                anchorRoot,
              })

      return h('div', {
        style: {
          fontSize: F(13), color: C.text, height: '100%', overflowY: 'auto',
          padding: '12px 12px 20px', boxSizing: 'border-box',
        },
      },
        // 卡片/行 hover 质感 + 焦点/按压反馈 + 统一基础样式 + 进行中动画：一次性注入静态样式（纯手写 h() 无构建）
        h('style', { key: 'awf-hover-css' }, AWF_HOVER_CSS + AWF_UI_CSS + AWF_MOTION_CSS),
        header, versionBar, body,
        archive ? renderArchiveModal(archive, () => setArchive(null)) : null)
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

    /**
     * DEV-035 空态：无法定位当前会话项目时提供「登记当前项目」入口（含仅本地开关）。
     * 看板只跟随当前会话：锚定不到 cwd 才走到这里；无项目下拉选择器。
     * @param {Array<object>|null} projects 项目索引（null=索引未就绪/为空）
     * @param {object} [ui] {onRegister, regBusy, regError, regLocal, onRegLocalToggle, anchorRoot}
     */
    function renderEmptyBody(projects, ui) {
      const U = ui || {}
      // 语义契约：null/undefined=索引未就绪；任何情况都只提示定位当前会话目录。
      const emptyIndex = !Array.isArray(projects)
      const canRegister = typeof U.onRegister === 'function'
      const extras = []
      if (U.anchorRoot) {
        extras.push(h('div', { style: muted({ marginTop: 8, maxWidth: 280, wordBreak: 'break-all' }) },
          '当前会话目录：' + U.anchorRoot))
      }
      if (canRegister) {
        extras.push(h('label', {
          style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: F(12), color: C.text, cursor: 'pointer' },
        },
          h('input', {
            type: 'checkbox',
            checked: !!U.regLocal,
            onChange: (ev) => { if (typeof U.onRegLocalToggle === 'function') U.onRegLocalToggle(!!ev.target.checked) },
            style: { accentColor: C.accent },
          }),
          '仅本地（不推送到远端）'))
        extras.push(h('button', {
          onClick: U.onRegister,
          disabled: !!U.regBusy,
          title: U.anchorRoot ? '登记当前会话目录：' + U.anchorRoot : undefined,
          style: Object.assign(buttonStyle(true), {
            marginTop: 12, opacity: U.regBusy ? 0.6 : 1,
            cursor: U.regBusy ? 'default' : 'pointer',
          }),
        }, '登记当前项目'))
      }
      if (U.regError) {
        extras.push(h('div', { style: { marginTop: 8, fontSize: F(12), color: C.error } }, U.regError))
      }
      return h(EmptyState, {
        icon: '🗂️',
        title: emptyIndex ? '无法定位当前会话项目' : '无法定位当前会话项目',
        desc: emptyIndex
          ? '看板只显示当前会话所在项目。未能从会话信息解析出工作目录，可一键登记当前项目（无工作流时自动生成骨架）。'
          : '看板只显示当前会话所在项目。未能从会话信息解析出工作目录，可一键登记当前会话目录。',
        extra: extras.length ? h('div', null, ...extras) : null,
      })
    }

    /**
     * DEV-035 框架版本状态条。
     * @param {object} vs {status: latest|outdated|unknown, installed, scaffold, latestAWF, latestRelease, upgradeTo}
     * @param {object} [ui] {onUpgrade, upgrading, upError}
     */
    function renderVersionBar(vs, ui) {
      const U = ui || {}
      if (!vs) return null
      if (vs.status === 'latest') {
        return h('div', {
          style: Object.assign(muted({ marginBottom: 8 }), {
            fontSize: F(11), display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          }),
        },
          h('span', { style: { color: C.success } }, '●'),
          '工作流已最新',
          vs.installed ? h('span', null, `（${vs.installed}${vs.scaffold ? ' · ' + vs.scaffold : ''}）`) : null)
      }
      if (vs.status === 'outdated') {
        return h('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '6px 8px',
            fontSize: F(12), borderRadius: C.radiusSm, flexWrap: 'wrap',
            background: 'color-mix(in srgb, ' + C.error + ' 10%, transparent)',
            color: C.text, border: '1px solid ' + C.error,
          },
        },
          h('span', { style: { color: C.error } }, '⚠'),
          h('span', null, `工作流可升级：${vs.installed || vs.scaffold || '未知'} → ${vs.upgradeTo || '最新'}`),
          U.upgrading ? h('span', { style: { fontSize: F(11), color: C.success } }, '升级指令已发给 agent，完成后自动刷新')
            : typeof U.onUpgrade === 'function'
              ? h('button', {
                  onClick: U.onUpgrade,
                  style: Object.assign(buttonStyle(true), {
                    padding: '2px 10px', minHeight: 0, fontSize: F(12), cursor: 'pointer',
                  }),
                }, '去升级')
              : null,
          U.upError ? h('div', { style: { fontSize: F(11), color: C.error, width: '100%' } }, U.upError) : null)
      }
      return h('div', {
        style: Object.assign(muted({ marginBottom: 8 }), { fontSize: F(11) }),
      }, '未检测到版本源（登记 agent-workflow-kit 项目后可对比框架版本）')
    }

    /**
     * 账本看板主体。
     * @param {object} ledger /awf/ledger 的 ledger 字段
     * @param {object} [ui] 交互回调（均可选）：
     *   t2：{onStart, onOpenArchive, onDelete, deleting, actionError}
     *   t5 todo CRUD：{todoType, onTodoTypeChange, onTodoAdd, todoAddForm, onTodoAddChange,
     *                  onTodoAddSave, onTodoAddCancel, onTodoEdit, todoEdits, onTodoEditChange,
     *                  onTodoEditSave, onTodoEditCancel, onTodoDelete, todoDeleteKey,
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
            borderRadius: 8, fontSize: F(12), color: C.error, wordBreak: 'break-all',
            border: '1px solid color-mix(in srgb, ' + C.error + ' 40%, transparent)',
            background: 'color-mix(in srgb, ' + C.error + ' 7%, transparent)',
          },
        }, h('span', {}, '⚠️'), h('span', {}, U.actionError)))
      }

      // ---- 项目卡（DEV-044 简洁版）：名称（+版本号）/ 路径 + 复制按钮（无账本状态徽章）
      const proj = ledger.project || {}
      const vs = U.versions || null
      // 版本号并入第一栏：latest → 绿点 + v{installed}；outdated → 黄点 + 可升级（点击去升级）。
      // 版本信号不存在时（未登记 kit / 读不到 AWF_VERSION）不显示。
      const upgradable = vs && (vs.status === 'outdated' || vs.status === 'unknown') && typeof U.onUpgrade === 'function'
      const versionChip = vs && vs.installed
        ? h('button', {
            onClick: upgradable ? U.onUpgrade : undefined,
            disabled: !upgradable || !!U.upgrading,
            title: vs.status === 'latest' ? '工作流已最新'
              : (vs.status === 'outdated' ? '工作流可升级：' + (vs.installed || vs.scaffold || '?') + ' → ' + (vs.upgradeTo || '最新') + '（点击升级）' : '框架版本'),
            style: {
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: F(11), color: vs.status === 'outdated' ? C.warn : C.dim,
              background: C.surface,
              border: '1px solid color-mix(in srgb, ' + (vs.status === 'outdated' ? C.warn : C.border) + ' 55%, transparent)',
              borderRadius: C.radiusSm, padding: '1px 7px', flexShrink: 0, fontWeight: 600,
              opacity: U.upgrading ? 0.6 : 1, cursor: upgradable && !U.upgrading ? 'pointer' : 'default',
            },
          },
            vs.status === 'latest' ? h('span', { style: { color: C.success, fontWeight: 700 } }, '●') : null,
            vs.status === 'outdated' ? h('span', { style: { color: C.warn, fontWeight: 700 } }, '⚠') : null,
            String(vs.installed || ''))
        : null
      const copyBtn = typeof U.onCopyPath === 'function' && proj.path
        ? h('button', {
            className: 'awf-icon-btn' + (U.pathCopied ? ' awf-icon-btn-ok' : ''),
            onClick: () => U.onCopyPath(proj.path),
            title: '复制项目路径到剪贴板',
          }, U.pathCopied ? '✓' : '⧉')
        : null
      items.push(h('div', {
        key: 'proj',
        style: Object.assign({}, cardStyle, {
          padding: '12px 14px', marginBottom: 0,
          background: 'linear-gradient(180deg, ' + C.raised + ', ' + C.surface + ')',
        }),
      },
        h('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
        },
          h('div', { style: { fontSize: 14, fontWeight: 800, color: C.text, lineHeight: 1.3, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            proj.name || '未命名项目'),
          versionChip),
        h('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: 6,
            marginTop: 3, minWidth: 0,
          },
        },
          h('div', { style: { fontFamily: C.mono, fontSize: F(11), color: C.faint, wordBreak: 'break-all', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            proj.path || ''),
          copyBtn)))

      // ---- 当前任务（DEV-024：宽面板两列网格，窄面板 auto-fit 自动回退单列）
      items.push(h(SectionTitle, { key: 'cur-h', label: '当前任务', count: ledger.current.length }))
      if (ledger.current.length > 0) {
        const taskCards = []
        ledger.current.forEach((t, i) => {
          taskCards.push(h(TaskCard, {
            key: 'cur-' + i, t, flush: true,
            onOpenSource: U.onOpenSource,
          }))
        })
        items.push(h('div', {
          key: 'cur-grid',
          className: 'awf-tasks',
          style: {
            // 任务卡恢复单列：步骤条、验收进度和操作区内容高度不同，双列会造成行内卡片错位。
            display: 'flex', flexDirection: 'column',
            gap: 10, width: '100%',
            // DEV-043：长列表滚动容器——任务多时不撑高面板，区域内滚动
            maxHeight: 320, overflowY: 'auto',
            paddingRight: 4,
          },
        }, taskCards))
      } else {
        items.push(h('div', {
          key: 'cur-none',
          style: {
            color: C.faint, fontSize: F(12), textAlign: 'center',
            padding: '10px 0', borderBottom: '1px solid ' + C.hairline,
          },
        }, '当前无进行中任务 · 全部空闲'))
      }

      // ---- 待办（类型 toggle + 该类型未开始任务行；todo.md 是表格行，无进度条）
      // DEV-100：区块常驻渲染——某类型 todo/todoRows 全空也渲染（「未开始任务 · 类型」+ 空态）；
      // 各类型 tab 挂未开始任务数量徽章（数据只取自 ledger.todoRows 过滤计数）；
      // 标题行不再重复数量（用户反馈：tab 徽章与标题数量重复，保留 tab 徽章一处）。
      const selType = (U.todoType && (U.todoType === 'dev' || U.todoType === 'debug' || U.todoType === 'docs')) ? U.todoType : 'dev'
      const typeRows = todoRows.filter((r) => r.type === selType)
      const todoCounts = { dev: 0, debug: 0, docs: 0 }
      for (const r of todoRows) {
        if (r.type === 'dev' || r.type === 'debug' || r.type === 'docs') todoCounts[r.type]++
      }
      items.push(h(SectionTitle, { key: 'todo-h', label: '待办' }))
      const cardChildren = []
      cardChildren.push(h('div', { key: 'toggle', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' } },
        h(TypeToggle, { value: selType, counts: todoCounts, onChange: U.onTodoTypeChange })))
      cardChildren.push(h('div', {
        key: 'rows-title',
        style: {
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 8,
          borderTop: '1px solid ' + C.hairline,
        },
      },
        h('span', { style: { fontSize: F(12), fontWeight: 700, color: C.sub } }, '未开始任务 · ' + TYPE_LABEL(selType))))
      if (typeRows.length > 0) {
        cardChildren.push(h('div', {
          key: 'rows',
          style: {
            // DEV-043：待办长列表滚动容器（同当前任务）
            maxHeight: 280, overflowY: 'auto', paddingRight: 4,
          },
        },
          typeRows.map((r) => {
            const key = r.type + ':' + r.id
            return h(TodoRow, { key, row: r, onOpen: U.onOpenSource })
          })))
      } else {
        cardChildren.push(h('div', {
          key: 'rows-empty',
          style: {
            padding: '10px 0', textAlign: 'center',
            color: C.faint, fontSize: F(12),
          },
        }, '该类型暂无未开始任务'))
      }
      items.push(h('div', { key: 'todo' }, cardChildren))

      // ---- 最近完成（仅 5 条，可点击查看归档）
      if (recent.length > 0) {
        items.push(h(SectionTitle, { key: 'recent-h', label: '最近完成', count: recent.length }))
        items.push(h('div', { key: 'recent' },
          recent.map((r, i) => h(RecentRow, { key: 'recent-' + i, r, onOpen: U.onOpenArchive }))))
      }

      // 源文件查看面板（覆盖层；只读 .md 展示 + 复制路径；DEV-043 起可编辑保存）
      if (U.source) {
        items.push(h(SourcePanel, {
          key: 'source-panel',
          src: U.source,
          onClose: U.onCloseSource,
          onCopy: U.onCopySourcePath,
          onSave: U.onSourceSave,
          onEditStart: U.onSourceEditStart,
          onEditCancel: U.onSourceEditCancel,
          onDraftChange: U.onSourceDraftChange,
        }))
      }

      return h('div', { style: { marginTop: 6 } }, items)
    }

    function TYPE_LABEL(type) {
      const s = TYPE_STYLE[type]
      return s ? s.label : (type || '其他')
    }

    function TabTitle() {
      return h('span', { style: { fontWeight: 600, fontSize: F(12) } }, 'Agent Workflow')
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
    exports.Dashboard = Dashboard
    exports.renderLedgerBody = renderLedgerBody
    exports.renderErrorBody = renderErrorBody
    exports.renderEmptyBody = renderEmptyBody
    exports.renderVersionBar = renderVersionBar
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
    exports.runAgentAction = runAgentAction
    exports.actionAgentEndpoint = actionAgentEndpoint
    exports.agentNotice = agentNotice
    exports.taskActionKey = taskActionKey
    exports.createTaskActionLock = createTaskActionLock
    exports.fetchSource = fetchSource
    exports.copyText = copyText
    exports.WORKFLOW_STEPS = WORKFLOW_STEPS
    exports.inferWorkflowStage = inferWorkflowStage
    return module.exports
  },
})