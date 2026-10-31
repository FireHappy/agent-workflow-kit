# DEV-010 升级工作流框架到 0.4.1

- 目标项目：agent-demo02（/Users/chenlin/Documents/GitHub/agent-demo02）
- 模块：工作流
- 类型：dev（框架维护）
- 目标：从 0.4.0 升级到 0.4.1（会话复用：按项目+模块复用空闲会话、`--new/--session/--module/--idle-wait`、会话命名 `[awf] <项目> · <模块>`）。

## 必须实际执行的步骤

```sh
cd /Users/chenlin/Documents/GitHub/agent-demo02
~/.dsh/skills/agent-workflow-scaffold/bin/awf init . --force
./agent-workflow/check_workflow.sh
git status --short
```

## 验收标准

- [ ] `check_workflow.sh` 退出 0，digest 与 project.yaml 一致
- [ ] `./agent-workflow/bin/awf-dispatch --help` 含 `--module` / `--new` / `--session` / `--idle-wait`
- [ ] `agent-workflow/workflows/cross-project.md` 含「模块：」可选字段说明与会话复用说明
- [ ] 只改预期生成文件与 `tasks/status.md`
- [ ] 本地 commit：`chore: 升级工作流框架到 0.4.1`，禁止 push

## 回报格式

状态 / 变更文件 / check 结果 / commit hash / 阻塞点（任务包五项）
