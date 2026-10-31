<!-- awf:begin v1 digest:52223645 -->
# agent-workflow-kit

生成、安装与校验 agent 工作流框架的脚手架（任务账本 / 流程规范 / 根入口）

## 开工顺序

1. 读 `agent-workflow/tasks/status.md`（唯一状态摘要，由 awf 生成，不要手改）
2. 按任务类型**只加载一个**流程文件：
   - 功能开发 / 重构 / 优化 → `agent-workflow/workflows/dev.md`
   - 崩溃 / 报错 / 行为异常 → `agent-workflow/workflows/debug.md`
   - 文档 / 架构分析 → `agent-workflow/workflows/docs.md`
   - 开发完成待审 → `agent-workflow/workflows/review.md`
3. 有自己名下 `active/verify/review/blocked` 的任务先恢复；没有则从 `tasks/<type>/todo.md` 认领
4. 动手前把任务写入 `tasks/<type>/current.md`：状态、Owner、验收标准、下一步
5. 收尾：`./agent-workflow/check_workflow.sh` 通过 → 更新 status → 归档 → 本地 commit

## 铁律

- 状态只写 `active` / `blocked` / `review` / `verify` / `handoff`
- 一个任务块只有一个 Owner；并行任务必须写清修改范围
- 不改 `status.md` 不算完成；不跑通过校验不算归档
- 只允许本地 commit，**禁止 push**；推送与合并由用户明确触发
- 未验证的判断只能写“待确认”，不能写成结论
- 验证命令不可用时，必须在任务块里写明阻塞原因，并置为 `blocked`

## 校验

- 框架与入口：`./agent-workflow/check_workflow.sh`
- 编译：`bash -n bin/awf && bash -n install.sh && bash -n test/smoke.sh`
- 测试：`bash test/smoke.sh`

## 并行

- 可并行单元：生成器与模板(bin/ templates/), 测试与CI(test/ .github/), 文档(docs/ README.md SKILL.md prompt.md)
- 共享写点（任何并行单元都不得同时修改）：agent-workflow/project.yaml, AGENTS.md, agent-workflow/templates/, agent-workflow/bin/awf
- 并行时账本只由主线写；子任务返回结果，由主线合并进 `current.md`

## 跨项目

- 全局索引：`~/.agents/AGENTS.md`（别名 → 路径）；也可运行 `./agent-workflow/bin/awf projects`
- 按名字定位：`./agent-workflow/bin/awf find <别名|ID>`
- 若索引里还没有本仓库（clone/移动后），运行 `./agent-workflow/bin/awf register`；`bootstrap` 会自动刷新已登记项目的路径
- 本仓库相关项目：`agent-workflow/neighbors.tsv`（不存在则忽略）
- 进入其他项目前先切换工作区；工作区外的写入可能被拒绝

## 项目事实

`agent-workflow/project.yaml` 是唯一输入。改完运行：

```sh
./agent-workflow/bin/awf bootstrap   # 只刷新本文件受控区块
```

> 本区块由 `agent-workflow/bin/awf bootstrap` 生成，源为 `agent-workflow/project.yaml` 与该模板。区块外的内容可以自由编辑。
<!-- awf:end -->
