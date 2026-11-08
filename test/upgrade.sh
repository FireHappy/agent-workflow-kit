#!/usr/bin/env bash
# awf upgrade 回归测试：验证「升级已有项目的工作流」是一等操作。
#
# 场景（对应 docs/upgrade.md 验收标准；DEV-205 双版本模型翻新）：
#   A. 干净升级：init 项目 → 制造存量旧项目（旧骨架版/旧模板/旧 README/旧 workflows/
#      副本/旧 bin 工具副本）→ upgrade --dry-run 只预览不改写 → upgrade 执行 → 断言
#      升级后骨架模板与 kit 一致、目标 FRAMEWORK_VERSION = kit 骨架版、project.yaml/
#      tasks/** 保留、AGENTS.md 入口按新模板重建、--slim 清理存量副本、check 通过。
#   B. 旧账本迁移兼容：归档块用旧英文表头（| Status |）→ check FAIL 且输出含
#      「| Status | → | 状态 |」修复指引；current.md 用 | Status | 时 awf status
#      仍正确读取状态列；按指引修复后 check 通过。
#   C. 自定义 check_workflow.sh：默认保留并告警，--force 才覆盖为标准入口。
#   D. 非 agent-workflow 目标拒绝；upgrade --help 可读；项目内无工具副本。
#   E. 已配置 version_file 的目标：upgrade 写 agent-workflow/FRAMEWORK_VERSION = kit
#      骨架版；项目版本锚点（agent-workflow/VERSION 与根 VERSION）不被改写（不再写锚点）。
#   F. 默认目标（未配置 version_file）：同样写 FRAMEWORK_VERSION；根 VERSION 不生成。
#   G. 目标 FRAMEWORK_VERSION == kit：dry-run 与执行均「骨架已最新」且不覆盖文件/不写锚点。
#   H. 存量目标（无 FRAMEWORK_VERSION）：迁移补写 = kit 骨架版。
#
# 隔离：DSH_AGENTS_HOME 重定向到临时目录，不触碰真实 ~/.agents，可重跑。
# 用法：bash test/upgrade.sh
set -eu

KIT="$(cd "$(dirname "$0")/.." && pwd)"
# v1.8.0（DEV-218）：技能/CLI/模板唯一源 = dsh-awf-dashboard/skills/agent-workflow-scaffold/
# 仓库形态（KIT=仓库根）走插件内嵌技能；技能形态（KIT=技能根，脚本在技能根/test/）直接用 KIT。
if [ -d "$KIT/dsh-awf-dashboard/skills/agent-workflow-scaffold" ]; then
  SKILL_ROOT="$KIT/dsh-awf-dashboard/skills/agent-workflow-scaffold"
else
  SKILL_ROOT="$KIT"
fi
AWF="$SKILL_ROOT/bin/awf"
# 派发技能源（仓库形态在插件 skills/ 下；技能形态在 ~/.dsh/skills/ 并列）
if [ -d "$KIT/dsh-awf-dashboard/skills/cross-project-dispatch" ]; then
  DISPATCH_SKILL="$KIT/dsh-awf-dashboard/skills/cross-project-dispatch"
else
  DISPATCH_SKILL="$KIT/../cross-project-dispatch"
fi
WORK="$(mktemp -d "${TMPDIR:-/tmp}/awf-upgrade.XXXXXX")"
WORK="$(cd "$WORK" && pwd)"
export DSH_AGENTS_HOME="$WORK/.agents"
trap 'rm -rf "$WORK"' EXIT
# DEV-186 工具技能化：项目内 bin/ 为空，项目内命令统一走技能路径。测试用隔离安装定位技能。
SKILL_BIN="$WORK/skills/agent-workflow-scaffold/bin/awf"
mkdir -p "$WORK/skills/agent-workflow-scaffold/bin"
cp "$AWF" "$SKILL_BIN"
chmod +x "$SKILL_BIN"
chk() { ( cd "$1" && "$SKILL_BIN" "${@:2}" ); }
# 隔离守卫（DEV-203/DEV-217）：upgrade 内部 bootstrap/check 硬编码 $HOME/.dsh/skills，不随
# DSH_AGENTS_HOME 重定向——全局技能实体必须与 checkout 一致，否则测试会静默测旧技能假绿。
# DEV-217 版本契约：实体根 VERSION/FRAMEWORK_VERSION 已退役，骨架版 = templates/FRAMEWORK_VERSION。
GLOBAL_SKILL="$HOME/.dsh/skills/agent-workflow-scaffold"
GLOBAL_AWF="$GLOBAL_SKILL/bin/awf"
if [ ! -f "$GLOBAL_AWF" ] || ! cmp -s "$GLOBAL_AWF" "$AWF"; then
  echo "FAIL  全局技能实体与 checkout 不一致（${GLOBAL_AWF}）；请先运行 ./install.sh 再跑本测试" >&2
  exit 1
fi
[ -f "$GLOBAL_SKILL/templates/AGENTS.md.tmpl" ] \
  && cmp -s "$GLOBAL_SKILL/templates/AGENTS.md.tmpl" "$SKILL_ROOT/templates/AGENTS.md.tmpl" \
  || { echo "FAIL  全局技能模板与 checkout 不一致；请先运行 ./install.sh" >&2; exit 1; }
[ -f "$GLOBAL_SKILL/templates/FRAMEWORK_VERSION" ] \
  && cmp -s "$GLOBAL_SKILL/templates/FRAMEWORK_VERSION" "$SKILL_ROOT/templates/FRAMEWORK_VERSION" \
  || { echo "FAIL  全局技能骨架版本与 checkout 不一致（templates/FRAMEWORK_VERSION）；请先运行 ./install.sh" >&2; exit 1; }

fail() { echo "FAIL  $*" >&2; exit 1; }
ok()   { echo "ok    $*"; }

# kit 骨架版（upgrade 判定与断言期望的源）：v1.8.0 契约 = templates/FRAMEWORK_VERSION
KIT_KFF="$(cat "$SKILL_ROOT/templates/FRAMEWORK_VERSION")"
[ -n "$KIT_KFF" ] || fail "kit templates/FRAMEWORK_VERSION 缺失或为空"

echo "# awf upgrade 回归测试"

# ---------- A. 干净升级：init → 制造旧版框架 → upgrade → 断言与 kit 一致 ----------
PA="$WORK/projA"
"$AWF" init "$PA" --name "升级测试" --purpose "验证 upgrade" --no-register >/dev/null \
  || fail "init projA 失败"

# 保留清单打标记：project.yaml 追加注释、tasks/dev/current.md 追加注释行
printf '\n# upgrade-marker-keep-project-yaml\n' >> "$PA/agent-workflow/project.yaml"
printf '\n<!-- upgrade-marker-keep-ledger-marker -->\n' >> "$PA/agent-workflow/tasks/dev/current.md"

# 制造存量旧项目：旧骨架版 / 旧模板 / 旧 README / 旧 workflows/ 副本 / 旧 bin 工具副本 / 旧 check_workflow.sh 桩
printf '0.9.0\n' > "$PA/agent-workflow/FRAMEWORK_VERSION"   # 旧骨架版：触发 upgrade 复制路径
printf '# 旧模板 v0.3（无任务路由）\n## 铁律\n- 旧\n' > "$PA/agent-workflow/templates/AGENTS.md.tmpl"
printf '# OLD-README\n' > "$PA/agent-workflow/README.md"
mkdir -p "$PA/agent-workflow/workflows"
printf '# OLD-CROSS-PROJECT\n' > "$PA/agent-workflow/workflows/cross-project.md"
printf '#!/bin/sh\necho OLD-GATE\nexit 0\n' > "$PA/agent-workflow/check_workflow.sh"
chmod +x "$PA/agent-workflow/check_workflow.sh"
# 旧 bin 工具副本（存量项目在工具技能化前的形态）：plain upgrade 保留，--slim 删除
mkdir -p "$PA/agent-workflow/bin"
printf '#!/bin/sh\necho OLD-TOOL\nexit 1\n' > "$PA/agent-workflow/bin/awf"
printf '#!/usr/bin/env python3\nprint("OLD-DISPATCH")\n' > "$PA/agent-workflow/bin/awf-dispatch"
chmod +x "$PA/agent-workflow/bin/awf" "$PA/agent-workflow/bin/awf-dispatch"

# 制造旧版后 check 应失败（旧模板/旧 README 与 digest 不一致 → 入口过期）
if chk "$PA" check >/dev/null 2>&1; then
  fail "A 制造旧版后 check 不应通过"
fi
ok "A 制造旧版框架后 check 失败（旧模板触发入口过期）"

# --dry-run：只打印，不覆盖
dry="$("$AWF" upgrade "$PA" --dry-run)"
grep -q '将覆盖' <<<"$dry" || fail "A dry-run 未打印变更清单：$dry"
grep -q '将保留' <<<"$dry" || fail "A dry-run 未打印保留清单：$dry"
grep -q '将写骨架版 agent-workflow/FRAMEWORK_VERSION' <<<"$dry" || fail "A dry-run 未打印骨架版登记：$dry"
grep -q 'OLD-GATE' "$PA/agent-workflow/check_workflow.sh" || fail "A dry-run 竟覆盖了 check_workflow.sh"
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

# 断言：骨架模板与 kit 一致（派发工具在技能，不复制到项目；存量副本由 --slim 清理）
[ -f "$DISPATCH_SKILL/scripts/awf-dispatch" ] || fail "A 派发技能缺少自带脚本（${DISPATCH_SKILL}"
cmp -s "$PA/agent-workflow/templates/AGENTS.md.tmpl" "$SKILL_ROOT/templates/AGENTS.md.tmpl" \
  || fail "A templates/AGENTS.md.tmpl 与 kit 不一致"
cmp -s "$PA/agent-workflow/templates/pre-commit" "$SKILL_ROOT/templates/pre-commit" \
  || fail "A templates/pre-commit 与 kit 不一致"
cmp -s "$PA/agent-workflow/README.md" "$SKILL_ROOT/templates/README.md" || fail "A README 与 kit 不一致"
grep -q 'OLD-GATE' "$PA/agent-workflow/check_workflow.sh" || fail "A 自定义门禁被静默覆盖"
ok "A 升级后骨架模板与 kit 一致，自定义门禁保留"

# DEV-205：升级登记目标骨架版 = kit 骨架版（落后 0.9.0 → 1.0.0）
[ "$(cat "$PA/agent-workflow/FRAMEWORK_VERSION")" = "$KIT_KFF" ] \
  || fail "A 目标 FRAMEWORK_VERSION 未升级到 kit 骨架版：$(cat "$PA/agent-workflow/FRAMEWORK_VERSION")"
ok "A 目标 FRAMEWORK_VERSION = kit 骨架版（${KIT_KFF}"

# 断言：保留清单逐字节不动
grep -q 'upgrade-marker-keep-project-yaml' "$PA/agent-workflow/project.yaml" || fail "A project.yaml 未保留"
grep -q 'upgrade-marker-keep-ledger-marker' "$PA/agent-workflow/tasks/dev/current.md" || fail "A tasks 账本未保留"
ok "A project.yaml / tasks/** 保留"

# 断言：AGENTS.md 按新模板重建（含技能指针式路由）
grep -q '## 任务路由' "$PA/AGENTS.md" || fail "A AGENTS.md 未按新模板重建"
grep -q 'cross-project-dispatch/SKILL.md' "$PA/AGENTS.md" || fail "A AGENTS.md 缺派发技能路由指针"
grep -q '本入口不重复' "$PA/AGENTS.md" || fail "A AGENTS.md 未按技能库指针形态收敛"
chk "$PA" check >/dev/null || fail "A 升级后 check 未通过"
ok "A AGENTS.md 重建含技能路由指针，check 通过"

# --slim 清理存量 workflows/ + bin 工具副本（技能化后不再需要）
# 前置自保护：plain upgrade 不清理（--slim 才有判别力）
[ -d "$PA/agent-workflow/workflows" ] || fail "A plain upgrade 不应已清理 workflows/"
[ -f "$PA/agent-workflow/bin/awf" ] || fail "A plain upgrade 不应已清理 bin/awf 副本"
[ -f "$PA/agent-workflow/bin/awf-dispatch" ] || fail "A plain upgrade 不应已清理 bin/awf-dispatch 副本"
# DEV-205：升级后骨架已最新，--slim 属维护动作，需 --force（强刷）才执行清理
"$AWF" upgrade "$PA" --slim --force >/dev/null 2>&1 || fail "A --slim --force 升级失败"
[ ! -d "$PA/agent-workflow/workflows" ] || fail "A --slim 未清理存量 workflows/"
[ ! -f "$PA/agent-workflow/bin/awf" ] || fail "A --slim 未清理存量 bin/awf"
[ ! -f "$PA/agent-workflow/bin/awf-dispatch" ] || fail "A --slim 未清理存量 bin/awf-dispatch"
chk "$PA" check >/dev/null || fail "A --slim 后 check 未通过"
ok "A --slim 清理存量 workflows/ + bin 工具副本，项目健康"

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

chk "$PB" status >/dev/null || fail "B awf status 失败"
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
chk "$PB" status >/dev/null
grep -q '| dev | DEV-103 | P1 | active | t3 | 正文含迁移字样 |' "$PB/agent-workflow/tasks/status.md" \
  || fail "B 正文引用迁移字样的块状态列被污染：$(grep 'DEV-103' "$PB/agent-workflow/tasks/status.md")"
ok "B 正文引用 | Status | / | 状态 | 字样不污染状态列"

# 按指引修复（只改表头，保留归档原值），check 恢复 0
cat > "$PB/agent-workflow/tasks/dev/current.md" <<'EOF'
# 正在开发

（暂无进行中任务）
EOF
# 按指引修复（只改表头，保留归档原值），check 恢复 0；兼容旧大文件与目录式 current/、done/ 单文件
for _fix in "$PB/agent-workflow/tasks/dev/current.md" "$PB/agent-workflow/tasks/dev/done.md" \
            "$PB/agent-workflow/tasks/dev/current/"*.md "$PB/agent-workflow/tasks/dev/done/"*.md; do
  [ -f "$_fix" ] || continue
  sed -i '' 's/| Status |/| 状态 |/' "$_fix" 2>/dev/null \
    || sed -i 's/| Status |/| 状态 |/' "$_fix"
done
chk "$PB" status >/dev/null
if chk "$PB" check >/dev/null 2>&1; then
  :
else
  echo "--- B 修复后 check 输出（调试） ---"
  chk "$PB" check 2>&1 | head -25
  fail "B 按指引修复后 check 未通过"
fi
ok "B 按指引修复（| Status | → | 状态 |）后 check 通过"

# ---------- C. 自定义 check_workflow.sh：默认保留并告警，--force 才覆盖 ----------
printf '0.9.0\n' > "$PA/agent-workflow/FRAMEWORK_VERSION"   # 旧骨架版：让 shim 分支走到（骨架相同会提前跳过）
printf '#!/bin/sh\necho custom-gate\nexit 0\n' > "$PA/agent-workflow/check_workflow.sh"
chmod +x "$PA/agent-workflow/check_workflow.sh"
c_out="$(cd "$WORK" && "$AWF" upgrade "$PA" 2>&1 || true)"
grep -q 'custom-gate' "$PA/agent-workflow/check_workflow.sh" || fail "C 自定义门禁被静默覆盖"
grep -q '自定义门禁' <<<"$c_out" || fail "C 未告警自定义门禁：$c_out"
ok "C 自定义 check_workflow.sh 默认保留并告警"
( cd "$WORK" && "$AWF" upgrade "$PA" --force >/dev/null 2>&1 ) || fail "C --force 升级失败"
grep -q 'agent-workflow-scaffold/bin/awf' "$PA/agent-workflow/check_workflow.sh" \
  || fail "C --force 后 check_workflow.sh 非标准入口"
ok "C --force 覆盖为标准兼容入口"

# ---------- E. 已配置 version_file 的目标（DEV-145/DEV-205）：upgrade 写骨架版、不再写版本锚点 ----------
PE="$WORK/projE"
"$AWF" init "$PE" --name "锚点定向" --no-register >/dev/null || fail "E init projE 失败"
sed -i '' 's|^version_file: VERSION$|version_file: agent-workflow/VERSION|' "$PE/agent-workflow/project.yaml" \
  || sed -i 's|^version_file: VERSION$|version_file: agent-workflow/VERSION|' "$PE/agent-workflow/project.yaml"
grep -q '^version_file: agent-workflow/VERSION$' "$PE/agent-workflow/project.yaml" \
  || fail "E project.yaml 未写入 version_file 定向"
printf '0.9.0\n' > "$PE/agent-workflow/FRAMEWORK_VERSION"   # 旧骨架版：触发升级复制路径
printf '9.9.9\n' > "$PE/VERSION"                            # 根 VERSION 旧值：不应被 upgrade 改写
printf '2.0.0\n' > "$PE/agent-workflow/VERSION"             # 项目自身技能版锚点：不应被 upgrade 改写
dry_e="$("$AWF" upgrade "$PE" --dry-run)"
grep -q '将写骨架版 agent-workflow/FRAMEWORK_VERSION' <<<"$dry_e" || fail "E dry-run 未打印骨架版登记：$dry_e"
grep -q '版本锚点' <<<"$dry_e" && fail "E dry-run 仍打印版本锚点文案（DEV-205 应删除）：$dry_e"
"$AWF" upgrade "$PE" >/dev/null 2>&1 || fail "E upgrade 失败"
[ "$(cat "$PE/agent-workflow/FRAMEWORK_VERSION")" = "$KIT_KFF" ] \
  || fail "E 骨架版未写到 agent-workflow/FRAMEWORK_VERSION：$(cat "$PE/agent-workflow/FRAMEWORK_VERSION")"
[ "$(cat "$PE/agent-workflow/VERSION")" = "2.0.0" ] || fail "E 技能版锚点（agent-workflow/VERSION）被 upgrade 改写：$(cat "$PE/agent-workflow/VERSION")"
[ "$(cat "$PE/VERSION")" = "9.9.9" ] || fail "E 根 VERSION 被 upgrade 误改写：$(cat "$PE/VERSION")"
ok "E upgrade 写目标骨架版 = kit 骨架版，版本锚点（version_file 指向与根 VERSION）不被改写"

# ---------- F. 默认目标（未配置 version_file）：upgrade 同样写 FRAMEWORK_VERSION，不生成根 VERSION ----------
PF="$WORK/projF"
"$AWF" init "$PF" --name "默认锚点" --no-register >/dev/null || fail "F init projF 失败"
grep -q '^version_file: VERSION$' "$PF/agent-workflow/project.yaml" \
  || fail "F 默认 project.yaml 应 version_file: VERSION"
printf '0.9.0\n' > "$PF/agent-workflow/FRAMEWORK_VERSION"   # 旧骨架版：触发升级复制路径
rm -f "$PF/VERSION"   # 无根 VERSION：upgrade 不应再生成（不再写项目版本锚点）
"$AWF" upgrade "$PF" >/dev/null 2>&1 || fail "F upgrade 失败"
[ "$(cat "$PF/agent-workflow/FRAMEWORK_VERSION")" = "$KIT_KFF" ] \
  || fail "F 默认目标 FRAMEWORK_VERSION 未写 kit 骨架版（=[$(cat "$PF/agent-workflow/FRAMEWORK_VERSION" 2>/dev/null)]，kit=[$KIT_KFF]）"
[ ! -f "$PF/VERSION" ] || fail "F upgrade 生成了根 VERSION（DEV-205 不再写项目版本锚点）：$(cat "$PF/VERSION")"
ok "F 默认目标 upgrade 写 FRAMEWORK_VERSION，根 VERSION 不生成（不再写锚点）"

# ---------- G. 目标 FRAMEWORK_VERSION == kit：dry-run 与执行均「骨架已最新」且不覆盖/不写锚点 ----------
PG="$WORK/projG"
"$AWF" init "$PG" --name "已最新" --no-register >/dev/null || fail "G init projG 失败"
# init 已写 FRAMEWORK_VERSION = kit 当前骨架版（== KIT_KFF）；打旧模板标记验证「不覆盖」
printf '# OLD-TEMPLATE-G\n' > "$PG/agent-workflow/templates/AGENTS.md.tmpl"
g_dry="$("$AWF" upgrade "$PG" --dry-run)"
grep -q '骨架已最新 v' <<<"$g_dry" || fail "G dry-run 未打印骨架已最新：$g_dry"
grep -q '将覆盖' <<<"$g_dry" && fail "G dry-run 骨架已最新仍列变更：$g_dry"
grep -q 'OLD-TEMPLATE-G' "$PG/agent-workflow/templates/AGENTS.md.tmpl" \
  || fail "G dry-run 竟覆盖了模板"
g_out="$("$AWF" upgrade "$PG" 2>&1)" || fail "G upgrade 执行失败：$g_out"
grep -q '骨架已最新 v' <<<"$g_out" || fail "G 执行未打印骨架已最新：$g_out"
grep -q 'OLD-TEMPLATE-G' "$PG/agent-workflow/templates/AGENTS.md.tmpl" \
  || fail "G 执行竟覆盖了模板（骨架相同应跳过复制）"
[ "$(cat "$PG/agent-workflow/FRAMEWORK_VERSION")" = "$KIT_KFF" ] \
  || fail "G FRAMEWORK_VERSION 被改写：$(cat "$PG/agent-workflow/FRAMEWORK_VERSION")"
[ ! -f "$PG/VERSION" ] || fail "G 执行生成了根 VERSION（不再写锚点）"
ok "G 骨架相同：dry-run 与执行均「骨架已最新」，不覆盖文件、不写锚点"

# ---------- H. 存量目标（无 FRAMEWORK_VERSION）：迁移补写 = kit 骨架版 ----------
PH="$WORK/projH"
"$AWF" init "$PH" --name "存量迁移" --no-register >/dev/null || fail "H init projH 失败"
rm -f "$PH/agent-workflow/FRAMEWORK_VERSION"   # 存量项目未登记骨架版本
dry_h="$("$AWF" upgrade "$PH" --dry-run)"
grep -q '迁移补写' <<<"$dry_h" || fail "H dry-run 未提示迁移补写：$dry_h"
"$AWF" upgrade "$PH" >/dev/null 2>&1 || fail "H upgrade 失败"
[ "$(cat "$PH/agent-workflow/FRAMEWORK_VERSION")" = "$KIT_KFF" ] \
  || fail "H 迁移补写未写 kit 骨架版（=[$(cat "$PH/agent-workflow/FRAMEWORK_VERSION" 2>/dev/null)]，kit=[$KIT_KFF]）"
[ ! -f "$PH/VERSION" ] || fail "H 迁移补写生成了根 VERSION（不再写锚点）"
ok "H 存量目标（无 FRAMEWORK_VERSION）迁移补写 = kit 骨架版"

# 边界：非项目目标拒绝 / 项目内副本拒绝 / help 可读
mkdir -p "$WORK/notproj"
if ( cd "$WORK" && "$AWF" upgrade "$WORK/notproj" >/dev/null 2>&1 ); then
  fail "D 非 agent-workflow 目标应被拒绝"
fi
ok "D 非 agent-workflow 目标被拒绝"

"$AWF" upgrade --help 2>&1 | grep -q '用法：awf upgrade' || fail "D upgrade --help 不可读"
ok "D upgrade --help 输出用法"

# 项目内 bin/ 为空（工具技能化：不再向项目复制 awf 副本）
if [ -e "$PB/agent-workflow/bin/awf" ]; then
  fail "D 项目内不应存在 awf 工具副本（工具在技能，项目内 bin/ 为空）"
fi
ok "D 项目内 bin/ 无工具副本（工具技能化形态）"

echo ""
echo "全部通过：awf upgrade 干净升级 / 旧账本迁移指引 / 自定义门禁保留 / 骨架版差量判定（E/F/G/H）/ 边界拒绝"
