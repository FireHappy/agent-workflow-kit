# rokid-system-components-DEV-035 升级工作流框架到 0.4.2

- 目标项目：rokid_system_components（/Users/chenlin/Documents/GitHub/rokid_system_components）
- 模块：工作流
- 类型：dev（框架维护，机械任务）

## 必须实际执行的步骤

```sh
cd /Users/chenlin/Documents/GitHub/rokid_system_components
~/.dsh/skills/agent-workflow-scaffold/bin/awf init . --force
./agent-workflow/check_workflow.sh
git status --short
```

## 验收标准

- [ ] checkpoint 退出 0，digest 与 project.yaml 一致
- [ ] ./agent-workflow/bin/awf-dispatch --help 含 --module / --new / --session / --idle-wait
- [ ] ./agent-workflow/bin/awf release-prep --help 可用
- [ ] 本地 commit：chore: 升级工作流框架到 0.4.2，禁止 push

## 回报格式

状态 / 变更文件 / check 结果 / commit hash / 阻塞点（任务包五项）
