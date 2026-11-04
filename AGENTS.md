<!-- awf:begin v1 digest:7354b7d6 -->
# agent-workflow-kit

生成、安装与校验 agent 工作流框架的脚手架（任务账本 / 流程规范 / 根入口）

## 开工顺序

1. 读 `agent-workflow/tasks/status.md`（唯一状态摘要，由 awf 生成，不要手改）
2. 按任务类型**只加载一个**流程文件：
   - 功能开发 / 重构 / 优化 → `agent-workflow/workflows/dev.md`
   - 崩溃 / 报错 / 行为异常 → `agent-workflow/workflows/debug.md`
   - 文档 / 架构分析 → `agent-workflow/workflows/docs.md`
   - 开发完成待审（dev 子流程，随 dev 一起加载） → `agent-workflow/workflows/review.md`
   - 跨项目派发 / 交接 → `agent-workflow/workflows/cross-project.md`
   - 发版 / 版本号 / tag / CHANGELOG → `agent-workflow/workflows/release.md`
3. 开始前先读 `agent-workflow/memory/history/` 中**同类主题的过往结论**（修复类先读过去修法、生成类先读上次教训、排查类先读已知坑）；有 INDEX.md 则先读索引
4. 有自己名下 `active/verify/review/blocked` 的任务先恢复；没有则从 `tasks/<type>/todo/` 认领（目录式：每个任务一个 `<ID>.md`，`todo/README.md` 为检索索引，由 `awf status` 生成）
5. 动手前把任务写入 `tasks/<type>/current/<ID>.md`（从 `todo/` 移入 `current/` 并改状态为 active）：优先级、状态、Owner、验收标准、下一步；认领/归档只移动文件 + 同步状态字段，索引 `README.md` 由 `awf status` 自动重生成
6. 收尾：归档（`current/` → `done/` 移动文件 + 状态改 `done` + 补 `完成日期`）→ 沉淀可复用结论到 memory/history、脚本按 tools 标准收录 → `./agent-workflow/check_workflow.sh` 通过 → `./agent-workflow/bin/awf status` → 本地 commit

## 铁律

- 状态只写 `active` / `blocked` / `review` / `verify` / `handoff`
- 一个任务块只有一个 Owner；并行任务必须写清修改范围
- 归档后必须跑通过校验；`status.md` 必须由 `awf status` 刷新后才算完成
- 只允许本地 commit，**禁止 push**；推送与合并由用户明确触发
- 未验证的判断只能写“待确认”，不能写成结论
- 验证命令不可用时，必须在任务块里写明阻塞原因，并置为 `blocked`

## 任务路由（逐条决策）

先判定「任务票据来源」（激活式路由，见下第 0 条），再判定「目标仓库 == 当前工作区？」，**不要在选通道前默认建队**：

0. **激活式路由（先看来源，再谈通道）**：路由能力在节点需要做出「执行 or 派发」决策时临时激活（面对用户原始请求，或对已派发任务判断是否继续转派），不是常驻身份。
   - **允许继续转派（DEV-128 放开深度限制，替代 DEV-115 的深度=1/禁转派）**：任务票据携带「来源：用户 | 工作流」标记（缺省视为「用户」，向后兼容）。任一收到任务的节点都可按需向下一层继续派发；转派时在票据头部更新「路由裁决」（目标 / 理由），保持派发链路清晰；来源=工作流的票据被再次派发只提示核对转派理由，不拦截、不 FAIL。
   - **router 决策三件套**：分析用户意图 → 检索全局索引（`awf projects` / `awf find`，即"工作群"）并读各 worker 的 role（特长），按任务意图筛选候选（如任务=日报生成 → 候选含 周报；role 是匹配依据，不是装饰字段）→ 综合决策（自己干 or 派给谁/通道）；**决策结论落盘到票据头部**（来源 + 路由裁决：目标 / 通道 / 理由），不留在模型头脑里。
1. **目标仓库 == 当前工作区**（本仓库任务）：
   - 小任务（单行修改 / 只读查询 / 跑一次校验）：**单会话直接完成**，并在回复里说明不走团队的原因。
   - 可并行拆分（多模块、修改范围不重叠、共享写点已声明、协调成本低于收益）：**才用团队**——先出计划与依赖，成员执行、主线汇总；共享写点只由主线改。
   - 其余默认单会话。
2. **目标仓库 ≠ 当前工作区**（跨仓库任务）：
   - **默认 `awf-dispatch` 派发到目标项目自己的工作区会话**执行；调度方只发任务、收结果，**不直接改目标仓库**。前置：目标有工作流且已登记为当前 harness 的工作区（见 `agent-workflow/workflows/cross-project.md` 四道前置门）。
   - **派发三规则（DEV-138）**：① **默认异步**——派发只发送任务、立即返回会话 ID，主会话不被钉住；需要本回合结果/落地确认时调用方**显式 `--wait`**（`--timeout` 仅对 `--wait` 生效）。② **派发即启动子代理**——派发动作就是在目标工作区启动目标 agent 的子代理会话，**不启用智能体团队承载派发**（无 captain/dispatcher 成员层；多目标=多次派发，默认异步互不阻塞）。③ **票据瘦身 + 分析归 worker**——router 只写 用户意图 / 硬约束 / 验收标准 / 路由裁决，**不写执行步骤、不做前置侦察**；前置分析由目标 worker 在自己的会话里用目标仓库 `tools/` 手册与 `memory/history` 完成，有疑问返回 router / 用户决策。
   - **团队不承载跨仓库任务**：团队成员会话工作区 = 队长工作区，跨仓库写入要么越权改错仓库、任务归属混乱，要么被目标项目的范围/门禁校验拦截。反例：2026-11-01 用 7 人团队在调度方工作区一次性修改 6 个其他项目仓库，任务归属凌乱、changedPaths 门禁卡死（需 amend 契约绕过），后改为逐项目派发才落地。
3. 无论哪条通道：账本与 commit 始终归主线 Owner；**只本地 commit，禁止 push**。

## 校验

- 框架与入口：`./agent-workflow/check_workflow.sh`
- 编译：`bash -n bin/awf && bash -n install.sh && bash -n test/smoke.sh && bash -n test/upgrade.sh && python3 -m py_compile bin/awf-dispatch`
- 测试：`bash test/smoke.sh`

## 并行

- 可并行单元：生成器与模板(bin/ templates/), 工作流规范(agent-workflow/README.md agent-workflow/workflows/), 技能(skills/ install.sh SKILL.md), 测试与CI(test/ .github/), 文档(docs/ README.md prompt.md)
- 共享写点（任何并行单元都不得同时修改）：agent-workflow/project.yaml, AGENTS.md, agent-workflow/templates/, agent-workflow/bin/awf, agent-workflow/bin/awf-dispatch, agent-workflow/workflows/cross-project.md
- 并行时账本只由主线写；子任务返回结果，由主线合并进 `tasks/<type>/current/<ID>.md`
- 实现与复核尽量由不同会话/角色承担；复核必须独立重跑验证命令，不能只看实现者自述

## 跨项目

- 全局索引：`~/.agents/AGENTS.md`（别名 → 路径）；也可运行 `./agent-workflow/bin/awf projects`
- 按名字定位：`./agent-workflow/bin/awf find <别名|ID>`
- 若索引里还没有本仓库（clone/移动后），运行 `./agent-workflow/bin/awf register`；`bootstrap` 会自动刷新已登记项目的路径
- 派发前先确认目标项目有工作流且已登记为当前 harness 的工作区；满足后优先在目标工作区的会话中执行，不要默认无人值守（后台）执行
- 派发工具（若 harness 提供）：`./agent-workflow/bin/awf-dispatch <别名|目录> <任务文件>`；前置检查失败时按提示补工作流/工作区
- 不要在调度方会话里直接改目标仓库；写入由目标 agent 在目标工作区完成

## 项目事实

`agent-workflow/project.yaml` 是唯一输入。改完运行：

```sh
./agent-workflow/bin/awf bootstrap   # 只刷新本文件受控区块
```

> 本区块由 `agent-workflow/bin/awf bootstrap` 生成，源为 `agent-workflow/project.yaml` 与该模板。区块外的内容可以自由编辑。
<!-- awf:end -->

## 本仓库协作约定（区块外，本地维护）

- 任务路由按「目标仓库 == 当前工作区？」逐条决策（教训：2026-11-01 曾用 7 人团队在调度方工作区直接改 6 个其他项目仓库，任务归属凌乱、changedPaths 门禁卡死，后改逐项目派发）——本仓库任务：小任务单会话，**可并行拆分才建队**；跨仓库任务：**默认 `awf-dispatch` 派到目标项目自己的工作区会话**，团队不承载跨仓库任务。
- 本仓库内建队即 automatic（用户已明确授权）：不再 staged 审批；建队后仍贴 3 行计划摘要（目标 / 成员 / 验收），发现不对可立即叫停；三轨 docs / dev / debug 见 `docs/team-flow.md`。
- 跨项目派发按三条规则（DEV-138）：① **默认异步**——主线直接 `awf-dispatch <目标> <票据>` 只发送并返回会话 ID，主会话不被钉住；需要本回合结果/落地确认时才显式 `--wait`。② **派发即启动子代理**——派发动作就是在目标工作区启动目标 agent 的子代理会话，**不启用智能体团队承载派发**（无 captain/dispatcher 成员层；多目标=多次派发，异步互不阻塞）。③ **票据瘦身 + 分析归 worker**——只写 用户意图 / 硬约束 / 验收标准 / 路由裁决，不写执行步骤、不做前置侦察；前置分析由目标 worker 在自己的会话里用目标仓库 `tools/` 手册与 `memory/history` 完成，有疑问返回 router / 用户决策。账本与 commit 归主线（目标项目账本由目标 agent 写），成员不代写目标仓库。
- 复核分级：新增功能/小调整走快速车道——必须自带测试进 smoke + 自检门禁，captain 快验即可；只有架构级改动（契约/默认行为/模板结构）才走 reviewer 全量复核（见 `docs/team-flow.md` §3.5）。
- 派发豁免：单行修改、只读查询、跑一次校验可直接做或直接派发——派发本身不建队承载，不存在「建队开销大于任务」的权衡；直接做时在回复里说明即可。
- 跨项目写仍走 `awf-dispatch` 派发给目标项目自己的会话，不由本仓库团队代写目标仓库；派发不建队承载（见 `docs/team-flow.md`「派发」）。
