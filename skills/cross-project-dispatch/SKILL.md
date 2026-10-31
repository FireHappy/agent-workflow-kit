---
name: cross-project-dispatch
description: 在 agent-workflow 项目之间派发任务：先检查目标项目是否有工作流、是否已登记为工作区，再在目标工作区创建会话执行，支持 headless / handoff 回退。
whenToUse: 用户要求把任务交给另一个项目、跨仓库协作、在 demo02 等对象项目的会话中执行，或需要判断目标项目是否具备工作流与工作区。
---

# 跨项目派发

把任务交给目标项目自己的 agent，在**目标项目的工作区会话**中执行；调度方只发任务、收结果，不跨仓库改账本。

配套规范：目标项目的 `agent-workflow/workflows/cross-project.md`（kit 的 `templates/workflows/cross-project.md`）。

## 四道前置门（缺一不可）

| 门 | 检查 | 不满足时 |
|---|---|---|
| G1 工作流 | 目标有 `AGENTS.md`、`agent-workflow/project.yaml`、`workflows/`、`check_workflow.sh` | 先 `awf init`（需用户确认），不要向无流程仓库派发 |
| G2 工作区 | 目标路径已登记为当前 harness 的工作区（DSH：GUI 工作区列表 / `workspace.json`） | 在 GUI「添加工作区」，或 `awf-dispatch --add-workspace`；否则 handoff |
| G3 可写 | 目标无已跟踪改动、无其他 active 任务 | 停止并询问；不要和另一个写者并行 |
| G4 通道 | 目标工作区能创建会话（GUI 在线、认证有效、模型可用） | 回退 headless（需用户同意）或 handoff |

只读任务可以放宽 G3，但仍建议在会话中执行，留下可追问的记录。

## 推荐执行

```sh
KIT="${DSH_HOME:-$HOME/.dsh}/skills/agent-workflow-scaffold"
[ -x "$KIT/bin/awf-dispatch" ] || KIT="$HOME/Documents/GitHub/agent-workflow-kit"
"$KIT/bin/awf-dispatch" <别名|目录> <任务文件>
```

脚本会：

1. 跑 G1–G4，并打印前置换结果；
2. 在目标工作区创建会话，标题为 `<项目> · <任务标题>`；
3. 发送任务包并等待回合结束（`--no-wait` 只受理）；
4. 把 sessionId、标题、状态、目标 HEAD 写到 `dispatch/log.md`；
5. 打印会话信息；后续细节由用户在同一个会话里继续提。

常用参数：`--dry-run`、`--headless`、`--handoff`、`--add-workspace`、`--no-wait`、`--json`、`--team`（任务包附加团队拆分建议，目标方自行决定是否拆队）。

手工等价操作：GUI 左侧切到目标工作区 → 新建会话 → 粘贴任务包。效果相同，只是没有自动前置检查与日志。

## 任务包

派发前写一份任务文件（`dispatch/tasks/<ID>-<slug>.md`），至少包含：

- 目标项目与任务 ID；类型 `dev|debug|docs`
- 一句话目标、修改范围、明确不做什么
- 验收标准与**必须实际执行**的验证命令
- 目标项目账本要求：在 `tasks/<type>/current.md` 认领、完成后归档
- 提交要求：只允许本地 commit，禁止 push
- 回报格式：状态 / 变更文件 / 验证 / commit / 阻塞点

任务包不要依赖调度方上下文；目标 agent 是独立会话。

## 回退

| 情况 | 回退 | 代价 |
|---|---|---|
| GUI 未运行 / 认证失效 | `--headless`（需用户同意） | 会话不在 GUI 工作区，用户不能直接续聊 |
| 无法创建会话 | `--handoff` | 只生成交接单，需用户手工在目标会话执行 |
| 目标未登记工作区 | `--add-workspace` 或 GUI 添加 | 否则会话落在 Ungrouped |
| 目标无工作流 | 先 `awf init`，再派发 | 不要跳过 G1 |

## 写者与账本

- 目标 agent 写目标项目的 `tasks/**`、`status.md`、代码与 commit。
- 调度方只写自己的 `dispatch/log.md` 与任务文件；**不要**跨仓库改目标账本。
- 一个任务只有一个 Owner；目标已有 active 任务时不要并行派发同一模块。

## 验收与收尾

1. 回合结束后检查目标 agent 的回报是否包含五项契约。
2. 在目标仓库核对 `git log -1`、`git status`、`./agent-workflow/check_workflow.sh`。
3. 调度方记录：会话 ID、任务文件、状态、目标 HEAD、时间。
4. 用户后续细节优先回到同一会话；只有新目标或新任务才重新派发。

## 失败处理

- `workspace-missing`：在 GUI 添加工作区，或 `--add-workspace`；不要用 `cwd` 绕过。
- `workflow-missing`：先 `awf init` / 补齐 `agent-workflow/`。
- `writer-held` / `session/conflict`：目标会话被 GUI 占用或同目录写者冲突；切走/等待后重试。
- `auth-required` / `connection refused`：重开 GUI URL；或 `--headless`。
- 回合超时：会话保留，不要杀掉；在 GUI 查看进度，必要时 `--no-wait` 重新派发新任务。

## 安全

`awf-dispatch` 只在本地读取 DSH GUI 的认证 cookie，用于本机 API；不打印、不写入任务文件或日志。不要把 cookie 粘进任何输出。
