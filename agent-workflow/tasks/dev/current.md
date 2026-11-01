# 正在开发

> 任务从 `todo.md` 移入此文件开始执行，完成后移入 `done.md`。
> 优先级只写 `P0` / `P1` / `P2` / `P3`。
> `awf status` 会解析本文件，任务块格式必须保持：`## [ID] 标题` + 字段表 + `### 下一步`。

<!-- 任务块格式示例（ID 用 XXX 占位，不会被解析）：

## [DEV-XXX] 任务标题

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | active |
| Owner | agent / human / unassigned |
| 协作模式 | single / parallel |
| 来源任务 | 无 / DEBUG-003 / 用户直接触发 |
| 修改范围 | 模块 / 目录 / 关键文件 |
| 分支/工作区 | 分支名 / worktree 标识 / N/A |
| 依赖 | 无 |
| 最近更新 | YYYY-MM-DD |

### 目标
一句话说明交付什么。

### 验收标准
- [ ] 校验命令通过
- [ ] 目标行为符合预期
- [ ] 没有已知回归

### 下一步
下一位 agent 可直接接手的最小动作。
-->

## [DEV-020] 工作流进度页签改进：UI 重构 + 默认锚定当前项目

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | active |
| Owner | wg-kit |
| 协作模式 | single |
| 来源任务 | 用户直接触发（DEV-019 后续改进） |
| 修改范围 | dsh-plugin/lib/client.js、dsh-plugin/test/、dsh-plugin/README.md、账本 |
| 分支/工作区 | main（agent-workflow-kit） |
| 依赖 | DEV-019 |
| 最近更新 | 2026-11-01 |

### 目标
改进右侧边栏「工作流进度」页签：① UI 重构（当前手写平铺样式难看，需视觉层级/语义配色/空态错误态设计，用 DSH 主题变量、纯手写 h() 无构建步骤）；② 页签打开默认自动锚定当前 DSH 会话所属项目（宿主注入 useWorkspaces/useSession 取工作区根与 /awf/projects 索引匹配，localStorage 用户选择优先），不再强制手动选择项目。保留项目切换、15s 自动刷新、手动刷新、账本只读。

### 验收标准
- [ ] UI 重构：项目卡 / 当前任务 / todo 进度条 / 最近完成 / 分区标题 / 空态错误态有明显质感提升，DSH 主题变量适配明暗
- [ ] 默认锚定：页签打开自动选中当前会话项目并加载账本；localStorage 用户选择优先
- [ ] 不回归：项目切换 / 15s 自动刷新 / 手动刷新 / 只读约束均保留
- [ ] node --test dsh-plugin/test/ledger.test.js dsh-plugin/test/client-chunk.test.js 全绿；sync-profile 后 GUI 实测默认打开当前项目
- [ ] check_workflow.sh 退出码 0；本地 commit 含 KIT-DEV-020（禁止 push）

### 下一步
实现与复核由 AgentTeams（kit-dev-019-improve）推进中：ui-developer 实现 → ui-reviewer 复核；通过后归档并 commit。

> 补充（2026-11-01）：本任务由 AgentTeams 团队执行（ui-developer / ui-reviewer，implementation → review 质量门禁）。团队建队时漏了账本登记，此块为补登。
