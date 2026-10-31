---
name: cross-project-dispatch
description: 在 agent-workflow 项目之间派发任务：先检查目标项目是否有工作流、是否已登记为工作区，再默认按「项目 + 模块」复用目标工作区已有的常驻会话（没有才新建）执行，支持 headless / handoff 回退；宿主有团队协作能力时默认建队派发，每个目标一个成员并用 `--wait` 同步等待回报。
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

## 默认：派发即建队（团队模式）

当前 harness 有团队协作能力时，跨项目派发**默认由团队执行**，不把派发压在主线上：

- **captain（需求方）**：拆目标、写票据、建队、汇总回报、写本仓库账本与 commit；不直接改目标仓库
- **dispatcher（每个目标一个成员）**：只派一个目标，`--wait` 同步等到回合结束，按团队回报五项回报 captain

### captain 最小操作序列

1. 预检（不建会话）：`awf-dispatch <目标> <票据> --dry-run`，确认 G1–G4
2. 写票据 `dispatch/tasks/<项目>-<ID>-<slug>.md`（见下「任务包」）
3. 建队：每个目标一个 dispatcher 任务，`inScope` 只含「执行派发 + 回报结果」
4. 收回报 → 写 `dispatch/log.md` → 更新本仓库账本 → `--prune` 归档票据 → 本地 commit
5. 有依赖的目标等上游回报「成功 + commit 已落地」后再派；失败/超时按退出码决定重试、改派或降级

### dispatcher 最小操作序列

```sh
KIT="${DSH_HOME:-$HOME/.dsh}/skills/agent-workflow-scaffold"
[ -x "$KIT/bin/awf-dispatch" ] || KIT="$HOME/Documents/GitHub/agent-workflow-kit"
"$KIT/bin/awf-dispatch" <别名|目录> <任务文件> --wait --timeout 900
```

1. 只处理自己那一个目标，不跨目标并行写；
2. **默认加 `--wait`**：等到回合结束，不把「已发送」当「已完成」；
3. 记录团队回报五项（退出码与最终状态 / 目标 commit / check 验证结果 / 阻塞原因 / 待 captain 决策），原样回报 captain；
4. 不改目标仓库，不自行重试、改派或降级（由 captain 决定）。

### 脚本做了什么

脚本会（**默认异步，团队模式必须显式 `--wait`**）：

1. 跑 G1–G4，并打印前置换结果；
2. **默认按「项目 + 模块」复用**目标工作区里的常驻会话（标题精确等于 `[awf] <项目> · <模块>`），不每次新建；没有匹配到本模块会话时才新建，标题同样用规范格式；
3. 发送任务包后立即返回会话 ID；加 `--wait` 才轮询到回合结束（`--timeout` 仅对 `--wait` 生效）；
4. 把 sessionId、标题、模块、会话来源（复用/新建）、状态、目标 HEAD 写到 `dispatch/log.md`；未等待时状态为「已发送，未等待回合」，并写明回到 GUI 会话的方式；
5. 打印会话信息；后续细节由用户在同一个会话里继续提。

**默认复用，不每次新建**：同一项目同一模块的后续任务继续用同一个会话，会话上下文就是开发资产；不同模块各自一个会话，不借其它模块的上下文。派发器不看上下文压力（压缩由 harness 负责）；选中的会话正在运行时先等它空闲（`--idle-wait`，默认 300s），超时报错并建议 `--new`，不会静默改成新建。压力 ≥ 0.9 只提示「可考虑 `--new`」，不自动切换。只有并行独立需求、上下文污染、排障或模块隔离时才加 `--new`。

会话命名与模块：

- 标题固定为 `[awf] <项目名> · <模块名>`，不带任务号；同一模块的多个任务共享一个会话。
- 模块来源：`--module <名称>` > 票据可选行 `- 模块：<名称>` > 默认 `通用`。
- 复用键 = 项目 + 模块：标题不同（其它模块）不复用，直接新建本模块会话。项目里还没有规范会话、且只有一个旧格式空闲会话时复用它并改名为规范标题；其余情况不猜，直接新建。

常用参数：

| 参数 | 作用 |
|---|---|
| `--wait` | 等待回合结束并打印回报；**团队派发默认加**（脚本默认不等待） |
| `--timeout N` | 等待秒数，仅 `--wait` 生效（默认 600） |
| `--no-wait` | 默认行为的兼容别名，与 `--wait` 互斥 |
| `--reuse` | 默认行为：按「项目 + 模块」复用目标工作区已有的常驻会话 |
| `--new` | 强制新建会话（隔离/调试）；与 `--reuse` 互斥 |
| `--module <名称>` | 模块名（标题 `[awf] <项目> · <模块>`）；默认取票据「模块：」行，都没有用「通用」 |
| `--session <id>` | 直接向指定会话发送（续跑历史会话/人工指定），不会新建 |
| `--idle-wait N` | 选中会话正在运行时最多等它空闲的秒数（默认 300） |
| `--dry-run` | 只做前置检查，不创建会话 |
| `--headless` | 回退 headless（默认后台启动，`--wait` 才同步等待） |
| `--handoff` | 只生成交接单，不执行 |
| `--add-workspace` | 目标未登记工作区时自动登记 |
| `--team` | 任务包附加团队拆分建议，目标方自行决定是否拆队 |
| `--prune` | 归档已完成票据：扫描 `dispatch/tasks/*.md`，按目标 commit / 账本 `done.md` 判定；默认 dry-run 只打印计划 |
| `--apply` | 配合 `--prune` 真正移动文件到 `dispatch/archive/<别名>/<YYYY-MM>/` |
| `--json` | 机器可读输出（含 `reused: true/false` 与 sessionId） |

`--headless` 默认也在后台启动并立即返回输出文件路径，`--wait` 才同步等待；headless / handoff 不参与会话复用。

手工等价操作：GUI 左侧切到目标工作区 → 打开（或新建）会话 → 粘贴任务包。效果相同，只是没有自动前置检查与日志。

## 票据生命周期

`dispatch/tasks/*.md` 是一次性票据：完成后用 `--prune` 归档到 `dispatch/archive/<别名>/<YYYY-MM>/`，主目录只留在途；`dispatch/log.md` 是永久日志，不清理。

判定 completed：目标仓库提交消息含任务 ID，或目标账本 `agent-workflow/tasks/*/done.md` 已含该 ID；解析不到目标项目/任务 ID、目标不是 git 仓库时判 unknown 并跳过。

```sh
"$KIT/bin/awf-dispatch" --prune           # dry-run：只打印计划，不改文件
"$KIT/bin/awf-dispatch" --prune --apply   # 确认后真正归档
```

## 任务包

派发前写一份任务文件（`dispatch/tasks/<ID>-<slug>.md`），至少包含：

- 目标项目与任务 ID；类型 `dev|debug|docs`
- 可选模块：`- 模块：<名称>`（同一项目不同模块各自一个常驻会话；不写默认「通用」）
- 一句话目标、修改范围、明确不做什么
- 验收标准与**必须实际执行**的验证命令
- 目标项目账本要求：在 `tasks/<type>/current.md` 认领、完成后归档
- 提交要求：只允许本地 commit，禁止 push
- 回报格式：状态 / 变更文件 / 验证结果 / commit / 阻塞

任务包不要依赖调度方上下文；目标 agent 是独立会话。

## 回退

回退由 captain 决定并派给 dispatcher 执行；dispatcher 不自行降级：

| 情况 | 回退 | 代价 |
|---|---|---|
| GUI 未运行 / 认证失效 | `--headless`（需用户同意） | 默认后台启动并立即返回输出路径（`--wait` 才同步等待）；会话不在 GUI 工作区，用户不能直接续聊 |
| 无法创建会话 | `--handoff` | 只生成交接单，需用户手工在目标会话执行 |
| 目标未登记工作区 | `--add-workspace` 或 GUI 添加 | 否则会话落在 Ungrouped |
| 目标无工作流 | 先 `awf init`，再派发 | 不要跳过 G1 |

## 写者与账本

- 目标 agent 写目标项目的 `tasks/**`、`status.md`、代码与 commit。
- 调度方只写自己的 `dispatch/log.md` 与任务文件；**不要**跨仓库改目标账本。
- 账本与 commit 归 captain；dispatcher 只回报结果，不写 `tasks/**`。
- 一个任务只有一个 Owner；目标已有 active 任务时不要并行派发同一模块。

## 验收与收尾

1. dispatcher 等回合结束后，检查目标 agent 的回报是否包含任务包五项（状态 / 变更文件 / 验证结果 / commit / 阻塞，见 `workflows/cross-project.md`），再按团队回报五项（`docs/team-flow.md`）汇总后回报 captain。
2. captain 在目标仓库核对 `git log -1`、`git status`、`./agent-workflow/check_workflow.sh`（关键命令不只看成员自述）。
3. captain 记录：会话 ID、任务文件、状态、目标 HEAD、时间。
4. 用户后续细节优先回到同一会话；只有新目标或新任务才重新派发。

## 失败处理

- `workspace-missing`：在 GUI 添加工作区，或 `--add-workspace`；不要用 `cwd` 绕过。
- `workflow-missing`：先 `awf init` / 补齐 `agent-workflow/`。
- `writer-held` / `session/conflict`：目标会话被 GUI 占用或同目录写者冲突；切走/等待后重试。
- `auth-required` / `connection refused`：重开 GUI URL；或 `--headless`。
- 回合超时（退出码 3）：会话保留，不要杀掉；回 GUI 看进度，由 captain 决定加大 `--timeout` 重派（`--force`）、改派或降级。

## 安全

`awf-dispatch` 只在本地读取 DSH GUI 的认证 cookie，用于本机 API；不打印、不写入任务文件或日志。不要把 cookie 粘进任何输出。
