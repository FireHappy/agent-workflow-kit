# agent-demo02 · DEV-005 新增 sum_between 区间求和

- 目标项目：agent-demo02（/Users/chenlin/Documents/GitHub/agent-demo02）
- 类型：dev
- 派发来源：agent-workflow-kit（跨项目派发测试）

## 目标

在 `calc/sum.py` 增加 `sum_between(lo: int, hi: int) -> int`：返回闭区间 `[lo, hi]` 的整数和；`hi < lo` 时返回 0。现有 `sum_to` 行为不变。

## 修改范围

- `calc/sum.py`：只新增函数，保留 `sum_to`
- `scripts/test.sh`：新增 3 条断言（`sum_between(1, 5) == 15`、`sum_between(3, 3) == 3`、`sum_between(5, 1) == 0`）
- `docs/calc.md`：补 `sum_between` 的签名、边界与一个示例

不做：不改 `web/`；不改 `agent-workflow/` 模板；不引入新依赖。

## 验收（必须实际执行）

1. `python3 -m py_compile calc/sum.py`
2. `bash scripts/test.sh` → 全部通过，输出含新用例
3. `./agent-workflow/check_workflow.sh` → 退出码 0

## 账本

- 认领：在 `agent-workflow/tasks/dev/current.md` 写 `DEV-005` 任务块（优先级 P2、状态 active、Owner、修改范围、验收、下一步）
- 完成：跑通验收 → `./agent-workflow/bin/awf status` → 归档到 `agent-workflow/tasks/dev/done.md`

## 提交

只允许本地 commit（`feat: DEV-005 sum_between 区间求和`），**禁止 push**。

## 回报格式

状态 / 变更文件 / 验证命令与结果 / commit hash / 阻塞点
