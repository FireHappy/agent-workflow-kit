# DEV-007 升级工作流框架到 0.2.1

- 目标项目：agent-demo02（/Users/chenlin/Documents/GitHub/agent-demo02）
- 类型：dev（框架维护，不改业务代码）
- 目标：用全局技能的新版生成器刷新本项目工作流，保留项目事实与账本。

## 背景

kit 已发布 0.2.1：入口新增「任务路由」（有团队能力时优先派发）；dev/docs/debug 工作流补
独立复核、回归范围与逐条核对；awf-dispatch 支持 `--team`。本项目仍在旧版本。

## 必须实际执行的步骤

```sh
cd /Users/chenlin/Documents/GitHub/agent-demo02
~/.dsh/skills/agent-workflow-scaffold/bin/awf init . --force
./agent-workflow/check_workflow.sh
git status --short
git diff --stat
```

## 约束

- 只用上面的全局 awf 刷新；不要手改生成文件
- 保留 `agent-workflow/project.yaml` 的 id/name/aliases，不要重命名项目
- 不要动 `tasks/`、`tools/`、`memory/` 里的既有内容（status.md 由 awf 刷新是允许的）
- 只允许本地 commit，禁止 push

## 验收标准

- [ ] `check_workflow.sh` 退出 0，digest 与 project.yaml 一致
- [ ] `git diff --stat` 只包含：`AGENTS.md`（受控区块）、`agent-workflow/README.md`、`agent-workflow/workflows/*`、`agent-workflow/bin/*`、`agent-workflow/templates/*`、`agent-workflow/tasks/status.md`
- [ ] 入口含「任务路由」节
- [ ] 本地 commit：`chore: 升级工作流框架到 0.2.1`

## 回报格式

状态 / 变更文件 / check 结果 / commit hash / 阻塞点
