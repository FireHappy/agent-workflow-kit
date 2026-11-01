# dsh-awf-dashboard

agent-workflow 工作流看板（DSH 客户端插件）：在处理需求时，在 DSH 右侧边栏的 **Agent Workflow** 页签可视化查看项目账本——当前任务状态、todo 进度、最近完成、status.md 新鲜度；并提供未初始化引导、开始任务与归档查看等交互。

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
- 客户端：右侧边栏页签，15s 自动刷新 + 手动刷新；项目选择记住上次选择
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

打开页签后默认自动加载**当前会话项目**的账本（也仍可在下拉中切换）：

- 项目卡：名称 / 路径 / purpose 与账本新鲜度徽章——`status.md` 比账本文件旧时显示「账本过期 → 请运行 awf status」
- 当前任务：任务标题 + ID + 类型徽章（开发/调试/文档）+ 状态徽章（进行中/待复核/验证/阻塞/交接）+ 优先级 + Owner + 更新时间；每卡带「编辑」「暂停/继续」「删除」入口（详见下）
- **未初始化引导**：所选项目尚未初始化 agent-workflow 时，页签显示引导卡（图标 + 文案 + 「初始化工作流」按钮）。点击调用 `/awf/init` 生成骨架（project.yaml + tasks/*/{todo,current,done}.md + status.md），成功后自动重新加载账本显示正常看板；`already-initialized` 等错误有友好提示
- **开始任务**：待办进度区除各类型进度条外，列出未开始任务表格行（类型 / ID / 描述 / 优先级），每行带「开始」按钮。点击调用 `/awf/task/start` 把该行移入 `current.md` 生成 active 任务块（todo 删行），成功后刷新账本；加载中按钮禁用，`not-found` 友好提示
- **todo CRUD**（`POST /awf/todo`，action add/update/delete）：
  - 类型切换：待办区用 **dev/debug/docs 三态切换器**展示（默认 dev），各类型只展示自己类型的未开始任务表格行 + CRUD；该类型无行时显示空态（「该类型暂无未开始任务」）；
  - 新增：分区「＋ 新增」展开表单（类型 / 任务 ID / 优先级 / 描述，ID 需 `TYPE-xxx` 格式，P0–P3），保存后调 `add` 并刷新；
  - 编辑：每行「编辑」原位展开表单（优先级 select + 描述 input + 保存/取消），保存调 `update`（ID 不可改）并刷新；
  - 删除：每行「删除」先弹行内二次确认（「确认删除待办 XX？」+ 删除/取消），确认后才调 `delete` 并刷新；
  - 错误（duplicate/invalid-id/not-found 等）在表单内联友好提示；所有操作加载中禁用对应按钮；
  - **无进度条**：todo.md 是表格行（`| ID | 优先级 | 描述 | 登记日期 |`）格式、没有 checkbox，`countTodo` 恒 0/0——不再渲染待办进度条
- **当前任务编辑 / 暂停 / 继续**（`POST /awf/task`，action update/pause/resume）：
  - 「编辑」原位展开表单：优先级 select / 状态 select（active/blocked/review/verify/handoff）/ Owner / 描述（=任务块标题）/ 修改范围；仅发送非空字段，保存调 `update`（fields 用中文字段键）并刷新；
  - 「暂停」调 `pause`（状态 → blocked），「开始」调 `resume`（状态 → active）——两个按钮随状态**二选一**切换；状态徽章对 blocked 明确显示「已暂停」（不显示英文 blocked）；请求中按钮禁用（「暂停中…/开始中…」）；
  - 错误（not-found/not-git-repo 等）内联友好提示；
  - **验收进度**：若任务块含 `- [ ]` 勾选子项（checkItems），任务卡显示完成进度（done/total + 百分比条）；无子项则只显示状态徽章，不强行造进度
  - **工作流步骤条**（t7 质感升级 → t8 重构为横向阶段轨道）：每个进行中任务按类型展示对应流程步骤条——`dev: 认领→方案→实现→验证→Review→归档`、`debug: 认领→选择诊断方式→收集证据→验证假设→修复与回归→归档`、`docs: 认领→大纲与核实→撰写→审阅→归档`；当前阶段由任务状态推断（active=实现/收集证据/撰写、verify=验证/验证假设、review=Review/审阅、blocked=在当前位置标注「已暂停」）；t8 起为 AgentTeams 面板视觉语言——横向轨道（圆形状态节点 + 连接线 + 节点下方标签）：完成=实心填充+✓、当前=强调色+光圈（●）、未到=空心置灰，已完成连接线段强调色；流程为前端静态定义，`inferWorkflowStage(t)` 纯函数导出可单测
  - **看板质感（AgentTeams 团队面板风格）**：任务卡/待办/todo 行多徽章布局（类型×状态×优先级×Owner），卡片 hover 边框高亮+浮起、行 hover 背景——静态注入 `<style>` 一次（主题令牌兜底，纯手写 h() 无构建）
- **打开源文件**（`GET /awf/source?path=&type=&file=`，只读）：编辑任务弹层（todo 行 / 当前任务）的「打开源文件」按钮 → 源文件面板：本地绝对路径 + 「复制路径」按钮（写剪贴板）+ macOS 访达提示（纯文案，不执行命令）+ `.md` 原文（等宽、可滚动、只读展示）；路由未就绪（404）时提示「源文件接口未就绪」；可关闭返回
- 待办进度：~~各类型 todo.md 的 `- [ ]` / `- [x]` 渐变进度条~~（DEV-022 t5 移除：todo.md 是表格行、无 checkbox，进度无意义；改为类型 toggle + 行列表，见上）
- 最近完成：done.md 摘要行按完成日期倒序**仅显示前 5 条**（日期 / ID / 描述排版），每条可点击弹出**归档查看**弹层（done 表格行 + 完整任务块 markdown 原文；归档未保留任务块的显示「该任务归档时未保留详细任务块，仅摘要」并仍展示摘要行与日期），可关闭返回
- **删除任务二次确认**：当前任务卡点「删除」→ 先调 `/awf/task/delete/dry-run` 弹出确认框：
  - 可回退：列出将回退文件清单（path + 改动状态徽标：已修改/未跟踪/已删除/…）+ 警示文案「删除后将回退这些文件的未提交修改，不可恢复」+ 三个按钮：「删除并回退修改」（危险样式，默认聚焦取消）、「仅删除账本」（跳过回退只移除任务块）、「取消」；
  - 无法回退（非 git 仓库 / 修改范围为空 / dry-run 失败）：弹框内说明原因，仅提供「仅删除账本 / 取消」；
  - 确认后才调 `/awf/task/delete/execute`，成功后刷新账本

## 默认锚定（DEV-019）

宿主 `sidebar.right.pane.tab` 槽位（session 作用域）会向页签组件注入标准 props：
`useWorkspaces` / `useSession` / `useSessions` / `sessionId`（宿主 slot 目录 standardProps
契约）。客户端据此解析当前会话所属工作区根目录：

1. `useWorkspaces` 快照 `items[].sessionIds` 命中当前 sessionId → `item.path`（工作区根）
2. `useSessions.byId[sessionId].cwd`（会话工作目录）
3. 会话快照 cwd / better-sidebar 通道注入的 `scope.cwd`

根目录再与 `/awf/projects` 索引的 `path` 匹配（精确 → 最长前缀 → 仅在容器目录下唯一
归属时选中），命中即自动选中并加载账本。**localStorage 中的用户手动选择
（`dsh-awf-dashboard.project`）优先**：手动切换后自动检测不再覆盖；自动锚定本身不写
localStorage，保持跟随当前会话。

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