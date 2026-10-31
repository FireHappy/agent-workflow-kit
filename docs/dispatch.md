# 跨项目派发

目标：在 A 项目里把任务交给 B 项目的 agent，由它按 B 自己的 `AGENTS.md` 与工作流执行，A 只收结果。

## 推荐：目标工作区会话（会话优先）

默认流程不是 headless，而是：

1. 检查 B 是否有自己的工作流；
2. 检查 B 是否已登记为当前 harness 的工作区；
3. 满足后在 B 的工作区**创建正式会话**，把任务发进去；
4. 用户之后可以在同一个会话里继续提细节。

这样任务可见、可追问、可恢复；headless 只作为无人值守回退。

## 四道前置门

| 门 | 检查 | 不满足时 |
|---|---|---|
| G1 工作流 | `AGENTS.md`、`agent-workflow/project.yaml`、`workflows/`、`check_workflow.sh`，且 `check_workflow.sh` 通过 | 先 `awf init`（需用户确认），不要向无流程仓库派发 |
| G2 工作区 | 目标路径已登记为当前 harness 的工作区（DSH：GUI 工作区列表 / `workspace.json`） | 在 GUI「添加工作区」，或 `awf-dispatch --add-workspace`；否则 handoff |
| G3 可写 | 无已跟踪改动、无其他 active 任务 | 停止并询问；不要和另一个写者并行 |
| G4 通道 | 目标工作区能创建会话（GUI 在线、认证有效、模型可用） | 回退 headless（需用户同意）或 handoff |

只读任务可以放宽 G3，但仍建议在会话中执行，留下可追问的记录。

## 派发器：awf-dispatch

DSH 适配器（Python 3 标准库，不写第三方依赖）：

```sh
./agent-workflow/bin/awf-dispatch <别名|目录> dispatch/tasks/<项目>-<ID>-<slug>.md
```

它会：

1. 跑 G1–G4，并打印前置换结果；
2. 在目标工作区 `session/create`，标题设为 `<项目> · <任务标题>`；
3. 发送任务包，等待回合结束（`--no-wait` 只受理）；
4. 把 `sessionId`、标题、状态、目标 HEAD 记录到 `dispatch/log.md`；
5. 打印会话信息；后续细节由用户在同一个会话里继续提。

常用参数：

| 参数 | 作用 |
|---|---|
| `--dry-run` | 只做前置检查，不创建会话 |
| `--headless` | 回退 `dsh --profile headless`（会话不可见，需用户同意） |
| `--handoff` | 只生成交接单，不执行 |
| `--add-workspace` | 目标未登记工作区时自动登记 |
| `--no-wait` | 只发送任务，不等待回合结束 |
| `--force` | 允许同名会话重复派发 |
| `--allow-dirty` / `--allow-active` | 放宽 G3（需明确知道风险） |
| `--json` | 机器可读输出 |

## 手工等价流程

GUI 左侧切到目标工作区 → 新建会话 → 粘贴任务包。效果相同，只是没有自动前置检查与日志。

## 回退矩阵

| 方式 | 本质 | 适用 | 关键限制 |
|---|---|---|---|
| 目标工作区会话（推荐） | 正式会话，在目标工作区 | 需要用户后续追问 | 依赖 GUI 在线 |
| `awf-dispatch --headless` | 独立进程、独立会话 | 无人值守、CI、批量 | 会话不在 GUI 工作区，无法直接续聊 |
| `awf-dispatch --handoff` | 只生成交接单 | GUI 不可用 / 用户自己执行 | 不自动执行 |
| `subagent(cwd=/path/to/B)` | 同进程、独立上下文 | 只读分析、1–N 个小任务 | 用户不能直接在该会话续聊 |

**不要**用父会话 `working_directory` 切过去，再在那边写文件：`cwd` 变了但写入边界没变。

## 任务包模板

```text
你在 <项目> 仓库中执行任务，必须遵守本仓库 AGENTS.md 与 agent-workflow/workflows/<type>.md。

任务：<ID> <一句话目标>
1. <实现步骤>
2. <验证命令，必须实际执行>
3. 在 tasks/<type>/current.md 认领 <ID>，补齐：优先级、状态 active、Owner、协作模式、来源任务、修改范围、依赖、最近更新、目标、验收标准、下一步。
4. 运行 ./agent-workflow/check_workflow.sh 与 ./agent-workflow/bin/awf status。
5. 归档到 tasks/<type>/done.md。
6. 本地 git commit（禁止 push）：<提交信息>。

回报：状态 / 变更文件 / 验证命令与结果 / commit sha / 阻塞点。
```

要点：

- 显式写“必须遵守 AGENTS.md”，否则模型可能跳过流程；
- 要求“实际执行”验证，避免只声明；
- 需要 review 时写死“先 review 再归档”，不能留空；
- 明确“禁止 push”；
- 任务包不要依赖调度方上下文。

## 结果契约

```text
- 状态：完成 / 阻塞
- 变更文件：...
- 验证：命令 + 结果摘要
- commit：sha
- 阻塞点：无 / 原因
```

## 写者与账本

- 目标 agent 写目标项目的 `tasks/**`、`status.md`、代码与 commit。
- 调度方只写自己的 `dispatch/log.md` 与任务文件；不要跨仓库改目标账本。
- 一个任务只有一个 Owner；目标已有 active 任务时不要并行派发同一模块。

## 安全与凭据

- 会话模式使用 DSH GUI 的本地认证；`awf-dispatch` 只在本地读取 cookie 调本机 API，不打印、不写入任务文件或日志。
- headless 默认走 `DEEPSEEK_API_KEY`，不读 GUI 保存的 OAuth 凭据。需要复用时写入一次 `~/.dsh/profiles/headless/cordis.patch.yml`：

```yaml
- id: credentials
  disabled: false
- id: authorization
  disabled: false
- id: deepseek-account
  disabled: false
- id: agent-default-model
  name: '@deepseek-ai/dsh-agent-default-model'
  config:
    provider: deepseek-account
    model: deepseek-flash
```

替代方案：在 `~/.dsh/.env` 写 `DEEPSEEK_API_KEY=...`（明文，注意权限）。

## 失败处理

- `workspace-missing`：在 GUI 添加工作区，或 `--add-workspace`；不要用 `cwd` 绕过。
- `workflow-missing`：先 `awf init` / 补齐 `agent-workflow/`。
- `writer-held` / `session/conflict`：目标会话被 GUI 占用或同目录写者冲突；切走/等待后重试。
- `auth-required` / `connection refused`：重开 GUI URL；或 `--headless`。
- 回合超时：会话保留，不要杀掉；在 GUI 查看进度，必要时 `--no-wait` 重新派发新任务。

## 优化说明

相比旧版“默认 headless”，当前流程的改进：

1. **会话优先**：工作留在 GUI 工作区，用户能继续追问，不用重新派发。
2. **四道门**：先排除“无工作流 / 无工作区 / 有写者 / GUI 不可用”，避免生成不可见的 headless 会话。
3. **workspaceId 而非 cwd**：会话归入正确的工作区分组，不会落到 Ungrouped。
4. **只读前置**：`git status`、active 任务、`check_workflow.sh` 都在派发前检查，避免和另一个写者冲突。
5. **单写者**：目标 agent 写目标账本；调度方只写自己的 dispatch log。
6. **可回退**：会话不可用时才用 headless/handoff，且必须让用户知道代价。
7. **可审计**：日志记录 sessionId、工作区、目标 HEAD、状态；后续可回到同一会话。
8. **核心与适配分离**：工作流规范保持 harness 无关；DSH 会话派发放在可选适配器 `awf-dispatch`。

## 已实测

两个空项目 demo01 / demo02，跨项目派发：

| 任务 | 产物 | 结果 |
|---|---|---|
| DEV-001 | `calc/sum.py` + `scripts/test.sh` | 编译与断言通过，本地提交 |
| DOCS-001 | `docs/calc.md` | 归档并通过 check |
| DEV-002 | `scripts/check.sh` | 通过，并验证了失败路径 |
| DEV-003 | `web/` 网页闹钟 | 通过 Node/HTTP/headless Chrome 验证，本地提交 |

DEV-003 还验证了“在 demo02 工作区创建正式会话并执行”的流程：会话 `session-eb25416b...` 出现在 `agent-demo02` 工作区，用户可直接继续提细节。

## 检查清单

- [ ] G1–G4 全过
- [ ] 任务包含验证命令和回报契约
- [ ] 会话在目标工作区（不是 Ungrouped）
- [ ] 目标 agent 自己写账本
- [ ] 只本地 commit，未 push
- [ ] 调度日志记录了 sessionId 与目标 HEAD
- [ ] 已告诉用户后续在哪个会话继续
