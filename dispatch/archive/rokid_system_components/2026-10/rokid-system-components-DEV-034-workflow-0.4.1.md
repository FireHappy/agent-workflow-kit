# DEV-034 升级工作流框架到 0.4.1

- 目标项目：rokid_system_components（/Users/chenlin/Documents/GitHub/rokid_system_components）
- 模块：工作流
- 类型：dev（框架维护）
- 目标：从 0.4.0 升级到 0.4.1（会话复用、`--new/--session/--module/--idle-wait`、会话命名规范）。

## 必须实际执行的步骤

```sh
cd /Users/chenlin/Documents/GitHub/rokid_system_components
~/.dsh/skills/agent-workflow-scaffold/bin/awf init . --force
./agent-workflow/check_workflow.sh
git status --short
```

## 注意

- 本项目的 `check_workflow.sh` 是定制版（含 CACHE_EXPIRE_DAYS 等），`init --force` 的 put_if_absent 会保留它，**不要手动覆盖或删除**
- `config/`、`docs/`、`memory/` 属于本项目内容，不要删改
- 项目有 active 任务（status.md），只做框架升级，不要动那些任务块

## 验收标准

- [ ] `check_workflow.sh` 退出 0，digest 与 project.yaml 一致
- [ ] `./agent-workflow/bin/awf-dispatch --help` 含 `--module` / `--new` / `--session` / `--idle-wait`
- [ ] 定制 `check_workflow.sh` 仍保留（含 CACHE_EXPIRE_DAYS）
- [ ] 本地 commit：`chore: 升级工作流框架到 0.4.1`，禁止 push

## 回报格式

状态 / 变更文件 / check 结果 / commit hash / 阻塞点（任务包五项）
