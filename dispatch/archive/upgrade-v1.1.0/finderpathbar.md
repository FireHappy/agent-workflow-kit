# 工作流架构升级 v1.1.0

- 目标项目：finderpathbar（/Users/chenlin/Documents/GitHub/FinderPathBar）
- 来源：用户
- 路由裁决：目标=finderpathbar；通道=目标工作区会话；理由=把 kit v1.1.0（派发握手 / 会话命名 [awf] [派发者] [任务名] / 并发池上限 3 / upgrade 版本锚点）发布升级到所有登记项目

## 任务（全程在目标项目自己的工作区会话执行，禁止改其他项目）

1. 预览：/Users/chenlin/Documents/GitHub/agent-workflow-kit/bin/awf upgrade "/Users/chenlin/Documents/GitHub/FinderPathBar" --dry-run
2. 执行：/Users/chenlin/Documents/GitHub/agent-workflow-kit/bin/awf upgrade "/Users/chenlin/Documents/GitHub/FinderPathBar"（框架文件同步为 kit v1.1.0；项目根 VERSION 锚点将写入 1.1.0）
3. 校验：cd "/Users/chenlin/Documents/GitHub/FinderPathBar" && ./agent-workflow/check_workflow.sh（必须 0 FAIL）
4. 确认锚点：cat "/Users/chenlin/Documents/GitHub/FinderPathBar/VERSION"（应为 1.1.0）
5. 本地 commit（禁止 push）：建议消息 chore(workflow): 框架升级至 v1.1.0
6. 回报：commit hash、check 结果、VERSION 值

## 验收

- [ ] VERSION 锚点 = 1.1.0
- [ ] check_workflow.sh 0 FAIL
- [ ] agent-workflow/ 框架 = kit v1.1.0（bin/awf-dispatch 含握手「连接成功」与 MAX_SENDER_SESSIONS）
- [ ] 本地 commit 落盘（禁止 push）
