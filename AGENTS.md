<!-- awf:begin v1 digest:34ed01a1 -->
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
3. 有自己名下 `active/verify/review/blocked` 的任务先恢复；没有则从 `tasks/<type>/todo.md` 认领
4. 动手前把任务写入 `tasks/<type>/current.md`：状态、Owner、验收标准、下一步
5. 收尾：归档 → `./agent-workflow/check_workflow.sh` 通过 → `./agent-workflow/bin/awf status` → 本地 commit

## 铁律

- 状态只写 `active` / `blocked` / `review` / `verify` / `handoff`
- 一个任务块只有一个 Owner；并行任务必须写清修改范围
- 归档后必须跑通过校验；`status.md` 必须由 `awf status` 刷新后才算完成
- 只允许本地 commit，**禁止 push**；推送与合并由用户明确触发
- 未验证的判断只能写“待确认”，不能写成结论
- 验证命令不可用时，必须在任务块里写明阻塞原因，并置为 `blocked`
- **建队/派发前必须先登记账本**：动手前把主任务写进 `agent-workflow/tasks/<type>/current.md`（任务 ID、Owner、验收标准）；`awf team-audit` 与 `awf check`（F7）会校验团队引用的任务 ID 已在账本——未登记直接 FAIL，不能以「建了团队」替代账本登记

## 任务路由（逐条决策）

先判定「目标仓库 == 当前工作区？」，再选通道，**不要在选通道前默认建队**：

1. **目标仓库 == 当前工作区**（本仓库任务）：
   - 小任务（单行修改 / 只读查询 / 跑一次校验）：**单会话直接完成**，并在回复里说明不走团队的原因。
   - 可并行拆分（多模块、修改范围不重叠、共享写点已声明、协调成本低于收益）：**才用团队**——先出计划与依赖，成员执行、主线汇总；共享写点只由主线改。
   - 其余默认单会话。
2. **目标仓库 ≠ 当前工作区**（跨仓库任务）：
   - **默认 `awf-dispatch` 派发到目标项目自己的工作区会话**执行；调度方只发任务、收结果，**不直接改目标仓库**。前置：目标有工作流且已登记为当前 harness 的工作区（见 `agent-workflow/workflows/cross-project.md` 四道前置门）。
   - **团队不承载跨仓库任务**：团队成员会话工作区 = 队长工作区，跨仓库写入要么越权改错仓库、任务归属混乱，要么被目标项目的范围/门禁校验拦截。反例：2026-11-01 用 7 人团队在调度方工作区一次性修改 6 个其他项目仓库，任务归属凌乱、changedPaths 门禁卡死（需 amend 契约绕过），后改为逐项目派发才落地。
3. 无论哪条通道：账本与 commit 始终归主线 Owner；**只本地 commit，禁止 push**。

## 校验

- 框架与入口：`./agent-workflow/check_workflow.sh`
- 编译：`bash -n bin/awf && bash -n install.sh && bash -n test/smoke.sh && bash -n test/upgrade.sh && python3 -m py_compile bin/awf-dispatch && node --test dsh-plugin/test/ledger.test.js dsh-plugin/test/client-chunk.test.js`
- 测试：`bash test/smoke.sh`

## 并行

- 可并行单元：生成器与模板(bin/ templates/), 工作流规范(agent-workflow/README.md agent-workflow/workflows/), 技能(skills/ install.sh SKILL.md), 测试与CI(test/ .github/), 文档(docs/ README.md prompt.md)
- 共享写点（任何并行单元都不得同时修改）：agent-workflow/project.yaml, AGENTS.md, agent-workflow/templates/, agent-workflow/bin/awf, agent-workflow/bin/awf-dispatch, agent-workflow/workflows/cross-project.md
- 并行时账本只由主线写；子任务返回结果，由主线合并进 `current.md`
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
- 跨项目派发默认建队（派发即建队，只派发不代写）：captain=需求方（拆分 / 汇总 / 本仓库账本 / commit），每个目标一个 dispatcher 成员；成员执行 `awf-dispatch <目标> <票据> --wait` 同步等到回合结束，把「成功/失败、目标 commit、check 结果、阻塞原因」回报 captain，由 captain 汇总归档，成员不代写目标仓库。
- 复核分级：新增功能/小调整走快速车道——必须自带测试进 smoke + 自检门禁，captain 快验即可；只有架构级改动（契约/默认行为/模板结构）才走 reviewer 全量复核（见 `docs/team-flow.md` §3.5）。
- 派发豁免：单行修改、只读查询、跑一次校验可直接做；建队开销大于任务本身时也可不建队——两种情况都要在回复里说明为何不建队。
- 跨项目写仍走 `awf-dispatch` 派发给目标项目自己的会话，不由本仓库团队代写目标仓库；默认由 team 内的 dispatcher 成员同步执行并回报（见 `docs/team-flow.md`「派发模式」）。
