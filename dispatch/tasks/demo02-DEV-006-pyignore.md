# agent-demo02 · DEV-006 忽略并清理 Python 缓存

- 目标项目：agent-demo02（/Users/chenlin/Documents/GitHub/agent-demo02）
- 类型：dev（流程文件：`agent-workflow/workflows/dev.md`）
- 派发来源：agent-workflow-kit（跨项目派发测试，第二轮）

## 背景

上一轮 DEV-005 的验收命令里包含 `python3 -m py_compile calc/sum.py`，产出了未跟踪目录 `calc/__pycache__/`；仓库目前没有 `.gitignore`，导致 `git status` 长期变脏。

## 目标

1. 新建仓库根 `.gitignore`，至少忽略 `__pycache__/` 与 `*.pyc`
2. 清理现存 `calc/__pycache__/`（它是生成物，未跟踪，可直接删除）
3. 保证再次执行 `python3 -m py_compile calc/sum.py` 后 `git status` 仍干净

## 修改范围

- `.gitignore`（新建）
- 删除 `calc/__pycache__/`（生成物，非源码）
- 不改 `calc/sum.py`、`scripts/test.sh`、`web/`、`agent-workflow/` 模板

## 验收（必须实际执行）

1. `python3 -m py_compile calc/sum.py` 后再执行 `git status --short` → 输出为空（无新增未跟踪项）
2. `bash scripts/test.sh` → 全部通过
3. `./agent-workflow/check_workflow.sh` → 退出码 0

## 账本

- 认领：`agent-workflow/tasks/dev/current.md` 写 `DEV-006` 任务块（优先级 P2、状态 active、Owner、验收、下一步）
- 完成：`./agent-workflow/bin/awf status` → 归档到 `agent-workflow/tasks/dev/done.md`

## 提交

只允许本地 commit（`chore: DEV-006 忽略并清理 Python 缓存`），**禁止 push**。只提交 `.gitignore`，不要把 `__pycache__` 加进索引。

## 回报格式

状态 / 变更文件 / 验证命令与结果 / commit hash / 阻塞点
