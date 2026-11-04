# 跨项目派发

目标：在 A 项目里把任务交给 B 项目的 agent，由它按 B 自己的 `AGENTS.md` 与工作流执行，A 只收结果。

## 团队派发模式（默认，派发即建队）

检测到当前 harness 有团队协作能力时，跨项目派发**默认建队执行**，而不是主线自己派发：

- **captain = 需求方（主线）**：拆目标、写票据、建队、汇总回报、写本仓库账本与 commit。不直接改目标仓库。
- **dispatcher = 每个目标一个成员**：只负责一个目标，执行 `awf-dispatch ... --wait` **同步等到回合结束**，然后回报 captain。

`--wait` 是团队模式的默认动作：派发不是「发出去就算完成」，成员必须等到目标 agent 的回合结束，拿到目标 agent 按任务包五项（状态 / 变更文件 / 验证结果 / commit / 阻塞，见 `templates/workflows/cross-project.md`）给出的结果，再按团队回报五项汇总给 captain。

### 用法 1：单目标

```sh
# dispatcher 成员执行（默认加 --wait，显式给超时）
./agent-workflow/bin/awf-dispatch demo02 dispatch/tasks/demo02-DEV-010-fix-calc.md --wait --timeout 900
# 退出码 0：派发/等待正常结束（不代表任务成功）→ 按团队回报五项回报 captain
```

captain 只做三件事：写票据、把它交给 dispatcher、收回报后汇总归档；命令本身由成员执行，captain 不代跑。

### 用法 2：多目标（无依赖，并行）

每个目标一个 dispatcher，各自等待自己的目标，互不阻塞：

```sh
# dispatcher A
./agent-workflow/bin/awf-dispatch demo01 dispatch/tasks/demo01-DOCS-002-calc-doc.md --wait --timeout 900
# dispatcher B
./agent-workflow/bin/awf-dispatch demo02 dispatch/tasks/demo02-DEV-011-clock.md --wait --timeout 900
```

- captain 按回报到达顺序汇总，不要求两个成员同时起步；
- 同一目标同一模块仍然只能有一个写者（G3），不要为并行而绕过 `--allow-dirty` / `--allow-active`。

### 用法 3：有依赖（串行）

下游必须等上游回报「成功 + 目标 commit 已落地」后再派：

```sh
# dispatcher A：先做接口/数据，回报 commit sha
./agent-workflow/bin/awf-dispatch demo02 dispatch/tasks/demo02-DEV-012-api.md --wait --timeout 900
# captain 确认 commit 后，再建/派下游
./agent-workflow/bin/awf-dispatch demo02 dispatch/tasks/demo02-DEV-013-ui.md --wait --timeout 900
```

不下发「等上游」的空转成员；依赖关系写在 captain 的分解里，不写在票据里让目标方猜。

### 回报与退出码

dispatcher 必须把退出码一并回报，captain 据此决定重试、改派或降级：

| 退出码 | 含义 | captain 处理 |
|---|---|---|
| 0 | 派发/等待正常结束（`--wait` 时回合已结束**且已落地**；未等待时只代表「已发送」；**不代表任务成功**；headless 进程正常退出且已落地） | 按团队回报五项核对任务自身结果，再进账本 |
| 2 | 前置门不过 / 派发失败（`workflow-missing`、`workspace-missing`、写者冲突、用法错误） | 补门（`awf init` / `--add-workspace` / 等写者），或改派、降级 handoff |
| 3 | `--wait` 超时：回合未结束（会话仍在运行），或回合已结束但任务未落地 | 不杀会话；看 GUI 进度，决定加大 `--timeout` 重派（`--force`）、`--session` 续跑或改派 |
| 4 | 疑似僵尸会话：回合 <5s 即时结束且零输出零工具调用 | 用 `--new` 重派，或在 GUI 重开会话；不要反复续跑同一僵尸会话 |
| 5 | headless 进程**非零退出**（执行失败；区别于 3 的超时/未落地） | 按 headless 输出文件排查目标侧错误，修后重派；不要当「等一等会好」的超时处理 |
| 1 | 未预期异常 | 保留输出原样回报，不静默重试 |

团队回报五项（dispatcher → captain）：

```text
- 退出码与最终状态：0 / 1 / 2 / 3 / 4 / 5；成功 / 失败 / 超时 / 未落地 / 僵尸 / 阻塞
- 目标 commit：<sha 或 无>
- check / 验证结果：./agent-workflow/check_workflow.sh → 通过 / 失败（摘要）
- 阻塞原因：无 / 原因（含错误码）
- 待 captain 决策：无 / 重试 / 改派 / 降级
```

与 `docs/team-flow.md`「团队回报五项」同一组格式；不要与任务包五项（目标 agent → dispatcher 的回报格式）混用。

### 豁免

单行修改、只读查询、跑一次校验可直接由 captain 派发或直接做；建队开销大于任务本身时也可以不建队——两种情况都要在回复里说明为什么没建队。

---

## 推荐：目标工作区会话（会话优先）

团队模式下，dispatcher 的传输默认也不是 headless，而是：

1. 检查 B 是否有自己的工作流；
2. 检查 B 是否已登记为当前 harness 的工作区；
3. 满足后在 B 的工作区**按「项目 + 模块」复用该项目已有的常驻会话**（没有匹配到本模块会话时才新建），把任务发进去，**立即返回会话 ID**（默认异步，不阻塞调度方）；
4. 用户之后可以在同一个会话里继续提细节。

同一项目同一模块的后续任务默认继续用同一个会话：会话上下文是开发资产，上下文增长交给 harness 自己的压缩机制，不因为压力大就自动换会话。不同模块各自一个会话，不串上下文。

团队派发默认加 `--wait`：派发器轮询到回合结束并打印目标 agent 的回报；`--timeout` 只对 `--wait` 生效。

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
2. 默认按「目标项目」复用目标工作区里的常驻会话（标题 `[awf] <目标项目>`，DEV-126 简化，见下「会话复用」）；会话正在运行时进入等待队列，没有可用会话时才新建；
3. 发送任务包；**默认不等待回合**，立即打印会话 ID（加 `--wait` 才等待回合结束并确认落地）；
4. 把 `sessionId`、标题、复用/新建、状态、目标 HEAD 记录到 `dispatch/log.md`；未等待时状态写「已发送，未等待回合」，并记录回到 GUI 会话的方式；
5. 打印会话信息；后续细节由用户在同一个会话里继续提。

常用参数：

| 参数 | 作用 |
|---|---|
| `--dry-run` | 只做前置检查，不创建会话 |
| `--reuse` | 默认行为：按「项目 + 模块」复用目标工作区已有的常驻会话；可显式书写 |
| `--new` | 强制新建会话（隔离/调试），不复用；与 `--reuse` 互斥 |
| `--module <名称>` | 模块名（DEV-126 后只影响展示/票据分类，不再进标题）；默认取票据「模块：」行，都没有用「通用」 |
| `--session <id>` | 直接向指定会话发送任务（续跑历史会话或人工指定），不会新建 |
| `--idle-wait N` | 兼容保留（DEV-126 起会话繁忙的队列等待改由 `--queue-timeout` 控制，默认 60；本参数不再生效） |
| `--queue-timeout N` | 会话繁忙时的**队列等待**上限秒数（DEV-126，默认 60；超时报队列超时，建议 --new 或稍后重试） |
| `--headless` | 回退 `dsh --profile headless`（会话不可见，需用户同意；默认同样不等待） |
| `--handoff` | 只生成交接单，不执行 |
| `--team` | 在会话模式的任务包末尾追加「可选：用 AgentTeams 执行」建议 |
| `--add-workspace` | 目标未登记工作区时自动登记 |
| `--wait` | 等待回合结束、确认落地并打印回报（默认不等待） |
| `--timeout N` | 回合等待 + 落地等待总秒数，仅 `--wait` 生效（默认 600） |
| `--no-wait` | 兼容别名：等价默认行为（只发送，不等待回合） |
| `--force` | 允许同名会话重复派发 |
| `--allow-dirty` / `--allow-active` | 放宽 G3（需明确知道风险） |
| `--check-role` | 软校验目标 role（worker 名牌）与任务描述的关键词交集：匹配通过 / 不匹配输出警告但继续 / 目标无 role 提示但不阻塞——均不改变退出码（不做硬门禁） |
| `--allow-role-mismatch` | 配合 `--check-role`：静默 role 不匹配警告（仍不硬拒） |
| `--allow-legacy-reuse` | 允许复用项目里唯一的旧格式（无 `[awf]` 标记）空闲会话并改名为规范标题；默认只在会话消息含派发任务包标记时才迁移（RT-1，防误吞用户自建会话） |
| `--prune` | 归档已完成票据：扫描 `./dispatch/tasks/*.md`，默认 dry-run 只打印计划 |
| `--apply` | 配合 `--prune` 真正移动文件（默认不移动） |
| `--json` | 机器可读输出 |

### 默认异步与回到会话

默认派发只做「（复用或新建会话）→ 发送任务 → 记日志」，几秒内返回并打印会话 ID：

```sh
./agent-workflow/bin/awf-dispatch demo02 dispatch/tasks/DEV-003.md
# 模块：通用（会话标题 [awf] agent-demo02）
# 复用会话：session-...（复用；reused: true）
# 已记录：/path/to/dispatch/log.md
```

`dispatch/log.md` 的状态写「已发送，未等待回合」，并记录「会话来源：复用 / 新建」与打开方式：GUI 左侧切到目标工作区，打开同名会话即可继续追问。需要等这一回合出结果（脚本串联、CI、立刻验收）时再加 `--wait`：

```sh
./agent-workflow/bin/awf-dispatch demo02 dispatch/tasks/DEV-003.md --wait --timeout 900
```

`--wait` 分两段：先轮询到回合结束，再等「落地」。落地基线（初始 HEAD）在**任务发送前一刻**采集；等落地时目标 `git -C <target> rev-parse HEAD` 与基线相比发生变化（本地 commit），**且最新 commit 的提交消息含本任务 ID**（无关会话/用户的 commit 不算），或账本 `agent-workflow/tasks/<type>/done.md` 出现本任务 ID（归档）。两者任一即完成；超时返回退出码 3，会话保留在 GUI。`--no-wait` 是 `--wait` 的反向兼容别名，等价于默认，二者互斥。

### 等落地与僵尸会话（`--wait`）

回合结束不等于任务完成：目标 agent 可能先结束回合、再等内部复核或提交。派发器在回合结束后每 10 秒检查一次落地，直到 `--timeout` 预算用完（与回合等待共用）：

- 目标 `git rev-parse HEAD` 变化、且最新 commit 含本任务 ID → 已落地（commit）；
- 目标账本 `agent-workflow/tasks/<type>/done.md` 出现本任务 ID → 已落地（归档）；
- 两者都没等到 → 退出码 3，状态「回合已结束但任务未落地（无 commit/未归档）」，**不要当成功进账本**；可重新派发（同名会话需 `--force`）或 `--session <id>` 续跑。

另一类失败是**无进展快失败**：复用旧会话时可能遇到「僵尸会话」（t7 实证：`turn/start → turn/end` 16–21ms 即时结束、零输出零工具调用，脚本却空转到超时）。派发器记录回合耗时与活动证据；若回合耗时 <5s 且零 assistant 输出、零工具调用，立即返回退出码 4，并提示：

```text
会话疑似僵尸（回合即时结束且零输出），请用 --new 重派或在 GUI 重开会话
```

僵尸判定不看会话是否「看起来正常」，只看本回合是否有产出；`--json` 输出的 `zombie`、`turnSeconds`、`sessionId` 与日志状态都会标明。判定优先于等落地（避免在僵尸会话上干等），只有正常回合才进入落地轮询。

`--headless` 默认也在后台启动 `dsh --profile headless`，立即返回 PID 与输出文件路径（`dispatch/headless/*.log`）；加 `--wait` 才同步等待进程结束并打印输出：初始 HEAD 在进程启动前采集，进程**退出 0 后仍校验落地**（commit 含任务 ID / done.md 归档，与会话模式契约一致）；进程**非零退出返回退出码 5**（执行失败，独立于 3 的超时/未落地语义）；进程等待超时仍为 3。`--handoff` 只生成交接单，本身不执行回合，因此没有等待语义。

### 会话复用（默认）

每次派发都新建会话会让项目会话数线性增长，也会丢掉已经积累的上下文。默认行为是**按「项目 + 模块」复用常驻会话**：同一项目同一模块的后续任务继续用同一个会话，会话上下文本身就是开发资产。

派发前先调 `session/list`，按以下条件选择：

1. `cwd` 与目标项目一致（按真实路径比较）；
2. `blank` 为 false（空会话没有上下文可继承）；
3. 标题**精确等于** `[awf] <目标项目>`（复用键 = 目标项目；DEV-126 不再按模块分会话）；
4. **不看上下文压力**：上下文增长交给 harness 自己的压缩机制，不因为压力大就自动换会话。

选中后直接往这个会话 `session/prompt`（`mode=queue`），**不新建会话**，并把标题归一到
`[awf] <目标项目>`。同项目任何模块的票据都复用这同一个会话（繁忙时进入等待队列排队），不再按模块拆分会话、不再有「跨模块上下文串味」的顾虑——模块信息保留在票据中。

标题里的 `[awf]` 是派发器的标记。`--json` 输出与 stderr 文案会打印 `reused: true/false`、`module` 和实际 sessionId，`dispatch/log.md` 记录「模块」「会话来源：复用 / 新建」。

#### 会话命名与模块

会话标题格式固定为：

```text
[awf] <目标项目>
```

例：`[awf] agent-demo01`。标题不再带任务号/模块号，同一项目的多个任务共享一个会话。

例：`[awf] agent-demo01`。标题不再带任务号/模块号，同一项目的多个任务共享一个会话。

模块来源（优先级从高到低）：

1. 命令行 `--module <名称>`；
2. 票据正文的可选行 `模块：<名称>`（放在「目标项目」行附近）：

   ```markdown
   - 目标项目：demo01（/Users/me/GitHub/agent-demo01）
   - 模块：工作流
   ```

3. 都没写时默认 `通用`。

```sh
# 用票据里的「模块：工作流」
./agent-workflow/bin/awf-dispatch demo01 dispatch/tasks/demo01-DEV-020-flow.md
# 命令行覆盖票据里的模块
./agent-workflow/bin/awf-dispatch demo01 dispatch/tasks/demo01-DEV-020-flow.md --module 文档
```

复用/等待的判定规则：

- **同项目同模块**（标题完全一致）→ 复用；
- **同项目其它模块**（标题不同）→ 不复用，新建本模块会话；
- 项目里**还没有任何规范会话**（`[awf]` 标题）、且恰好只有一个旧格式（形如 `<项目> · <任务>`）空闲会话时，**默认不复用它**——只有两种情况下才迁移并顺手把标题改成规范格式：① 该会话消息里含派发任务包标记（旧版派发器在里面派发过，RT-1 回归实证路径）；② 显式加 `--allow-legacy-reuse`（用户确认）。用户自建的 `<项目> · xxx` 普通会话既无标记也无显式放行，**不会被复用/改名/注入任务**，派发器直接新建规范会话；一旦已有规范会话，或旧格式会话不止一个，同样不猜测，直接按模块新建；
- `--session <id>` 可强行指定任意会话（也会归一到当前模块标题）；`--new` 强制新建。

#### 会话正在运行

选中的项目会话如果 `running=true`（还有一个回合没结束），默认**进入等待队列**再发送（DEV-126）：每 3 秒轮询一次 `session/list`，最多等 `--queue-timeout` 秒（默认 60；回合结束等待仍走 `--wait`/`--timeout`）。队列超时后报错并建议 `--new`（或稍后重试、加大 `--queue-timeout`），**不会静默改成新建、也不立即失败**。

#### 上下文压力只作提示

压力值（`pressureTokens / contextWindow`）不参与选择。只有达到 **0.9** 时，输出与日志会提示「该会话上下文接近上限，可考虑 `--new`」——是否换会话由人或 captain 决定，派发器不自动切换。

#### 强制新建与指定会话

```sh
# 强制新建（隔离/调试；与 --reuse 互斥）
./agent-workflow/bin/awf-dispatch demo02 dispatch/tasks/DEV-003.md --new

# 直接向指定会话发送（续跑历史会话 / 人工指定；不会新建）
./agent-workflow/bin/awf-dispatch demo02 dispatch/tasks/DEV-003.md --session session-xxxx
```

`--reuse` 是默认值，可以显式书写，便于脚本表达意图。

> `--new` 只保证**本次**新建：新会话仍使用规范标题，之后同模块派发会在同标题会话里优先选空闲的，可能再次复用它。需要长期隔离时，用 `--title` 给它不同标题，或用不同 `--module`。

什么时候才该 `--new`（手动开新会话）：

- **并行独立需求**：两个互不相关的需求同时在目标项目推进，需要各自独立的上下文；
- **上下文污染**：上一次派发把会话引到错误方向，或需要干净起点重新说明；
- **排障**：调试派发器本身，需要确定「一定是新建」；
- **模块隔离**：需要让同一模块的某个任务暂时脱离常驻会话（例如灰度验证）；
- 会话一直 `running` 且不想等待（`--queue-timeout` 超时后也可用）。

#### 失败处理

- `session/list` 失败不会静默回退：按原逻辑报 G4（可加 `--new` 跳过复用检查，或改用 `--headless` / `--handoff`）；
- 选中会话但 `session/prompt` 失败：报明确错误并建议加 `--new` 新建会话重试（原会话保留）；
- `--session` 指定的会话不存在、或 `cwd` 与目标项目不一致：直接报错，不猜；
- `--session` 与 `--new` / `--headless` / `--handoff` 互斥，同时出现按用法错误处理（退出码 2）；
- `--headless` / `--handoff` 不参与会话复用。

### 可选：用 AgentTeams 执行（`--team`）

给会话模式加 `--team`，派发器会在任务包末尾追加一段中性的可选建议：

- 目标 agent 可先把任务拆成 2–3 个可并行的子任务，声明子任务之间的依赖，再由队长汇总结果；
- 拆分不改变任务包的验收标准；账本仍只由一个 Owner 写入，并行子任务只回结果，避免多写者；
- 目标端没有 AgentTeams 插件时，目标 agent 直接忽略这一节，用普通会话完成任务——不阻塞、不报错。

```sh
./agent-workflow/bin/awf-dispatch demo02 dispatch/tasks/DEV-003.md --team
```

建议只对可拆分的大任务使用；小改动直接普通会话即可。不加 `--team` 时任务包与旧版完全一致；`--team` 只影响会话模式注入的任务包，`--handoff` 生成的交接单保持原文。

### 票据生命周期

`dispatch/tasks/*.md` 是一次性票据：生成后留在 `dispatch/tasks/` 直到目标项目落地，然后用 `--prune` 归档。`dispatch/tasks/` 只留在途，`dispatch/archive/` 存已完成的票据。

```text
dispatch/tasks/<项目>-<ID>-<slug>.md      生成（调度方写任务包）
        │  派发（会话 / headless / handoff）；dispatch/log.md 记录
        ▼
目标项目完成并本地 commit，账本归档到 agent-workflow/tasks/<type>/done.md
        │  awf-dispatch --prune（默认 dry-run）
        ▼
dispatch/archive/<目标别名>/<YYYY-MM>/<原文件名>
```

- **生成**：文件名必须含任务 ID（`<项目>-<ID>-<slug>.md`），正文必须有 `- 目标项目：<别名>（<绝对路径>）` 一行。
- **在途**：派发后票据留在 `dispatch/tasks/`；`dispatch/log.md` 记录会话、状态与目标 HEAD。
- **落地**：目标项目完成并本地 commit，账本归档到目标 `agent-workflow/tasks/<type>/done.md`。
- **归档**：`--prune` 判定完成后把票据移到 `dispatch/archive/`，主目录恢复为「只有在途」。
  - 判定 completed：`git -C <目标路径> log --all --grep=<ID>` 命中，**或** 目标账本 `agent-workflow/tasks/*/done.md`（工作区或 HEAD）含该 ID。提交消息没写任务 ID 的票据，只要目标账本已归档同样判 completed。
  - 判定 unknown：解析不到「目标项目」行 / 文件名没有任务 ID / 目标路径不存在 / 目标不是 git 仓库。unknown 只报告，不猜、不移动。
  - 判定 pending：commit 与 done.md 都没命中。
  - 归档路径：`dispatch/archive/<目标别名>/<YYYY-MM>/<原文件名>`；月份取该任务提交的 `%cs`，取不到（例如只命中账本）用当天。
  - 移动：票据在 git 索引里用 `git mv`，否则 `os.rename`；目标已存在则跳过并报冲突，不覆盖。
  - 无票据或全部 pending 时退出码 0；`--prune` 不接受 target/task 位置参数（同时出现报用法错误，退出码 2）。

```sh
# 只打印计划（默认 dry-run，不改任何文件）
./agent-workflow/bin/awf-dispatch --prune

# 确认后真正归档
./agent-workflow/bin/awf-dispatch --prune --apply

# 机器可读（items[].status / archive / summary）
./agent-workflow/bin/awf-dispatch --prune --json
```

dry-run 示例：

```text
prune：dry-run（只读；加 --apply 才移动文件）
票据目录：/path/to/kit/dispatch/tasks
归档目录：/path/to/kit/dispatch/archive

completed dispatch/tasks/demo02-DEV-005-sum-between.md
  目标项目：agent-demo02 → /Users/.../agent-demo02
  任务ID：DEV-005
  判定：completed（commit 命中 2026-10-31）
  将移往：dispatch/archive/agent-demo02/2026-10/demo02-DEV-005-sum-between.md

合计：completed 1 / pending 0 / unknown 0（共 1）
dry-run：未移动任何文件；确认后加 --apply 执行。
```

`dispatch/log.md` 是永久派发日志，`--prune` 只移动票据文件，不清理、不改写日志。

## 手工等价流程

GUI 左侧切到目标工作区 → 新建会话 → 粘贴任务包。效果相同，只是没有自动前置检查与日志。

## 回退矩阵

| 方式 | 本质 | 适用 | 关键限制 |
|---|---|---|---|
| 目标工作区会话（推荐） | 正式会话，在目标工作区 | 需要用户后续追问 | 默认只发送不等待；依赖 GUI 在线 |
| `awf-dispatch --headless` | 独立进程、独立会话 | 无人值守、CI、批量 | 默认后台启动并立即返回输出路径（`--wait` 才同步等）；会话不在 GUI 工作区，无法直接续聊 |
| `awf-dispatch --handoff` | 只生成交接单 | GUI 不可用 / 用户自己执行 | 不自动执行 |
| `subagent(cwd=/path/to/B)` | 同进程、独立上下文 | 只读分析、1–N 个小任务 | 用户不能直接在该会话续聊 |

**不要**用父会话 `working_directory` 切过去，再在那边写文件：`cwd` 变了但写入边界没变。

## 任务包模板

```text
你在 <项目> 仓库中执行任务，必须遵守本仓库 AGENTS.md 与 agent-workflow/workflows/<type>.md。

任务：<ID> <一句话目标>
- 来源：用户（| 工作流；缺省=用户。来源=工作流的票据 DEV-128 起允许按需继续转派）
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

## 任务票据来源（激活式 router）

跨项目派发遵循「激活式 router」协议（动机与设计见 [docs/design.md](design.md)「激活式 Router」）：节点需要路由决策时临时激活；DEV-128 起**允许已派发任务继续向下一层转派**（深度不限）。票据头部必须携带来源标记：

```text
- 来源：用户 | 工作流
```

- **来源：用户**（缺省，向后兼容）：票据由用户原始请求触发；接收节点可自行决策执行或再派发。
- **来源：工作流**：票据由另一节点派发；DEV-128 起接收节点**允许按需继续向下一层转派**（深度不限）。

`awf-dispatch` 在派发前读取票据头部（`ticket_source`）：

- 缺失来源或缺省值：按用户来源处理，正常派发——旧票据没有该字段仍可用；
- 标记「来源：工作流」的票据再次作为 target 派发：**允许并提示**核对转派理由、在票据头部更新「路由裁决」保持链路清晰；不再 FAIL 拦截（DEV-128 去掉禁转派硬校验）。

## 任务包五项（目标 agent → dispatcher）

```text
- 状态：完成 / 阻塞
- 变更文件：...
- 验证结果：命令 + 结果摘要
- commit：sha
- 阻塞：无 / 原因
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
- 预检的 `session/list`（G4 探针，同时缓存给复用查找）：失败按 G4 报错；改用 `--headless` / `--handoff`，或检查 GUI / 认证。
- 选中的会话一直在 `running`：默认排队等 `--queue-timeout` 秒（60）；超时后不要杀掉目标回合，稍后重试、加大 `--queue-timeout`，或加 `--new` 新开一个会话。
- 复用会话 `session/prompt` 失败：报错并建议 `--new`；原会话与已产生的上下文都保留。
- `--session` 指定的会话不存在或目录不匹配：按错误处理，不自动换会话；确认 ID 或去掉 `--session`。
- 回合超时（退出码 3）：会话保留，不要杀掉；在 GUI 查看进度。默认派发本身不等待（`--no-wait` 是默认行为的兼容别名），需要重派时直接重新派发并加 `--force`。
- 回合已结束但未落地（退出码 3）：不要当完成；可在 GUI 看目标是否还在复核，或重新派发（`--force` 同名）/`--session` 续跑。
- 疑似僵尸会话（退出码 4）：回合即时结束且零输出；用 `--new` 重派或在 GUI 重开会话，不要继续在同一会话上续跑空回合。
- headless 进程非零退出（退出码 5）：执行失败，不是超时；按 `dispatch/headless/*.log` 排查目标侧错误后重派。

## 优化说明

相比旧版“默认 headless”，当前流程的改进：

1. **会话优先**：工作留在 GUI 工作区，用户能继续追问，不用重新派发。
2. **四道门**：先排除“无工作流 / 无工作区 / 有写者 / GUI 不可用”，避免生成不可见的 headless 会话。
3. **workspaceId 而非 cwd**：会话归入正确的工作区分组，不会落到 Ungrouped。
4. **只读前置**：`git status`、active 任务、`check_workflow.sh` 都在派发前检查，避免和另一个写者冲突。
5. **单写者**：目标 agent 写目标账本；调度方只写自己的 dispatch log。
6. **可回退**：会话不可用时才用 headless/handoff，且必须让用户知道代价。
7. **可审计**：日志记录 sessionId、工作区、目标 HEAD、状态（含是否等待）、会话来源（复用/新建）与回到会话方式；后续可回到同一会话。
8. **默认异步**：复用/创建会话、发送任务后立即返回，不阻塞调度方；需要本回合结果时显式 `--wait`。
9. **核心与适配分离**：工作流规范保持 harness 无关；DSH 会话派发放在可选适配器 `awf-dispatch`。
10. **默认复用**：同一项目同一模块继续用同一个常驻会话，不因上下文压力自动换会话；会话数量不再随派发线性增长，历史上下文还能复用。不同模块各自一个会话（`[awf] <项目> · <模块>`），避免上下文串味。

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
- [ ] 票据头部带「来源：用户 | 工作流」标记（缺省=用户）；来源=工作流的票据不再用于再派发
- [ ] 同一项目同一模块续用原会话（标题 `[awf] <项目> · <模块>`）；不同模块各自会话，只有隔离/污染/排障才 `--new`
- [ ] 清楚本回合是否加 `--wait`（默认异步，「已发送」不等于「已完成」）
- [ ] 会话在目标工作区（不是 Ungrouped）
- [ ] 目标 agent 自己写账本
- [ ] 只本地 commit，未 push
- [ ] 调度日志记录了 sessionId、会话来源（复用/新建）与目标 HEAD
- [ ] 已告诉用户后续在哪个会话继续
