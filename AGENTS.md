<!-- awf:begin v1 digest:81c8c2bb -->
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

## 任务路由

- 当前 harness 提供团队协作能力时（例如 DSH 的 AgentTeams：工具列表含 `agent_teams_*` 或 `/agent-teams` 可用），**任务默认优先派发给团队**：先出计划与依赖，成员执行，主线汇总。
- 团队不可用，或任务小到协调成本更高（单行修改、只读查询、跑一次校验）时，按单会话流程直接完成，并在回复里说明原因。
- 无论走哪条路径，账本与 commit 始终归主线 Owner。

## 校验

- 框架与入口：`./agent-workflow/check_workflow.sh`
- 编译：`bash -n bin/awf && bash -n install.sh && bash -n test/smoke.sh && python3 -m py_compile bin/awf-dispatch`
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
- 派发前先确认目标项目有工作流且已登记为当前 harness 的工作区；满足后优先在目标工作区的会话中执行，不要默认 headless
- DSH 适配：`./agent-workflow/bin/awf-dispatch <别名|目录> <任务文件>`；前置检查失败时按提示补工作流/工作区
- 不要在调度方会话里直接改目标仓库；写入由目标 agent 在目标工作区完成

## 项目事实

`agent-workflow/project.yaml` 是唯一输入。改完运行：

```sh
./agent-workflow/bin/awf bootstrap   # 只刷新本文件受控区块
```

> 本区块由 `agent-workflow/bin/awf bootstrap` 生成，源为 `agent-workflow/project.yaml` 与该模板。区块外的内容可以自由编辑。
<!-- awf:end -->

## 本仓库协作约定（区块外，本地维护）

- 检测到团队能力时，对话中的需求默认优先转团队计划（staged），主对话只做澄清、拆分、审批与验收；三轨 docs / dev / debug 见 `docs/team-flow.md`。
- 跨项目写仍走 `awf-dispatch` 派发给目标项目自己的会话，不由本仓库团队代写。
