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

# 直接用 importlib 加载源脚本，断言 build_prompt 的 --team 注入与缺省行为
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
PY
then
  ok "build_prompt --team 注入且缺省不变"
else
  bad "build_prompt --team 断言失败"
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
