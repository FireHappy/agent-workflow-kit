#!/usr/bin/env bash
# awf upgrade 回归测试：验证「升级已有项目的工作流」是一等操作。
#
# 场景（对应 docs/upgrade.md 验收标准）：
#   A. 干净升级：init 项目 → 制造旧版框架（旧模板/旧 README/旧工作流/旧 bin/awf
#      桩）→ upgrade --dry-run 只预览不改写 → upgrade 执行 → 断言升级后框架文件
#      与 kit 一致、project.yaml/tasks/** 保留、AGENTS.md 入口按新模板重建、
#      check 通过。
#   B. 旧账本迁移兼容：归档块用旧英文表头（| Status |）→ check FAIL 且输出含
#      「| Status | → | 状态 |」修复指引；current.md 用 | Status | 时 awf status
#      仍正确读取状态列；按指引修复后 check 通过。
#   C. 自定义 check_workflow.sh：默认保留并告警，--force 才覆盖为标准入口。
#   D. 非 agent-workflow 目标拒绝；upgrade --help 可读；项目内副本拒绝执行。
#
# 隔离：DSH_AGENTS_HOME 重定向到临时目录，不触碰真实 ~/.agents，可重跑。
# 用法：bash test/upgrade.sh
set -eu

KIT="$(cd "$(dirname "$0")/.." && pwd)"
AWF="$KIT/bin/awf"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/awf-upgrade.XXXXXX")"
WORK="$(cd "$WORK" && pwd)"
export DSH_AGENTS_HOME="$WORK/.agents"
trap 'rm -rf "$WORK"' EXIT

fail() { echo "FAIL  $*" >&2; exit 1; }
ok()   { echo "ok    $*"; }

echo "# awf upgrade 回归测试"

# ---------- A. 干净升级：init → 制造旧版框架 → upgrade → 断言与 kit 一致 ----------
PA="$WORK/projA"
"$AWF" init "$PA" --name "升级测试" --purpose "验证 upgrade" --no-register >/dev/null \
  || fail "init projA 失败"

# 保留清单打标记：project.yaml 追加注释、tasks/dev/current.md 追加注释行
printf '\n# upgrade-marker-keep-project-yaml\n' >> "$PA/agent-workflow/project.yaml"
printf '\n<!-- upgrade-marker-keep-ledger-marker -->\n' >> "$PA/agent-workflow/tasks/dev/current.md"

# 制造旧版框架：旧模板 / 旧 README / 旧 cross-project / 旧 bin/awf 桩 / 旧外层模板副本
printf '# 旧模板 v0.3（无任务路由）\n## 铁律\n- 旧\n' > "$PA/agent-workflow/templates/AGENTS.md.tmpl"
printf '# OLD-README\n' > "$PA/agent-workflow/README.md"
printf '# OLD-CROSS-PROJECT\n' > "$PA/agent-workflow/workflows/cross-project.md"
cat > "$PA/agent-workflow/bin/awf" <<'EOF'
#!/usr/bin/env bash
# 旧版 awf 桩：无 upgrade / 无迁移指引，check 必失败
printf 'OLD-AWF\n' >&2
exit 1
EOF
chmod +x "$PA/agent-workflow/bin/awf"

# 旧模板入口 → AGENTS.md 已过期（digest 不变但模板内容旧），升级后应重建
if ( cd "$PA" && ./agent-workflow/bin/awf check >/dev/null 2>&1 ); then
  fail "A 制造旧版后 check 不应通过"
fi
ok "A 制造旧版框架后 check 失败（旧 awf 桩验证）"

# --dry-run：只打印，不覆盖
dry="$("$AWF" upgrade "$PA" --dry-run)"
grep -q '将覆盖' <<<"$dry" || fail "A dry-run 未打印变更清单：$dry"
grep -q '将保留' <<<"$dry" || fail "A dry-run 未打印保留清单：$dry"
grep -q 'OLD-AWF' "$PA/agent-workflow/bin/awf" || fail "A dry-run 竟覆盖了 bin/awf"
grep -q 'upgrade-marker-keep-project-yaml' "$PA/agent-workflow/project.yaml" \
  || fail "A dry-run 竟改写了 project.yaml"
ok "A --dry-run 只预览不改写"

# 执行 upgrade（rc = check 失败项数量，干净账本应为 0）
if ! out="$(cd "$WORK" && "$AWF" upgrade "$PA" 2>&1)"; then
  echo "--- upgrade 输出 ---"
  printf '%s\n' "$out"
  fail "A upgrade 退出码非 0"
fi
ok "A upgrade 执行成功且 check 通过"

# 断言：框架文件与 kit 一致
cmp -s "$PA/agent-workflow/bin/awf" "$KIT/bin/awf" || fail "A bin/awf 与 kit 不一致"
cmp -s "$PA/agent-workflow/bin/awf-dispatch" "$KIT/bin/awf-dispatch" || fail "A bin/awf-dispatch 与 kit 不一致"
cmp -s "$PA/agent-workflow/templates/AGENTS.md.tmpl" "$KIT/templates/AGENTS.md.tmpl" \
  || fail "A templates/AGENTS.md.tmpl 与 kit 不一致"
cmp -s "$PA/agent-workflow/README.md" "$KIT/templates/README.md" || fail "A README 与 kit 不一致"
for wf in "$KIT"/templates/workflows/*.md; do
  b="$(basename "$wf")"
  cmp -s "$PA/agent-workflow/workflows/$b" "$wf" || fail "A workflows/$b 与 kit 不一致"
done
cmp -s "$PA/agent-workflow/check_workflow.sh" "$KIT/templates/../agent-workflow/check_workflow.sh" 2>/dev/null \
  || cmp -s "$PA/agent-workflow/check_workflow.sh" <(printf '%s\n' '#!/bin/sh' '# 兼容入口：等价于 agent-workflow/bin/awf check' 'exec "$(dirname "$0")/bin/awf" check "$@"') \
  || fail "A check_workflow.sh 非标准兼容入口"
ok "A 升级后框架文件与 kit 一致"

# 断言：保留清单逐字节不动
grep -q 'upgrade-marker-keep-project-yaml' "$PA/agent-workflow/project.yaml" || fail "A project.yaml 未保留"
grep -q 'upgrade-marker-keep-ledger-marker' "$PA/agent-workflow/tasks/dev/current.md" || fail "A tasks 账本未保留"
grep -q 'OLD-AWF' "$PA/agent-workflow/bin/awf" && fail "A 旧 bin/awf 桩未被覆盖"
ok "A project.yaml / tasks/** 保留、旧框架文件被覆盖"

# 断言：AGENTS.md 按新模板重建（含新的逐条路由）
grep -q '任务路由（逐条决策）' "$PA/AGENTS.md" || fail "A AGENTS.md 未按新模板重建"
grep -q '团队不承载跨仓库任务' "$PA/AGENTS.md" || fail "A AGENTS.md 缺团队边界规则"
( cd "$PA" && ./agent-workflow/bin/awf check >/dev/null ) || fail "A 升级后 check 未通过"
ok "A AGENTS.md 重建含新路由规则，check 通过"

# ---------- B. 旧账本迁移兼容：| Status | 表头 → check 给修复指引 ----------
PB="$WORK/projB"
"$AWF" init "$PB" --name "旧账本" --no-register >/dev/null || fail "init projB 失败"

cat >> "$PB/agent-workflow/tasks/dev/done.md" <<'EOF'

## [DEV-101] 旧英文表头归档

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| Status | 完成 |
| Owner | t3 |
EOF

cat >> "$PB/agent-workflow/tasks/dev/current.md" <<'EOF'

## [DEV-102] 状态预览

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| Status | active |
| Owner | t3 |

### 下一步
x
EOF

( cd "$PB" && ./agent-workflow/bin/awf status >/dev/null ) || fail "B awf status 失败"
b_out="$(cd "$PB" && ./agent-workflow/check_workflow.sh 2>&1)" && fail "B 旧英文表头 check 应失败"
printf '%s\n' "$b_out" | grep -q 'DEV-101' || fail "B 未点名旧归档块：$b_out"
printf '%s\n' "$b_out" | grep -q 'Status' || fail "B 未指明旧表头 Status：$b_out"
printf '%s\n' "$b_out" | grep -q '| 状态 |' || fail "B 未给出 | Status | → | 状态 | 指引：$b_out"
ok "B 归档块旧英文表头 → check FAIL 且输出含修复指引"

grep -q 'DEV-102' "$PB/agent-workflow/tasks/status.md" || fail "B status 未列出 Status 表头任务"
grep -q '| active |' "$PB/agent-workflow/tasks/status.md" || fail "B status 未读取出 Status 状态列"
ok "B awf status 兼容读取 | Status | 表头"

# 正文引用迁移字样（`| Status |` / `| 状态 |`）不污染状态列（回归：字段检测必须锚定表格行）
cat >> "$PB/agent-workflow/tasks/dev/current.md" <<'EOF'

## [DEV-103] 正文含迁移字样

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | active |
| Owner | t3 |

### 目标
迁移指引正文：把 `| Status |` 改为 `| 状态 |`；归档块缺「状态」字段时补一行 `| 状态 | 完成 |`。

### 下一步
x
EOF
( cd "$PB" && ./agent-workflow/bin/awf status >/dev/null )
grep -q '| dev | DEV-103 | P1 | active | t3 | 正文含迁移字样 |' "$PB/agent-workflow/tasks/status.md" \
  || fail "B 正文引用迁移字样的块状态列被污染：$(grep 'DEV-103' "$PB/agent-workflow/tasks/status.md")"
ok "B 正文引用 | Status | / | 状态 | 字样不污染状态列"

# 按指引修复（只改表头，保留归档原值），check 恢复 0
cat > "$PB/agent-workflow/tasks/dev/current.md" <<'EOF'
# 正在开发

（暂无进行中任务）
EOF
sed -i '' 's/| Status |/| 状态 |/' "$PB/agent-workflow/tasks/dev/done.md" 2>/dev/null \
  || sed -i 's/| Status |/| 状态 |/' "$PB/agent-workflow/tasks/dev/done.md"
( cd "$PB" && ./agent-workflow/bin/awf status >/dev/null ) || fail "B 修复后 status 失败"
( cd "$PB" && ./agent-workflow/bin/awf check >/dev/null ) || fail "B 按指引修复后 check 未通过"
ok "B 按指引修复（| Status | → | 状态 |）后 check 通过"

# ---------- C. 自定义 check_workflow.sh：默认保留，--force 才覆盖 ----------
printf '#!/bin/sh\necho custom-gate\nexit 0\n' > "$PA/agent-workflow/check_workflow.sh"
chmod +x "$PA/agent-workflow/check_workflow.sh"
c_out="$(cd "$WORK" && "$AWF" upgrade "$PA" 2>&1 || true)"
grep -q 'custom-gate' "$PA/agent-workflow/check_workflow.sh" || fail "C 自定义门禁被静默覆盖"
grep -q '自定义门禁' <<<"$c_out" || fail "C 未告警自定义门禁：$c_out"
ok "C 自定义 check_workflow.sh 默认保留并告警"
( cd "$WORK" && "$AWF" upgrade "$PA" --force >/dev/null 2>&1 ) || fail "C --force 升级失败"
cmp -s "$PA/agent-workflow/check_workflow.sh" \
  <(printf '%s\n' '#!/bin/sh' '# 兼容入口：等价于 agent-workflow/bin/awf check' 'exec "$(dirname "$0")/bin/awf" check "$@"') \
  || fail "C --force 后 check_workflow.sh 非标准入口"
ok "C --force 覆盖为标准兼容入口"

# ---------- D. 边界：非项目目标拒绝 / 项目内副本拒绝 / help 可读 ----------
mkdir -p "$WORK/notproj"
if ( cd "$WORK" && "$AWF" upgrade "$WORK/notproj" >/dev/null 2>&1 ); then
  fail "D 非 agent-workflow 目标应被拒绝"
fi
ok "D 非 agent-workflow 目标被拒绝"

"$AWF" upgrade --help 2>&1 | grep -q '用法：awf upgrade' || fail "D upgrade --help 不可读"
ok "D upgrade --help 输出用法"

# 项目内副本（模板目录不完整）应拒绝：借用 projB 的 bin/awf 无 templates 源
if ( cd "$PB" && ./agent-workflow/bin/awf upgrade /tmp >/dev/null 2>&1 ); then
  fail "D 项目内副本执行 upgrade 应被拒绝"
fi
ok "D 项目内副本（无模板源）拒绝执行 upgrade"

echo ""
echo "全部通过：awf upgrade 干净升级 / 旧账本迁移指引 / 自定义门禁保留 / 边界拒绝"