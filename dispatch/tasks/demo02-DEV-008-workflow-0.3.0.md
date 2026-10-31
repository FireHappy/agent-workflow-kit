# DEV-008 升级工作流框架到 0.3.0

- 目标项目：agent-demo02（/Users/chenlin/Documents/GitHub/agent-demo02）
- 类型：dev（框架维护，不改业务代码）
- 目标：把本项目工作流从 0.2.1 升到 0.3.0，保留项目事实与账本。

## 0.3.0 新增

- `release` 工作流：`agent-workflow/workflows/release.md`（版本方案探测、CHANGELOG、tag 分级）
- 入口新增「发版 / 版本号 / tag / CHANGELOG」路由；`project.yaml` 支持 `version_file` / `changelog` / `tag_prefix`
- `awf-dispatch` 默认异步（`--wait` 才等待）；`check` 强制要求 `release.md`

## 必须实际执行的步骤

```sh
cd /Users/chenlin/Documents/GitHub/agent-demo02
~/.dsh/skills/agent-workflow-scaffold/bin/awf init . --force
./agent-workflow/check_workflow.sh
git status --short
git diff --stat
```

## 约束

- 只用全局 awf 刷新；不要手改生成文件
- 保留 `agent-workflow/project.yaml` 的 id/name/aliases，不重命名项目
- 不动 `tasks/`、`tools/`、`memory/` 既有内容（status.md 由 awf 刷新允许）
- 只允许本地 commit，禁止 push

## 验收标准

- [ ] `check_workflow.sh` 退出 0，digest 与 project.yaml 一致
- [ ] `agent-workflow/workflows/release.md` 存在
- [ ] `AGENTS.md` 含「发版 / 版本号 / tag」与「任务路由」两节
- [ ] `git diff --stat` 只含预期生成文件与 `tasks/status.md`
- [ ] 本地 commit：`chore: 升级工作流框架到 0.3.0`

## 回报格式

状态 / 变更文件 / check 结果 / commit hash / 阻塞点
