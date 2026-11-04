# 工作流架构升级 v1.1.3

- 目标项目：pluto（/Users/chenlin/projects/Rokid-System/pluto）
- 任务编号：（由目标按自身账本体系自排，如 DEV-xxx；禁止 UP-xxx 类编号）
- 来源：用户（经 dsh-im 派发，票据 DISPATCH-144）
- 路由裁决：目标=pluto；通道=目标工作区会话；理由=把 kit v1.1.3（DEV-148 门禁优化 / DEV-149 worktree 评估 / DEV-150 熄屏判定·远程办公状态）发布升级到全部登记项目

## 任务（全程在目标项目自己的工作区会话执行，禁止改其他项目）

1. 执行：/Users/chenlin/Documents/GitHub/agent-workflow-kit/bin/awf upgrade "/Users/chenlin/projects/Rokid-System/pluto"（框架文件同步为 kit v1.1.3；版本锚点按 project.yaml 的 version_file 写入 1.1.3，默认根 VERSION）
2. 校验：cd "/Users/chenlin/projects/Rokid-System/pluto" && ./agent-workflow/check_workflow.sh（必须 0 FAIL）
3. 确认锚点：cat "/Users/chenlin/projects/Rokid-System/pluto/VERSION"（应为 1.1.3；若项目配置了自定义 version_file 则以该文件为准）
4. 本地 commit（禁止 push）：commit 消息建议「chore(workflow): 框架升级至 v1.1.3」，可附目标项目自己的合法任务编号（如 DEV-xxx），**禁止 UP-xxx 类编号**
5. 回报：commit hash、check 结果、锚点值

## 验收

- [ ] 版本锚点 = 1.1.3
- [ ] check_workflow.sh 0 FAIL
- [ ] agent-workflow/ 框架 = kit v1.1.3（含 DEV-148 门禁优化 / DEV-149 worktree 评估 / DEV-150 远程办公状态）
- [ ] 本地 commit 落盘且消息不含自造任务编号（禁止 push）
