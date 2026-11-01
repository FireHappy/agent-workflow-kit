# DEV-024 Agent Workflow 面板 UI 走查与优化方案

> 任务 t1（frontend-dev，2026-11-01）。范围：`dsh-plugin/lib/client.js` 渲染的右侧边栏「Agent Workflow」面板。
> 方法：源码逐行走查 + 真实宿主 GUI（127.0.0.1:62936，暗色主题，面板内容宽 606px）实机测量
> （computed style 采样）；演示项目覆盖 active / verify / review / blocked / handoff 五种状态、todo 行、最近完成与验收进度。
> 本文档是**走查结论 + 优化方案 + 可执行实现清单**，默认不动生产代码（本次仅新增本文档）。

---

## 1. 现状总览（实机测量基线）

| 维度 | 实测值 |
|---|---|
| 面板内容宽 | 606px（原生右侧页签宿主 630px） |
| 根容器 | `padding: 12px 12px 20px`，`font-size: 13px`，透明背景 |
| 字体档位 | **11 档**：8.5 / 9 / 10 / 10.5 / 11 / 11.5 / 12 / 12.5 / 13 / 14 / 15 px（叶子节点统计：<11px 共约 136 处，86 处 11px，64 处 10px，36 处 8.5px） |
| 圆角档位 | 999(66) / 99(30) / 50%(59) / 10px(9) / 8px(9) / 6px(3) / 2px(3) —— 胶囊按钮与方块按钮并存 |
| 任务卡 | 6 张全等宽 601px、全等高 **170px**；每张内嵌完整 6 步工作流轨道 |
| 主体总高 | 6 任务 + 待办 + 最近完成 + 项目卡 = **1654px**（视口 742px，约 2.2 屏） |
| 按钮高度 | 主操作 24px（开始）~ 19px（删除）不等；字 10–11px |
| 步骤条 | 节点 15px 圆；**标签 8.5px**；轨道头计数 10px；暂停 ⏸ 9px |
| 状态/类型色 | 全部走 DSH 令牌（无硬编码杂色）✅，但**语义撞色**（见 §3.3） |

对照：宿主同侧栏兄弟组件（dsh-better-sidebar kit）规范为 12px 正文 / 11px meta / 28px 控件、圆角 2/3/4/8、颜色 token-only。AWF 面板整体**字号与控件尺度比兄弟 UI 偏小、档位过碎**，是「整体 UI 不满意」的主要视觉来源。

---

## 2. 逐区块问题清单

### 2.1 布局层次（Acceptance 1）
1. **头部冗余**：页签标题已叫「Agent Workflow」，面板内又渲染 14px 粗体大标题 + 子标题（`client.js:1807-1815`），占 32px 但零信息增量。
2. **任务区无分组层次**：6 张任务卡平铺，`当前任务` 区没有「主要任务/其他」或主次之分；每张卡 170px、样式均质，第一屏全是任务卡侧写，区块节奏感弱。
3. **待办计数只在分区标题**：`当前任务(n)` 计数 pill 15px 高、11px 字，与卡片对比弱。
4. 面板宽 606px 却始终单列：任务卡内部行、徽章行大量留空（徽章行实际占用 ~180px），右侧 300px+ 闲置。

### 2.2 信息密度
5. **每张任务卡内嵌完整 6 步轨道**（`WorkflowSteps`，`client.js:971-1082`，卡高主要贡献者）：6 张卡即渲染 6 个轨道 × 30+ 节点、连接线、计数行。重复信息密度高、单卡信息增益低。
6. 卡片底部 meta 行（Owner 头像圆 + 文字、↻ 更新、协作模式）三块同排 11px，但 Owner 已经以徽章形式出现在徽章行（`client.js:654-657`）——**同一信息两处呈现**。
7. 「刷新中/刷新」按钮随 15s 轮询频繁闪烁 loading 文案（`client.js:1811-1815` + `loadLedger` 每次 setLoading(true)），干扰视觉。
8. `TodoBar`（`client.js:608-633`）为 DEV-022 移除待办进度条后的**死代码**（无任何调用点）。

### 2.3 间距 / 圆角 / 字号（Acceptance 2）
9. 字号 11 档且 5 档低于 11px meta 下限（8.5/9/10/10.5）；步骤标签 8.5px、节点符号 9-10px，基本不可读也不符合可点控件最小尺寸。
10. 圆角随意：胶囊 button（999）、方块 dangerSolid（8）、输入框（6）、select（8）、轨道（8）并存；按钮高度 19–24px 三档不一。
11. 间距基本贴合 4px 网格，但卡片 padding（10/12/9）与轨道 padding（8/10）、分区标题 margin（14/8）存在 2px 级抖动；卡片间距 8px 偏挤。
12. 颜色全部 token 化 ✅，但徽章底色全部用 `color-mix(色 13%/34%)` 手调配方（`Pill`，`client.js:227-241`），未用主题自带的 tertiary/secondary 变体令牌，深浅主题下对比不稳。

### 2.4 状态徽章与语义可视化（Acceptance 3）
13. **review（待复核）与 handoff（交接）同为琥珀色**（`STATUS_STYLE`，`client.js:69,72`）：演示数据里两者相邻出现，只能靠文字区分。
14. **类型色与状态色系统撞色**：`TYPE_STYLE` docs=绿（=verify 绿）、dev=蓝（=active 蓝）、debug=琥珀（=review 琥珀）。docs 任务在 verify/review 态时类型徽章与状态徽章完全同色。
15. `PRIO_COLOR` P1=琥珀（=review 色）、P2=蓝（=active 色）、P0=红（=blocked 色）：优先级、类型、状态三套语义共用 4 个色相，视觉编码互相污染。
16. blocked 徽章文案「已暂停」+ 红点 ✅ 语义明确（灰色 = 未到阶段也保持正确：未到节点用 `C.faint`，符合「灰色=未到而非失效」）。

### 2.5 步骤条与计数（Acceptance 4）
17. 步骤轨道本身结构正确（15px 圆、白点光圈、✓/⏸ 符号、awf-step 三态类，DEV-023 裁剪修复已生效），但**标签 8.5px 过小**；「选择诊断方式」等 6 字标签与 8px 连接线在窄卡内拥挤。
18. 轨道头计数行（`✓ 已完成 2 · 当前 · 实现 · 待办 3`）10px 字号，与右侧「开发 · 流程」组在 575px 轨道内尚无冲突，但字号低于 meta 下限。
19. 光圈 3px（`boxShadow 0 0 0 3px`）在紧凑布局里易形成「被裁」观感（历史用户反馈），可收敛为 2px。

### 2.6 任务卡 / todo 行 / 交互反馈（Acceptance 5）
20. 卡片/行 hover（`AWF_HOVER_CSS`，`client.js:141-147`）✅；但**无 :focus-visible 样式**、无 :active 按压反馈；按钮 busy 只改 opacity。
21. todo 行一行三按钮高度不一（开始 24 / 编辑 20 / 删除 19）、字号不一（11 / 10 / 10.5），行内控件不齐。
22. TypeToggle（`client.js:919-939`）21px 高，低于兄弟 kit 28px 控件下限；选中态用 accent 18% 底 + 40% 描边，与 kit 的 `interactive-bg-hover-accent` 语言不一致。
23. 行内删除确认（红色左边条 + 文案）✅ 明确；卡片删除走模态二次确认 ✅（实测：无回退能力时只给「仅删除账本/取消」，默认聚焦取消）。
24. 「＋新增」按钮 10px 字、20px 高，与「收起」切换时无过渡。

### 2.7 空态 / 未初始化引导 / 错误态（Acceptance 6）
25. 空态（`renderEmptyBody`，`client.js:1925-1950`）、错误态（`renderErrorBody`，1905-1923）、初始化引导（`renderInitCard`，1333-1360）三处各自手写 emoji + dashed 边框，视觉语言不统一：图标 22-26px、无情感层次、错误/空态装饰弱。
26. 引导卡可优化为正式 onboarding 形态（宿主有 `--dsw-alias-onboarding-*` 令牌），当前 `🚀 + accent 5% 底` 已可用但偏玩具感。

### 2.8 功能缺陷（走查附带发现，非纯视觉）
27. **验收进度条集成断链【高】**：服务端 `ledgerOf` 产出 `checkItems = {done, total, items:[...]}`（`src/ledger.js:224`），而 `TaskCheckProgress`（`client.js:942-963`）按**数组**消费（`items.length`）→ 真实面板中**验收进度永不渲染**。单测 `t5 当前任务验收进度`（`client-chunk.test.js:861-879`）把 `checkItems` 当成数组直接注入，掩盖了与真实服务端的契约不一致。实机验证：ledger 返回 checkItems 但 UI 无「验收进度」。
28. 刷新按钮 loading 闪文案（见 #7）。
29. `TodoBar` 死代码（见 #8）。

---

## 3. 优化方案

### 3.0 设计总则（对齐兄弟 kit 的「12/11/28」尺度）
- 字号收敛到 **5 档**：`xxxs-11`（meta/徽章）· `xxs-12`（正文/行）· `s-13`（卡片标题/主正文）· `14`（项目名）· 删除 ≤10.5px 档。
- 控件高度统一 **24px**（侧栏面板密集场景低于 kit 28px 但保持一致），输入/按钮/切换器同高同圆角。
- 圆角三档：卡片/轨道 **10px**（`--dsl-web-radius`）· 控件/输入 **6px** · 徽章/胶囊 **999px**。
- 间距走 **4px 网格**：卡片间距 8→10，卡片 padding → `12px 14px`，分区标题 `16px 上 / 10px 下`，轨道 padding → `10px 12px`。
- 颜色：全部 DSH 令牌，**徽章底色改用主题二级/三级变体令牌**，替换 `color-mix 13%/34%` 配方；遮罩改用 `--dsw-alias-bg-mask-*`。

### 3.1 目标布局（Acceptance 1）
```
┌ Toolbar（1 行，32px）─────────────────────────────┐
│ [项目▼（主控件）] [已锚定 pill]      [刷新]        │
├ 项目卡：名称 / 路径 / 新鲜度 pill / purpose ────────┤
├ 当前任务  计数 pill ───────────────────────────────┤
│ ┌ 任务卡(主) ─────────┐ ┌ 任务卡 ───────────────┐   │  ← 宽面板(≥560px) 两列 grid
│ │ 徽章行+ID │ 步骤条    │ │ 徽章行+ID │ 步骤条    │   │    窄面板回退单列
│ │ 标题 / 验收进度      │ │ 标题 / 验收进度      │   │
│ └ 底部 meta · 操作 ────┘ └ 底部 meta · 操作 ────┘   │
├ 待办：类型 toggle ＋ 行列表 ───────────────────────┤
├ 最近完成：行列表 ──────────────────────────────────┤
└ footer（自动刷新提示）─────────────────────────────┘
```
- 移除面板内大标题（页签标题已承担），头部变为工具条：项目下拉为主控件。
- **任务卡两列网格**（`grid-template-columns: repeat(auto-fit, minmax(250px, 1fr))`，容器 `renderLedgerBody` 当前任务区）——606px 宽下每卡 ~290px，卡片高度由 170 → ~200（两行内换行），但总高度腰斩。窄面板（<520px，可给网格容器加 `min-width` 检测或直接依赖 auto-fit 回退单列）自动回退。
- 步骤条保持单轨（t8 契约 `awf-track` 不动），仅将连接线 `minWidth 8→6`、标签 8.5→10.5px、光圈 3→2px 以适配紧凑卡。
- 分级信息：主任务（active 且无 checkItems 阻断的）不特殊处理；以 grid 对齐 + 卡片 hover 层级表达主次，避免引入额外「主任务」概念（后端不动）。

### 3.2 色板令牌映射（Acceptance 2/3，C 对象 `client.js:42-59` 扩展）

| 语义 | 现状 | 目标令牌（含回退值） |
|---|---|---|
| 状态 active | business 蓝 | `--dsw-alias-state-business-primary`（不变） |
| 状态 verify | success 绿 | `--dsw-alias-state-success-primary`（不变） |
| 状态 review | warn 琥珀 | `--dsw-alias-state-warn-primary`（不变） |
| 状态 blocked | error 红 | `--dsw-alias-state-error-primary`（不变）+ ⏸ 符号（已有） |
| 状态 **handoff** | ~~warn（撞色）~~ | **`--dsw-alias-state-idle-primary`（中性流转蓝灰）+ 环形样式（无实底，描边+点）**，与 review 彻底区分 |
| 徽章底色 | `color-mix(色 13%)` | `--dsw-alias-state-success-tertiary` / `state-warn-tertiary` / `state-business-tertiary` / `state-error-secondary` 等变体（Pill 加 `variant` 参数） |
| 徽章描边 | `color-mix(色 34%)` | 同色 `*-secondary`/`*-tertiary` 降 1 档，或保留 color-mix 仅一处封装 |
| 类型徽章 | dev/debug/docs 三彩 | **中性 chip**：`C.sub` 文字 + `--dsw-alias-border-l1` 描边 + 无彩底（语义色位让给状态/优先级） |
| 优先级 P0 | 红浅底 | 红**实底白字**（`dangerSolid` 同款 pill 变体） |
| P1/P2/P3 | 琥珀/蓝/灰浅底 | 分别 warn/business 浅底、P3 `label-tertiary` 中性浅底（实底=最高级，浅底=次级，双层编码） |
| 模态遮罩 | `rgba(0,0,0,0.45)` | `--dsw-alias-bg-mask-1, rgba(0,0,0,0.45)` |
| 环境/图底 | `color-mix(C.surface 45%)` | `--dsw-alias-bg-layer-1/-2`（已有 C.surface/C.raised，直接用） |
| 引导卡 | accent 5% 底 | `--dsw-alias-onboarding-card-fill` / `--dsw-alias-onboarding-accent` 降级 `C.accent 5%` |
| 空态/错误 | 各自色系 | 统一 `EmptyState`：`error → state-error-primary`、空 → `label-tertiary`、引导 → onboarding-accent |
| 滚动条（可选） | 默认 | `--dsw-alias-scrollbar-bg-l2` / `scrollbar-hover-l2` |

### 3.3 组件级改动点（client.js 行号锚定）

| # | 组件 | 行号 | 改动 |
|---|---|---|---|
| 1 | `C` 常量 | 42-59 | 新增 `C.idle`、`C.bgMask`、`C.radiusMd/Sm`、`C.fontS/XXS/XXXS`（语义字号变量）、`C.businessT/warnT/successT/errorS`（变体令牌）；删除不再使用的 `C.dim` 分档或保留兼容 |
| 2 | `TYPE_STYLE` | 61-66 | 三类型改为中性 chip 样式（color 统一 `C.sub`/border-l1），`STATUS_STYLE` 仅改 handoff → `C.idle` + 环形 variant |
| 3 | `PRIO_COLOR` | 75-79 | P0 加 `solid:true` 标志；P3 用 `C.faint` |
| 4 | `Pill` | 227-241 | 加 `variant: 'solid'\|'ring'\|'soft'`；底色改用 tertiary/secondary 变体令牌；ring = 无底 + 描边 + 点 |
| 5 | `SectionTitle` | 249-261 | 字号 12.5→12（xxs-strong），计数 pill 高 15→16、字 11；margin `14/8`→`16/10` |
| 6 | 头部 | 1807-1815 | 移除大标题+子标题，工具条化：左=项目区块，右=刷新；刷新按钮 label 恒定「刷新」，busy 仅 disabled+opacity（修 #7/#28） |
| 7 | 项目卡 | 1988-2019 | padding `12/14`；名称 15→14（s-strong）；purpose 底用 business-tertiary |
| 8 | 当前任务区 | 2021-2047 | 包一层 grid 容器（两列回退单列）；空态卡改用统一样式 |
| 9 | `TaskCard` | 639-778 | 卡片 padding `12px 14px`；徽章行 gap 4→6；类型 chip + 状态/优先级 Pill + Owner chip；标题 12.5→13；按钮统一 24px 高 / 11px 字 / radius 6 / 文案一致（编辑/暂停/开始/删除），busy 态统一；meta 行删除重复的 Owner 文字（保留头像圆） |
| 10 | `TaskCheckProgress` | 942-963 | **修集成断链**：兼容 `{done,total,items}` 与服务端契约（`items = ci.items; done = ci.done`），数组形态继续兼容（修 #27）。加单测（见 §5） |
| 11 | `WorkflowSteps` | 971-1082 | 标签 8.5→10.5px；轨道 padding `8/10`→`10/12`、mt 8→10；连接线 minWidth 8→6、高度 2 保留；光圈 3→2px；轨道头 10→11px；计数行间距 8→10 |
| 12 | `TypeToggle` | 919-939 | 高 21→24px；文字 11→11.5（与按钮一致 11 即可）；选中态改 `interactive-bg-hover-accent` 底 + `state-business-primary` 描边（对齐 kit chipActive） |
| 13 | `TodoRow` | 810-913 | 三按钮统一 22px 高 / 11px / radius 6；行内删除确认与编辑态保持现有语义色与虚线边框 |
| 14 | `TodoAddForm` | 1087-1126 | padding 与输入控件对齐 24px 高；虚线框改 business 语义（已有 accent → `C.businessT`） |
| 15 | `renderInitCard` | 1333-1360 | 用 onboarding 令牌；图标/文案层级调整；按钮 24px 高 |
| 16 | `renderEmptyBody` / `renderErrorBody` | 1925-1950 / 1905-1923 | 抽 `EmptyState({icon,tone,title,desc,action})` 统一三态；dashed 边框 + token 底色 |
| 17 | `ModalShell` / `renderDeleteModal` / `renderArchiveModal` / `SourcePanel` | 264-295 / 1185-1292 / 1295-1330 / 1133-1182 | 遮罩用 `C.bgMask`；标题 13.5→13；按钮统一 24px；文件行 padding `5/9`→`6/10` |
| 18 | `TodoBar` | 608-633 | **删除死代码**（修 #29） |
| 19 | `AWF_HOVER_CSS` | 141-147 | 补充 `:focus-visible`（outline accent）、`:active` 按压反馈、按钮 hover 统一过渡 |
| 20 | 滚动条容器 | 1886-1900 | 可选：`scrollbar` 样式用 `--dsw-alias-scrollbar-*` 令牌 |

---

## 4. 可执行实现清单（Implementer 可直接开工）

> 排序 = 建议实施顺序；每项标注验收映射（A=DEV-024 验收标准条款）与回归约束（T=单测契约，须保持）。

- [ ] **P0-1 修验收进度集成断链**（#27，A3/A2，T:`t5 当前任务验收进度` 需扩展为真实 checkItems 结构断言）
  - `TaskCheckProgress`：`items` 兼容 `{done,total,items}`；ledger 直通 `t.checkItems`（`client.js:725`）。
  - 新增单测：`renderLedgerBody` 注入 `checkItems:{done,total,items}`（服务端形态）必须渲染「验收进度 2/4 · 50%」。
- [ ] **P0-2 语义色重构**（#13-15，A3，T：改 `STATUS_STYLE/TYPE_STYLE/PRIO_COLOR` 为纯数据，测试只断言文案不深拷颜色，`collectTexts` 不受影响）
  - handoff → idle 环形；类型牌中性化；P0 实底；`Pill` 加 variant。
  - 回归：`t7 看板质感`（awf-card/awf-row/Owner 徽章文本）不受影响。
- [ ] **P0-3 字号/尺度收拢**（#9-11, A2）：实施 §3.0 五档字号 + 24px 控件 + 三档圆角；删除 ≤10.5px 档；步骤标签 ≥10.5px。
- [ ] **P1-1 头部工具条化 + 刷新按钮 loading 文案修复**（#1, #7; A1）
- [ ] **P1-2 当前任务区 grid 两列（宽面板自适应回退单列）**（#4, A1）：新增渲染容器；`auto-fit,minmax(250px,1fr)`。
- [ ] **P1-3 任务卡/todo 按钮统一高度与反馈**（#21-24, A5）：24px、:focus-visible/:active CSS。
- [ ] **P1-4 步骤条紧凑化**（#17-19, A4）：标签 10.5px、连接线 6px、光圈 2px、轨道 padding 10/12。
- [ ] **P2-1 徽章底色换变体令牌**（#12, A2）：Pill tertiary/secondary。
- [ ] **P2-2 空态/引导/错误态统一 EmptyState**（#25-26, A6）。
- [ ] **P2-3 模态令牌化 + 按钮统一**（#17, A2）。
- [ ] **P2-4 删除死代码 `TodoBar`**（#29）。
- [ ] **P2-5 项目卡/分区标题间距微调**（#11, A2）。
- [ ] **收尾清理**：删除演示索引行 `awf-walkthrough-demo`（及历史残留 `awf-preview-demo`/`awf-step-demo`/`awf-step-demo2`）于 `~/.agents/projects.tsv` 与 `~/.agents/AGENTS.md`；删除 `/tmp/awf-walkthrough-demo`。

### 回归约束（实现时必须保持）
- `node --test dsh-plugin/test/ledger.test.js dsh-plugin/test/client-chunk.test.js` 58+ 项全绿；以下契约不得破坏：
  - `awf-card` / `awf-row` / `awf-track` / `awf-step(-cur|-done|-pend)` / `awf-badge-row` 类名；
  - 文案：`当前无进行中任务`、`未开始任务 · 开发`、`账本新鲜/账本过期`、`请运行 awf status`、`已完成 2/当前 · 实现/待办 3`、`已暂停 · 实现`、`初始化工作流`、`✓`/`⏸` 且**不含 `●`**；`最近完成`只显示 5 条；todo 区不出现「待办进度」/`2/5`。
- 单测中 `checkItems` 数组形态的兼容分支保留（新断言叠加而非替换）。
- 不引入外部依赖、不引入构建步骤；颜色继续 token-only（新增硬编码色会被门禁/评审拒绝）。

### GUI 目视验收（captain 收尾）
1. 打开右侧边栏 → Agent Workflow（真实项目 agent-workflow-kit）。
2. 切到演示项目 `/tmp/awf-walkthrough-demo`（含 6 任务全状态），核对：5 状态徽章两两可辨、类型牌中性、P0 实底、验收进度条出现（P0-1 生效）、两列网格、步骤条标签可读、hover/focus 反馈。
3. 未初始化项目 → 引导卡（onboarding 风格）；断网/错误 → 错误态；空索引 → 空态。
4. 深色/浅色主题各过一遍（令牌自动跟随）。

## 5. 附：实机证据
- 全页与顶部截图：`~/Downloads/awf-walkthrough-dev-024-full.jpg`、`awf-walkthrough-dev-024-top.jpg`
- 走查环境：宿主 GUI `http://127.0.0.1:62936`（暗色），面板内容宽 606px，computed-style 采样如上表。
- 演示项目：`/tmp/awf-walkthrough-demo`（临时，收尾删除）。