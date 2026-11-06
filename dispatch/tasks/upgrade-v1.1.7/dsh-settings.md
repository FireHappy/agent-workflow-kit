# 工作流架构升级 v1.1.7

- 目标项目：dsh-settings（/Users/chenlin/Documents/GitHub/dsh-settings）
- 任务编号：（由目标按自身账本体系自排，如 DEV-xxx；禁止 UP-xxx 类编号）
- 来源：用户（经 agent-workflow-kit 会话派发，票据 DEV-177）
- 路由裁决：目标=dsh-settings；通道=目标工作区会话；理由=把 kit v1.1.7（DEV-174 锚点迁移 / DEV-175 init --gitignore / 派发者规范 --sender 修复）发布升级到登记项目

## 任务（全程在目标项目自己的工作区会话执行，禁止改其他项目）

1. 执行：/Users/chenlin/Documents/GitHub/agent-workflow-kit/bin/awf upgrade "/Users/chenlin/Documents/GitHub/dsh-settings"（框架文件同步为 kit v1.1.7；版本锚点按 project.yaml 的 version_file 写入 1.1.7，未配置 version_file 则默认写根 VERSION）
2. 校验：cd "/Users/chenlin/Documents/GitHub/dsh-settings" && ./agent-workflow/check_workflow.sh（必须 0 FAIL）
3. 确认锚点：按 project.yaml 的 version_file 路径 cat 版本文件（应为 1.1.7；未配置则查根 VERSION）
4. 本地 commit（禁止 push）：commit 消息建议「chore(workflow): 框架升级至 v1.1.7」，可附目标项目自己的合法任务编号（如 DEV-xxx），**禁止 UP-xxx 类编号**
5. 回报（经 awf-dispatch --report 发回执请求）：commit hash / check 结果 / 锚点值

## 验收

- [ ] 版本锚点 = 1.1.7
- [ ] check_workflow.sh 0 FAIL
- [ ] agent-workflow/ 框架 = kit v1.1.7（含 DEV-174 锚点迁移 / DEV-175 init --gitignore / 派发者规范）
- [ ] 本地 commit 落盘且消息不含自造任务编号（禁止 push）
