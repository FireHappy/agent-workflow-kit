# dsh-awf-dashboard

agent-workflow 工作流看板（DSH 客户端插件）：在处理需求时，在 DSH 右侧边栏的 **Agent Workflow** 页签可视化查看项目账本——当前任务状态、todo 进度、最近完成、status.md 新鲜度；并提供未初始化引导、开始任务与归档查看等交互。

## 定位（为什么做这个插件）

1. **让 agent 的开发更规范**：账本（todo → active → verify → review → 归档）是开发流程的唯一事实源，agent 的一切开发动作都遵循工作流纪律；插件把流程可视化、可强制，**判断型写操作（返回待办/删除/回退）由 agent 执行**，程序不绕过 agent 直接改账本。
2. **让用户更方便地使用 agent**：面板按钮是意图入口，用户点一下即把操作指令注入主对话 agent（sessionController.prompt），agent 干剩下的事——减少重复输入长指令；程序以账本数据状态驱动页面刷新，agent 写账本后 UI 自动反映。

架构原则：账本文件是唯一事实源，程序只做「读账本渲染 + 注入意图」，写操作收敛到 agent。

- 数据源：各项目的 `agent-workflow/tasks/{dev,debug,docs}/{todo,current,done}.md` 与 `status.md`（账本读取只读；交互写操作走下方安全路由）
- 服务端路由（全部走宿主连接认证围栏，错误统一 `{ok:false, error:{code,message}}`）：
  - `GET  /awf/projects`（全局索引）
  - `GET  /awf/ledger?path=<项目根>`（账本看板；未初始化项目返回 400 bad-request 或缺省标识，前端据此显示初始化引导）
  - `POST /awf/init`（未初始化引导：生成骨架，白名单 = 绝对路径 ∧（全局索引 ∨ 客户端上报 workspaceRoot），零外部命令）
  - `POST /awf/init/agent`（DEV-183 起初始化与升级一致：**注入主会话**由当前会话 agent 完整配置；body `{path, workspaceRoot, sessionId, gitignore?}`，`gitignore: true` 时指令附加「写入 .gitignore 忽略工作流」步骤）
  - `POST /awf/task/start`（开始任务：todo 表格行 → current.md active 任务块）
  - `GET  /awf/archive?path=&id=`（归档只读查看：done 表格行 + 完整任务块原文）
  - `POST /awf/todo`（待办 CRUD：body `{path, type, action: add|update|delete, row:{id, 优先级?, 描述?}}`；add 时 ID 需 `TYPE-xxx`、优先级 P0–P3，duplicate→409）
  - `POST /awf/task`（当前任务：body `{path, type, id, action: update|pause|resume, fields?}`；update 的 fields 用中文字段键，`描述` 映射任务块标题；pause↔blocked、resume↔active）
  - `GET  /awf/source?path=&type=&file=`（只读 .md 源文件：type 白名单 dev/debug/docs、file 白名单 todo/current/done，absPath 服务端固定拼接；→ {ok, source:{type,file,absPath,content}}）
  - `POST /awf/task/delete/dry-run` / `POST /awf/task/delete/execute`（删除任务回退：dry-run 文件清单 → 前端弹框二次确认 → execute）
  - `POST /awf/register`（DEV-035 登记当前项目：已有 agent-workflow/ 直接写全局索引；没有则先初始化骨架再登记；body `{path, workspaceRoot, local}`，白名单与 `/awf/init` 相同；`local: true` → project.yaml 写 `track: false` + `.gitignore` 追加 `# awf:local-begin` 忽略区块 `/agent-workflow/` `/AGENTS.md` `/CLAUDE.md`；顺带补齐缺失的 `scaffold_version`）
  - `POST /awf/upgrade`（DEV-035 框架升级：版本落后时向 agent 注入升级意图（不直接改文件），409 up-to-date 表示已最新；升级由 agent 执行并跑 `awf check` 验证，插件经 SSE/轮询刷新状态）
  - `GET  /awf/ledger` 响应附带 `versions`（DEV-035 版本监测：`{status: latest|outdated|unknown, installed, scaffold, latestAWF, latestRelease, upgradeTo}`，双信号 = 项目 `AWF_VERSION` 代次 + `scaffold_version` 发布号，与 kit `VERSION`/`AWF_VERSION` 比对）
- 客户端：右侧边栏页签，15s 自动刷新 + 手动刷新；只跟随当前会话项目，无项目下拉选择器
- 默认锚定：页签打开即自动选中当前 DSH 会话所属项目（见「默认锚定」一节），无需手动选择

## 安装

```sh
# 1. 把插件装进桌面 profile（也可在设置 → 插件管理里安装）
cd ~/.dsh/profiles/desktop
pnpm add file:/绝对路径/agent-workflow-kit/dsh-plugin

# 2. 把 dsh-awf-dashboard 追加到 package.json 的 dsh.profile.bundles 数组
#    （若用 dsh plugin CLI：dsh plugin --profile desktop add dsh-awf-dashboard）

# 3. 重启 DSH（或刷新 GUI 页面，见下）
```

安装后打开右侧边栏（若没显示，点边栏右侧的栏位切换），应出现 **Agent Workflow** 页签。

## 使用

打开页签即自动加载**当前会话项目**的账本（无项目下拉选择器、无顶部工具条，不看其他项目）。DEV-044 起面板统一为**轻量行风格**：当前任务 / 待办 / 最近完成三区都是紧凑行（hairline 分隔、无卡片边框），只读展示账本事实，无任何操作按钮；写操作由 agent 在对话中执行，面板经 SSE/轮询自动反映账本变化。

- 项目卡：名称（右侧带**版本号** chip：latest 绿点 / outdated 黄点可点击升级）+ 路径（右侧**复制按钮** icon，点击复制路径）；无账本新鲜度/status.md 提示
- 当前任务（行）：ID + 类型/优先级徽章 · 标题 · 元信息行（👤 Owner / ↻ 更新时间）
- 待办（行）：类型 chip + ID + 描述 + 优先级，dev/debug/docs 三态切换；每个类型 tab 显示该类型未开始任务数量徽章（如「开发 2」「调试 0」，数据取自 `ledger.todoRows` 过滤计数），标题「未开始任务 · 类型」不再重复数量（tab 徽章一处即可）；数量为 0 时区块仍渲染（空态文案「该类型暂无未开始任务」），解析层兼容 4/5 列任务表格
- 最近完成（行）：✓ 日期 ID 描述，点击查看归档
- **未初始化引导**：所选项目尚未初始化 agent-workflow 时，页签显示引导卡（图标 + 文案 + 「初始化工作流（主会话）」按钮 + **「在 .gitignore 中忽略工作流」toggle**）。点击调用 `/awf/init/agent`：**注入当前会话**由 agent 读取项目上下文生成完整骨架（与升级/整理流程一致，不再用受管理子代理）；勾选 gitignore 时指令附加「把 agent-workflow/、AGENTS.md、CLAUDE.md 写入 .gitignore」步骤；成功后自动重新加载账本显示正常看板；`already-initialized` 等错误有友好提示
- **待办列表（只读）**：dev/debug/docs 三态切换器（默认 dev）展示未开始任务表格行（类型 / ID / 描述 / 优先级），无新增/编辑/删除/开始按钮；该类型无行时显示空态（「该类型暂无未开始任务」）；todo.md 是表格行格式、无 checkbox，不渲染待办进度条
- **源文件面板**（`GET /awf/source?path=&type=&file=`，服务端能力保留）：面板可查看/编辑 `.md` 原文并保存写回；DEV-044 起看板行上不再暴露「源文件」按钮（纯看板），面板仅由内部程序逻辑触发
- 最近完成：done.md 归档记录（**行式** 4/5/6 列摘要行 + **块式** `## [ID]` 任务块合并去重、块式优先；块仅统计状态=完成/取消，日期取 归档日期 > 完成日期 > 最近更新/Last Updated）全局按完成日期倒序**仅显示前 5 条**（日期 / ID / 描述排版），每条可点击弹出**归档查看**弹层（done 表格行 + 完整任务块 markdown 原文；归档未保留任务块的显示「该任务归档时未保留详细任务块，仅摘要」并仍展示摘要行与日期），可关闭返回
- **登记当前项目**（DEV-035，`POST /awf/register`）：空索引 / 未命中态不再只提示「先运行 awf register」——面板直接给出「登记当前项目」按钮（带当前会话目录提示）。已有 `agent-workflow/` 直接登记进全局索引；没有则服务端先初始化骨架再登记；成功后自动选中并加载账本。旁路「仅本地（不推送到远端）」勾选：登记时写 `track: false` + `.gitignore` 忽略区块，工作流痕迹不进 git。手动「刷新」按钮现在同时重取项目索引（修复挂载后索引陈旧不更新的问题）
- **框架版本监测**（DEV-035）：账本头部状态条显示项目工作流与 kit 框架的版本关系（`latest` 绿点「工作流已最新」/ `outdated` 黄条「工作流可升级 X → Y」/ `unknown` 灰字提示登记 kit）。「去升级」只注入 agent 升级意图（`POST /awf/upgrade`），升级由 agent 执行并跑 `awf check` 验证；面板不执行升级，经 SSE/轮询在 `versions.status` 变 `latest` 时自动退出「升级中」态

## 默认锚定（DEV-019）

宿主 `sidebar.right.pane.tab` 槽位（session 作用域）会向页签组件注入标准 props：
`useWorkspaces` / `useSession` / `useSessions` / `sessionId`（宿主 slot 目录 standardProps
契约）。客户端据此解析当前会话所属工作区根目录：

1. `useWorkspaces` 快照 `items[].sessionIds` 命中当前 sessionId → `item.path`（工作区根）
2. `useSessions.byId[sessionId].cwd`（会话工作目录）
3. 会话快照 cwd / better-sidebar 通道注入的 `scope.cwd`

根目录再与 `/awf/projects` 索引的 `path` 匹配（精确 → 最长前缀 → 仅在容器目录下唯一
归属时选中）；未命中索引时也直接以该根路径为目标（看板与初始化均支持
workspaceRoot 白名单，未登记项目同样能初始化/查看）。**不再有项目选择器与
localStorage 手动选择**：始终跟随当前会话，换会话即自动切换账本。

锚定结果同时作为 `workspaceRoot` 随写接口上报——未初始化项目不在全局索引里时，
服务端白名单靠它放行（`绝对路径 ∧（全局索引 ∨ workspaceRoot）`）。

## 卸载

```sh
cd ~/.dsh/profiles/desktop
pnpm remove dsh-awf-dashboard        # 若 CLI 装的：dsh plugin --profile desktop remove dsh-awf-dashboard
```

## 开发

- 解析逻辑：`src/ledger.js`（纯 Node ESM，与 `bin/awf` 的字段表行锚定规则一致，含 KIT-DEV-017 回归；DEV-022 新增骨架生成 / 任务迁移 / 归档查询 / 白名单）
- 服务端：`lib/index.js`（cordis 插件，`ctx.webServer.register` 路由；写路由走认证围栏 + 白名单，零外部命令）
- 客户端：`lib/client.js`（ModuleLoader chunk，`ctx.slots.inject('sidebar.right.pane.tab', ...)`；
  纯手写 `h()` 无构建步骤；颜色全部走 DSH 主题变量 `--dsw-alias-*` / `--dsl-*`，白天/暗色跟随）
- 可测试纯函数（导出于 module.exports，供 `client-chunk.test.js` 覆盖）：
  `resolveDefaultProject` / `resolveAnchorRoot`（默认锚定）、`detectNotInitialized`（未初始化判定）、
  `collectTodoRows`（todo 行兜底解析）、`buildDeleteView` / `deleteReasonText`（删除回退视图）、
  `runDeleteFlow`（确认后才 execute 的流程）、`runTodoAction` / `runTaskAction`（todo/任务 CRUD 请求封装）、
  `apiErrorText`（错误码 → 友好文案）、`postJson` / `getJson`（fetchImpl 可注入，mock 测试）、
  `WORKFLOW_STEPS` / `inferWorkflowStage` / `stageSummary`（流程步骤定义、阶段推断与内联摘要，纯函数）
- 测试：`node --test test/ledger.test.js test/client-chunk.test.js`（无需 GUI）
- 开发中改动同步到已安装副本：`./scripts/sync-profile.sh`；刷新/重启宿主后生效

## 约束

- 不读取与账本无关的文件；`/awf/ledger` 仅接受含 `agent-workflow/project.yaml` 的绝对项目目录
- 写接口（init / task:start / delete）只做服务端白名单路径内的文件操作，**不执行任何外部命令**；删除回退严格走「dry-run 清单 → 弹框二次确认 → execute」
- 所有路由都与平台一致走宿主 Connection 认证围栏（同 /api 网关准入），未授权请求返回 403

## 变更记录

- **0.3.5（DEV-179）**：当前任务行内联显示流程阶段 + 流程渲染重做（参考 AgentTeams 布局）；**0.3.6（DEV-182）**：移除流程阶段行——阶段由 status 静态映射、非真实流程数据，看板不再呈现（等真实流程数据接入后再恢复）
  - 背景：用户反馈 ①「当前任务要点击进度详情才能看到当前到哪个流程了」——阶段信息不在行内；②「流程画得太难看，参考 agent-team 的布局优化」——旧大步骤条（横向节点轨道 + 呼吸圆点/流动连线）观感差。
  - 现状核对：`WorkflowSteps` 大步骤条组件为死代码（全仓库未被调用），当前任务行（TaskCard）确实不渲染任何阶段。
  - 实现（仅前端 `lib/client.js` + 单测 + 版本号）：
    - TaskCard 行内新增固定单行「流程阶段」：阶段徽章（`流程 · <当前阶段> · <位置>/<总步数>`，如「流程 · 验证 · 4/6」）+ 迷你分段进度（完成段=状态色浅底、当前段=状态色实底+静态光圈、未到段=灰）；blocked 徽章标注「⏸ 暂停」。一瞥即知，无需点击详情。**（0.3.6 移除：status 静态映射非真实流程数据）**
    - 删除死代码大步骤条及其呼吸/流动动画 CSS（awf-breathe/awf-flow/awf-live-dot 等），阶段渲染为纯静态强调（无动画、box-shadow 光圈不影响布局），尊重 `prefers-reduced-motion`；状态色随账本状态语义（verify=绿 / review=琥珀 / active=品牌蓝 / blocked=琥珀暂停）。
    - 新增 `stageSummary` 纯函数（导出，供单测）：由 `inferWorkflowStage` 派生「流程 · 阶段 · 位置/总步数」摘要；`WORKFLOW_STEPS`/`inferWorkflowStage` 契约不变。
    - 回归不破坏：整行点击仍打开源文件详情；行高固定（阶段行为固定单行），无 hover 位移/布局跳动（DEV-026 约束）；`awf-*` 类名契约（`awf-stage`/`awf-stage-chip`/`awf-stage-segs`/`awf-stage-seg`）供断言。
  - 新增 `test/client-chunk.test.js`（ModuleLoader 桩加载 client.js，覆盖 inferWorkflowStage 各类型/状态映射与 stageSummary 摘要文本）；`node --test` 40/40 全绿。
  - 版本 0.3.4 → 0.3.5；宿主副本经 `./scripts/sync-profile.sh` 同步，重启 DSH 后生效。

- **0.3.4（DEV-178）**：版本锚点读取适配 `version_file`（kit v1.1.7 锚点迁移后不再硬编码根 VERSION）
  - 背景：kit v1.1.7（DEV-174）把版本锚点迁移为「读 project.yaml 的 `version_file`，默认根 VERSION；kit 自身 = `agent-workflow/VERSION`」。插件此前在两处硬编码根 `VERSION`（`readProjectRelease` 读项目、`kitVersions` 读 kit），锚点迁移后 kit 根 VERSION 已删——kit 最新发布版读成 null、kit 面板只显示框架代次、登记时 `scaffold_version` 无法补齐。
  - 修复：`src/ledger.js` `projectMetaFromYaml` 支持 `version_file` 键，新增 `projectVersionFile(projectPath, meta)`（与 `bin/awf project_version_file` 同口径，相对项目根解析，未配置默认根 VERSION），`readProjectRelease` 改走该解析；`lib/index.js` `kitVersions` 的 kit 最新发布版改读 `readProjectRelease(kit.path)`（自动跟随 kit 自身 version_file），与 `awf upgrade` 源版本读取（KVF）同口径。
  - 新增 2 组单测（已配置 version_file → 读其指向文件、未配置 → 默认根 VERSION），另覆盖读不到返回 null；`cd dsh-plugin && node --test` 全绿。
  - 宿主副本同步：新增 `./scripts/sync-profile.sh`（README 原引用的脚本此前并不存在），一键复制 lib/src/package.json 等到 profile 已安装副本；重启 DSH 后看板版本徽标恢复显示具体发布版（v1.1.7）。

- **0.3.3（DEBUG-002）**：最近完成同日排序修正（最新完成任务排第一）
  - 解析层（`src/ledger.js` `ledgerOf`）：recent 排序由「仅完成日期倒序」改为「**日期倒序 + 任务 ID 数值倒序**」（DEV-134 → 134）。
  - 背景：目录式账本（DEV-127）同日记录按 readdir **字母序**收集，仅有日期键时退化为字母序——kit 同日批次 DEV-115…122 排前、最新完成的 DEV-129…134 被 `slice(0,8)` 切掉，面板「最近完成」看起来全是旧任务；legacy 表格行顶部插入（最新在最小行号），解析层行号序与之相反，同日组内顺序反转。
  - 顺序发号的任务系统里 ID 数值递增 ≈ 完成先后，作为同日稳定次键（跨类型同日保留 dev→debug→docs 收集序）；`recent` 输出结构与数量不变，前端无需改动。
  - 新增 2 组单测（目录式同日 ID 倒序、legacy 同日 ID 倒序）；真实数据三项目验证（kit DEV-134 打头、uxrsample DEV-074 打头、rokid_system_components DEV-029 打头）；`cd dsh-plugin && node --test` 35/35 全绿

- **0.3.2（DEV-133）**：版本徽章显示具体发布版（v1.0.0）+ 版本判定/锚点修正 + 拷贝按钮与徽章对比度加强
  - 版本显示：项目卡版本徽章优先读「项目根 VERSION 文件」（对外发布版，如 v1.0.0），不再只显示 awf 框架代次整数（v1）；缺 VERSION 文件回退 v{代次}（旧行为兼容）
  - 版本判定：`versionStatus` 优先按「项目根 VERSION vs kit VERSION」semver 比对（与显示一致），无 VERSION 回退 AWF 代次、再回退 scaffold_version；`awf upgrade` 新增版本锚点——把 kit 的 VERSION 文件同步到目标项目根（无 VERSION 或落后时更新）
  - UI 加强：`awf-icon-btn`（项目卡/弹框拷贝按钮）24px、1.5px 边框、图标 C.sub、hover 提亮（边框+文字）、ok 态更实；版本徽章 latest 文字 C.dim→C.sub + 边框透明度 55%→72%，不再发虚
  - 测试 33/33 全绿

- **0.3.1（DEV-132）**：点击任务图标改读「该任务单文件详情」，不再打开整桶 README 索引
  - `GET /awf/source` 新增可选 `id` 查询参数：目录式账本下带 id 读 `tasks/<type>/<桶>/<ID>.md`（仅该任务内容，预览/编辑/拷贝路径均指向单文件），不带 id 仍返回桶 README 检索索引（查看整桶视图保留）
  - 前端「最近完成 / 当前任务 / 待办」行点击源文件时自动携带任务 id（`fetchSource`/`openSource` 透传）；id 非法返回 400 bad-id，目录式 404 文案带 `tasks/<type>/<桶>/<ID>` 路径提示
  - 旧形态（大文件）项目不受影响（id 忽略，语义保持）；测试 33/33 全绿（新增 2 个 DEV-132 用例）
  - 读修复保持只读：目录式 writeSource 仍拒绝直写（编辑保存由账本状态机/awf 负责）

- **0.3.0（DEV-127）**：看板账本目录式适配（tasks/<type>/{todo,current,done}/<ID>.md + README 检索索引）
  - 读路径 `ledgerOf` 目录式优先：current 桶任务文件 → 逐个块；todo 桶文件 → 验收 checkbox 进度 + ID/优先级/标题/登记日期；done 桶文件 → 块式归档（`parseDoneRows` 归档白名单加入 `done`——目录式归档任务文件的状态字段）；status.md 新鲜度按目录文件集 mtime 比较；旧形态大文件（todo.md/current.md/done.md）兼容回退，过渡期不坏
  - 写路径目录式：`startTask` 认领= todo/<ID>.md 状态改 active 后移入 current/；`returnTaskToTodo` 反向移回；`todoEdit` add/update/delete = 建/改/删任务文件；`deleteTask` 删除 = 移除 current/<ID>.md，撤销记录写 done/<ID>.md（任务文件形态）；`taskEdit` 编辑 current/<ID>.md
  - `readSource` 目录式返回桶的 README 检索索引；`writeSource` 目录式拒绝直写（索引由 `awf status` 生成，防手改）
  - `initSkeleton` 生成目录式三桶 README 骨架（与 awf render_ledger_readmes 头部一致）；status.md 数据来源文案更新
  - 测试 31/31 全绿（新增 5 个 DEV-127 目录式用例：ledgerOf / startTask / todoEdit / readSource / skeletonFiles）

- **0.2.5（DEBUG-001）**：修复 md 表格渲染重叠（长摘要列溢出覆盖相邻列）
  - 渲染层（`lib/client.js` `mdToHtml`）：表格 td 此前仅第 3 列（任务描述）允许换行，其余列一律 `white-space:nowrap`——`实现方案摘要` 列的超长文本（无空格长串：包路径 / commit hash / JSON 片段）在 `table-layout:fixed` 下不换行直接绘出单元格边界，横向覆盖 `完成日期`/`状态` 列、纵向压贴下一行（6 列归档表复现）
  - 修复：全部 td 统一 `word-break:break-word;overflow-wrap:anywhere`（去除 nowrap）；colgroup 列宽按比例归一化合计 100%（旧值 18+12+52+18+16+16=132% 溢出）；4 列 docs 型表格宽度不变（回归）
  - 验证：抽取 mdToHtml 对真实 6 列归档表合成渲染断言通过 + 单测回归 26/26 全绿

- **0.3.6+（DEV-183）**：初始化与升级流程一致——`/awf/init/agent` 改为**注入主会话**（不再用受管理子代理）；引导卡加「git 忽略工作流」toggle（对应 awf init --gitignore / awf gitignore）；同时 `awf-dispatch` 增加**全局 [awf] 会话总数 ≤ 3** 限制（所有项目合计，复用不受限）
- **0.2.4（DEV-103 等）**：看板初始化 agent 化 + 引导卡提亮
  - 初始化改走 agent 完整配置（`lib/index.js` 新增 `POST /awf/init/agent`）：受管理子代理读项目上下文（README/技术栈/结构）→ 生成完整骨架（project.yaml + AGENTS.md 区块 + workflows/templates/bin/awf + 标准 4 列账本骨架 + 初始真实任务）→ awf check/status 验证 → 回报；替代仅空模板的最小骨架
  - `buildActPrompt` 新增 init 动作分支（`INIT_AGENT_GUIDE`），`AGENT_ACTIONS` 白名单加入 init
  - 引导卡：busy 态「初始化中…」标题 + 旋转动画 + 说明已派发 agent；按钮「初始化工作流（agent 配置）」；失败显示原因
  - 引导卡说明文字提亮（EmptyState desc dim→sub），与待办/最近完成/底部提示一致
  - 单测 26/26 全绿；check_workflow 全绿

- **0.2.3（DEV-102）**：最近完成适配块式归档 + recent 全局倒序
  - 块式归档解析（`src/ledger.js` `parseDoneRows`）：新增 `## [ID] Title` 任务块形态——仅当块内 `状态` 为「完成」或「取消」计为已归档记录（active/blocked/verify/review/pending/done/archived 不算）；日期优先级 `归档日期` > `完成日期` > `最近更新`/`Last Updated`（取值的 YYYY-MM-DD 部分）；HTML 注释（`<!-- … -->`）内示例块不解析
  - 合并去重：行式 + 块式按 ID 去重、**块式优先**（近期仅以块形式归档的完成/取消项目不再从最近完成区消失）
  - recent 聚合修复（DEV-101 遗留）：全部类型（dev/debug/docs）行式+块式记录**合并后全局按完成日期倒序**再取前 8——旧逻辑 dev→debug→docs 各取 8 再拼接 slice(0,8)，dev 行多时独占全部槽位、debug/docs 更新鲜记录被截掉；`recent` 输出结构与数量不变，前端无需改动
  - 新增单测（块式完成/取消/缺日期/非归档状态/注释内块/行块去重/混合倒序 + ledgerOf 全局跨类型倒序）；`cd dsh-plugin && node --test` 26/26 全绿

- **0.2.2（DEV-101）**：最近完成区兼容多列归档行 + 倒序修正
  - 解析层（`src/ledger.js` `parseDoneRows`）：兼容 4/5/6 列归档表格行（dev/debug 6 列 `| ID | P | 标题 | 摘要 | 完成日期 | 链接 |`、docs 5 列），desc = 第 3 列，完成日期 = 行内第一个 YYYY-MM-DD（链接列含日期不抢前）；无日期行跳过
  - 排序：完成日期倒序优先，**同日按归档先后倒序**（done.md 文件靠后的行 = 越晚归档 = 排最前），面板最近完成与 status.md 摘要一致
  - `_row` 仅作排序键，返回前剔除，对外契约仍是 `{id, prio, desc, date}`
  - 新增 parseDoneRows 单测（混合 4/5/6 列、倒序、截断、无日期跳过）；`cd dsh-plugin && node --test` 18/18 全绿

- **0.2.1（DEV-100）**：待办区兼容 5 列任务表格 + 显式任务数量
  - 解析层（`src/ledger.js` `parseTodoRows`）：同时接受 4 列 `| ID | prio | desc | date |`（回归，结果与旧版一致）与 5 列 `| ID | prio | title | deps | date |`；5 列行 `desc = title`，deps 非空时并入 desc（`title（依赖 deps）`），「开始任务」生成的块与列表展示均可见依赖；表头/分隔/畸形行（ID 不合法、日期非 YYYY-MM-DD）依旧不产生任务行
  - 展示层（`lib/client.js` 待办区块）：每个类型 tab（开发/调试/文档）显示该类型未开始任务数量徽章（只取自 `ledger.todoRows` 过滤计数，0 也显示）；标题「未开始任务 · 类型」不重复数量（tab 徽章一处）；某类型数量为 0 时区块仍渲染（空态文案「该类型暂无未开始任务」）；后端契约 `ledger.todoRows` 不变
  - 新增 `test/ledger.test.js` 单测（`cd dsh-plugin && node --test`）