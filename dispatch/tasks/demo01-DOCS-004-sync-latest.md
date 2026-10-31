# DOCS-004 同步工作流到最新（含派发票据归档与团队派发规则）

- 目标项目：agent-demo01（/Users/chenlin/Documents/GitHub/agent-demo01）
- 类型：docs（框架维护，不改业务代码）
- 目标：把本项目工作流从 0.3.0 刷新到 kit 最新 HEAD（新增 `--prune` 票据归档、派发即建队规则文档）。

## 必须实际执行的步骤

```sh
cd /Users/chenlin/Documents/GitHub/agent-demo01
~/.dsh/skills/agent-workflow-scaffold/bin/awf init . --force
./agent-workflow/check_workflow.sh
git status --short
```

## 验收标准

- [ ] `check_workflow.sh` 退出 0，digest 与 project.yaml 一致
- [ ] `./agent-workflow/bin/awf-dispatch --prune --help` 可用（含 --prune / --apply）
- [ ] `agent-workflow/workflows/cross-project.md` 含票据生命周期说明
- [ ] 只改预期生成文件与 `tasks/status.md`
- [ ] 本地 commit：`chore: 同步工作流到最新（含派发票据归档）`，禁止 push

## 回报格式

状态 / 变更文件 / check 结果 / commit hash / 阻塞点
