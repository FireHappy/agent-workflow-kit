# 提交 agent-workflow 框架升级改动（pluto）

- 目标项目：pluto（/Users/chenlin/projects/Rokid-System/pluto）
- 任务编号：（目标按自身账本体系自排，如 DEV-xxx；禁止 UP-xxx）
- 来源：用户（工作流）
- 路由裁决：目标=pluto；通道=awf-dispatch；理由=kit 已用 bin/awf upgrade 升级本目标框架（awf-dispatch 投递头改造、cross-project.md DISPATCH-152 条款），升级改动需目标本地提交（禁 push）

## 任务

agent-workflow 框架升级改动已就位。请：
1. `git status` 核对改动清单（应只含 agent-workflow 框架文件与 AGENTS.md、VERSION；不应动 project.yaml / tasks/** / memory/** / tools/**）
2. 若混入无关文件 → 只提交框架相关
3. 本地 commit（消息含本任务编号 +「框架升级（kit 最新：回报投递头/回报条款）」），禁 push
4. 运行 check 复核 0 FAIL

## 硬约束
- 只在 pluto 工作区操作；禁 push

## 验收标准
- [ ] 升级改动已本地 commit（含任务编号，禁 push）
- [ ] check 0 FAIL
- [ ] 完成回报（commit 短号 + check 结果）
