# 跨项目派发

目标：在 A 项目里把任务交给 B 项目的 agent，由它按 B 自己的 `AGENTS.md` 与工作流执行，A 只收结果。

## 三种方式

| 方式 | 本质 | 适用 | 关键限制 |
|---|---|---|---|
| `subagent(cwd=/path/to/B)` | 同进程、独立会话、独立上下文 | 会话内派发 1–N 件，可 `send_message` 追问 | 默认 `maxDepth=1`；写入边界是子会话自己的 cwd |
| `dsh --profile headless "任务"` | 独立进程、独立会话 | 无人值守、CI、批量 | 一次一个任务；需 `--session-id` 续聊 |
| `--profile sdk` / `acp` | JSON-RPC / ACP 服务 | 自建派发器 | 需写客户端 |

**不要**用父会话 `working_directory` 切过去，再在那边写文件：`cwd` 变了但写入边界没变。

## 前置：headless 复用 GUI 登录

headless 默认走 `DEEPSEEK_API_KEY`，不读 GUI 保存的 OAuth 凭据。写入一次 `~/.dsh/profiles/headless/cordis.patch.yml` 即可复用：

```yaml
- id: credentials
  disabled: false
- id: authorization
  disabled: false
- id: deepseek-account
  disabled: false
- id: agent-default-model
  name: '@deepseek-ai/dsh-agent-default-model'
  config:
    provider: deepseek-account
    model: deepseek-flash
```

替代方案：在 `~/.dsh/.env` 写 `DEEPSEEK_API_KEY=...`（明文，注意权限）。

## 派发器

放在调度方项目（如 demo01）里：

```bash
#!/usr/bin/env bash
set -euo pipefail
ALIAS="${1:?别名}"; TASK_FILE="${2:?任务文件}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$("$ROOT/agent-workflow/bin/awf" find "$ALIAS" | head -1 | awk -F'\t' '{print $2}')"
[ -n "$TARGET" ] || { echo "未找到：$ALIAS" >&2; exit 1; }
cd "$TARGET"
dsh --profile headless "$(cat "$TASK_FILE")"
```

`awf find` 读的是全局索引，所以调度方不需要知道目标项目的绝对路径。

## 任务文本模板

```text
你在 <项目> 仓库中执行任务，必须遵守本仓库 AGENTS.md 与 agent-workflow/workflows/<type>.md。

任务：<ID> <一句话目标>
1. <实现步骤>
2. <验证命令，必须实际执行>
3. 在 tasks/<type>/current.md 认领 <ID>，补齐：优先级、状态 active、Owner、协作模式、来源任务、修改范围、依赖、最近更新、目标、验收标准、下一步。
4. 运行 ./agent-workflow/check_workflow.sh 与 ./agent-workflow/bin/awf status。
5. 归档到 tasks/<type>/done.md。
6. 本地 git commit（禁止 push）：<提交信息>。

回报：状态 / 变更文件 / 验证命令与结果 / commit sha / 阻塞点。
```

要点：

- 显式写“必须遵守 AGENTS.md”，否则模型可能跳过流程；
- 要求“实际执行”验证，避免只声明；
- 需要 review 时写死“先 review 再归档”，不能留空；
- 明确“禁止 push”。

## 结果契约

让目标 agent 按固定格式回报，父级才能稳定汇总：

```text
- 状态：完成 / 阻塞
- 变更文件：...
- 验证：命令 + 结果摘要
- commit：sha
- 阻塞点：无 / 原因
```

## 已实测

两个空项目 demo01 / demo02，三次派发：

| 任务 | 产物 | 结果 |
|---|---|---|
| DEV-001 | `calc/sum.py` + `scripts/test.sh` | 编译与断言通过，本地提交 |
| DOCS-001 | `docs/calc.md` | 归档并通过 check |
| DEV-002 | `scripts/check.sh` | 通过，并验证了失败路径 |

目标 agent 自己读了 demo02 的 `AGENTS.md`、写自己的账本、跑自己的校验、只做本地提交。

## 必须注意

1. **子 agent 审批通常是关闭的**（越界写入直接失败），派发任务要保证在目标仓库内完成。
2. **账本单写者**：目标 agent 写自己的 `current.md` / `status.md`，父级不要跨仓库改。
3. **独立上下文**：每次派发都是新会话，隐性约束必须写进任务文本。
4. **`workflow` 工具不适合跨仓库**：它的 `agent()` 没有 `cwd`，会继承父级目录。
5. **凭据**：headless 见上文；SDK / ACP 默认保留已保存凭据。
