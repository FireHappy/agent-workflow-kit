# 团队执行流程（AgentTeams 适配层）

> 本文件随 `agent-workflow-scaffold` 技能分发（仓库根即技能目录），但不进入 `templates/`、不随 `awf init` 写进每个新项目——由使用方按需采用。
> 主规范仍是 `agent-workflow/README.md` 与 `agent-workflow/workflows/*.md`；本文件只规定"什么时候、怎么把主线流程交给团队"。
> 三条轨道直接对应 `workflows/docs.md`、`workflows/dev.md`、`workflows/debug.md`，不另立规范。

## 0. 与账本的关系：先登记，再建队

团队任务和 awf 账本是两套状态，必须显式对齐：

1. **建队前**把主任务写进 `agent-workflow/tasks/<type>/current.md`：`Owner=队长`、`协作模式=team`、`来源任务=<团队名>`
2. 团队名用 `<任务ID>-<slug>`（如 `DEV-005-team-flow`），归档后能按 ID 检索
3. 成员**不写** `tasks/**`；只报告改动文件、命令输出、目标 HEAD
4. 收尾时由队长把团队产出写进账本并归档：**归档 → check → awf status → commit**
5. `.agent-teams/` 不入库；对账依据是 `dispatch/log.md` + 账本 + `git log`

这一步是原来最大的缺口：团队"完成"很容易，账本里却查不到对应记录。

## 1. 什么时候用

- 多文件、跨模块、需要独立复核的改动
- 诊断类问题有 2 个以上可并行验证的假设
- 文档要作为后续开发的契约（先 docs 后 dev）

**不用**：一句话文案、单文件小修、纯查询、跑一次校验。为这类任务开团队，协调成本大于收益。

## 2. 三条轨道

### 轨道 A：docs（文档 / 契约）

适用 `workflows/docs.md`。

```text
docs（撰写）
  └─> docs-review（事实核对：代码路径、链接、过期信息）
        └─> archive（队长归档 + 提交）
```

- 成员：`doc-writer` + `fact-checker`（1 人可完成时不开队）
- 硬性要求：结论必须给 `file:line`；不确定标「待确认」；审阅必须实际打开被引用的文件
- 账本：`tasks/docs/`，ID `DOCS-xxx`

### 轨道 B：dev（功能开发，默认主力）

适用 `workflows/dev.md`（review 子流程见 `workflows/review.md`）。

```text
docs（设计/契约，可裁剪）
  └─> dev（实现，不 commit）
        └─> review-test（独立复核 + 独立重跑验证）
              └─> archive（文档回填 + 队长提交）
```

- 成员：`doc-writer`（可省）+ `implementer` + `reviewer`
- 硬性要求：实现只改声明范围；验证命令必须实际执行；review 必须独立重跑，禁止只读自我报告
- 账本：`tasks/dev/`，ID `DEV-xxx`

### 轨道 C：debug（缺陷 / 异常）

适用 `workflows/debug.md`。核心是假设可证伪，不是堆日志。

```text
hypothesis-a（假设 1 验证）┐
hypothesis-b（假设 2 验证）┤─> fix（根因修复 + 回归）
                          ┘        └─> verify（独立复核 + 回归范围确认）
                                        └─> archive（复盘入 history）
```

- 成员：`diagnoser` ×2（各自独立假设）+ `implementer` + `verifier`
- 硬性要求：每条假设写「假设 / 证据 / 证伪方法 / 结果」；根因未明确不得大范围改代码；verify 要跑**相关回归**而不只是原复现
- 账本：`tasks/debug/`，ID `DEBUG-xxx`

## 3. 质量合同：让插件当门禁

约定靠自觉，合同靠机制。非平凡改动优先用插件的 quality kind，而不是普通 work 任务：

| 用途 | 用法 |
|---|---|
| B 轨实现 | `kind=implementation`，把改动范围写 `inScope`、验证命令写 `verify`，验收写 `acceptance` |
| B/C 轨复核 | `kind=review`，`reviewedTaskId` 指回实现任务 |
| C 轨独立验证 | `kind=verification`，同样带 `verify` 命令 |

关键收益：**review 判 `needs_revision` 时，插件自动补 `repair` + 下一轮 review**，不要手工把 findings 变成新任务、更不要重排整条 DAG。手工补任务会丢掉 attempt 归属和重试计数。

纯文档、纯查询不要上 quality 合同——字段成本高于收益。

## 4. 队长职责（三轨通用，不可下放）

1. 开工前登记账本（见 §0）
2. 出 staged 计划，等用户点「确认并启动团队」；不自己批准
3. 账本只由队长写；成员只报告
4. 收尾顺序固定：**归档 → `check_workflow.sh` → `awf status` → 本地 commit**
5. 成员"完成"不等于验收通过；关键命令队长自己复跑
6. 禁止 push
7. 团队终态后归档，不留悬空 attempt

## 5. 成本与约束

- 同一时间只开 **1 个团队**；成员 **2–3 人**
- 成员各自长上下文独立计费；并行的前提是真的有独立工作，不是"人多显得快"
- staged 计划必须先给用户看；不确认就不启动、不消耗成员 token
- 跨项目任务不走本仓库团队：`awf-dispatch` 把任务发给目标会话，目标方若有插件，由**目标队长**自行决定是否拆队

## 6. 默认路由：先派发，主对话不阻塞

检测到当前 harness 具备团队协作能力时（DSH：`agent_teams_*` 工具可用或 `/agent-teams` 可调用），**所有任务默认优先派发给团队**；需求进入时按此顺序处理：

1. **澄清**（只在需求有歧义时）→ 2. **出 staged 计划** → 3. 用户点确认 → 4. 成员后台执行
5. 主对话继续处理只读分析、跨项目派发、下一需求澄清 → 6. 报告回来后由队长汇总与验收

约束：

- 同一时间只开 1 个团队；新需求排队，不并行开第二个队
- 唯一的跳过条件：单行修改、只读查询、跑一次校验——直接做，并在回复里说明没开队的理由
- 计划创建本身必须很短：目标、轨道、成员、DAG、验收命令；不在主对话里替成员干活
- 主对话不得修改成员正在改的文件；冲突时排队
- 跨项目任务不进本仓库团队，走 `awf-dispatch`（其本身也不阻塞）

## 7. 发起口令

```text
用 AgentTeams 按 docs/team-flow.md 执行：<一句话目标>
```

队长据此出 staged 计划（轨道 + 成员 + DAG + 质量合同），用户在 Web 面板确认后创建成员。

## 8. 附录：计划模板（复制后改）

```text
目标：<一句话交付物>
轨道：B/dev
成员：implementer（实现）、reviewer（独立复核）

t1 实现：kind=implementation
  inScope: <文件/目录>
  verify: <必须实际执行的命令>
  acceptance: <可判定的结果>

t2 复核：kind=review，deps=t1，reviewedTaskId=t1
  要求：独立重跑 verify；输出 verdict + findings

队长：建队前登记 <type>-xxx；收尾归档 → check → status → commit
```
