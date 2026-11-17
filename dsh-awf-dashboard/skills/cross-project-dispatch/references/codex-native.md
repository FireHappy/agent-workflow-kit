# Codex 本地项目原生派发

本参考只在当前会话运行于 Codex 桌面端、且目标仓库需要派发到同一 Codex 本地主机时使用。它描述的是路由和记录规则，不替代目标项目的 `AGENTS.md`、任务账本或流程技能。

## 路由判定

1. 从票据的 `- 目标项目：<别名>（<绝对路径>）` 读取目标绝对路径。
2. 调用 `mcp__codex_app__list_projects`，要求出现一个 `isGitRepository=true` 且路径与目标绝对路径完全相同的本地项目。
3. 精确匹配时选择 Codex 原生通道；没有匹配、当前环境没有 Codex App 工具，或用户明确要求 DSH 时，回到 `awf-dispatch` 的 GUI/headless/handoff 路由。不能用项目名模糊匹配代替路径匹配。

## 派发调用

使用 `mcp__codex_app__create_thread` 创建目标项目线程：

```json
{
  "title": "[awf] [派发者] [任务名]",
  "prompt": "<完整票据文本>\n\n<回执与状态透明化约束>",
  "target": {
    "type": "project",
    "projectId": "<list_projects 返回的 projectId>",
    "environment": {"type": "local"}
  }
}
```

- `startingState` 不要臆造；只有用户明确要求从某个分支或工作树启动时才设置。
- `prompt` 必须包含完整票据，不要在路由方重写目标项目的执行步骤。
- 默认异步返回；记录 `threadId`、`hostId`、`projectId`、标题、目标 HEAD 和 `status=sent`。
- 返回 `clientThreadId` 表示仍在创建，不代表线程已经启动；记录 `status=queued`，待得到正式 `threadId` 或 Codex 状态确认后再报“已启动”。创建状态不明确时不要重复调用 `create_thread`。
- 只在用户要求等待或票据明确要求本回合落地确认时调用 `mcp__codex_app__wait_threads`；超时保留线程，不重复创建。

## 回执和收尾

- 目标线程沿用本技能的必报点 1–11、回执字段和“派发方核验后归档”规则。
- 回执可由目标线程直接回复；需要跨会话转发时，使用 Codex 的线程消息能力或派发方收件箱约定，不假设 `awf-dispatch --report` 能读取 Codex 线程。
- Codex 原生线程不进入 DSH `[awf]` 会话池，不使用 `--retire-session`、`dsh-session-gc` 或 DSH 复用计数。
- 在调度方 `.dispatch/log.md` 记录 `通道=codex-native`、线程/项目标识、状态和回到线程的方式；任务完成并独立核验后才按票据生命周期删除票据。

## 失败边界

- `list_projects` 无精确路径匹配：不要创建项目外线程，改走 DSH 或 handoff。
- `create_thread` 返回失败、需要用户输入或项目状态不明确：记录原始结果为阻塞，不静默重试、不重复创建；若用户明确允许 DSH 回退，再把原始错误和授权记录到 `.dispatch/log.md` 后进入 DSH 路由，否则保持阻塞等待决定。
- Codex 原生路由不绕过 G1/G3；目标工作流缺失、业务改动冲突或 active 任务冲突仍按主技能要求处理，并在票据中明确豁免理由。
