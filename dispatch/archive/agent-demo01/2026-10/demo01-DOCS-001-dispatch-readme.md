# agent-demo01 · DOCS-001 dispatch 目录说明

- 目标项目：agent-demo01（/Users/chenlin/Documents/GitHub/agent-demo01）
- 类型：docs（流程文件：`agent-workflow/workflows/docs.md`）
- 派发来源：agent-workflow-kit（跨项目派发测试）

## 目标

新建 `dispatch/README.md`，说明本目录的用法，作为派发侧的速查表。

## 修改范围

- `dispatch/README.md`（新建）
- 不改 `dispatch/log.md` 历史、不改 `dispatch/tasks/*` 既有任务包、不改 `bin/`、不改 `workflows/`

## 内容要求

1. 目录用途：调度方任务包 + 派发日志 + 入口脚本
2. 任务包格式：目标项目/任务 ID/类型、目标、修改范围、验收命令、账本要求、提交要求、回报格式
3. `run.sh` 用法与常用参数（`--dry-run`、`--no-wait`、`--headless`、`--handoff`）
4. `log.md` 记录字段：时间、目标、任务、工作区、会话、状态、目标 HEAD、回报节选
5. G1–G4 前置门与对应回退，内容以 `agent-workflow/workflows/cross-project.md` 为准，**不要整篇复制**

## 验收（必须实际执行）

1. `./agent-workflow/check_workflow.sh` → 退出码 0
2. `grep -c` 确认文档含 `G1`、`G2`、`G3`、`G4`、`--handoff`、`--headless`、`log.md`

## 账本

- 认领：`agent-workflow/tasks/docs/current.md` 写 `DOCS-001` 任务块（优先级 P2、状态 active、Owner、验收、下一步）
- 完成：`./agent-workflow/bin/awf status` → 归档到 `agent-workflow/tasks/docs/done.md`

## 提交

只允许本地 commit（`docs: DOCS-001 dispatch 目录说明`），**禁止 push**。

## 回报格式

状态 / 变更文件 / 验证命令与结果 / commit hash / 阻塞点
