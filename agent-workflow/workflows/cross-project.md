# 跨项目派发工作流

> 适用：目标代码/产物在另一个仓库，当前项目只负责调度、拆分与验收。
> 主规范：`../README.md`
> 派发器：`../bin/awf-dispatch`（可选适配器；无此脚本时用 GUI 手工会话）

---

## 目标

把任务交给目标项目自己的 agent，在**目标项目的工作区会话**中执行；调度方只发任务、收结果，不跨仓库改账本。

---

## 四道前置门（缺一不可）

| 门 | 检查 | 不满足时 |
|---|---|---|
| G1 工作流 | 目标有 `AGENTS.md`、`agent-workflow/project.yaml`、`workflows/`、`check_workflow.sh` | 先 `awf init`（需用户确认），不要向无流程仓库派发 |
| G2 工作区 | 目标路径已登记为当前 harness 的工作区（工作区列表 / `workspace.json`） | 在 GUI「添加工作区」，或 `awf-dispatch --add-workspace`；否则 handoff |
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
- 回报格式（任务包五项）：状态 / 变更文件 / 验证结果 / commit / 阻塞

任务包不要依赖调度方的上下文；目标 agent 是独立会话。

---

## 任务包生命周期

`dispatch/tasks/*.md` 是一次性票据：`dispatch/tasks/` 只留在途，完成后归档。

1. **生成**：文件名带任务 ID（`<项目>-<ID>-<slug>.md`），正文写 `- 目标项目：<别名>（<绝对路径>）`。
2. **在途**：派发后票据留在 `dispatch/tasks/`；`dispatch/log.md` 记录会话、状态与目标 HEAD。
3. **落地**：目标项目完成并本地 commit，账本归档到目标 `agent-workflow/tasks/<type>/done.md`。
4. **归档**：完成后在调度方运行 `awf-dispatch --prune`（默认 dry-run，只打印计划），确认后加 `--apply` 把票据移到 `dispatch/archive/<目标别名>/<YYYY-MM>/<原文件名>`。

判定依据：目标仓库提交消息含任务 ID，**或** 目标账本 `done.md` 已含该 ID——提交消息没写 ID 的票据也能归档；解析不到目标项目/任务 ID、目标路径不存在或不是 git 仓库时判 unknown 并跳过（不猜）。

```sh
./agent-workflow/bin/awf-dispatch --prune           # dry-run：打印票据 / 目标 / 任务ID / 判定 / 将移往路径
./agent-workflow/bin/awf-dispatch --prune --apply   # 真正移动已完成票据
```

`dispatch/log.md` 是**永久派发日志**，`--prune` 只移动票据文件，不清理、不改写日志。

---

## 执行：会话优先

有派发器时用 `awf-dispatch`（**默认异步**：创建会话并发送任务后立即返回会话 ID，不阻塞调度方）：

```sh
./agent-workflow/bin/awf-dispatch <别名|目录> dispatch/tasks/<ID>-<slug>.md
```

它会：

1. 跑 G1–G4 前置检查（G2 读本 harness 的工作区清单，G4 检查 GUI 地址与本地认证）
2. 在目标工作区创建会话，标题设为 `<别名> · <任务标题>`
3. 发送任务包后立即返回；加 `--wait` 才等待回合结束（`--timeout` 仅对 `--wait` 生效）
4. 记日志：未等待时状态为「已发送，未等待回合」，并写明如何回到 GUI 会话
5. 打印会话信息；**后续细节由用户在同一个会话里继续提**

需要本次回合结果时显式等待：

```sh
./agent-workflow/bin/awf-dispatch <别名|目录> dispatch/tasks/<ID>-<slug>.md --wait --timeout 900
```

> 默认不等待时，调度方只确认「任务已发送」；目标 agent 的最终回报稍后回到 GUI 会话查看，日志里记有会话 ID 与打开方式。`--no-wait` 是默认行为的兼容别名（与 `--wait` 互斥）。

> 若当前 harness 支持多会话协作，可把派发交给独立会话/成员执行并等待其回报：调度方建队、每个目标一个成员，成员执行带 `--wait`（`--timeout` 限时）同步等到回合结束，把成功/失败、目标 commit、校验结果与阻塞原因回给调度方汇总。没有多会话协作能力时，退回单会话按本文执行。

手工等价操作：GUI 左侧切到目标工作区 → 新建会话 → 粘贴任务包。效果相同，只是没有自动前置检查与日志。

### 可选：`--team`（团队拆分建议）

给派发命令加 `--team` 时，任务包末尾会追加一段「可选：用团队执行」建议：目标 agent 可先拆 2–3 个可并行子任务、声明依赖，再由队长汇总；团队协作插件不可用时忽略该节，按普通会话完成即可。拆分不改变验收标准，账本仍只由一个 Owner 写入。该参数只影响会话模式注入的任务包，`--handoff` 交接单保持原文；不加时任务包与旧版一致。

```sh
./agent-workflow/bin/awf-dispatch <别名|目录> dispatch/tasks/<ID>-<slug>.md --team
```

---

## 回退

| 情况 | 回退 | 代价 |
|---|---|---|
| GUI 未运行 / 认证失效 | `awf-dispatch --headless`（需用户同意） | 默认后台启动并立即返回输出路径（`--wait` 才同步等待）；会话不在 GUI 工作区，用户不能直接续聊 |
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

1. 回合结束后检查目标 agent 的回报是否包含任务包五项（状态 / 变更文件 / 验证结果 / commit / 阻塞）。
2. 在目标仓库核对 `git log -1`、`git status`、`./agent-workflow/check_workflow.sh`。
3. 调度方记录：会话 ID、任务文件、状态、目标 HEAD、时间；`dispatch/` 随调度方仓库本地 commit。
4. 用户后续细节优先回到同一会话；只有新目标或新任务才重新派发。

> 派发活动不写入目标项目账本；调度方的 `awf status` 只反映自身登记的任务，需在收尾时补跑一次。

> 目标 harness 若支持团队协作，任务包会附拆分建议；是否拆队由目标方自行决定，调度方不代开团队。

---

## 失败处理

- `workspace-missing`：在 GUI 添加工作区，或 `--add-workspace`；不要用 `cwd` 绕过。
- `workflow-missing`：先 `awf init` / 补齐 `agent-workflow/`。
- `writer-held` / `session/conflict`：目标会话被 GUI 占用或同目录写者冲突；切走/等待后重试。
- `auth-required` / `connection refused`：重开 GUI URL；或 `--headless`。
- 回合超时：会话保留，不要杀掉；在 GUI 查看进度。默认派发本身不等待（`--no-wait` 是默认行为的兼容别名），需要重派时直接重新派发并加 `--force`。

---

## 检查清单

- [ ] G1–G4 全过
- [ ] 任务包含验证命令和回报契约
- [ ] 清楚本回合是否加 `--wait`（默认异步，「已发送」不等于「已完成」）
- [ ] 会话在目标工作区（不是 Ungrouped）
- [ ] 目标 agent 自己写账本
- [ ] 只本地 commit，未 push
- [ ] 调度日志记录了 sessionId 与目标 HEAD
- [ ] 已告诉用户后续在哪个会话继续
