# 跨项目派发工作流

> 适用：目标代码/产物在另一个仓库，当前项目只负责调度、拆分与验收。
> 主规范：`../README.md`
> 派发器：`../bin/awf-dispatch`（DSH 适配；无此脚本时用 GUI 手工会话）

---

## 目标

把任务交给目标项目自己的 agent，在**目标项目的工作区会话**中执行；调度方只发任务、收结果，不跨仓库改账本。

---

## 四道前置门（缺一不可）

| 门 | 检查 | 不满足时 |
|---|---|---|
| G1 工作流 | 目标有 `AGENTS.md`、`agent-workflow/project.yaml`、`workflows/`、`check_workflow.sh` | 先 `awf init`（需用户确认），不要向无流程仓库派发 |
| G2 工作区 | 目标路径已登记为当前 harness 的工作区（DSH：GUI 工作区列表 / `workspace.json`） | 在 GUI「添加工作区」，或 `awf-dispatch --add-workspace`；否则 handoff |
| G3 可写 | 目标 `git status` 无已跟踪改动、无其他 active 任务 | 停止并询问；不要和另一个写者并行 |
| G4 通道 | 目标工作区能创建会话（GUI 在线、认证有效、模型可用） | 回退 headless（需用户同意）或 handoff；不要用 `cwd` 绕过 |

只读任务可以放宽 G3，但仍建议在会话中执行，留下可追问的记录。

---

## 任务包

派发前写成一份任务文件（如 `dispatch/tasks/<项目>-<ID>-<slug>.md`），至少包含：

- 目标项目与任务 ID；类型 `dev|debug|docs`
- 一句话目标、修改范围、明确不做什么
- 验收标准与**必须实际执行**的验证命令
- 账本要求：在目标 `tasks/<type>/current.md` 认领，完成后归档
- 提交要求：只允许本地 commit，禁止 push
- 回报格式：状态 / 变更文件 / 验证 / commit / 阻塞点

任务包不要依赖调度方的上下文；目标 agent 是独立会话。

---

## 执行：会话优先

DSH 下用 `awf-dispatch`：

```sh
./agent-workflow/bin/awf-dispatch <别名|目录> dispatch/tasks/<ID>-<slug>.md
```

它会：

1. 跑 G1–G4 前置检查（G2 读 `$DSH_HOME/storages/workspace.json`，G4 读 `$DSH_WEB_URL` 与本地 GUI 认证）
2. 在目标工作区创建会话，标题设为 `<别名> · <任务标题>`
3. 发送任务包并等待回合结束（`--no-wait` 可只受理）
4. 把 `sessionId`、标题、状态、目标 HEAD 记录到 `dispatch/log.md`
5. 打印会话信息；**后续细节由用户在同一个会话里继续提**

手工等价操作：GUI 左侧切到目标工作区 → 新建会话 → 粘贴任务包。效果相同，只是没有自动前置检查与日志。

---

## 回退

| 情况 | 回退 | 代价 |
|---|---|---|
| GUI 未运行 / 认证失效 | `awf-dispatch --headless`（需用户同意） | 会话不在 GUI 工作区，用户不能直接续聊 |
| 无法创建会话 | `awf-dispatch --handoff` | 只生成交接单，需用户手工在目标会话执行 |
| 目标未登记工作区 | `--add-workspace` 或 GUI 添加 | 否则会话落在 Ungrouped，用户找不到 |
| 目标无工作流 | 先 `awf init`，再派发 | 不要跳过 G1 |

---

## 写者与账本

- 目标 agent 写目标项目的 `tasks/**`、`status.md`、代码与 commit。
- 调度方只写自己的 `dispatch/log.md` 与任务文件；**不要**跨仓库改目标账本。
- 一个任务只有一个 Owner；目标已有 active 任务时不要并行派发同一模块。

---

## 验收与收尾

1. 回合结束后检查目标 agent 的回报是否包含五项契约。
2. 在目标仓库核对 `git log -1`、`git status`、`./agent-workflow/check_workflow.sh`。
3. 调度方记录：会话 ID、任务文件、状态、目标 HEAD、时间；`dispatch/` 随调度方仓库本地 commit。
4. 用户后续细节优先回到同一会话；只有新目标或新任务才重新派发。

> 派发活动不写入目标项目账本；调度方的 `awf status` 只反映自身登记的任务，需在收尾时补跑一次。

---

## 失败处理

- `workspace-missing`：在 GUI 添加工作区，或 `--add-workspace`；不要用 `cwd` 绕过。
- `workflow-missing`：先 `awf init` / 补齐 `agent-workflow/`。
- `writer-held` / `session/conflict`：目标会话被 GUI 占用或同目录写者冲突；切走/等待后重试。
- `auth-required` / `connection refused`：重开 GUI URL；或 `--headless`。
- 回合超时：会话保留，不要杀掉；在 GUI 查看进度，必要时 `--no-wait` 重新派发新任务。

---

## 检查清单

- [ ] G1–G4 全过
- [ ] 任务包含验证命令和回报契约
- [ ] 会话在目标工作区（不是 Ungrouped）
- [ ] 目标 agent 自己写账本
- [ ] 只本地 commit，未 push
- [ ] 调度日志记录了 sessionId 与目标 HEAD
- [ ] 已告诉用户后续在哪个会话继续
