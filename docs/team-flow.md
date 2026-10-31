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

## 派发模式：跨项目（cross-project）

跨项目派发**同样默认由团队执行**：本仓库团队不代写目标仓库，只负责把任务送到目标项目自己的会话，并等结果回来。本节是 §2 三轨之外的派发轨道——三条轨道决定「目标项目内部怎么改」，本节决定「谁去派、谁等、谁汇总」。

### 角色

| 角色 | 由谁担任 | 职责 | 不做 |
|---|---|---|---|
| captain | 需求方（主线） | 拆目标、写票据、建队、汇总回报、写本仓库账本、commit | 不改目标仓库、不替成员干活 |
| dispatcher | 每个目标一个成员 | 只派一个目标，`--wait` 同步等到回合结束，回报结果 | 不写 `tasks/**`、不自行改派或降级 |

多个目标 = 多个 dispatcher，各自等待自己的目标，互不阻塞；成员之间不互相等待，只对 captain 回报。

### 最小流程

1. captain 登记账本：`agent-workflow/tasks/<type>/current.md`，`协作模式=team`，写清目标项目（见 §0）
2. captain 为目标写票据 `dispatch/tasks/<项目>-<ID>-<slug>.md`（验收标准 + 必须实际执行的验证命令 + 任务包五项回报格式）
3. captain 建队：每个目标一个 dispatcher 任务（普通 `kind=work` 即可），`inScope` 只含「执行派发 + 回结果」
4. dispatcher 执行 `awf-dispatch <目标> <票据> --wait --timeout <秒>`——**默认加 `--wait`**，等回合结束，不把「已发送」当「已完成」
5. dispatcher 回报 captain：成功/失败、目标 commit、`check_workflow.sh` 结果、阻塞原因、退出码
6. captain 汇总：写 `dispatch/log.md`、更新本仓库账本、归档票据、本地 commit

### 多目标与依赖

- **多目标（无依赖）**：多个 dispatcher 同时 `--wait` 各自的目标，互不阻塞；captain 按回报到达顺序汇总，不要求同步起步。
- **有依赖**：上游回报「成功 + 目标 commit 已落地」后，captain 才派下游；不下发「等上游」的空转成员，也不让下游先占写者。

### 失败与超时

dispatcher 必须把 `awf-dispatch` 的退出码一并回报，captain 据此决策：

| 退出码 | 含义 | captain 处理 |
|---|---|---|
| 0 | 派发/等待正常结束（`--wait` 时回合已结束**且已落地**；**不代表任务成功**） | 按团队回报五项（见下）核对任务自身结果，再进账本 |
| 2 | 前置门不过 / 派发失败（缺工作流、缺工作区、写者冲突、用法错误） | 按提示补门（`awf init` / `--add-workspace` / 等写者），或改派、降级 handoff |
| 3 | `--wait` 超时：回合未结束（会话仍在运行），或回合已结束但任务未落地（无 commit/未归档） | 不杀会话；回 GUI 看进度，决定续等（重派并加大 `--timeout`；同名会话重派还需 `--force`）、`--session` 续跑或改派 |
| 4 | 疑似僵尸会话：回合 <5s 即时结束且零输出零工具调用 | 用 `--new` 重派或在 GUI 重开会话；不要继续在同一会话上续跑空回合 |
| 1 | 未预期异常 | 保留输出，原样回报；不静默重试 |

- 重试、改派、降级（`--headless` / `--handoff`）由 captain 决定；其中 `--headless` 需用户明确同意（G4 / 技能 / 模板均有此要求），**成员不得自行降级**；dispatcher 不得自行绕过前置门。
- 目标回报「阻塞」时 dispatcher 原样转述阻塞点，captain 不替目标改代码。
- 目标项目内部若有团队能力，是否拆队由**目标方**决定，本仓库 captain 不代开第二层团队。

### 团队回报五项（dispatcher → captain）

「团队回报五项」是团队内固定的结果回报格式，与「任务包五项」不是同一组：**任务包五项**（状态 / 变更文件 / 验证结果 / commit / 阻塞）是目标 agent 回给 dispatcher 的格式，**团队回报五项**是 dispatcher 回给 captain 的格式，也不是任务包里的「验收标准 / 修改范围」：

1. **退出码与最终状态**：`awf-dispatch` 退出码 + 目标回合最终状态（成功 / 失败 / 超时 / 未落地 / 僵尸）
2. **目标 commit hash**：目标仓库落地的提交（没有就写「无」）
3. **check / 验证命令结果**：目标项目 `check_workflow.sh` 与任务包要求的命令，实际执行的实际结果
4. **阻塞原因**：无 / 具体原因（含错误码、报错摘要）
5. **需要 captain 决策的事项**：重试、改派、降级、放宽门禁等

任务包里的「验收标准 / 修改范围」由 captain 建队前写定、约束目标 agent 怎么做；团队回报五项只约束成员怎么把结果带回来。两者不要混用，也不要拿验收标准代替回报。

### 豁免与成本

- 单行修改、只读查询、跑一次校验：不建队，直接做，并在回复里说明为什么不建队。
- 机械维护任务（工作流升级/同步、批量拷贝、纯命令序列，无业务决策）：captain 直发 `awf-dispatch --wait`，不建 dispatcher 成员层；票据里标注「机械任务」，验证以复跑命令为准。
- 建队开销大于任务本身（例如一个目标、一张小票据）：同样可以不建队，但必须说明；说明本身是这条规则的验收点。

---

## 3. 质量合同：让插件当门禁

约定靠自觉，合同靠机制。非平凡改动优先用插件的 quality kind，而不是普通 work 任务：

| 用途 | 用法 |
|---|---|
| B 轨实现 | `kind=implementation`，把改动范围写 `inScope`、验证命令写 `verify`，验收写 `acceptance` |
| B/C 轨复核 | `kind=review`，`reviewedTaskId` 指回实现任务 |
| C 轨独立验证 | `kind=verification`，同样带 `verify` 命令 |

关键收益：**review 判 `needs_revision` 时，插件自动补 `repair` + 下一轮 review**，不要手工把 findings 变成新任务、更不要重排整条 DAG。手工补任务会丢掉 attempt 归属和重试计数。

纯文档、纯查询不要上 quality 合同——字段成本高于收益。

## 3.5 两级复核：速度与风险分级（默认走快速车道）

复核成本按改动风险分级，避免小改动也走满 review 循环：

| 轨道 | 适用 | 流程 | reviewer 轮 |
|---|---|---|---|
| **A 全量架构复核** | 架构级：工作流契约、AGENTS/模板结构、跨项目规则、命令默认行为、会话模型 | 实现（附 diff）→ review → 有 blocker 才 repair → 复审 | 完整（至多 1 次返工） |
| **B 快速车道（默认）** | 新增功能 / 小调整（新选项、bug fix、文档、机械任务） | 实现**必须自带测试进 smoke** + 自检门禁 → captain 快验（看 diff + 跑测试）→ 直接收尾 | 0 轮 |

### 快速车道的自检门禁（声称完成前必须贴输出）

```sh
bash test/smoke.sh            # 新增功能必须带新断言
python3 -m py_compile bin/awf bin/awf-dispatch
bash -n bin/awf test/smoke.sh
./agent-workflow/check_workflow.sh
git diff --check
```

加上针对性 grep（如模板 harness 专有词）。grep 能查出来的问题不许到 reviewer 手里。

### A 类的复核要增量

- 实现者在任务回报里附 `git diff` 摘要 + 自检输出
- reviewer 看 diff 与关键门禁，不重读全部文档
- 返回 values：**只有 blocker/medium 影响正确性才 needs_revision**；low/措辞类记入「后续清单」，合并下次处理，不单独返工

### 测试归属：谁用谁的校验

| 场景 | 用谁的测试 | 含什么 |
|---|---|---|
| kit 自身开发（改 bin/awf、awf-dispatch、templates） | **kit 的 smoke + check_workflow** + py_compile/bash -n | 新功能必须自带断言进 smoke |
| 目标项目一般任务（升级框架/业务功能，经派发） | **目标项目自己的 check_workflow** + 任务包验收 + 目标自己的测试（如有单测） | **不跑 kit 的 smoke**——它是框架测试，与目标业务无关 |

> kit 冒烟测试只对 kit 开发负责；派发到别的项目时，以目标项目的校验为准。

> 判定依据是「框架测试套件能否兜底」：测试绿 + diff 合理 → B；涉及契约/默认行为/安全 → A。拿不准问用户。

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
- 跨项目派发也走本仓库团队（见「派发模式」）：captain 建队、每个目标一个 dispatcher，成员用 `awf-dispatch --wait` 同步等待并回报；目标方若有插件，是否拆第二层团队由**目标队长**自行决定

## 6. 默认路由：先派发，主对话不阻塞

检测到当前 harness 具备团队协作能力时（DSH：`agent_teams_*` 工具可用或 `/agent-teams` 可调用），**所有任务默认优先派发给团队**；需求进入时按此顺序处理：

1. **澄清**（只在需求有歧义时）→ 2. **出 staged 计划** → 3. 用户点确认 → 4. 成员后台执行
5. 主对话继续处理只读分析、跨项目派发、下一需求澄清 → 6. 报告回来后由队长汇总与验收

约束：

- 同一时间只开 1 个团队；新需求排队，不并行开第二个队
- 跳过条件：团队不可用，或协调成本高于任务本身（单行修改、只读查询、跑一次校验、建队开销大于任务）——直接做，并在回复里说明原因
- 本仓库内的建队使用 `approval=automatic`（用户已授权）：跳过 staged 审批直接执行；建队后仍贴 3 行计划摘要，发现方向错误立即叫停或改任务
- 计划创建本身必须很短：目标、轨道、成员、DAG、验收命令；不在主对话里替成员干活
- 主对话不得修改成员正在改的文件；冲突时排队
- 跨项目派发同样走团队：captain 建队、每个目标一个 dispatcher 成员，成员用 `awf-dispatch --wait` 同步等到回合结束并回报 captain（见「派发模式」）；只有豁免场景才直接在主线派发

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
