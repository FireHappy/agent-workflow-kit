# 工作流架构升级 v1.2.0（技能化）

- 目标项目：dsh-settings（/Users/chenlin/Documents/GitHub/dsh-settings）
- 任务编号：（由目标按自身账本体系自排，如 DEV-xxx；禁止 UP-xxx 类编号）
- 来源：用户（经 agent-workflow-kit 会话派发，票据 DEV-185）
- 路由裁决：目标=dsh-settings；通道=目标工作区会话；理由=把 kit v1.2.0（DEV-184 彻底技能化：项目内 workflows/ 退役、流程细节在技能 agent-workflow-scaffold 的 skills/）发布升级到登记项目

## 任务（全程在目标项目自己的工作区会话执行，禁止改其他项目）

1. 执行：/Users/chenlin/Documents/GitHub/agent-workflow-kit/bin/awf upgrade "/Users/chenlin/Documents/GitHub/dsh-settings" --slim（框架文件同步为 kit v1.2.0 技能化形态；--slim 清理 agent-workflow/workflows/ 存量副本；版本锚点按 project.yaml 的 version_file 写入 1.2.0，未配置 version_file 则默认写根 VERSION）
2. 确认 AGENTS.md 已刷新：含技能路由（skills/dev/SKILL.md 等 6 条，bootstrap 自动完成）
3. 校验：cd "/Users/chenlin/Documents/GitHub/dsh-settings" && ./agent-workflow/check_workflow.sh（必须 0 FAIL；无 workflows/ 目录为技能化形态正常）
4. 确认锚点：按 project.yaml 的 version_file 路径 cat 版本文件（应为 1.2.0；未配置则查根 VERSION）
5. 本地 commit（禁止 push）：commit 消息「chore(workflow): 框架升级至 v1.2.0 技能化」，可附目标项目自己的合法任务编号（如 DEV-xxx），**禁止 UP-xxx 类编号**
6. 回报（经 awf-dispatch --report 发回执请求）：commit hash / check 结果 / 锚点值 / workflows 是否已清理

## 验收

- [ ] 版本锚点 = 1.2.0
- [ ] check_workflow.sh 0 FAIL
- [ ] agent-workflow/workflows/ 目录已清理（技能化形态；细节在技能 agent-workflow-scaffold 的 skills/）
- [ ] agent-workflow/ 框架 = kit v1.2.0（含 DEV-184 技能化改造）
