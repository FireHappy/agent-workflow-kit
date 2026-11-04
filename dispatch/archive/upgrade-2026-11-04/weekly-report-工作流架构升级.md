# 工作流架构升级

- 目标项目：weekly-report（/Users/chenlin/Documents/周报）
- 来源：用户
- 路由裁决：目标=weekly-report；通道=目标工作区会话；理由=发布升级任务（把 kit 的 bin/awf-dispatch 会话命名 [awf] [派发者] [任务名] 与版本锚点等变更同步到所有登记项目）

## 任务（全程在目标项目自己的工作区会话执行，禁止改其他项目）

0. （若前置检查提示脏文件）处理存量脏文件：与升级无关的编辑器自动改动（如 Unity ProjectSettings/Layouts、dispatch/log.md 派发日志）→ ① 先 git checkout -- 还原；或 ② 与升级改动一并本地 commit（禁止 push），确保升级前/后工作树可校验
1. 预览：/Users/chenlin/Documents/GitHub/agent-workflow-kit/bin/awf upgrade "/Users/chenlin/Documents/周报" --dry-run（确认变更/保留清单）
2. 执行：/Users/chenlin/Documents/GitHub/agent-workflow-kit/bin/awf upgrade "/Users/chenlin/Documents/周报"（自动复制 bin/awf、bin/awf-dispatch、templates、README、workflows，并同步 VERSION 版本锚点；保留 project.yaml/tasks/**/memory/**/AGENTS.md 区块外内容）
3. 校验：cd "/Users/chenlin/Documents/周报" && ./agent-workflow/check_workflow.sh（必须 0 FAIL）
4. 验证新派发器：grep -c "MAX_SENDER_SESSIONS" "/Users/chenlin/Documents/周报/agent-workflow/bin/awf-dispatch"（应 ≥1，即 [awf] [派发者] [任务名] 命名已就位）
5. 本地 commit：commit 消息建议：chore(workflow): 框架升级 DEV-133/134，**禁止 push**
6. 回报：commit hash、check 结果（n ok/0 fail）、grep 计数

## 验收

- [ ] agent-workflow/ 框架为 kit 最新（bin/awf-dispatch 含 MAX_SENDER_SESSIONS 特性，bin/awf 为 kit 版本）
- [ ] 项目根 VERSION 存在且为 1.0.0（DEV-133 锚点，已有则保持）
- [ ] check_workflow.sh 全绿（0 FAIL）
- [ ] 本地 commit 落盘（禁止 push）
