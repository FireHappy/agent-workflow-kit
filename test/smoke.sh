#!/usr/bin/env bash
# awf-kit 冒烟测试：在临时目录验证 init / check / status / bootstrap / --force
set -eu

KIT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export DSH_AGENTS_HOME="$TMP/agents"

PROJ="$TMP/proj"
mkdir -p "$PROJ"

pass=0
fail=0

ok() { pass=$((pass + 1)); printf 'ok    %s\n' "$*"; }
bad() { fail=$((fail + 1)); printf 'FAIL  %s\n' "$*"; }

assert_file() { [ -f "$1" ] && ok "存在 $2" || bad "缺少 $2"; }
assert_grep() { grep -q "$1" "$2" && ok "$3" || bad "$3"; }

# 1. init
"$KIT_DIR/bin/awf" init "$PROJ" --name "冒烟项目" --purpose "验证脚手架" >/dev/null
assert_file "$PROJ/AGENTS.md" "AGENTS.md"
assert_file "$PROJ/agent-workflow/project.yaml" "project.yaml"
assert_file "$PROJ/agent-workflow/bin/awf" "bin/awf"
assert_file "$PROJ/agent-workflow/tasks/status.md" "status.md"
assert_grep 'awf:begin v1 digest:' "$PROJ/AGENTS.md" "入口含 digest"
assert_grep '（未配置' "$PROJ/AGENTS.md" "空校验命令有回退提示"
assert_file "$PROJ/agent-workflow/workflows/cross-project.md" "cross-project 工作流"
assert_file "$PROJ/agent-workflow/workflows/release.md" "release 工作流"
assert_file "$PROJ/agent-workflow/bin/awf-dispatch" "awf-dispatch"
assert_grep '跨项目' "$PROJ/AGENTS.md" "入口含跨项目路由"

# 1.1 派发器：help / --team 任务包注入 / handoff / 无工作流前置检查
"$PROJ/agent-workflow/bin/awf-dispatch" --help >/dev/null && ok "awf-dispatch --help" || bad "awf-dispatch --help 失败"
if "$PROJ/agent-workflow/bin/awf-dispatch" --help 2>&1 | grep -q -- '--team'; then
  ok "--help 列出 --team"
else
  bad "--help 未列出 --team"
fi
if "$PROJ/agent-workflow/bin/awf-dispatch" --help 2>&1 | grep -q 'AgentTeams'; then
  ok "--help 说明 AgentTeams 语义"
else
  bad "--help 未说明 AgentTeams 语义"
fi

# 1.2 默认异步：--help 含 --wait / --no-wait 兼容别名，并写清默认不等待
help_text="$("$PROJ/agent-workflow/bin/awf-dispatch" --help 2>&1)"
if printf '%s\n' "$help_text" | grep -Eq -- '(^|[[:space:]])--wait([[:space:]]|$)'; then
  ok "--help 列出 --wait"
else
  bad "--help 未列出 --wait"
fi
if printf '%s\n' "$help_text" | grep -q -- '--no-wait'; then
  ok "--help 保留 --no-wait 兼容别名"
else
  bad "--help 未保留 --no-wait"
fi
if printf '%s\n' "$help_text" | grep -q '默认不等待'; then
  ok "--help 写清默认不等待"
else
  bad "--help 未写清默认不等待"
fi

# 1.3 --prune：help 同步归档参数与目录语义
if printf '%s\n' "$help_text" | grep -q -- '--prune'; then
  ok "--help 列出 --prune"
else
  bad "--help 未列出 --prune"
fi
if printf '%s\n' "$help_text" | grep -q -- '--apply'; then
  ok "--help 列出 --apply"
else
  bad "--help 未列出 --apply"
fi
if printf '%s\n' "$help_text" | grep -q 'dispatch/archive'; then
  ok "--help 说明归档目录"
else
  bad "--help 未说明归档目录"
fi

# 1.4 --prune 判定：票据解析 + commit 无 ID 但 done.md 含 ID 也算 completed
if python3 - "$KIT_DIR/bin/awf-dispatch" <<'PY'
import importlib.machinery
import importlib.util
import pathlib
import subprocess
import sys
import tempfile

source = pathlib.Path(sys.argv[1])
loader = importlib.machinery.SourceFileLoader("awf_dispatch_prune_under_test", str(source))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)

ticket = "# demo01 · DOCS-042 冒烟\n\n- 目标项目：demo01（/tmp/awf-demo01）\n- 类型：docs\n"
alias, target = module.parse_ticket_target(ticket)
assert alias == "demo01", alias
assert str(target) == "/tmp/awf-demo01", target
assert module.parse_ticket_target("- 类型：docs\n") == (None, None)
assert module.parse_ticket_target("- 目标项目：demo01（relative/path）\n") == (None, None)

assert module.ticket_task_id("demo01-DOCS-042-smoke.md") == "DOCS-042"
assert module.ticket_task_id("no-id-ticket.md") is None
assert module.ticket_task_id("demo02-DEV-0071-x.md") == "DEV-0071"
assert not module.id_regex("DEV-007").search("DEV-0071"), "ID 边界失效"
assert module.id_regex("DEV-007").search("归档 DEV-007 完成")

with tempfile.TemporaryDirectory() as tmp:
    tmp = pathlib.Path(tmp)
    repo = tmp / "repo"
    (repo / "agent-workflow/tasks/dev").mkdir(parents=True)
    (repo / "agent-workflow/tasks/dev/done.md").write_text("## [DEV-007] 已完成\n", encoding="utf-8")

    def git(*args):
        subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True)

    git("init", "-q")
    git("config", "user.email", "smoke@example.com")
    git("config", "user.name", "smoke")
    git("add", "-A")
    git("commit", "-qm", "chore: 升级工作流框架到 0.3.0")  # 提交消息不含任务 ID

    tasks = tmp / "dispatch/tasks"
    tasks.mkdir(parents=True)
    (tasks / "demo02-DEV-007-ledger.md").write_text(f"- 目标项目：demo02（{repo}）\n", encoding="utf-8")
    (tasks / "demo02-DEV-099-pending.md").write_text(f"- 目标项目：demo02（{repo}）\n", encoding="utf-8")
    (tasks / "demo02-DEV-100-broken.md").write_text("# 无目标项目行\n", encoding="utf-8")
    (tasks / "demo02-DEV-101-missing.md").write_text("- 目标项目：demo02（/no/such/path）\n", encoding="utf-8")

    items = {item["taskId"]: item for item in module.scan_tickets(tmp)}
    assert items["DEV-007"]["status"] == "completed", items["DEV-007"]
    assert "done.md" in items["DEV-007"]["reason"], items["DEV-007"]["reason"]
    month = module.datetime.date.today().strftime("%Y-%m")
    expected = f"dispatch/archive/demo02/{month}/demo02-DEV-007-ledger.md"
    assert items["DEV-007"]["archive"] == expected, items["DEV-007"]["archive"]
    assert items["DEV-099"]["status"] == "pending", items["DEV-099"]
    assert items["DEV-100"]["status"] == "unknown", items["DEV-100"]
    assert items["DEV-101"]["status"] == "unknown", items["DEV-101"]
    assert (tasks / "demo02-DEV-007-ledger.md").is_file(), "判定阶段不得移动票据"
PY
then
  ok "票据解析与完成判定（commit 无 ID、done.md 含 ID）正确"
else
  bad "票据解析 / 完成判定断言失败"
fi

# 直接用 importlib 加载源脚本，断言 build_prompt 的 --team 注入、默认异步实现点与缺省行为
if python3 - "$KIT_DIR/bin/awf-dispatch" <<'PY'
import importlib.machinery
import importlib.util
import inspect
import pathlib
import sys

source = pathlib.Path(sys.argv[1])
loader = importlib.machinery.SourceFileLoader("awf_dispatch_under_test", str(source))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)

target = pathlib.Path("/tmp/awf-demo")
task = "任务：TEST-001 冒烟派发\n\n1. 只读验证。\n"
base = module.build_prompt(target, "demo · 冒烟", "dev", task)
off = module.build_prompt(target, "demo · 冒烟", "dev", task, team=False)
team = module.build_prompt(target, "demo · 冒烟", "dev", task, team=True)

assert inspect.signature(module.build_prompt).parameters["team"].default is False, "build_prompt 的 team 默认值必须为 False"
assert base == off, "team 缺省与 team=False 输出必须一致"
assert "AgentTeams" not in base, "未开启 --team 时不得出现 AgentTeams 段"
assert "可选：用 AgentTeams 执行" in team, "team=True 时缺少 AgentTeams 段标题"
for word in ("子任务", "依赖", "队长", "插件"):
    assert word in team, f"team=True 段落缺少关键词：{word}"
assert team.startswith(base), "--team 段落只能追加在任务包末尾"
assert "team=args.team" in inspect.getsource(module.dispatch_session), "dispatch_session 必须把 args.team 传给 build_prompt"

# 默认异步：DEFAULT_WAIT 常量、argparse 默认值、session/headless 两条路径
assert module.DEFAULT_WAIT is False, "DEFAULT_WAIT 必须为 False（默认不等待）"
assert module.DEFAULT_TIMEOUT > 0, "DEFAULT_TIMEOUT 必须为正数"
main_src = inspect.getsource(module.main)
assert "default=DEFAULT_WAIT" in main_src, "--wait 必须以 DEFAULT_WAIT 作默认值"
assert "--no-wait" in main_src, "--no-wait 兼容别名缺失"
assert "仅 --wait 生效" in main_src, "--timeout 必须注明仅对 --wait 生效"

session_src = inspect.getsource(module.dispatch_session)
assert "if not args.wait" in session_src, "dispatch_session 默认必须不等待"
assert "args.no_wait" not in session_src, "dispatch_session 不得再依赖 args.no_wait"
assert "已发送，未等待回合" in session_src, "session 异步日志状态缺失"
assert "next_step=" in session_src, "session 异步日志必须注明如何回到 GUI 会话"
assert "回到会话" in inspect.getsource(module.log_entry), "日志缺少回到会话字段"

headless_src = inspect.getsource(module.dispatch_headless)
assert "if not args.wait" in headless_src, "headless 默认也必须不等待"
assert "已发送，未等待回合" in headless_src, "headless 异步日志状态缺失"
assert "Popen" in headless_src, "headless 默认应以后台进程启动"
PY
then
  ok "build_prompt --team 注入且缺省不变；默认异步实现点有断言"
else
  bad "build_prompt / 默认异步断言失败"
fi

printf '任务：TEST-001 冒烟派发\n\n1. 只读验证。\n' > "$TMP/task.md"
( cd "$TMP" && "$PROJ/agent-workflow/bin/awf-dispatch" "$PROJ" task.md --handoff >/dev/null ) \
  && ok "handoff 生成交接单" || bad "handoff 失败"
[ -f "$TMP"/dispatch/handoff/*.md ] && ok "交接单文件存在" || bad "交接单文件缺失"
mkdir -p "$TMP/noworkflow"
if "$PROJ/agent-workflow/bin/awf-dispatch" "$TMP/noworkflow" "$TMP/task.md" --dry-run >"$TMP/out" 2>&1; then
  bad "无工作流时派发应失败"
else
  grep -q 'G1 工作流失败' "$TMP/out" && ok "无工作流时前置检查失败" || bad "无工作流时错误信息不明确"
fi

# 1.5 --prune 端到端：dry-run 不改文件 / --apply 移动（git mv 与 os.rename）/ 冲突不覆盖 / 用法错误
DISPATCH="$PROJ/agent-workflow/bin/awf-dispatch"
PRUNE="$TMP/prune"
PRUNE_TARGET="$TMP/prune-target"
mkdir -p "$PRUNE/dispatch/tasks" "$PRUNE_TARGET/agent-workflow/tasks/dev"
printf '## [DEV-101] 已完成\n' > "$PRUNE_TARGET/agent-workflow/tasks/dev/done.md"
git -C "$PRUNE_TARGET" init -q
git -C "$PRUNE_TARGET" config user.email smoke@example.com
git -C "$PRUNE_TARGET" config user.name smoke
git -C "$PRUNE_TARGET" add -A
git -C "$PRUNE_TARGET" commit -qm "chore: 无任务 ID 的提交"

git -C "$PRUNE" init -q
git -C "$PRUNE" config user.email smoke@example.com
git -C "$PRUNE" config user.name smoke

cat > "$PRUNE/dispatch/tasks/demo01-DEV-101-tracked.md" <<EOF
# demo01 · DEV-101

- 目标项目：demo01（$PRUNE_TARGET）
EOF
cat > "$PRUNE/dispatch/tasks/demo01-DEV-101-untracked.md" <<EOF
# demo01 · DEV-101 副本

- 目标项目：demo01（$PRUNE_TARGET）
EOF
git -C "$PRUNE" add dispatch/tasks/demo01-DEV-101-tracked.md
git -C "$PRUNE" commit -qm "chore: 种子票据（只把 tracked 加入索引）"
cat > "$PRUNE/dispatch/tasks/demo01-DEV-101-conflict.md" <<EOF
# demo01 · DEV-101 冲突

- 目标项目：demo01（$PRUNE_TARGET）
EOF

if ( cd "$PRUNE" && "$DISPATCH" --prune --json > plan.json ); then
  ok "--prune dry-run 退出 0"
else
  bad "--prune dry-run 失败"
fi
if [ -f "$PRUNE/dispatch/tasks/demo01-DEV-101-tracked.md" ] && [ ! -e "$PRUNE/dispatch/archive" ]; then
  ok "dry-run 不移动文件、不建 archive"
else
  bad "dry-run 改动了票据文件"
fi
if python3 - "$PRUNE/plan.json" <<'PY'
import json
import sys

data = json.load(open(sys.argv[1], encoding="utf-8"))
assert data["mode"] == "prune", data
assert data["dryRun"] is True, data
assert data["summary"]["completed"] == 3, data["summary"]
assert data["summary"]["total"] == 3, data["summary"]
for item in data["items"]:
    assert item["status"] == "completed", item
    assert item["taskId"] == "DEV-101", item
    assert item["archive"].startswith("dispatch/archive/demo01/"), item
    assert item["archive"].endswith(item["file"].split("/")[-1]), item
PY
then
  ok "--prune --json 计划字段完整（completed / 任务 ID / 归档路径）"
else
  bad "--prune --json 计划字段不完整"
fi

# 冲突：预先占用一张票据的归档路径，apply 时必须跳过且不覆盖
conflict_dest="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print([i["archive"] for i in d["items"] if i["file"].endswith("conflict.md")][0])' "$PRUNE/plan.json")"
mkdir -p "$(dirname "$PRUNE/$conflict_dest")"
printf '老内容\n' > "$PRUNE/$conflict_dest"

if ( cd "$PRUNE" && "$DISPATCH" --prune --apply --json > apply.json ); then
  ok "--prune --apply 退出 0"
else
  bad "--prune --apply 失败"
fi
[ ! -f "$PRUNE/dispatch/tasks/demo01-DEV-101-tracked.md" ] && ok "apply 移走已跟踪票据" || bad "已跟踪票据未移动"
[ ! -f "$PRUNE/dispatch/tasks/demo01-DEV-101-untracked.md" ] && ok "apply 移走未跟踪票据" || bad "未跟踪票据未移动"
[ -f "$PRUNE/dispatch/tasks/demo01-DEV-101-conflict.md" ] && ok "冲突时源票据保留" || bad "冲突时源票据被删除"
[ "$(cat "$PRUNE/$conflict_dest")" = "老内容" ] && ok "冲突不覆盖目标文件" || bad "冲突覆盖了目标文件"
if git -C "$PRUNE" status --porcelain | grep -q '^R  dispatch/tasks/.* -> dispatch/archive/'; then
  ok "已跟踪票据用 git mv（索引记录为 rename）"
else
  bad "已跟踪票据未使用 git mv"
fi
if ls "$PRUNE"/dispatch/archive/demo01/*/demo01-DEV-101-tracked.md >/dev/null 2>&1; then
  ok "归档路径含别名与 YYYY-MM"
else
  bad "归档路径不符合 <别名>/<YYYY-MM>/<文件名>"
fi
if python3 - "$PRUNE/apply.json" <<'PY'
import json
import sys

data = json.load(open(sys.argv[1], encoding="utf-8"))
assert data["dryRun"] is False, data
assert data["summary"]["moved"] == 2, data["summary"]
assert data["summary"]["conflicts"] == 1, data["summary"]
assert data["summary"]["errors"] == 0, data["summary"]
PY
then
  ok "apply 汇总：移动 2、冲突 1、失败 0"
else
  bad "apply 汇总不符"
fi

( cd "$PRUNE" && "$DISPATCH" --prune >/dev/null ) && ok "全部 pending/冲突时 dry-run 退出 0" || bad "剩余票据 dry-run 退出非 0"
set +e
( cd "$PRUNE" && "$DISPATCH" --prune demo01 x.md >/dev/null 2>&1 )
prune_positional=$?
( cd "$PRUNE" && "$DISPATCH" --apply >/dev/null 2>&1 )
apply_only=$?
set -e
[ "$prune_positional" = "2" ] && ok "--prune 与位置参数同用退出 2" || bad "--prune 位置参数退出码为 $prune_positional（期望 2）"
[ "$apply_only" = "2" ] && ok "--apply 不配 --prune 时退出 2" || bad "--apply 单独使用退出码为 $apply_only（期望 2）"

# 2. check 通过
( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null ) && ok "check 通过" || bad "check 未通过"

# 3. status 生成
( cd "$PROJ" && ./agent-workflow/bin/awf status >/dev/null )
assert_grep '## 当前进行中' "$PROJ/agent-workflow/tasks/status.md" "status 含当前进行中"

# 4. 进行中任务缺字段 → check 失败
cat > "$PROJ/agent-workflow/tasks/dev/current.md" <<'EOF'
# 正在开发

## [DEV-001] 缺字段

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | active |
EOF
if ( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null 2>&1 ); then
  bad "缺字段时 check 应失败"
else
  ok "缺字段时 check 失败"
fi

# 5. 补齐字段并通过
cat > "$PROJ/agent-workflow/tasks/dev/current.md" <<'EOF'
# 正在开发

## [DEV-001] 补齐字段

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | active |
| Owner | agent |

### 下一步
继续。
EOF
( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null ) && ok "补齐后 check 通过" || bad "补齐后 check 未通过"

# 6. 事实文件变更 → 入口过期 → bootstrap 修复
sed -i '' 's|^purpose:.*|purpose: 变更后的定位|' "$PROJ/agent-workflow/project.yaml" 2>/dev/null \
  || sed -i 's|^purpose:.*|purpose: 变更后的定位|' "$PROJ/agent-workflow/project.yaml"
if ( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null 2>&1 ); then
  bad "project.yaml 变更后 check 应失败"
else
  ok "project.yaml 变更后 check 失败"
fi
( cd "$PROJ" && ./agent-workflow/bin/awf bootstrap >/dev/null )
( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null ) && ok "bootstrap 后 check 通过" || bad "bootstrap 后 check 未通过"
assert_grep '变更后的定位' "$PROJ/AGENTS.md" "入口已刷新"

# 7. --force 保留事实文件与任务账本
"$KIT_DIR/bin/awf" init "$PROJ" --name "改名" --force >/dev/null
assert_grep 'purpose: 变更后的定位' "$PROJ/agent-workflow/project.yaml" "--force 保留 project.yaml"
assert_grep 'DEV-001' "$PROJ/agent-workflow/tasks/dev/current.md" "--force 保留任务块"
assert_grep '变更后的定位' "$PROJ/AGENTS.md" "--force 后入口仍同步"

# 8. 入口外内容不被覆盖
printf '\n## 团队约定\n- 保留我\n' >> "$PROJ/AGENTS.md"
( cd "$PROJ" && ./agent-workflow/bin/awf bootstrap >/dev/null )
assert_grep '保留我' "$PROJ/AGENTS.md" "区块外内容保留"
assert_grep 'awf:begin' "$PROJ/AGENTS.md" "受控区块仍存在"

# 9. 全局索引：init 自动登记，bootstrap 自愈刷新，--no-register 可跳过
assert_file "$DSH_AGENTS_HOME/projects.tsv" "projects.tsv"
assert_grep '冒烟项目' "$DSH_AGENTS_HOME/projects.tsv" "init 自动登记别名"
assert_grep '冒烟项目' "$DSH_AGENTS_HOME/AGENTS.md" "全局索引含别名"
( cd "$PROJ" && ./agent-workflow/bin/awf projects | grep -q "冒烟项目" ) && ok "projects 列出项目" || bad "projects 未列出项目"
( cd "$PROJ" && ./agent-workflow/bin/awf find 冒烟 | grep -q "$PROJ" ) && ok "find 返回路径" || bad "find 未返回路径"
( cd "$PROJ" && ./agent-workflow/bin/awf register >/dev/null )
[ "$(wc -l < "$DSH_AGENTS_HOME/projects.tsv" | tr -d ' ')" = "1" ] && ok "重复登记不产生重复行" || bad "登记出现重复行"

# bootstrap 自愈：把路径改错后刷新
sed -i '' "s|$PROJ|/wrong/path|" "$DSH_AGENTS_HOME/projects.tsv" 2>/dev/null \
  || sed -i "s|$PROJ|/wrong/path|" "$DSH_AGENTS_HOME/projects.tsv"
( cd "$PROJ" && ./agent-workflow/bin/awf bootstrap >/dev/null )
assert_grep "$PROJ" "$DSH_AGENTS_HOME/projects.tsv" "bootstrap 刷新索引路径"

# --no-register 跳过
"$KIT_DIR/bin/awf" init "$TMP/proj2" --name "不登记" --no-register >/dev/null
if grep -q "不登记" "$DSH_AGENTS_HOME/projects.tsv"; then
  bad "--no-register 仍写入索引"
else
  ok "--no-register 不写入索引"
fi

# 10. 受控区块缺 awf:end：bootstrap 必须失败且不改写文件
cp "$PROJ/AGENTS.md" "$PROJ/AGENTS.full"
grep -v 'awf:end' "$PROJ/AGENTS.full" > "$PROJ/AGENTS.md" || true
before_size="$(wc -c < "$PROJ/AGENTS.md" | tr -d ' ')"
if ( cd "$PROJ" && ./agent-workflow/bin/awf bootstrap >/dev/null 2>&1 ); then
  bad "缺少 awf:end 时 bootstrap 未失败"
else
  ok "缺少 awf:end 时 bootstrap 失败"
fi
after_size="$(wc -c < "$PROJ/AGENTS.md" | tr -d ' ')"
[ "$before_size" = "$after_size" ] && ok "bootstrap 失败时不改写文件" || bad "bootstrap 失败时仍改写了文件"
mv "$PROJ/AGENTS.full" "$PROJ/AGENTS.md"

# 11. 非法任务 ID 必须被 check 发现
cat > "$PROJ/agent-workflow/tasks/dev/current.md" <<'AWFBAD'
# 正在开发

## [DEV_001] 非法 ID

| 字段 | 内容 |
|------|------|
| 状态 | active |
| Owner | agent |

### 下一步
改成 DEV-001。
AWFBAD
if ( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null 2>&1 ); then
  bad "非法任务 ID 未被 check 发现"
else
  ok "非法任务 ID 被 check 发现"
fi
cat > "$PROJ/agent-workflow/tasks/dev/current.md" <<'AWFCLEAN'
# 正在开发

（暂无进行中任务）
AWFCLEAN

# 12. 派发器：无效目标应返回退出码 2（门失败）
set +e
"$KIT_DIR/bin/awf-dispatch" no-such-project /dev/null >/dev/null 2>&1
dispatch_code=$?
set -e
[ "$dispatch_code" = "2" ] && ok "awf-dispatch 门失败退出码为 2" || bad "awf-dispatch 退出码为 $dispatch_code（期望 2）"

printf '\n通过 %d 项，失败 %d 项\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
