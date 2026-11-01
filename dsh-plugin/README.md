# dsh-awf-dashboard

agent-workflow 工作流进度看板（DSH 客户端插件）：在处理需求时，在 DSH 右侧边栏的「工作流进度」页签可视化查看项目账本——当前任务状态、todo 进度、最近完成、status.md 新鲜度。

- 数据源：各项目的 `agent-workflow/tasks/{dev,debug,docs}/{todo,current,done}.md` 与 `status.md`（**只读**，不写文件、不执行命令；改动用 awf 自身命令完成）
- 服务端：只读 JSON 路由 `GET /awf/projects`（全局索引）与 `GET /awf/ledger?path=<项目根>`（账本看板）
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

安装后打开右侧边栏（若没显示，点边栏右侧的栏位切换），应出现「工作流进度」页签。

## 使用

打开页签后默认自动加载**当前会话项目**的账本（也仍可在下拉中切换）：

- 项目卡：名称 / 路径 / purpose 与账本新鲜度徽章——`status.md` 比账本文件旧时显示「账本过期 → 请运行 awf status」
- 当前任务：任务标题 + ID + 类型徽章（开发/调试/文档）+ 状态徽章（进行中/待复核/验证/阻塞/交接）+ 优先级 + Owner + 更新时间
- 待办进度：各类型 todo.md 的 `- [ ]` / `- [x]` 渐变进度条，完成态以成功色区分
- 最近完成：done.md 摘要行按完成日期倒序前 8 条（日期 / ID / 描述排版）

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

## 卸载

```sh
cd ~/.dsh/profiles/desktop
pnpm remove dsh-awf-dashboard        # 若 CLI 装的：dsh plugin --profile desktop remove dsh-awf-dashboard
```

## 开发

- 解析逻辑：`src/ledger.js`（纯 Node ESM，与 `bin/awf` 的字段表行锚定规则一致，含 KIT-DEV-017 回归）
- 服务端：`lib/index.js`（cordis 插件，`ctx.webServer.register` 只读路由）
- 客户端：`lib/client.js`（ModuleLoader chunk，`ctx.slots.inject('sidebar.right.pane.tab', ...)`；
  纯手写 `h()` 无构建步骤；颜色全部走 DSH 主题变量 `--dsw-alias-*` / `--dsl-*`，白天/暗色跟随）
- 默认锚定纯函数：`resolveDefaultProject(projects, root)` / `resolveAnchorRoot(...)`
  （导出于 module.exports，供 `client-chunk.test.js` 直接覆盖）
- 测试：`node --test test/ledger.test.js test/client-chunk.test.js`（无需 GUI）
- 开发中改动同步到已安装副本：`./scripts/sync-profile.sh`；刷新/重启宿主后生效

## 约束

- 不读取与账本无关的文件；`/awf/ledger` 仅接受含 `agent-workflow/project.yaml` 的绝对项目目录
- 不写盘、不执行命令——「可视化」只是账本的只读投影
- 两个路由都与平台一致走宿主 Connection 认证围栏（同 /api 网关准入），未授权请求返回 403