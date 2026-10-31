# DEV-009 升级工作流框架到 0.4.0

- 目标项目：agent-demo02（/Users/chenlin/Documents/GitHub/agent-demo02）
- 类型：dev（框架维护，不改业务代码）
- 目标：把本项目工作流从 0.3.0 升级到 0.4.0（新增 `--prune` 票据归档、派发即建队规则、模板中立化）。

## 必须实际执行的步骤

```sh
cd /Users/chenlin/Documents/GitHub/agent-demo02
~/.dsh/skills/agent-workflow-scaffold/bin/awf init . --force
./agent-workflow/check_workflow.sh
git status --short
```

## 验收标准

- [ ] `check_workflow.sh` 退出 0，digest 与 project.yaml 一致
- [ ] `./agent-workflow/bin/awf-dispatch --prune --help` 可用（含 --prune / --apply）
- [ ] `agent-workflow/workflows/cross-project.md` 含票据生命周期与派发即建队说明
- [ ] 只改预期生成文件与 `tasks/status.md`
- [ ] 本地 commit：`chore: 升级工作流框架到 0.4.0`，禁止 push

## 回报格式

状态 / 变更文件 / check 结果 / commit hash / 阻塞点
