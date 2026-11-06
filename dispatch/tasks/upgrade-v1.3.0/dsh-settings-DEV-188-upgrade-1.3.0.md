# 工作流架构升级 v1.3.0（工具技能化）

- 目标项目：dsh-settings（/Users/chenlin/Documents/GitHub/dsh-settings）
- 任务编号：（由目标按自身账本体系自排，如 DEV-xxx；禁止 UP-xxx 类编号）
- 来源：用户（经 agent-workflow-kit 会话派发，票据 DEV-188）
- 路由裁决：目标=dsh-settings；通道=目标工作区会话；理由=把 kit v1.3.0（DEV-186 工具技能化：项目内不再复制 bin/awf+awf-dispatch、命令改技能路径；技能实体化）发布升级到登记项目

## 任务（全程在目标项目自己的工作区会话执行，禁止改其他项目）

1. 执行：/Users/chenlin/Documents/GitHub/agent-workflow-kit/bin/awf upgrade "/Users/chenlin/Documents/GitHub/dsh-settings" --slim（框架同步 kit v1.3.0；--slim 清理 agent-workflow/workflows/ 与 agent-workflow/bin/awf、bin/awf-dispatch 存量副本——工具在技能 ~/.dsh/skills/agent-workflow-scaffold/bin/，项目内只留 check_workflow.sh 接口 shim；锚点按 version_file 写 1.3.0）
2. 确认 AGENTS.md 已刷新（bootstrap 自动）：含技能路由（skills/*/SKILL.md）+ 命令为技能路径
3. 校验：cd "/Users/chenlin/Documents/GitHub/dsh-settings" && ./agent-workflow/check_workflow.sh（必须 0 FAIL；无 workflows/、无 bin/ 副本为技能化形态正常）
4. 确认锚点：按 project.yaml 的 version_file cat 版本文件（应为 1.3.0）
5. 本地 commit（禁止 push）：消息「chore(workflow): 框架升级至 v1.3.0 工具技能化」，禁 UP-xxx 编号
6. 回报（awf-dispatch --report 发回执请求）：commit hash / check 结果 / 锚点值 / workflows 与 bin 副本清理情况

## 验收

- [ ] 版本锚点 = 1.3.0
- [ ] check_workflow.sh 0 FAIL
- [ ] agent-workflow/workflows/ 与 agent-workflow/bin/ 副本已清理（工具在技能，check_workflow.sh 指向技能）
- [ ] agent-workflow/ 框架 = kit v1.3.0
