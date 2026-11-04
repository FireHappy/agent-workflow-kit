# dsh-im 补版本锚点 VERSION=1.0.0（目标项目自己的工作区会话执行）

- 目标项目：dsh-im（/Users/chenlin/.dsh/im）
- 来源：用户
- 路由裁决：目标=dsh-im；通道=目标工作区会话；理由=v1.0.0 升级批次补版本锚点（看板按项目根 VERSION 显示具体版本）

## 任务（在目标项目自己的工作区会话执行，禁止改其他项目）

1. 在项目根创建/更新 VERSION 文件，内容为单行：1.0.0（结尾换行）
2. 本地 commit（消息含 UP-102，推荐：chore(workflow): 版本锚点 VERSION=1.0.0 UP-102），**禁止 push**
3. 回报：commit hash
