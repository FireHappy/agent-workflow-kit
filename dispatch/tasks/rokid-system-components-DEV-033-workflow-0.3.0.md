# DEV-033 升级工作流框架到 0.3.0（合并上次安装残留）

- 目标项目：rokid-system-components（/Users/chenlin/Documents/GitHub/rokid_system_components）
- 类型：dev（框架升级，不动业务代码）
- 目标：把本项目工作流从旧版（约 0.2.0，且部分文件未入库）升到 0.3.0，并把上次未提交的安装残留合并为一次升级提交。

## 当前已知状态（派发方已核对）

- 工作区有 18 项未提交改动，多为上次安装残留：`AGENTS.md`、`project.yaml`、`templates/`、`neighbors.tsv` 未跟踪；`README.md`、`check_workflow.sh`、`tasks/*` 已修改；`memory/cache/*` 删除、`memory/history/*` 新增
- `check_workflow.sh` 是**定制版**（340 行，含 cache/P0 检查，调用 `./bin/awf check`）；`awf init --force` 用 put_if_absent 写入，**不会覆盖它**，不要手动替换
- `awf check` 当前可通过

## 必须实际执行的步骤

```sh
cd /Users/chenlin/Documents/GitHub/rokid_system_components
# 1) 先登记任务（状态 active，Owner=本会话，范围 agent-workflow/* + AGENTS.md，不动业务代码）
~/.dsh/skills/agent-workflow-scaffold/bin/awf init . --force
./agent-workflow/check_workflow.sh
git status --short
git diff --stat
```

2) 若 `check` 失败：按输出修复；`config/`、`docs/` 是项目定制，**不要删除**；`neighbors.tsv` 是旧版生成物，确认新 README/check 都不再引用后再删（直接 `rm`，它未跟踪）
3) 确认 `agent-workflow/workflows/release.md` 存在、`AGENTS.md` 含「发版 / 版本号 / tag」与「任务路由」两节
4) 一次提交（用户已确认合并残留）：`chore: 升级工作流框架到 0.3.0`
   - 包含：生成物刷新、AGENTS.md/project.yaml/templates 入库、tasks 账本变更、memory cache→history 迁移
   - message body 用 3–5 行分类说明这次一并提交了上次安装残留
5) 归档 DEV-033 到 `tasks/dev/done.md`，跑 `./agent-workflow/bin/awf status`，最后再跑一次 `./agent-workflow/check_workflow.sh`
6) **禁止 push**；不要动业务代码与既有任务块（DEV-030/DEV-026 等）

## 验收标准

- [ ] `check_workflow.sh` 退出 0，digest 与 `project.yaml` 一致
- [ ] `agent-workflow/workflows/release.md` 存在
- [ ] 定制版 `check_workflow.sh` 保留（仍含 `CACHE_EXPIRE_DAYS`，未被模板替换）
- [ ] 只有一个新 commit，工作区干净（或只剩明确说明的忽略项）
- [ ] 未 push

## 回报格式

状态 / 变更文件统计 / check 结果 / commit hash / 是否有需要人工确认的残留
