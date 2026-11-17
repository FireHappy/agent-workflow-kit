<!-- awf:begin v1 digest:3e9d98e8 -->
# agent-workflow-kit

生成、安装与校验 agent 工作流框架的脚手架（任务账本 / 流程规范 / 根入口）

## 开工顺序

1. 读 `agent-workflow/tasks/status.md`（唯一状态摘要，由 awf 生成，不要手改）
2. 按任务类型**只加载一个**流程手册：技能已在全局技能库（DSH 启动注入，凭 `whenToUse` 自动匹配），按任务类型加载对应技能即可，细节全在技能内——本入口不列举技能清单，新增/调整技能只动技能库
3. 开始前先读 `agent-workflow/memory/history/` 中**同类主题的过往结论**（修复类先读过去修法、生成类先读上次教训、排查类先读已知坑）；有 INDEX.md 则先读索引
4. 有自己名下 `active/verify/review/blocked` 的任务先恢复；没有则从 `tasks/<type>/todo/` 认领（目录式：每个任务一个 `<ID>.md`，`todo/README.md` 为检索索引，由 `awf status` 生成）
5. 动手前把任务写入 `tasks/<type>/current/<ID>.md`（从 `todo/` 移入 `current/` 并改状态为 active）：优先级、状态、Owner、验收标准、下一步；认领/归档只移动文件 + 同步状态字段，索引 `README.md` 由 `awf status` 自动重生成
6. 收尾：归档（`current/` → `done/` 移动文件 + 状态改 `done` + 补 `完成日期`）→ 沉淀可复用结论到 memory/history、可复用脚本收敛到项目本地技能 `agent-workflow/skills/<name>/` → `./agent-workflow/check_workflow.sh` 通过 → `~/.agents/skills/agent-workflow-scaffold/bin/awf status` → 本地 commit

## 铁律

- 状态只写 `active` / `blocked` / `review` / `verify` / `handoff`
- 一个任务块只有一个 Owner；并行任务必须写清修改范围
- 归档后必须跑通过校验；`status.md` 必须由 `awf status` 刷新后才算完成
- 只允许本地 commit，**禁止 push**；推送与合并由用户明确触发
- 未验证的判断只能写“待确认”，不能写成结论
- 验证命令不可用时，必须在任务块里写明阻塞原因，并置为 `blocked`
- 改任务正文必配一条 `awf log`（收工三步：改正文 → awf log → 回读末行）；`### Execution Log` 只由 awf 追加，禁止手改
- 建任务不主动：用户点名才建；「删除」只认用户原话 + 二次确认；暂停 / 取消 / 结案不互相替代，含糊先反问
- 结案 = 完成归档（`done/` + 状态 `done` + 完成日期）；取消 = 作废归档（同样进 `done/`，结论写明取消原因，不写完成）

## 本地个性化技能

- 本工程专属流程放 `agent-workflow/skills/<name>/SKILL.md`，frontmatter 写 `name` / `description` / `whenToUse`，与全局技能同格式。
- **本地技能目录名与它覆盖的全局技能同名**：`build`（打包，覆盖 `unity-build-install`）、`release`（发版，覆盖 `release`）、其他全局技能同理；不要另造 `build-android`、`release-tagging` 这类名字。
- 标准路径：`agent-workflow/skills/<name>/SKILL.md`，frontmatter `name: <name>`；全局技能第 0 步按此路径读取，命中即走本地流程、不回退默认。
- 一个流程只留一个本地技能：多目标/多产物时主入口不变，用参数或步骤区分。
- 全局技能（如 `unity-build-install`、`release`）第 0 步会先读本目录：命中本地技能就按本地技能执行，**不再走全局默认通道**；本地技能不存在时才回退默认流程。
- 本地技能与代码不一致时以代码为准，并把差异写回本地技能（工具方法名、菜单路径、产物路径、已知坑）。
- **每个项目的本地技能内容都可能不同**：同一全局技能在不同项目里的本地定制（工具入口、菜单/命令、产物路径、坑位）以各自项目代码为准，不可跨项目照搬；框架只约定目录、命名与优先级，不约定具体内容。

## 任务路由

路由决策（激活式路由 / 单会话 / 团队 / 派发四通道选择）在对应技能内（激活式路由见 `dsh-awf-dashboard/skills/cross-project-dispatch/SKILL.md` / 团队见 `dsh-awf-dashboard/skills/team-flow/SKILL.md`），按 `whenToUse` 自动匹配加载后逐条决策，本入口不重复。

## 校验

- 框架与入口：`./agent-workflow/check_workflow.sh`
- 编译：`bash -n dsh-awf-dashboard/skills/agent-workflow-scaffold/bin/awf && bash -n install.sh && bash -n test/smoke.sh && bash -n test/upgrade.sh && python3 -m py_compile dsh-awf-dashboard/skills/cross-project-dispatch/scripts/awf-dispatch`
- 测试：`bash test/smoke.sh`

## 并行

- 可并行单元：插件与技能源(dsh-awf-dashboard/ install.sh), 工作流规范(agent-workflow/README.md agent-workflow/workflows/), 测试与CI(test/ .github/), 文档(docs/ README.md prompt.md)
- 共享写点（任何并行单元都不得同时修改）：agent-workflow/project.yaml, AGENTS.md, dsh-awf-dashboard/skills/agent-workflow-scaffold/templates/, dsh-awf-dashboard/skills/cross-project-dispatch/scripts/awf-dispatch, dsh-awf-dashboard/skills/cross-project-dispatch/SKILL.md
- 并行时账本只由主线写；子任务返回结果，由主线合并进 `tasks/<type>/current/<ID>.md`
- 实现与复核尽量由不同会话/角色承担；复核必须独立重跑验证命令，不能只看实现者自述

## 跨项目

- 全局索引：`~/.agents/AGENTS.md`（别名 → 路径）；也可运行 `~/.agents/skills/agent-workflow-scaffold/bin/awf projects`
- 按名字定位：`~/.agents/skills/agent-workflow-scaffold/bin/awf find <别名|ID>`
- 若索引里还没有本仓库（clone/移动后），运行 `~/.agents/skills/agent-workflow-scaffold/bin/awf register`；`bootstrap` 会自动刷新已登记项目的路径
- 派发前先确认目标项目有工作流且已登记为当前 harness 的工作区；满足后优先在目标工作区的会话中执行，不要默认无人值守（后台）执行
- 派发工具（若 harness 提供）：`~/.agents/skills/cross-project-dispatch/scripts/awf-dispatch <别名|目录> <任务文件>`；前置检查失败时按提示补工作流/工作区
- 不要在调度方会话里直接改目标仓库；写入由目标 agent 在目标工作区完成

## 项目事实

`agent-workflow/project.yaml` 是唯一输入。改完运行：

```sh
~/.agents/skills/agent-workflow-scaffold/bin/awf bootstrap   # 只刷新本文件受控区块
```

> 本区块由 `~/.agents/skills/agent-workflow-scaffold/bin/awf bootstrap` 生成，源为 `agent-workflow/project.yaml` 与该模板。区块外的内容可以自由编辑。
<!-- awf:end -->

## 本仓库协作约定（区块外，本地维护）

- **本仓库内建队即 automatic**（用户已明确授权）：建队后仍贴 3 行计划摘要（目标 / 成员 / 验收），发现不对可立即叫停；流程细节全在技能（任务路由/派发/团队/复核见 `skills/README.md` 与对应技能），本入口不重复。
