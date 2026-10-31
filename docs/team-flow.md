# 团队执行流程（AgentTeams 适配层）

> 本文件是**本仓库本地约定**，不进入 `templates/`，也不随 `awf init` 分发。
> 主规范仍是 `agent-workflow/README.md` 与 `agent-workflow/workflows/*.md`；本文件只规定"什么时候、怎么把主线流程交给团队"。
> 三条轨道直接对应 `workflows/docs.md`、`workflows/dev.md`、`workflows/debug.md`，不另立规范。

## 什么时候用

- 多文件、跨模块、需要独立复核的改动
- 诊断类问题有 2 个以上可并行验证的假设
- 文档要作为后续开发的契约（先 docs 后 dev）

**不用**：一句话文案、单文件小修、纯查询、跑一次校验。

## 轨道 A：docs（文档 / 契约）

适用 `workflows/docs.md`。文档本身是交付物，或后续 dev 的契约。

```text
docs（撰写）
  └─> docs-review（事实核对：代码路径、链接、过期信息）
        └─> archive（队长归档 + 提交）
```

- 成员：`doc-writer` + `fact-checker`（1 人任务时不开队）
- 硬性要求：结论必须给 `file:line`；不确定的标「待确认」；审阅必须实际打开被引用的文件
- 账本类型：`tasks/docs/`，ID `DOCS-xxx`

## 轨道 B：dev（功能开发，默认主力）

适用 `workflows/dev.md`（review 子流程见 `workflows/review.md`）。

```text
docs（设计/契约，可裁剪）
  └─> dev（实现，不 commit）
        └─> review-test（独立复核 + 独立重跑验证）
              └─> archive（文档回填 + 队长提交）
```

- 成员：`doc-writer`（可省）+ `implementer` + `reviewer`
- 硬性要求：实现只改声明范围；验证命令必须实际执行；review 必须独立重跑，禁止只读自我报告
- 账本类型：`tasks/dev/`，ID `DEV-xxx`

## 轨道 C：debug（缺陷 / 异常）

适用 `workflows/debug.md`。核心是指假设可证伪，不是堆日志。

```text
hypothesis-a（假设 1 验证）┐
hypothesis-b（假设 2 验证）┤─> fix（根因修复 + 回归）
                          ┘        └─> verify（独立复核 + 回归范围确认）
                                        └─> archive（复盘入 history）
```

- 成员：`diagnoser` ×2（各自独立假设）+ `implementer` + `verifier`
- 硬性要求：每条假设写「假设 / 证据 / 证伪方法 / 结果」；根因未明确不得大范围改代码；verify 要跑**相关回归**而不只是原复现
- 账本类型：`tasks/debug/`，ID `DEBUG-xxx`

## 队长职责（三轨通用，不可下放）

1. 开工前把主任务写进 `agent-workflow/tasks/<type>/current.md`
2. 账本只由队长写；成员只报告改动文件与命令结果
3. 收尾顺序固定：**归档 → `check_workflow.sh` → `awf status` → 本地 commit**
4. 成员"完成"不等于验收通过；关键命令队长自己复跑
5. 禁止 push

## 与原流程的映射

| awf 流程 | 轨道 | 团队增量 | 不能替代的原有要求 |
|---|---|---|---|
| `workflows/docs.md` | A | 独立事实核对 | 认领字段、`file:line` 出处 |
| `workflows/dev.md` | B | 独立 reviewer、docs 契约前置 | 强制验证、review 子流程、归档顺序 |
| `workflows/debug.md` | C | 并行假设、独立回归验证 | 可证伪格式、根因优先、复盘入 history |
| `workflows/review.md` | B/C 共用 | reviewer 角色化 | 回流原任务、不新建任务 |
| `workflows/cross-project.md` | 不走团队 | — | 仍用 `awf-dispatch` 派发给目标会话 |

## 怎么发起

```text
用 AgentTeams 按 docs/team-flow.md 执行：<一句话目标>
```

队长先出 staged 计划（含轨道、成员、DAG），用户在 Web 面板点「确认并启动团队」后才创建成员。

## 成本与回退

- 成员各自长上下文是独立成本；A 轨单人可完成时不开队，C 轨只在假设可并行时开队
- 插件不可用时退回单会话：同一任务包去掉团队段即可
- 团队归档在 `.agent-teams/archive/`，不进入 git
