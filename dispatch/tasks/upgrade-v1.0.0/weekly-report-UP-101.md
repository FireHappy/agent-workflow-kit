# weekly-report 框架升级 v1.0.0 + 目录式账本迁移（目标项目自己的工作区会话执行）

- 目标项目：weekly-report（/Users/chenlin/Documents/周报）
- 来源：用户
- 路由裁决：目标=weekly-report；通道=目标工作区会话；理由=批量升级（用户要求更新所有登记项目至 v1.0.0）

## 任务（全程在目标项目自己的工作区会话执行，禁止改其他项目）

1. 预览：/Users/chenlin/Documents/GitHub/agent-workflow-kit/bin/awf upgrade "/Users/chenlin/Documents/周报" --dry-run（确认变更/保留清单）
2. 执行：/Users/chenlin/Documents/GitHub/agent-workflow-kit/bin/awf upgrade "/Users/chenlin/Documents/周报"
3. 目录式账本迁移：cd "/Users/chenlin/Documents/周报" && ./agent-workflow/bin/awf status（v1.0.0 幂等迁移：含块大文件→单任务文件、todo 表行→待办文件；可反复跑直至无迁移输出；旧大文件 done.md/todo.md/current.md 应被移除）
4. ./agent-workflow/check_workflow.sh 通过；FAIL 项按提示修复（历史任务文件状态字段归一为 done；必要时 status 重建索引 README）
5. 本地 commit：消息含任务 ID（推荐：upgrade(weekly-report): v1.0.0 目录式账本迁移 UP-101），**禁止 push**
6. 回报：commit hash、check 结果（n ok/0 fail）、迁移后 tasks/ 结构摘要

## 验收

- [ ] agent-workflow/ 框架为 v1.0.0（bin/awf 为 kit 版本）
- [ ] tasks/<type>/{todo,current,done}/ 目录化 + 三目录 README 检索（由 awf status 生成）
- [ ] 旧大文件已移除（done.md/todo.md/current.md），git 中可见删除
- [ ] check_workflow.sh 全绿
- [ ] 本地 commit 落盘（禁止 push）
