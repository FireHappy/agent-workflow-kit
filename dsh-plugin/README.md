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
- 待办（行）：类型 chip + ID + 描述 + 优先级，dev/debug/docs 三态切换
- 最近完成（行）：✓ 日期 ID 描述，点击查看归档
- **未初始化引导**：所选项目尚未初始化 agent-workflow 时，页签显示引导卡（图标 + 文案 + 「初始化工作流」按钮）。点击调用 `/awf/init` 生成骨架（project.yaml + tasks/*/{todo,current,done}.md + status.md），成功后自动重新加载账本显示正常看板；`already-initialized` 等错误有友好提示
- **待办列表（只读）**：dev/debug/docs 三态切换器（默认 dev）展示未开始任务表格行（类型 / ID / 描述 / 优先级），无新增/编辑/删除/开始按钮；该类型无行时显示空态（「该类型暂无未开始任务」）；todo.md 是表格行格式、无 checkbox，不渲染待办进度条
- **源文件面板**（`GET /awf/source?path=&type=&file=`，服务端能力保留）：面板可查看/编辑 `.md` 原文并保存写回；DEV-044 起看板行上不再暴露「源文件」按钮（纯看板），面板仅由内部程序逻辑触发
- 最近完成：done.md 摘要行按完成日期倒序**仅显示前 5 条**（日期 / ID / 描述排版），每条可点击弹出**归档查看**弹层（done 表格行 + 完整任务块 markdown 原文；归档未保留任务块的显示「该任务归档时未保留详细任务块，仅摘要」并仍展示摘要行与日期），可关闭返回
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
  `WORKFLOW_STEPS` / `inferWorkflowStage`（工作流步骤条定义与阶段推断，纯函数）
- 测试：`node --test test/ledger.test.js test/client-chunk.test.js`（无需 GUI）
- 开发中改动同步到已安装副本：`./scripts/sync-profile.sh`；刷新/重启宿主后生效

## 约束

- 不读取与账本无关的文件；`/awf/ledger` 仅接受含 `agent-workflow/project.yaml` 的绝对项目目录
- 写接口（init / task:start / delete）只做服务端白名单路径内的文件操作，**不执行任何外部命令**；删除回退严格走「dry-run 清单 → 弹框二次确认 → execute」
- 所有路由都与平台一致走宿主 Connection 认证围栏（同 /api 网关准入），未授权请求返回 403