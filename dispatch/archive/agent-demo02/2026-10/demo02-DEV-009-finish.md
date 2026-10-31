# DEV-009 收尾：提交 0.4.0 升级

- 目标项目：agent-demo02（/Users/chenlin/Documents/GitHub/agent-demo02）
- 类型：dev（收尾提交）
- 背景：上一回合已完成升级与归档，DEV-009 已在 `tasks/dev/done.md`，但未刷新 status、未 commit。

## 当前已知状态

- `check_workflow.sh` 已通过（退出 0）
- 工作区 7 个文件已改未提交：AGENTS.md、agent-workflow/README.md、bin/awf-dispatch、tasks/dev/done.md、tasks/status.md、templates/AGENTS.md.tmpl、workflows/cross-project.md
- `status.md` 仍显示 DEV-009 active，需要 `awf status` 刷新

## 必须实际执行

```sh
cd /Users/chenlin/Documents/GitHub/agent-demo02
./agent-workflow/check_workflow.sh
./agent-workflow/bin/awf status
git status --short
git diff --stat
```

确认 diff 只含上述 7 个文件后：

```sh
git add -A
git commit -m "chore: 升级工作流框架到 0.4.0"
```

## 约束

- 不要再改模板或账本内容（DEV-009 已归档，保持现状）
- 若 check 失败，修复后重跑；不要删除既有任务块
- 禁止 push；只允许本地 commit

## 验收

- [ ] check 退出 0
- [ ] `status.md` 中 DEV-009 不再显示 active
- [ ] 出现新 commit `chore: 升级工作流框架到 0.4.0`
- [ ] 工作区干净

## 回报格式

状态 / commit hash / check 结果 / 工作区是否干净
