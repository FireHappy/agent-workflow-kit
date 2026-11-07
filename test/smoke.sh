#!/usr/bin/env bash
# awf-kit 冒烟测试：在临时目录验证 init / check / status / bootstrap / --force
# 两种形态共用一套测试：
#   - 仓库形态（KIT_DIR=仓库根）：有 AGENTS.md/README.md，全量断言
#   - 技能形态（KIT_DIR=skill/ 或 ~/.dsh/skills/agent-workflow-scaffold/）：无项目入口文件，
#     仓库级文档断言跳过（SKILL_ONLY=1 标记）
set -eu

KIT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DISPATCH_IMPL="$KIT_DIR/skills/cross-project-dispatch/scripts/awf-dispatch"
DISPATCH_CLI="$DISPATCH_IMPL"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export DSH_AGENTS_HOME="$TMP/agents"

# DEV-186 形态检测：技能形态 = 无根 AGENTS.md / README.md（项目入口文件不进技能）
if [ ! -f "$KIT_DIR/AGENTS.md" ] || [ ! -f "$KIT_DIR/README.md" ]; then
  SKILL_ONLY=1
else
  SKILL_ONLY=0
fi

PROJ="$TMP/proj"
mkdir -p "$PROJ"

pass=0
fail=0

ok() { pass=$((pass + 1)); printf 'ok    %s\n' "$*"; }
bad() {
  # DEV-186 技能形态：仓库级断言（$KIT_DIR/docs/AGENTS.md/README.md 不在技能里）失败 = 不适用，
  # 不计数；功能断言（bin/templates/skills 均在）仍正常判失败。
  if [ "${SKILL_ONLY:-0}" = "1" ] && { [ ! -f "$KIT_DIR/skills/cross-project-dispatch/SKILL.md" ] || [ ! -f "$KIT_DIR/AGENTS.md" ]; }; then
    printf 'skip  %s（技能形态不适用）\n' "$*"
    return 0
  fi
  fail=$((fail + 1)); printf 'FAIL  %s\n' "$*"
}

assert_file() { [ -f "$1" ] && ok "存在 $2" || bad "缺少 $2"; }
assert_grep() { grep -q "$1" "$2" && ok "$3" || bad "$3"; }

# 1. init
"$KIT_DIR/bin/awf" init "$PROJ" --name "冒烟项目" --purpose "验证脚手架" >/dev/null
assert_file "$PROJ/AGENTS.md" "AGENTS.md"
assert_file "$PROJ/agent-workflow/project.yaml" "project.yaml"
assert_file "$KIT_DIR/bin/awf" "bin/awf"
assert_file "$PROJ/agent-workflow/tasks/status.md" "status.md"
assert_grep 'awf:begin v1 digest:' "$PROJ/AGENTS.md" "入口含 digest"
assert_grep '（未配置' "$PROJ/AGENTS.md" "空校验命令有回退提示"
assert_grep '技能库' "$PROJ/AGENTS.md" "入口含技能库表述（技能化形态）"
[ ! -d "$PROJ/agent-workflow/workflows" ] && ok "init 不生成 workflows/ 目录（技能化：细节在技能）" || bad "init 不应生成 workflows/ 目录"
assert_file "$PROJ/agent-workflow/FRAMEWORK_VERSION" "agent-workflow/FRAMEWORK_VERSION（init 登记骨架版）"
assert_file "$DISPATCH_CLI" "awf-dispatch"
assert_grep '跨项目' "$PROJ/AGENTS.md" "入口含跨项目路由"

# 1.4 gitignore：init --gitignore 写 .gitignore（根锚定+幂等）；awf gitignore 为存量项目补写
GI_PROJ="$TMP/gi-proj"
"$KIT_DIR/bin/awf" init "$GI_PROJ" --name "忽略项目" --no-register --gitignore >/dev/null
assert_grep '^/agent-workflow/$' "$GI_PROJ/.gitignore" "init --gitignore 忽略 agent-workflow/（根锚定）"
assert_grep '^/AGENTS.md$' "$GI_PROJ/.gitignore" "init --gitignore 忽略 AGENTS.md"
assert_grep '^/CLAUDE.md$' "$GI_PROJ/.gitignore" "init --gitignore 忽略 CLAUDE.md"
GI_MARK="# agent-workflow（本机私有工作流，不入库）"
[ "$(grep -cF "$GI_MARK" "$GI_PROJ/.gitignore")" = "1" ] && ok "gitignore 块含唯一标记行" || bad "gitignore 块标记行数量异常"
( cd "$GI_PROJ" && "$KIT_DIR/bin/awf" gitignore ) >/dev/null
[ "$(grep -cF "$GI_MARK" "$GI_PROJ/.gitignore")" = "1" ] && ok "awf gitignore 幂等（不重复追加）" || bad "awf gitignore 重复追加"

NOGI_PROJ="$TMP/nogi-proj"
"$KIT_DIR/bin/awf" init "$NOGI_PROJ" --name "补写项目" --no-register >/dev/null
# DEV-183：init 缺省写「本机派发产物」忽略段（dispatch 流水/回执/运行时状态，任何项目都不入库）；
# 但缺省不写「工作流私有」段（--gitignore 才写 agent-workflow/ 整体）。
assert_grep '^/dispatch/log.md$' "$NOGI_PROJ/.gitignore" "init 缺省写派发流水忽略"
DISP_MARK="# agent-workflow（本机派发产物，不入库）"
[ "$(grep -cF "$DISP_MARK" "$NOGI_PROJ/.gitignore")" = "1" ] && ok "init 缺省写派发产物标记（唯一）" || bad "init 缺省派发产物标记异常"
[ "$(grep -cF "$GI_MARK" "$NOGI_PROJ/.gitignore")" = "0" ] && ok "init 缺省不写工作流私有段（--gitignore 专属）" || bad "init 缺省不应写工作流私有段"
printf '/node_modules/' > "$NOGI_PROJ/.gitignore"
( cd "$NOGI_PROJ" && "$KIT_DIR/bin/awf" gitignore ) >/dev/null
assert_grep '^/node_modules/$' "$NOGI_PROJ/.gitignore" "既有内容不被粘连（无换行先补行）"
assert_grep '^/agent-workflow/$' "$NOGI_PROJ/.gitignore" "awf gitignore 为存量项目补写忽略"
assert_grep '^/CLAUDE.md$' "$NOGI_PROJ/.gitignore" "无换行 .gitignore 追加块完整落行"

# 1.1 派发器：help / --team 任务包注入 / handoff / 无工作流前置检查
"$DISPATCH_CLI" --help >/dev/null && ok "awf-dispatch --help" || bad "awf-dispatch --help 失败"
if "$DISPATCH_CLI" --help 2>&1 | grep -q -- '--team'; then
  ok "--help 列出 --team"
else
  bad "--help 未列出 --team"
fi
if "$DISPATCH_CLI" --help 2>&1 | grep -q 'AgentTeams'; then
  ok "--help 说明 AgentTeams 语义"
else
  bad "--help 未说明 AgentTeams 语义"
fi

# 1.2 默认异步：--help 含 --wait / --no-wait 兼容别名，并写清默认不等待
help_text="$("$DISPATCH_CLI" --help 2>&1)"
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

# 1.3 --prune：help 同步清理（用完即删）语义
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
if printf '%s\n' "$help_text" | grep -q '用完即删'; then
  ok "--help 说明票据用完即删"
else
  bad "--help 未说明票据用完即删"
fi

# 1.3b 会话复用：help 参数与选择函数（项目+模块复用键、不看压力、running 等待、--session 互斥）
for flag in --reuse --new --session --idle-wait --module; do
  if printf '%s\n' "$help_text" | grep -Eq -- "(^|[[:space:]])${flag}([[:space:]]|=|$)"; then
    ok "--help 列出 ${flag}"
  else
    bad "--help 未列出 ${flag}"
  fi
done
if printf '%s\n' "$help_text" | grep -q '复用'; then
  ok "--help 说明会话复用"
else
  bad "--help 未说明会话复用"
fi
if printf '%s\n' "$help_text" | grep -q '\[awf\]'; then
  ok "--help 说明 [awf] 标题约定"
else
  bad "--help 未说明 [awf] 标题约定"
fi
if printf '%s\n' "$help_text" | grep -q '疑似僵尸'; then
  ok "--help 说明僵尸会话与退出码 4"
else
  bad "--help 未说明僵尸会话判定"
fi
if printf '%s\n' "$help_text" | grep -q '未落地'; then
  ok "--help 说明回合结束后的落地检查"
else
  bad "--help 未说明落地检查"
fi
# 1.4 release-prep：help / 参数校验 / dry-run / 临时目录装配（不碰真实仓库）
rp_help="$("$KIT_DIR/bin/awf" release-prep --help 2>&1)"
if printf '%s\n' "$rp_help" | grep -q 'release-prep <X.Y.Z>'; then
  ok "release-prep --help 打印用法"
else
  bad "release-prep --help 未打印用法"
fi
if printf '%s\n' "$rp_help" | grep -q -- '--dry-run'; then
  ok "release-prep --help 列出 --dry-run"
else
  bad "release-prep --help 未列出 --dry-run"
fi
if printf '%s\n' "$rp_help" | grep -q '不自动 commit'; then
  ok "release-prep --help 声明不自动 commit/tag/push"
else
  bad "release-prep --help 未声明不自动 commit"
fi

bad_ver_out=""
if bad_ver_out="$("$KIT_DIR/bin/awf" release-prep 1.2 2>&1)"; then
  bad "release-prep 接受了非法版本号 1.2"
else
  ok "release-prep 拒绝非法版本号"
fi
if printf '%s\n' "$bad_ver_out" | grep -q 'X.Y.Z'; then
  ok "release-prep 非法版本号打印用法"
else
  bad "release-prep 非法版本号未打印用法"
fi
if "$KIT_DIR/bin/awf" release-prep >/dev/null 2>&1; then
  bad "release-prep 缺少版本号仍成功"
else
  ok "release-prep 缺少版本号退出非 0"
fi

make_release_fixture() {
  local dir="$1"
  mkdir -p "$dir/agent-workflow/tasks/dev" "$dir/bin" "$dir/agent-workflow/bin" "$dir/test"
  printf 'id: release-test\n' > "$dir/agent-workflow/project.yaml"
  printf '0.0.1\n' > "$dir/VERSION"
  {
    printf '# Changelog\n\n'
    printf '## [Unreleased]\n\n### Added\n- 待发版条目\n\n'
    printf '## [0.0.1] - 2026-01-01\n'
  } > "$dir/CHANGELOG.md"
  mkdir -p "$dir/agent-workflow/tasks/dev/todo" "$dir/agent-workflow/tasks/dev/current" "$dir/agent-workflow/tasks/dev/done"
  {
    printf '# 进行中 README\n\n| ID | 优先级 | 状态 | Owner | 标题 |\n|----|--------|------|-------|------|\n'
  } > "$dir/agent-workflow/tasks/dev/current/README.md"
  {
    printf '| ID | 优先级 | 标题 | 完成日期 |\n|----|--------|------|----------|\n'
    printf '| DEV-007 | P1 | 旧任务 | 2026-10-01 |\n'
  } > "$dir/agent-workflow/tasks/dev/done/README.md"
  printf '#!/bin/sh\nexit 0\n' > "$dir/bin/awf"
  printf '#!/bin/sh\nexit 0\n' > "$dir/agent-workflow/bin/awf"
  printf '#!/bin/sh\nexit 0\n' > "$dir/agent-workflow/check_workflow.sh"
  printf '#!/bin/sh\nexit 0\n' > "$dir/test/smoke.sh"
  chmod +x "$dir/bin/awf" "$dir/agent-workflow/bin/awf" \
    "$dir/agent-workflow/check_workflow.sh" "$dir/test/smoke.sh"
}

REL_DRY="$TMP/release-dry"
make_release_fixture "$REL_DRY"
dry_out="$("$KIT_DIR/bin/awf" release-prep --root "$REL_DRY" 0.4.2 --dry-run 2>&1)"
if printf '%s\n' "$dry_out" | grep -q 'init . --force --no-register'; then
  ok "release-prep --dry-run 打印 init 动作"
else
  bad "release-prep --dry-run 未打印 init 动作"
fi
if printf '%s\n' "$dry_out" | grep -q 'bootstrap'; then
  ok "release-prep --dry-run 打印 bootstrap 动作"
else
  bad "release-prep --dry-run 未打印 bootstrap 动作"
fi
if [ "$(cat "$REL_DRY/VERSION")" = "0.0.1" ] \
  && [ "$(grep -c 'Unreleased' "$REL_DRY/CHANGELOG.md")" = "1" ] \
  && ! grep -q 'release-prep 0.4.2' "$REL_DRY/agent-workflow/tasks/dev/current/README.md"; then
  ok "release-prep --dry-run 不修改文件"
else
  bad "release-prep --dry-run 修改了文件"
fi

REL="$TMP/release-real"
make_release_fixture "$REL"
if rel_out="$("$KIT_DIR/bin/awf" release-prep --root "$REL" 0.4.2 2>&1)"; then
  ok "release-prep 临时目录装配成功"
else
  bad "release-prep 临时目录装配失败：$rel_out"
fi
if [ "$(cat "$REL/VERSION")" = "0.4.2" ]; then
  ok "release-prep 写入 VERSION"
else
  bad "release-prep 未写入 VERSION"
fi
if grep -q '^## \[0.4.2\] - ' "$REL/CHANGELOG.md" && ! grep -q '^## \[Unreleased\]' "$REL/CHANGELOG.md"; then
  ok "release-prep 把 Unreleased 替换为版本标题"
else
  bad "release-prep 未正确替换 Unreleased"
fi
if [ -f "$REL/agent-workflow/tasks/dev/done/DEV-008.md" ] \
  && grep -q 'release-prep 0.4.2' "$REL/agent-workflow/tasks/dev/done/DEV-008.md" \
  && grep -q '| 状态 | done |' "$REL/agent-workflow/tasks/dev/done/DEV-008.md"; then
  ok "release-prep 自动取下一个 ID 并归档（done/DEV-008.md，状态=done）"
else
  bad "release-prep 未归档账本或 ID 不正确：$(ls "$REL/agent-workflow/tasks/dev/done/" 2>/dev/null)"
fi
if ! grep -q 'release-prep 0.4.2' "$REL/agent-workflow/tasks/dev/current/README.md"; then
  ok "release-prep 归档后清理 current.md"
else
  bad "release-prep 归档后仍残留 current.md 块"
fi
if printf '%s\n' "$rel_out" | grep -q 'git tag -a v0.4.2' \
  && printf '%s\n' "$rel_out" | grep -q 'git push origin main v0.4.2' \
  && printf '%s\n' "$rel_out" | grep -q 'release: v0.4.2（DEV-008）'; then
  ok "release-prep 打印 commit/tag/push 下一步与建议消息"
else
  bad "release-prep 下一步提示不完整"
fi
idem_out="$("$KIT_DIR/bin/awf" release-prep --root "$REL" 0.4.2 2>&1)"
if [ "$(ls "$REL/agent-workflow/tasks/dev/done/"DEV-008.md 2>/dev/null | wc -l | tr -d ' ')" = "1" ] \
  && printf '%s\n' "$idem_out" | grep -q '幂等'; then
  ok "release-prep 重复执行幂等"
else
  bad "release-prep 重复执行产生了重复账本"
fi

# 版本锚点 version_file 定向（DEV-145）：锚点写 project.yaml 的 version_file，默认根 VERSION 兼容
REL_VF="$TMP/release-vf"
make_release_fixture "$REL_VF"
printf 'id: release-vf\nversion_file: agent-workflow/VERSION\n' > "$REL_VF/agent-workflow/project.yaml"
vf_dry="$("$KIT_DIR/bin/awf" release-prep --root "$REL_VF" 0.6.0 --dry-run 2>&1)"
if printf '%s\n' "$vf_dry" | grep -q '版本锚点' && printf '%s\n' "$vf_dry" | grep -q 'agent-workflow/VERSION'; then
  ok "release-prep --dry-run 显示 version_file 锚点路径"
else
  bad "release-prep --dry-run 未显示 version_file 锚点路径：$vf_dry"
fi
if "$KIT_DIR/bin/awf" release-prep --root "$REL_VF" 0.6.0 >/dev/null 2>&1 \
  && [ "$(cat "$REL_VF/agent-workflow/VERSION" 2>/dev/null)" = "0.6.0" ] \
  && [ "$(cat "$REL_VF/VERSION")" = "0.0.1" ]; then
  ok "release-prep 写 version_file 指向的锚点（根 VERSION 不动）"
else
  bad "release-prep 未按 version_file 写锚点（agent-workflow/VERSION=[$(cat "$REL_VF/agent-workflow/VERSION" 2>/dev/null)]，根=[$(cat "$REL_VF/VERSION")]）"
fi

# DEV-198：check 对根目录 VERSION 给防踩坑软提示（迁移建议；软提示不阻塞，fails 不增）
chk_vf_out="$(cd "$REL_VF" && "$KIT_DIR/bin/awf" check 2>&1 || true)"
if printf '%s\n' "$chk_vf_out" | grep -q 'git mv VERSION agent-workflow/VERSION' \
  && printf '%s\n' "$chk_vf_out" | grep -q '残留 VERSION'; then
  ok "DEV-198 check 对根 VERSION 给迁移软提示（version_file 已指 agent-workflow/VERSION）"
else
  bad "DEV-198 check 未给根 VERSION 迁移软提示：$(printf '%s\n' "$chk_vf_out" | grep -i 'VERSION' | head -3)"
fi
chk_vf_def_out="$(cd "$REL" && "$KIT_DIR/bin/awf" check 2>&1 || true)"
if printf '%s\n' "$chk_vf_def_out" | grep -q '默认根 VERSION' \
  && printf '%s\n' "$chk_vf_def_out" | grep -q 'git mv VERSION agent-workflow/VERSION'; then
  ok "DEV-198 check 对默认根 VERSION 项目给迁移软提示（不阻塞）"
else
  bad "DEV-198 check 未对默认根 VERSION 项目给软提示：$(printf '%s\n' "$chk_vf_def_out" | grep -i 'VERSION' | head -3)"
fi

# DEV-205 双版本模型：源持骨架版本 FRAMEWORK_VERSION（单行 semver，无 v 前缀）
KFF_SRC="$KIT_DIR/agent-workflow/FRAMEWORK_VERSION"
[ -f "$KFF_SRC" ] || KFF_SRC="$KIT_DIR/FRAMEWORK_VERSION"
if [ -f "$KFF_SRC" ] \
  && [ "$(wc -l < "$KFF_SRC" | tr -d ' ')" = "1" ] \
  && grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' "$KFF_SRC"; then
  ok "DEV-205 源持骨架版本 FRAMEWORK_VERSION（单行 semver，无 v 前缀）"
else
  bad "DEV-205 源 FRAMEWORK_VERSION 缺失或格式错误：$(cat "$KFF_SRC" 2>/dev/null)"
fi

# DEV-205：项目缺 agent-workflow/FRAMEWORK_VERSION → check 软提示「未登记骨架版本」（不阻塞、不增 FAIL）
HINT_PROJ="$TMP/hint-proj"
"$KIT_DIR/bin/awf" init "$HINT_PROJ" --name "软提示" --no-register >/dev/null
rm -f "$HINT_PROJ/agent-workflow/FRAMEWORK_VERSION"
if hint_out="$(cd "$HINT_PROJ" && "$KIT_DIR/bin/awf" check 2>&1)"; then
  if printf '%s\n' "$hint_out" | grep -q '未登记骨架版本'; then
    ok "DEV-205 check 对缺骨架版本项目给软提示（不阻塞）"
  else
    bad "DEV-205 check 未给缺骨架版本项目软提示：$(printf '%s\n' "$hint_out" | grep -i '骨架\|FRAMEWORK' | head -3)"
  fi
else
  bad "DEV-205 check 对缺骨架版本项目不应 FAIL（软提示不阻塞）"
fi

# 没有 Unreleased 且没有目标版本：提示手动，不报错
printf '# Changelog\n' > "$REL/CHANGELOG.md"
manual_out="$("$KIT_DIR/bin/awf" release-prep --root "$REL" 0.4.3 2>&1)"
if printf '%s\n' "$manual_out" | grep -q '手动'; then
  ok "release-prep 无 Unreleased 时提示手动"
else
  bad "release-prep 无 Unreleased 时未提示手动"
fi

if python3 - "$DISPATCH_IMPL" <<'PY'
import contextlib
import importlib.machinery
import importlib.util
import inspect
import io
import json
import pathlib
import subprocess
import sys
import tempfile
import time

source = pathlib.Path(sys.argv[1])
loader = importlib.machinery.SourceFileLoader("awf_dispatch_reuse_under_test", str(source))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)

target = pathlib.Path("/tmp/awf-reuse-project")


def row(session_id, cwd=str(target), running=False, blank=False, title="",
        tokens=None, window=None, updated=0):
    values = {"title": title}
    if tokens is not None or window is not None:
        values["contextPressure"] = {"pressureTokens": tokens, "contextWindow": window}
    return {
        "sessionId": session_id,
        "cwd": cwd,
        "running": running,
        "blank": blank,
        "updatedAt": updated,
        "projections": {"values": values, "asOfSeq": 1},
    }


assert module.DEFAULT_REUSE is True, "默认必须复用"
assert module.ZOMBIE_TURN_SECONDS == 5.0, "僵尸判定阈值必须是 5s"
assert module.LANDING_POLL_SECONDS == 10.0, "落地轮询间隔必须是 10s"
assert (module.EXIT_OK, module.EXIT_FAIL, module.EXIT_TIMEOUT, module.EXIT_ZOMBIE,
        module.EXIT_HEADLESS_FAIL) == (0, 2, 3, 4, 5), \
    "退出码契约：5 是 headless 子进程非零退出（独立于 3 的超时/未落地）"
assert module.PRESSURE_HINT_LIMIT == 0.9, "压力只作 0.9 提示，不再作为轮换阈值"
assert module.DEFAULT_IDLE_WAIT == 300, "running 等待默认 300s"
assert module.DEFAULT_QUEUE_TIMEOUT == 180, "DEV-126/DISPATCH-139 busy 会话队列等待默认 180s（--queue-timeout）"
assert module.AWF_TITLE_PREFIX == "[awf]", "DEV-126 前缀仍为 [awf]（派发任务澄清，非 [asf]）"
assert module.MODULE_DEFAULT == "通用", "默认模块必须是「通用」"

project = target.name
title = module.awf_session_title("lead", "TEST-001 工作流")
# DEV-134：标题 = [awf] [派发者] [任务名]——派发者（--sender > 票据「派发者：」> lead）
# + 动态任务摘要；模块不进标题（同项目同派发者收敛复用）
assert title == "[awf] [lead] [TEST-001 工作流]", title
assert module.awf_session_title("lead", "") == "[awf] [lead] [未命名任务]"
assert module.awf_title_sender(title) == "lead"
assert module.awf_title_sender("[awf] 周报") == ""

# 模块来源：--module > 票据「模块：」行 > 默认「通用」
ticket = "任务：TEST-001\n\n- 目标项目：proj（/tmp/proj）\n- 模块：工作流\n"
assert module.ticket_module(ticket) == "工作流"
assert module.ticket_module("任务：TEST-001\n") == ""
assert module.resolve_module(ticket) == "工作流"
assert module.resolve_module(ticket, "文档") == "文档", "--module 必须覆盖票据"
assert module.resolve_module("任务：TEST-001\n") == "通用"

# DEV-134：标题不含模块——同项目同派发者的会话复用（无论任务名/模块），改名接新任务
same = row("s-same", title=title, updated=1)
other_module = row("s-other-module", title=module.awf_session_title("lead", "TEST-002 文档"), updated=9)
assert module.select_reuse_session([same], target, "工作流", sender="lead")["sessionId"] == "s-same"
assert module.select_reuse_session([other_module], target, "工作流", sender="lead")["sessionId"] == "s-other-module", \
    "不同模块（同派发者）复用到同一会话"
assert module.select_reuse_session([same, other_module], target, "工作流", sender="lead")["sessionId"] == "s-other-module", \
    "多候选选 updatedAt 最新"
# 不同派发者的 [awf] 闲置会话可复用（复用池 = 项目下全部 [awf] 会话，跨派发者；改名接新任务）
member = row("s-member", title=module.awf_session_title("member", "TEST-003 任务"), updated=99)
assert module.select_reuse_session([member], target, "工作流", sender="lead")["sessionId"] == "s-member", \
    "不同派发者的 [awf] 闲置会话可复用（改名接新任务）"

# 池未满时运行中会话不选中 → 新建扩充（DEV-134 并发上限内扩充；满了才等）
running_same = row("s-running", title=title, running=True, updated=99)
assert module.select_reuse_session([running_same], target, "工作流", sender="lead") is None, \
    "池未满且都忙 → 新建（不静默等）"

# 同项目多个空闲：选 updatedAt 最新
older = row("s-old", title=title, updated=10)
newer = row("s-new", title=title, updated=20)
assert module.select_reuse_session([older, newer], target, "工作流", sender="lead")["sessionId"] == "s-new"
assert module.select_reuse_session([older, running_same], target, "工作流", sender="lead")["sessionId"] == "s-old"

# 并发上限：同派发者同项目 3 个都忙 → 返回候选等待（不新建第 4 个）
pool_full = [row(f"s-r{i}", title=title, running=True, updated=i) for i in (1, 2, 3)]
assert module.select_reuse_session(pool_full, target, "工作流", sender="lead")["sessionId"] == "s-r3", \
    "池满（3 个都忙）→ 选择等待（不新建第 4 个）"

# 旧格式标题（无 [awf]）：默认不再自动迁移（RT-1，防误吞用户自建会话）；
# 只有 legacy_probe 确认（显式放行 / 消息含派发任务包标记）才复用；多条不猜；运行中不迁移
legacy = row("s-legacy", title=f"{project} · 旧任务")
assert module.is_legacy_session_title(f"{project} · 旧任务", project)
assert not module.is_legacy_session_title(title, project)
assert module.select_reuse_session([legacy], target, "工作流") is None, \
    "默认不得复用以 <项目> · 开头的用户普通会话（RT-1）"
assert module.reuse_rename_needed(legacy, title), "旧格式标题复用后必须改名"
assert not module.reuse_rename_needed(same, title)
assert module.select_reuse_session([legacy], target, "工作流",
                                   legacy_probe=lambda r: True)["sessionId"] == "s-legacy", \
    "probe 确认（--allow-legacy-reuse / 含派发标记）才迁移单一旧格式会话"
assert module.select_reuse_session([legacy], target, "工作流",
                                   legacy_probe=lambda r: False) is None, \
    "probe 拒绝（无派发标记）不得迁移"
legacy2 = row("s-legacy2", title=f"{project} · 另一个旧任务")
assert module.select_reuse_session([legacy, legacy2], target, "工作流",
                                   legacy_probe=lambda r: True) is None, "多条旧格式不得猜"
assert module.select_reuse_session([row("s-legacy-run", title=f"{project} · 旧", running=True)],
                                   target, "工作流", legacy_probe=lambda r: True) is None
# 项目已有规范会话（[awf] <项目>，DEV-126 后模块已并入同标题）时旧格式不迁移
assert module.select_reuse_session([other_module, legacy], target, "工作流",
                                   legacy_probe=lambda r: True)["sessionId"] == "s-other-module", \
    "存在 [awf] 规范会话时先命中规范会话，不迁移旧格式"

# 不兜底复用普通用户会话；不同 cwd / blank 跳过；无候选返回 None
assert module.select_reuse_session([row("s-user", title="用户的会话")], target, "工作流") is None
assert module.select_reuse_session([row("s-other", cwd="/tmp/other", title=title)],
                                   target, "工作流") is None
assert module.select_reuse_session([row("s-blank", blank=True, title=title)],
                                   target, "工作流") is None
assert module.select_reuse_session([], target, "工作流") is None

# 压力不参与筛选（上下文是开发资产）：高压力会话仍被选中，只给提示
high = row("s-high", title=title, tokens=950, window=1000)
assert module.select_reuse_session([high], target, "工作流")["sessionId"] == "s-high", "高压力会话不得被跳过"
hint = module.pressure_hint(high)
assert hint and "--new" in hint and "可考虑" in hint, hint
assert module.pressure_hint(row("s-low", tokens=500, window=1000)) == "", "低压力不得提示"

# 标题约定（DEV-134）：[awf] [派发者] [任务名]（任务段截断）
long_t = module.awf_session_title("lead", "x" * 50)
assert long_t.startswith("[awf] [lead] [") and long_t.endswith("]") and long_t.count("[") == 3, long_t


class FakeApi:
    """只实现 sessions()，模拟 session/list 轮询（不触碰真实会话）。"""

    def __init__(self, sequence):
        self.sequence = list(sequence)
        self.calls = 0

    def sessions(self):
        self.calls += 1
        return self.sequence[min(self.calls - 1, len(self.sequence) - 1)]


def turn(running):
    return {"sessionId": "s-awf", "running": running, "blank": False}


# running=true：轮询到空闲后返回
polling = FakeApi([[turn(True)], [turn(True)], [turn(False)]])
row_idle = module.wait_for_idle(polling, "s-awf", timeout=5, interval=0.01)
assert row_idle is not None and row_idle["running"] is False and polling.calls == 3

# 持续运行：超时返回 None（调用方据此报「队列等待超时」并建议 --new / 加大 --queue-timeout）
stuck = FakeApi([[turn(True)]])
assert module.wait_for_idle(stuck, "s-awf", timeout=0.05, interval=0.01) is None

# DEV-212：项目 3 个 [awf] 全忙时，监听器观察整个池；任一会话空闲即返回
multi = FakeApi([[{"sessionId": "s-a", "running": True}, {"sessionId": "s-b", "running": True}],
                 [{"sessionId": "s-a", "running": True}, {"sessionId": "s-b", "running": False}]])
watch = module.wait_for_idle_sessions(multi, ["s-a", "s-b"], timeout=5, interval=0.01)
assert watch is not None and watch["sessionId"] == "s-b" and watch["running"] is False


# 轮询中会话消失/被归档：返回 SESSION_GONE（与超时区分，调用方提示重新派发）
missing = FakeApi([[{"sessionId": "other", "running": False}]])
assert module.wait_for_idle(missing, "s-awf", timeout=0.05, interval=0.01) is module.SESSION_GONE

# 派发主流程（mock API，不接触真实会话）：同模块复用 / 异模块新建 / 旧标题改名 / running 等待
import argparse

module.time.sleep = lambda _seconds: None  # wait_for_idle 在测试里不真等


class FakeDispatchApi:
    def __init__(self, rows, idle_after=None, page=None, mark_updated=False):
        self.rows = rows
        self.idle_after = idle_after
        self.page = page if page is not None else {"records": []}
        self.mark_updated = mark_updated
        self.calls = 0
        self.created = []
        self.renamed = []
        self.prompts = []

    def sessions(self):
        self.calls += 1
        if self.idle_after is not None:
            running = self.calls < self.idle_after
            for item in self.rows:
                item["running"] = running
        if self.mark_updated:
            now_ms = int(time.time() * 1000)
            for item in self.rows:
                item["updatedAt"] = now_ms
        return self.rows

    def rpc(self, method, params, timeout=30):
        if method != "session/page":
            raise module.DispatchError(f"未知 RPC：{method}")
        return self.page

    def create_session(self, workspace_id):
        created = row(f"s-created-{len(self.created) + 1}", title="")
        self.rows.append(created)
        self.created.append(created["sessionId"])
        return {"sessionId": created["sessionId"]}

    def rename(self, session_id, new_title):
        # 只记录，不原地改 rows（row 是快照）；改名后的输出必须由 dispatch_session 用新标题。
        self.renamed.append((session_id, new_title))

    def prompt(self, session_id, text, request_id):
        self.prompts.append((session_id, text))


class NoListApi(FakeDispatchApi):
    """--new 不应调用 session/list：一旦调用就失败。"""

    def sessions(self):
        raise module.DispatchError("session/list 不可用（--new 不应调用）")


class VanishApi(FakeDispatchApi):
    """轮询中会话消失：sessions() 在指定次数后返回空列表。"""

    def __init__(self, rows, disappear_after):
        super().__init__(rows)
        self.disappear_after = disappear_after

    def sessions(self):
        self.calls += 1
        if self.calls >= self.disappear_after:
            return []
        return self.rows


def preflight_stub(api, sessions=True):
    def stub(target, args, need_channel):
        rows = api.sessions() if sessions else []
        return {
            "api": api,
            "workspace": {"title": "w", "workspaceId": "id"},
            "sessions": rows,
        }
    return stub


def _args(**overrides):
    values = dict(
        session="", reuse=True, module="", title="", wait=False, timeout=600,
        idle_wait=300, queue_timeout=60, force=False, team=False, json=False, headless=False,
        handoff=False, dry_run=False, add_workspace=False, allow_dirty=False,
        allow_active=False, apply=False, prune=False, web_url="",
        allow_legacy_reuse=False, sender="lead", new=False, allow_over_3=False,
        cleanup=False, forget_archived=False,
    )
    values.update(overrides)
    return argparse.Namespace(**values)


def run_dispatch(api, task_module, idle_wait=300, queue_timeout=60, force=False, reuse=True,
                 json_mode=False, expect_error=False, sessions_in_preflight=True,
                 allow_legacy=False, session="", new=False, allow_over_3=False):
    logs = []
    output = io.StringIO()
    original = (module.preflight, module.append_log, module.emit)
    module.preflight = preflight_stub(api, sessions_in_preflight)
    module.append_log = lambda entry: logs.append(entry) or pathlib.Path("/tmp/awf-dispatch-log.md")
    emitted = []
    api.emitted = emitted
    module.emit = lambda message, json_mode=False: emitted.append(message)
    text = (
        f"任务：TEST-001 冒烟\n\n- 目标项目：{project}（{target}）\n"
        f"- 模块：{task_module}\n"
    )
    args = _args(reuse=reuse and not new, idle_wait=idle_wait, queue_timeout=queue_timeout, force=force,
                 json=json_mode, allow_legacy_reuse=allow_legacy, session=session, new=new,
                 allow_over_3=allow_over_3)
    try:
        with contextlib.redirect_stdout(output):
            try:
                code = module.dispatch_session(
                    target, pathlib.Path("/tmp/TEST-001-task.md"), text,
                    f"{project} · TEST-001", "dev", args,
                )
            except module.DispatchError as error:
                if not expect_error:
                    raise
                return str(error)
    finally:
        module.preflight, module.append_log, module.emit = original
    if expect_error:
        raise AssertionError("预期派发失败但成功了")
    assert code == 0, code
    return logs, output.getvalue()


def run_wait_dispatch(api, task_module, timeout=30.0, landing="commit", landing_calls=None,
                      repo=None, expect_error=False):
    logs = []
    output = io.StringIO()
    dispatch_target = repo or target
    original = (module.preflight, module.append_log, module.emit, module.wait_for_landing)
    module.preflight = preflight_stub(api)
    module.append_log = lambda entry: logs.append(entry) or pathlib.Path("/tmp/awf-dispatch-log.md")
    module.emit = lambda message, json_mode=False: None

    def fake_landing(target_arg, task_id, initial_head, remaining):
        if landing_calls is not None:
            landing_calls.append(
                {"task_id": task_id, "initial_head": initial_head, "timeout": remaining}
            )
        return landing

    module.wait_for_landing = fake_landing
    text = (
        f"任务：TEST-001 冒烟\n\n- 目标项目：{project}（{target}）\n"
        f"- 模块：{task_module}\n"
    )
    args = _args(wait=True, timeout=timeout, json=True)
    try:
        with contextlib.redirect_stdout(output):
            try:
                code = module.dispatch_session(
                    dispatch_target, pathlib.Path("/tmp/TEST-001-task.md"), text,
                    f"{project} · TEST-001", "dev", args,
                )
            except module.DispatchError as error:
                if not expect_error:
                    raise
                return str(error), logs, output.getvalue()
    finally:
        (module.preflight, module.append_log, module.emit,
         module.wait_for_landing) = original
    if expect_error:
        raise AssertionError("预期派发失败但成功了")
    return code, logs, output.getvalue()


# --- 0.4.2 可靠性：回合耗时 / 活动证据 / 落地判定（纯函数 + mock） ---
prompt_ms = int(time.time() * 1000)
fast = FakeApi([[row("s-awf", updated=prompt_ms + 1)]])
fast_row, fast_seconds = module.wait_for_turn(fast, "s-awf", prompt_ms, timeout=0.2, json_mode=True)
assert fast_row is not None and fast_seconds is not None and fast_seconds < 5, fast_seconds

observed = FakeApi([[row("s-awf", running=True)], [row("s-awf", updated=prompt_ms + 1)]])
observed_row, observed_seconds = module.wait_for_turn(
    observed, "s-awf", prompt_ms, timeout=0.2, json_mode=True)
assert observed_row is not None and observed_seconds is not None and observed_seconds >= 0


class PageApi:
    def __init__(self, page):
        self.page = page

    def rpc(self, method, params, timeout=30):
        return self.page


class BrokenPageApi:
    def rpc(self, method, params, timeout=30):
        raise module.DispatchError("page 不可用")


def activity_row():
    value = row("s-act")
    value["projections"]["asOfSeq"] = 1
    return value


def event(kind, data, seq=1, stamp=None):
    return {"event": {"type": kind, "seq": seq, "time": stamp or prompt_ms, "data": data}}


empty_activity = module.turn_activity(PageApi({"records": []}), activity_row())
assert empty_activity["available"] and not empty_activity["has_output"] and not empty_activity["has_tool"]
assert empty_activity["turn_ended"] is False

text_activity = module.turn_activity(PageApi({"records": [
    event("turn/end", {"turn": 1}, seq=3, stamp=prompt_ms + 2),
    event("assistant/message",
          {"turn": 1, "message": {"content": [{"type": "text", "text": "完成"}]}},
          seq=2, stamp=prompt_ms + 1),
]}), activity_row())
assert text_activity["has_output"] and text_activity["text"] == "完成"
assert text_activity["turn_ended"] is True

tool_activity = module.turn_activity(PageApi({"records": [
    event("turn/end", {"turn": 1}, seq=3, stamp=prompt_ms + 2),
    event("tool/call", {"turn": 1, "name": "bash"}, seq=2, stamp=prompt_ms + 1),
]}), activity_row())
assert tool_activity["has_tool"] and not tool_activity["has_output"]
assert tool_activity["turn_ended"] is True

# 历史回合的文本/工具调用不能算到本回合（否则僵尸会被历史掩盖）
history_activity = module.turn_activity(PageApi({"records": [
    event("assistant/message",
          {"turn": 1, "message": {"content": [{"type": "text", "text": "上一回合"}]}},
          seq=2, stamp=prompt_ms - 3000),
    event("tool/call", {"turn": 1, "name": "bash"}, seq=3, stamp=prompt_ms - 2000),
    event("turn/end", {"turn": 2}, seq=5, stamp=prompt_ms + 1),
]}), activity_row())
assert not history_activity["has_output"] and not history_activity["has_tool"], history_activity
unreadable = module.turn_activity(BrokenPageApi(), activity_row())
assert unreadable["available"] is False, "读不到记录时不能判僵尸"

orig_sha, orig_ledger, orig_cmrange = module.git_head_sha, module.ledger_has_id, module.commit_range_has_id
try:
    module.commit_range_has_id = lambda target, task_id, since_sha: task_id == "TEST-001"
    heads = iter(["aaa", "aaa", "bbb"])
    module.git_head_sha = lambda target: next(heads)
    module.ledger_has_id = lambda target, task_id: False
    assert module.wait_for_landing(
        target, "TEST-001", "aaa", timeout=0.5, interval=0.01) == "commit"

    # RT-3：区间内无本任务 commit（全部无关 commit）→ 不判落地
    module.git_head_sha = lambda target: "bbb"
    module.commit_range_has_id = lambda target, task_id, since_sha: False
    assert module.wait_for_landing(
        target, "TEST-001", "aaa", timeout=0.05, interval=0.01) is None, \
        "无关 commit 不得判落地（RT-3）"
    # RT-3 区间归因：任务 commit 落地后被无关 commit 压顶，区间内仍含任务 ID → 判落地
    module.commit_range_has_id = lambda target, task_id, since_sha: task_id == "TEST-001"
    assert module.wait_for_landing(
        target, "TEST-001", "aaa", timeout=0.5, interval=0.01) == "commit", \
        "任务 commit 被压顶仍应判落地（RT-3 区间归因）"

    module.git_head_sha = lambda target: "aaa"
    module.ledger_has_id = lambda target, task_id: task_id == "TEST-001"
    assert module.wait_for_landing(
        target, "TEST-001", "aaa", timeout=0.5, interval=0.01) == "done"

    module.ledger_has_id = lambda target, task_id: False
    assert module.wait_for_landing(
        target, "TEST-001", "aaa", timeout=0.05, interval=0.01) is None

    # 轮询中途读取失败（None）不能当作 HEAD 变化
    module.git_head_sha = lambda target: None
    assert module.wait_for_landing(
        target, "TEST-001", "aaa", timeout=0.05, interval=0.01) is None
    failed_heads = iter([None, None, "bbb"])
    module.git_head_sha = lambda target: next(failed_heads)
    assert module.wait_for_landing(
        target, "TEST-001", "aaa", timeout=0.5, interval=0.01) == "commit"

    # 空仓库：初始 ""，首次 commit（消息含 ID）后应正常判 landed
    empty_heads = iter(["", "", "abc"])
    module.git_head_sha = lambda target: next(empty_heads)
    assert module.wait_for_landing(
        target, "TEST-001", "", timeout=0.5, interval=0.01) == "commit"

    # 初始 HEAD 不可用（None）：只能等归档，不能靠后续成功推断 commit
    module.git_head_sha = lambda target: "abc"
    assert module.wait_for_landing(
        target, "TEST-001", None, timeout=0.05, interval=0.01) is None
finally:
    module.git_head_sha, module.ledger_has_id, module.commit_range_has_id = (
        orig_sha, orig_ledger, orig_cmrange)


TEXT_PAGE = {"records": [
    {"event": {"type": "assistant/message", "seq": 2, "time": 4102444800000,
               "data": {"turn": 1,
                        "message": {"content": [{"type": "text", "text": "已完成并提交"}]}}}},
    {"event": {"type": "turn/end", "seq": 3, "time": 4102444800001,
               "data": {"turn": 1}}},
]}

# git_head_sha 三态：空仓库 ""、正常 sha、读取失败 None
with tempfile.TemporaryDirectory() as tmp:
    repo = pathlib.Path(tmp)
    assert module.git_head_sha(repo) is None, "非 git 目录必须返回 None"
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    assert module.git_head_sha(repo) == "", "空仓库（无 commit）必须返回空串"
    (repo / "a.txt").write_text("a", encoding="utf-8")
    subprocess.run(["git", "-C", str(repo), "add", "a.txt"], check=True)
    subprocess.run(
        ["git", "-C", str(repo), "-c", "user.email=smoke@test",
         "-c", "user.name=smoke", "commit", "-qm", "fix: TEST-001 落地"],
        check=True,
    )
    sha = module.git_head_sha(repo)
    assert isinstance(sha, str) and len(sha) == 40, sha
    assert module.commit_range_has_id(repo, "TEST-001", "") is True, "提交消息含任务 ID"
    assert module.commit_range_has_id(repo, "TEST-999", "") is False, "无关 ID 不得命中"
    assert module.wait_for_landing(
        repo, "TEST-001", "", timeout=0.1, interval=0.01) == "commit"
    assert module.git_head_sha(repo / "missing") is None

    # RT-3：无关 commit（提交消息不含任务 ID，如用户/其它会话的提交）不算本任务落地
    unrelated = pathlib.Path(tmp) / "unrelated"
    unrelated.mkdir()
    subprocess.run(["git", "init", "-q", str(unrelated)], check=True)
    (unrelated / "b.txt").write_text("b", encoding="utf-8")
    subprocess.run(["git", "-C", str(unrelated), "add", "b.txt"], check=True)
    subprocess.run(
        ["git", "-C", str(unrelated), "-c", "user.email=smoke@test",
         "-c", "user.name=smoke", "commit", "-qm", "chore: 用户无关提交"],
        check=True,
    )
    assert module.commit_range_has_id(unrelated, "TEST-001", "") is False
    assert module.wait_for_landing(
        unrelated, "TEST-001", "", timeout=0.1, interval=0.01) is None, \
        "无关 commit 不得判落地（RT-3）"


# 初始 HEAD 读取失败：git 仓库必须明确报错，且不发送任务
with tempfile.TemporaryDirectory() as tmp:
    broken_repo = pathlib.Path(tmp)
    (broken_repo / ".git").mkdir()
    broken_api = FakeDispatchApi(
        [row("s-broken", title=title)], mark_updated=True, page=TEXT_PAGE)
    real_sha = module.git_head_sha
    module.git_head_sha = lambda target: None
    try:
        broken_msg, _, _ = run_wait_dispatch(
            broken_api, "工作流", repo=broken_repo, expect_error=True)
    finally:
        module.git_head_sha = real_sha
    assert "初始 HEAD" in broken_msg and "落地判定不可靠" in broken_msg, broken_msg
    assert broken_api.prompts == [], "初始 HEAD 失败时不得发送任务"


# 目标不是 git 仓库：退回仅以 done.md 判定，不因无法读 HEAD 而中断
with tempfile.TemporaryDirectory() as tmp:
    plain_dir = pathlib.Path(tmp)
    plain_api = FakeDispatchApi(
        [row("s-plain", title=title)], mark_updated=True, page=TEXT_PAGE)
    plain_calls = []
    real_sha = module.git_head_sha
    module.git_head_sha = lambda target: None
    try:
        plain_code, _, _ = run_wait_dispatch(
            plain_api, "工作流", landing="done", landing_calls=plain_calls, repo=plain_dir)
    finally:
        module.git_head_sha = real_sha
    assert plain_code == 0, plain_code
    assert plain_calls and plain_calls[0]["initial_head"] is None, plain_calls


# 模块相同 → 复用，不新建
same_api = FakeDispatchApi([row("s-same", title=title)])
logs, _ = run_dispatch(same_api, "工作流")
assert same_api.created == [], "同模块应复用，不新建会话"
assert same_api.prompts and same_api.prompts[0][0] == "s-same", same_api.prompts
assert "会话来源：复用" in logs[0]
assert same_api.calls == 1, f"G4 探针与复用查找应合并为一次 session/list，实际 {same_api.calls} 次"

# DEV-126 后标题不含模块：已有的 [awf] <项目> 会话（即使曾按其它模块建过）直接复用，不新建
shared_api = FakeDispatchApi([row("s-doc", title=module.awf_session_title("lead", "TEST-002 文档"))])
logs, _ = run_dispatch(shared_api, "工作流")
assert shared_api.prompts and shared_api.prompts[0][0] == "s-doc", shared_api.prompts
assert shared_api.created == [], "同标题会话应复用而非新建"
assert "会话来源：复用" in logs[0], logs[0]

# RT-1：用户自建旧格式会话（无派发任务包标记）不得被复用/改名/注入 → 新建
user_legacy_api = FakeDispatchApi([row("s-user-legacy", title=f"{project} · 用户的分析记录")])
logs, _ = run_dispatch(user_legacy_api, "工作流")
assert user_legacy_api.created == ["s-created-1"], "用户普通会话不得迁移复用，应新建"
assert all(sid != "s-user-legacy" for sid, _ in user_legacy_api.renamed), user_legacy_api.renamed
assert all(sid != "s-user-legacy" for sid, _ in user_legacy_api.prompts), user_legacy_api.prompts
assert "会话来源：新建" in logs[0]

# RT-1：会话消息含派发任务包标记 → 旧格式迁移复用并改名（旧版派发器留存的会话）
MARKER_PAGE = {"records": [{"event": {"type": "user/message", "seq": 1,
    "data": {"message": {"content": [{"type": "text",
        "text": "请执行下面的跨项目任务。\n----- 任务包开始 -----\n任务：TEST-001"}]}}}}]}
marker_api = FakeDispatchApi([row("s-legacy-marker", title=f"{project} · 旧任务")], page=MARKER_PAGE)
logs, _ = run_dispatch(marker_api, "工作流")
assert marker_api.created == [], "含派发任务包标记的旧格式会话应迁移复用"
assert ("s-legacy-marker", "[awf] [lead] [TEST-001 冒烟]") in marker_api.renamed, marker_api.renamed
assert marker_api.prompts and marker_api.prompts[0][0] == "s-legacy-marker", marker_api.prompts
assert f"（[awf] [lead] [TEST-001 冒烟]）" in logs[0], logs[0]
assert f"（{project} · 旧任务）" not in logs[0], logs[0]
assert "会话来源：复用" in logs[0]

# RT-1：显式 --allow-legacy-reuse 无标记也迁移
forc_api = FakeDispatchApi([row("s-legacy-forc", title=f"{project} · 旧任务")])
logs, _ = run_dispatch(forc_api, "工作流", allow_legacy=True)
assert forc_api.created == [], "显式放行应迁移复用"
assert ("s-legacy-forc", "[awf] [lead] [TEST-001 冒烟]") in forc_api.renamed, forc_api.renamed
assert forc_api.prompts and forc_api.prompts[0][0] == "s-legacy-forc", forc_api.prompts

legacy_json_api = FakeDispatchApi([row("s-legacy-json", title=f"{project} · 旧任务")], page=MARKER_PAGE)
_, legacy_json = run_dispatch(legacy_json_api, "工作流", json_mode=True)
payload = json.loads(legacy_json)
assert payload["reused"] is True and payload["sessionId"] == "s-legacy-json", payload
assert payload["sessionTitle"] == "[awf] [lead] [TEST-001 冒烟]", payload

# DEV-134 并发上限：池满（3 个都忙）→ 等空闲后再发送（不静默新建第 4 个）
running_api = FakeDispatchApi(
    [row("s-r1", title=title, running=True, updated=1),
     row("s-r2", title=title, running=True, updated=2),
     row("s-r3", title=title, running=True, updated=3)],
    idle_after=3)
logs, _ = run_dispatch(running_api, "工作流")
assert running_api.created == [], running_api.created
assert running_api.prompts and running_api.prompts[0][0] == "s-r3", running_api.prompts
assert any("等待队列" in m for m in running_api.emitted), running_api.emitted

# DEV-210/DEV-212 数量上限：每项目 [awf] 会话总数 ≤3；达到 3 且全忙时等待，不拒绝、不新建第 4 个。
# 自动复用路径已有 running_api 覆盖；这里保留 3 个空闲候选，验证优先复用 [awf] 闲置而非新建。
pool3_api = FakeDispatchApi([
    row("s-p1", title=module.awf_session_title("lead", "TEST-310 甲"), updated=1),
    row("s-p2", title=module.awf_session_title("member", "TEST-311 乙"), updated=2),
    row("s-p3", title=module.awf_session_title("lead", "TEST-312 丙"), updated=3),
])
logs, _ = run_dispatch(pool3_api, "通用")
assert pool3_api.created == [], "已有 3 个 [awf] 会话时应优先复用闲置，不新建"
assert pool3_api.prompts and pool3_api.prompts[0][0] == "s-p3", pool3_api.prompts
assert "会话来源：复用" in logs[0], logs

# --new 不碰 session/list：mock sessions() 抛错也应成功（不应报 G4 / 复用检查失败）
new_api = NoListApi([row("s-same", title=title)])
logs, _ = run_dispatch(new_api, "工作流", reuse=False, sessions_in_preflight=False)
assert new_api.created == ["s-created-1"], new_api.created
assert new_api.prompts and new_api.prompts[0][0] == "s-created-1", new_api.prompts
assert new_api.calls == 0, "显式 --new 不应调用 session/list"
assert "会话来源：新建" in logs[0]

# 自动路径的同名保护仍按原逻辑 gated：自动新建遇同名会话要 --force；--new 跳过
dup_rows = [
    row("s-dup", title=f"{project} · TEST-001"),
    row("s-dup-2", title=f"{project} · 另一个旧任务"),
]
dup_msg = run_dispatch(FakeDispatchApi(dup_rows), "工作流", expect_error=True)
assert "同名会话" in dup_msg and "--force" in dup_msg, dup_msg
forced_api = FakeDispatchApi(dup_rows)
forced_logs, _ = run_dispatch(forced_api, "工作流", force=True)
assert forced_api.created == ["s-created-1"], forced_api.created
assert "会话来源：新建" in forced_logs[0]

# 等待超时 vs 会话消失：两类错误分开（文案与恢复建议不同）
# 等待超时 vs 会话消失：两类错误分开（文案与恢复建议不同）；池满才触发等待
timeout_api = FakeDispatchApi(
    [row("s-r1", title=title, running=True, updated=1),
     row("s-r2", title=title, running=True, updated=2),
     row("s-r3", title=title, running=True, updated=3)])
timeout_msg = run_dispatch(
    timeout_api, "工作流", idle_wait=0, queue_timeout=0, expect_error=True,
)
assert "超时" in timeout_msg and "仍在运行" in timeout_msg, timeout_msg
assert "消失" not in timeout_msg, timeout_msg
assert any("等待队列" in m for m in timeout_api.emitted), timeout_api.emitted

gone_msg = run_dispatch(
    VanishApi([row("s-r1", title=title, running=True, updated=1),
               row("s-r2", title=title, running=True, updated=2),
               row("s-r3", title=title, running=True, updated=3)],
              disappear_after=3),
    "工作流", expect_error=True,
)
assert "消失" in gone_msg and "重新派发" in gone_msg, gone_msg
assert "超时" not in gone_msg, gone_msg



# --- 0.4.2 可靠性：--wait 僵尸 / 落地 / 未落地（dispatch_session 全流程 mock） ---

ZOMBIE_PAGE = {"records": [{"event": {
    "type": "turn/end", "seq": 2, "time": 4102444800000, "data": {"turn": 1},
}}]}
zombie_calls = []
zombie_api = FakeDispatchApi(
    [row("s-zombie", title=title)], mark_updated=True, page=ZOMBIE_PAGE)
zombie_code, zombie_logs, zombie_out = run_wait_dispatch(
    zombie_api, "工作流", landing="commit", landing_calls=zombie_calls)
zombie_payload = json.loads(zombie_out)
assert zombie_code == module.EXIT_ZOMBIE == 4, zombie_code
assert zombie_payload["zombie"] is True and zombie_payload["sessionId"] == "s-zombie"
assert "僵尸" in zombie_payload["message"] and "--new" in zombie_payload["message"]
assert "僵尸" in zombie_logs[0]
assert zombie_calls == [], "僵尸判定优先于落地轮询"

landing_calls = []
ok_api = FakeDispatchApi([row("s-ok", title=title)], mark_updated=True, page=TEXT_PAGE)
ok_code, ok_logs, ok_out = run_wait_dispatch(
    ok_api, "工作流", landing="commit", landing_calls=landing_calls)
ok_payload = json.loads(ok_out)
assert ok_code == module.EXIT_OK == 0, ok_code
assert ok_payload["status"] == "completed" and ok_payload["landed"] == "commit"
assert ok_payload["final"] == "已完成并提交"
assert "完成（已落地：commit）" in ok_logs[0]
assert landing_calls and landing_calls[0]["task_id"] == "TEST-001"

miss_api = FakeDispatchApi([row("s-miss", title=title)], mark_updated=True, page=TEXT_PAGE)
miss_code, miss_logs, miss_out = run_wait_dispatch(miss_api, "工作流", landing=None)
miss_payload = json.loads(miss_out)
assert miss_code == module.EXIT_TIMEOUT == 3, miss_code
assert miss_payload["status"] == "not_landed" and miss_payload["landed"] is False
assert "未落地" in miss_payload["message"] and "--force" in miss_payload["message"]
assert "未落地" in miss_logs[0]

# 日志记录复用/新建、模块；--session 来源单独标注；headless 不写
base = dict(
    alias="proj", target=target, title="任务", session_id="s-awf",
    session_title_value=title, workspace={"title": "w", "workspaceId": "id"},
    status="已发送，未等待回合", final_text="", task=pathlib.Path("/tmp/task.md"),
)
assert "- 会话来源：复用\n" in module.log_entry(**base, reused=True)
assert "- 会话来源：新建\n" in module.log_entry(**base, reused=False)
assert "- 会话来源：复用（--session 指定）\n" in module.log_entry(**base, reused="复用（--session 指定）")
assert "会话来源" not in module.log_entry(**base), "headless 路径不写会话来源"
assert "- 会话提示：" in module.log_entry(**base, reused=True, session_note="接近上限")
assert "- 模块：工作流\n" in module.log_entry(**base, reused=True, module="工作流")
assert "模块：" not in module.log_entry(**base), "未传模块时不写模块行"

# --- DISPATCH-138：S1/S2/M1/M2 审查修复断言 ---

# S1：check_active 目录式账本（tasks/<type>/current/<ID>.md）能检出 active；
#     旧大文件（tasks/<type>/current.md）仍兼容；README 索引不误报。
with tempfile.TemporaryDirectory() as tmp:
    proj = pathlib.Path(tmp)
    dev_cur = proj / "agent-workflow/tasks/dev/current"
    dev_cur.mkdir(parents=True)
    (dev_cur / "DEV-999.md").write_text(
        "## [DEV-999] 目录式 active 冒烟\n\n| 状态 | active |\n", encoding="utf-8")
    (dev_cur / "README.md").write_text("# 索引\n", encoding="utf-8")
    debug_tasks = proj / "agent-workflow/tasks/debug"
    debug_tasks.mkdir(parents=True)
    (debug_tasks / "current.md").write_text(
        "## [DEBUG-001] 旧大文件 active A\n## [DEBUG-002] 旧大文件 active B\n",
        encoding="utf-8")
    try:
        module.check_active(proj, allow_active=False)
        raise AssertionError("S1：目录式+旧大文件 active 应触发 G3 拦截")
    except module.DispatchError as error:
        msg = str(error)
        assert "DEV-999" in msg and "DEBUG-001" in msg and "DEBUG-002" in msg, msg
    allowed = module.check_active(proj, allow_active=True)
    assert "3 个 active 任务（已允许）" in allowed, allowed
    (dev_cur / "DEV-999.md").unlink()
    (debug_tasks / "current.md").unlink()
    assert module.check_active(proj, allow_active=False) == "无 active 任务", \
        "README 索引不得误报为 active"

# S2：派发注入指向技能回执规范（blocked/解除条件/静默等明细在技能内）
prompt = module.build_prompt(target, "TEST", "dev", "任务：TEST-001 冒烟\n")
assert "cross-project-dispatch/SKILL.md" in prompt and "必报点" in prompt, prompt

# S3（DISPATCH-139）：门禁严格度——P0 默认 180s + 中途状态 / P1 allow-dirty=tasks 粒度 + G3 三选项 / P2 G1 瞬态豁免
assert module.DEFAULT_QUEUE_TIMEOUT == 180, module.DEFAULT_QUEUE_TIMEOUT
_src = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
assert "report_mid_status" in _src and "中途状态" in _src and "已等 %ds" in _src, "P0 中途状态回执缺失"
assert "--allow-dirty=" in _src and "allow_dirty_scope" in _src, "P1 allow-dirty 范围解析缺失"
assert "只豁免账本自我生成物" in _src and "业务/代码改动仍拦截" in _src, "P1 粒度豁免语义缺失"
assert "三选项" in _src and "--allow-active" in _src and "① 等它完成后再派" in _src, "P1 G3 三选项提示缺失"
assert "瞬态豁免" in _src and "status.md 已过期" in _src, "P2 瞬态豁免语义缺失"

# 行为级：P1 --allow-dirty=tasks 豁免生成物、拦截业务；G3 active 三选项；P2 check 瞬态/真缺损
with tempfile.TemporaryDirectory() as tmp:
    repo = pathlib.Path(tmp) / "proj"
    (repo / "agent-workflow" / "tasks" / "dev" / "current").mkdir(parents=True)
    (repo / "agent-workflow" / "workflows").mkdir(parents=True)
    (repo / "AGENTS.md").write_text("# x\n", encoding="utf-8")
    (repo / "agent-workflow" / "project.yaml").write_text("role: t\n", encoding="utf-8")
    (repo / "agent-workflow" / "README.md").write_text("r\n", encoding="utf-8")
    (repo / "agent-workflow" / "workflows" / "dev.md").write_text("w\n", encoding="utf-8")
    (repo / "agent-workflow" / "tasks" / "status.md").write_text("s\n", encoding="utf-8")
    (repo / "dispatch").mkdir(parents=True)
    (repo / "dispatch" / "log.md").write_text("log\n", encoding="utf-8")
    (repo / "src.py").write_text("code\n", encoding="utf-8")
    subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.email", "t@t"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=repo, check=True)
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=repo, check=True)
    # P1：业务代码 + 生成物都脏 → =tasks 应拒
    (repo / "agent-workflow" / "tasks" / "status.md").write_text("s2\n", encoding="utf-8")
    (repo / "dispatch" / "log.md").write_text("log2\n", encoding="utf-8")
    (repo / "src.py").write_text("code2\n", encoding="utf-8")
    try:
        module.check_git(repo, True, "tasks")
        raise AssertionError("P1：--allow-dirty=tasks 应拦截业务代码脏")
    except module.DispatchError as err:
        assert "业务/代码改动仍拦截" in str(err), str(err)
    # P1：只留生成物脏 → =tasks 放行
    (repo / "src.py").write_text("code\n", encoding="utf-8")
    out = module.check_git(repo, True, "tasks")
    assert "账本自我生成物" in out, out
    # P1：G3 active 三选项
    (repo / "agent-workflow" / "tasks" / "dev" / "current" / "DEV-999.md").write_text(
        "## [DEV-999] 测试\n| 状态 | active |\n", encoding="utf-8")
    try:
        module.check_active(repo, False)
        raise AssertionError("P1：G3 active 应报错")
    except module.DispatchError as err:
        assert "三选项" in str(err) and "--allow-active" in str(err) and "--new" in str(err), str(err)
    # P2：仅 status.md 过期 → 瞬态放行
    (repo / "agent-workflow" / "check_workflow.sh").write_text(
        "#!/bin/sh\necho 'FAIL  tasks/status.md 已过期（账本改动后未刷新）' >&2\nexit 1\n",
        encoding="utf-8")
    (repo / "agent-workflow" / "check_workflow.sh").chmod(0o755)
    module.check_workflow(repo)  # 不应 raise
    # P2：含真缺损 → 仍 FAIL
    (repo / "agent-workflow" / "check_workflow.sh").write_text(
        "#!/bin/sh\necho 'FAIL  tasks/status.md 已过期（账本改动后未刷新）' >&2\n"
        "echo 'FAIL  缺 workflow 文件' >&2\nexit 2\n", encoding="utf-8")
    (repo / "agent-workflow" / "check_workflow.sh").chmod(0o755)
    try:
        module.check_workflow(repo)
        raise AssertionError("P2：真缺损应 FAIL")
    except module.DispatchError:
        pass

# S3.5（DISPATCH-139 回归）：report_mid_status「HEAD 未变」分支曾 TypeError 破坏
# wait_for_turn 的 (None,None) 语义；现必须不崩、正常回执中途状态、语义不变。
with tempfile.TemporaryDirectory() as tmp:
    mid_repo = pathlib.Path(tmp) / "mid"
    mid_repo.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=mid_repo, check=True)
    subprocess.run(["git", "config", "user.email", "t@t"], cwd=mid_repo, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=mid_repo, check=True)
    (mid_repo / "f.txt").write_text("x", encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=mid_repo, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=mid_repo, check=True)
    sha = subprocess.run(["git", "-C", str(mid_repo), "rev-parse", "--short", "HEAD"],
                         capture_output=True, text=True, check=True).stdout.strip()
    class _ListApi:
        def sessions(self):
            return [row("s-mid")]
        def rpc(self, method, params, timeout=30):
            raise module.DispatchError("test: rpc 不可用（session_records 应返回 None）")
    mid_api = _ListApi()
    with contextlib.redirect_stderr(io.StringIO()) as err:
        trow, tsec = module.wait_for_turn(mid_api, "s-mid", 0, 0.0, False,
                                          target=mid_repo, head_before=sha)
    assert trow is None and tsec is None, "P0 回归：回合超时必须仍返回 (None,None)"
    assert "未变" in err.getvalue() and "中途状态" in err.getvalue(), err.getvalue()
# --allow-dirty=（空值）不得静默当全豁免，parser.error exit 2
with contextlib.redirect_stderr(io.StringIO()):
    try:
        module.main(["demo", "task.md", "--allow-dirty="])
    except SystemExit as code:
        assert code.code == 2, code.code
    else:
        raise AssertionError("P1 回归：--allow-dirty= 空值应被拒绝")

# S5（DISPATCH-143）：熄屏判定——解析器纯函数 fixtures + 本机状态契约 + CLI 不崩
_off_then_on = (
    "2026-11-04 19:00:00 +0800 Notification \tDisplay is turned off\n"
    "2026-11-04 19:35:39 +0800 Notification \tDisplay is turned on\n"
)
_on_then_off = (
    "2026-11-04 19:35:39 +0800 Notification \tDisplay is turned on\n"
    "2026-11-04 21:07:01 +0800 Notification \tDisplay is turned off\n"
)
assert module._display_state_from_log(_off_then_on) == "on", "熄屏→亮屏应为 on"
assert module._display_state_from_log(_on_then_off) == "off", "亮屏→熄屏应为 off"
assert module._display_state_from_log("2026-11-04 19:35:39 \tDisplay is turned on\n") == "on"
assert module._display_state_from_log("2026-11-04 21:07:01 \tDisplay is turned off\n") == "off"
assert module._display_state_from_log("随便的日志行\n") is None, "无转事件应 None"
_state = module.detect_screen_state()
assert _state in ("on", "off", "locked", "unknown"), _state
probe = subprocess.run([sys.argv[1], "--screen-state"], capture_output=True, text=True, timeout=30)
assert probe.returncode == 0, probe.returncode
assert probe.stdout.strip() in ("on", "off", "locked", "unknown"), probe.stdout
probe_json = subprocess.run([sys.argv[1], "--screen-state", "--json"], capture_output=True, text=True, timeout=30)
assert probe_json.returncode == 0
assert json.loads(probe_json.stdout)["screen_state"] in ("on", "off", "locked", "unknown"), probe_json.stdout

# S6（DISPATCH-144）：注入文本指向技能回执规范（状态透明化等明细在技能内，不重复内联）
agreed = module.build_prompt("demo", "S6", "dev", "任务：S6-144 冒烟\n")
assert "cross-project-dispatch/SKILL.md" in agreed, "注入文本缺技能回执规范指针"
assert "必报点" in agreed and "回执" in agreed, agreed

# M1：read_task 票据必备字段校验（目标项目/任务编号/来源/路由裁决），缺失拒发并明示缺项
with tempfile.TemporaryDirectory() as tmp:
    good = pathlib.Path(tmp) / "good.md"
    good.write_text(
        "- 目标项目：proj（/tmp/proj）\n- 任务编号：由目标自排\n- 来源：用户\n"
        "- 路由裁决（a → b）：目标 proj / 通道 awf-dispatch / 理由 role\n"
        "任务：TEST-001\n", encoding="utf-8")
    _task, _text = module.read_task(str(good))
    assert "TEST-001" in _text, _text
    bad = pathlib.Path(tmp) / "bad.md"
    bad.write_text("任务：TEST-002\n", encoding="utf-8")
    try:
        module.read_task(str(bad))
        raise AssertionError("M1：缺必备字段的票据应拒发")
    except module.DispatchError as error:
        msg = str(error)
        for key in ("目标项目", "任务编号", "来源", "路由裁决"):
            assert key in msg, msg
        assert "拒绝派发" in msg, msg
    partial = pathlib.Path(tmp) / "partial.md"
    partial.write_text(
        "- 目标项目：proj（/tmp/proj）\n- 任务编号：由目标自排\n- 来源：用户\n"
        "任务：TEST-003\n", encoding="utf-8")
    try:
        module.read_task(str(partial))
        raise AssertionError("M1：缺路由裁决应拒发")
    except module.DispatchError as error:
        assert "路由裁决" in str(error) and "目标项目" not in str(error), str(error)

# M2：--session 归属校验——其他派发者的会话拒发（串台）；本派发者会话放行；
#     非 [awf] 普通会话放行但提示风险
m2_other = FakeDispatchApi(
    [row("s-m2-other", title=module.awf_session_title("member", "TEST-009 任务"))])
m2_msg = run_dispatch(m2_other, "工作流", expect_error=True, session="s-m2-other")
assert "其他派发者" in m2_msg and "串台" in m2_msg, m2_msg
assert m2_other.prompts == [], "串台风险会话不得发送任务"

m2_own = FakeDispatchApi([row("s-m2-own", title=module.awf_session_title("lead", "TEST-001 冒烟"))])
m2_logs, _ = run_dispatch(m2_own, "工作流", session="s-m2-own")
assert m2_own.prompts and m2_own.prompts[0][0] == "s-m2-own", m2_own.prompts
assert "复用（--session 指定）" in m2_logs[0], m2_logs[0]

m2_plain = FakeDispatchApi([row("s-m2-plain", title="用户的普通会话")])
m2_plain_logs, _ = run_dispatch(m2_plain, "工作流", session="s-m2-plain")
assert m2_plain.prompts and m2_plain.prompts[0][0] == "s-m2-plain", m2_plain.prompts
assert any("风险提示" in m for m in m2_plain.emitted), m2_plain.emitted

# 实现点：dispatch_session 走 args.module / args.reuse / --session / 等待 / 旧标题改名 /
# DEV-214 并发互斥（decide_new_session + wait_session_ready + 文件锁）
session_src = inspect.getsource(module.dispatch_session)
for needle in ("args.module", "resolve_module(", "args.session",
               "select_reuse_session(", "reuse_rename_needed(",
               "api.rename(session_id, session_name)", "--new", "pressure_hint(",
               "turn_activity(", "wait_for_landing(", "git_head_sha(", "EXIT_ZOMBIE",
               "decide_new_session(", "wait_session_ready(", "project_new_lock("):
    assert needle in session_src, f"dispatch_session 缺少 {needle}"
decide_src = inspect.getsource(module.decide_new_session)
for needle in ("if args.reuse:", "select_reuse_session(", "over_limit_guard(",
               "args.allow_over_3", "api.create_session(workspace_id)",
               "api.rename(session_id, session_name)", "复用（并发重读）"):
    assert needle in decide_src, f"decide_new_session 缺少 {needle}"
wait_src = inspect.getsource(module.wait_session_ready)
for needle in ("wait_for_idle(", "args.queue_timeout", "SESSION_GONE",
               "spawn_idle_listener(", "project_awf_pool("):
    assert needle in wait_src, f"wait_session_ready 缺少 {needle}"

main_src = inspect.getsource(module.main)
for needle in ("--reuse", "--new", "--session", "--idle-wait", "--module",
               "default=DEFAULT_REUSE", "default=DEFAULT_IDLE_WAIT",
               "--session 与 --new 互斥", "--cleanup", "--forget-archived",
               "--allow-over-3", "run_cleanup(", "run_forget_archived("):
    assert needle in main_src, f"main 缺少 {needle}"

# --session 参数解析：与 --new / --headless 互斥（argparse 阶段退出 2）
for argv in (["demo", "task.md", "--session", "session-x", "--new"],
             ["demo", "task.md", "--session", "session-x", "--headless"]):
    with contextlib.redirect_stderr(io.StringIO()):
        try:
            module.main(argv)
        except SystemExit as code:
            assert code.code == 2, (argv, code.code)
        else:
            raise AssertionError(f"{argv} 应被拒绝")
PY
then
  ok "会话复用：选择不看压力 / [awf] 优先 / running 等待 / --session 互斥"
else
  bad "会话复用选择或参数断言失败"
fi

# 1.4 --prune 判定：票据解析 + commit 无 ID 但 done.md 含 ID 也算 completed
if python3 - "$DISPATCH_IMPL" <<'PY'
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
    (repo / "agent-workflow/tasks/dev/done").mkdir(parents=True, exist_ok=True)
    (repo / "agent-workflow/tasks/dev/done/DEV-007.md").write_text("## [DEV-007] 已完成\n", encoding="utf-8")

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
    assert ("done/" in items["DEV-007"]["reason"] or "done.md" in items["DEV-007"]["reason"]), items["DEV-007"]["reason"]
    assert "archive" not in items["DEV-007"], "用完即删：完成票据不再生成归档路径"
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

# 1.6 -- DEV-214 四件套：本地归档台账 / --new 上限校验 / 并发新建互斥 / --cleanup
if python3 - "$DISPATCH_IMPL" <<'PY'
import importlib.machinery
import importlib.util
import argparse
import contextlib
import io
import json
import os
import pathlib
import sys
import tempfile
import threading
import time

source = pathlib.Path(sys.argv[1])
loader = importlib.machinery.SourceFileLoader("awf_dispatch_dev214", str(source))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)

target = pathlib.Path("/tmp/dev214-proj")
project = target.name
title = module.awf_session_title("lead", "TEST-214 冒烟")
MAX = module.MAX_SENDER_SESSIONS


def row(sid, cwd=None, running=False, updated=0, title_value=None, blank=False):
    values = {"title": title_value if title_value is not None else title}
    return {
        "sessionId": sid, "cwd": str(cwd) if cwd is not None else str(target),
        "running": running, "blank": blank, "updatedAt": updated,
        "projections": {"values": values, "asOfSeq": 1},
    }


# ---- ① 本地归档台账：写出/读取/去重/排除/重置 ----
with tempfile.TemporaryDirectory() as tmp:
    original_cwd = os.getcwd()
    try:
        os.chdir(tmp)
        assert module.archived_ledger_path() == pathlib.Path.cwd() / "dispatch/archived-sessions.json", \
            "台账路径 = <cwd>/dispatch/archived-sessions.json"
        assert module.load_archived_session_ids() == set(), "无台账时为空集"
        module.record_archived_sessions([
            {"sessionId": "s-a", "project": "p1", "title": "t1"},
            {"sessionId": "s-b", "project": "p1", "title": "t2"},
        ])
        module.record_archived_sessions([
            {"sessionId": "s-a", "project": "p1", "title": "t1-dup"},
            {"sessionId": "s-c", "project": "p2", "title": "t3"},
        ])
        ids = module.load_archived_session_ids()
        assert ids == {"s-a", "s-b", "s-c"}, "台账去重后含全部归档 id"
        # 组装复用池时排除已归档会话（缺省从台账读）
        rows = [row("s-a", updated=5), row("s-b", updated=4), row("s-live", updated=9)]
        sel = module.select_reuse_session(rows, target, "工作流", sender="lead")
        assert sel is not None and sel["sessionId"] == "s-live", \
            "归档会话不得进复用池（s-a/s-b 被台账排除）"
        # 项目 [awf] 池统计同样排除
        pool_rows = [row("s-a"), row("s-b"), row("s-live", running=True)]
        pool = module.project_awf_pool(pool_rows, target)
        assert [r["sessionId"] for r in pool] == ["s-live"], "池统计排除归档 id"
        assert module.project_awf_pool(
            [row("s-live"), row("s-legacy", title_value=f"{project} · 旧"),
             row("s-other", cwd="/tmp/elsewhere")], target,
            archived_ids=set()) == [row("s-live")], "池只收同 cwd + [awf] 前缀"
        # --forget-archived 重置台账
        assert pathlib.Path("dispatch/archived-sessions.json").is_file()
        code = module.run_forget_archived(argparse.Namespace(json=False))
        assert code == 0 and not pathlib.Path("dispatch/archived-sessions.json").exists()
        assert module.load_archived_session_ids() == set(), "重置后归档 id 恢复为空"
        # 重置后 s-a 恢复进入复用池
        sel2 = module.select_reuse_session([row("s-a", updated=5)], target, "工作流", sender="lead")
        assert sel2["sessionId"] == "s-a", "重置台账后归档会话恢复可复用"
    finally:
        os.chdir(original_cwd)

# 显式 archived_ids 参数路径（不依赖本地台账）
archived_rows = [row("s-old", updated=1), row("s-new", updated=2)]
assert module.select_reuse_session(
    archived_rows, target, "工作流", sender="lead",
    archived_ids={"s-new"})["sessionId"] == "s-old", "archived_ids 参数排除生效"

# ---- ② --new 上限校验：池≥3 且全忙需 --allow-over-3，确认后留痕 ----
pool3_busy = [row(f"s-b{i}", running=True, updated=i) for i in (1, 2, 3)]
try:
    module.over_limit_guard(pool3_busy, False, json_mode=True)
    raise AssertionError("池满全忙且未确认应拒发")
except module.DispatchError as error:
    assert "--allow-over-3" in str(error) and "超项目上限" in str(error), str(error)
note = module.over_limit_guard(pool3_busy, True, json_mode=True)
assert "超上限新建" in note and "--allow-over-3" in note, "确认后返回留痕说明"
assert module.over_limit_guard([row("s-x", running=True)], True, json_mode=True) == "", "池未满不拦"
assert module.over_limit_guard(
    pool3_busy[:2] + [row("s-idle", running=False)], False, json_mode=True) == "", "池满但有空闲不拦"


class FakeDispatchApi:
    def __init__(self, rows):
        self.rows = [dict(r) for r in rows]
        self.calls = 0
        self.created = []
        self.renamed = []
        self.prompts = []

    def sessions(self):
        self.calls += 1
        return self.rows

    def create_session(self, workspace_id):
        created = row("s-created-%d" % (len(self.created) + 1))
        self.rows.append(created)
        self.created.append(created["sessionId"])
        return {"sessionId": created["sessionId"]}

    def rename(self, session_id, new_title):
        self.renamed.append((session_id, new_title))

    def prompt(self, session_id, text, request_id):
        self.prompts.append((session_id, text))

    def rpc(self, method, params, timeout=30):
        raise module.DispatchError("unknown rpc " + method)


def run_dispatch(api, task_module, reuse=True, new=False, expect_error=False,
                 allow_over_3=False, json_mode=False):
    logs = []
    output = io.StringIO()
    original = (module.preflight, module.append_log, module.emit)

    def preflight_stub(target, args, need_channel):
        return {"api": api, "workspace": {"title": "w", "workspaceId": "id"},
                "sessions": api.sessions()}

    module.preflight = preflight_stub
    module.append_log = lambda entry: logs.append(entry) or pathlib.Path("/tmp/awf-dispatch-log.md")
    emitted = []
    module.emit = lambda message, json_mode=False: emitted.append(message)
    text = (f"任务：TEST-001 冒烟\n\n- 目标项目：{project}（{target}）\n- 模块：{task_module}\n")
    args = argparse.Namespace(
        session="", reuse=reuse and not new, module="", title="", wait=False, timeout=600,
        idle_wait=300, queue_timeout=5, force=False, team=False, json=json_mode, headless=False,
        handoff=False, dry_run=False, add_workspace=False, allow_dirty=False,
        allow_active=False, apply=False, prune=False, web_url="",
        allow_legacy_reuse=False, sender="lead", new=new, allow_over_3=allow_over_3,
        cleanup=False, forget_archived=False)
    try:
        with contextlib.redirect_stdout(output):
            try:
                code = module.dispatch_session(
                    target, pathlib.Path("/tmp/TEST-001-task.md"), text,
                    f"{project} · TEST-001", "dev", args)
            except module.DispatchError as error:
                if not expect_error:
                    raise
                return str(error)
    finally:
        module.preflight, module.append_log, module.emit = original
    assert code == 0, code
    return logs, output.getvalue()


# 派发主流程：--new 遇池满全忙 → 拒绝并给出 --allow-over-3；确认后放行且日志留痕
over_api = FakeDispatchApi(pool3_busy)
over_msg = run_dispatch(over_api, "工作流", reuse=False, new=True, expect_error=True)
assert isinstance(over_msg, str) and "--allow-over-3" in over_msg, over_msg
over_ok_api = FakeDispatchApi([row("s-b1", running=True, updated=1),
                               row("s-b2", running=True, updated=2),
                               row("s-b3", running=True, updated=3)])
logs, _ = run_dispatch(over_ok_api, "工作流", reuse=False, new=True, allow_over_3=True)
assert over_ok_api.created == ["s-created-1"], over_ok_api.created
assert "超上限新建（--allow-over-3 确认）" in logs[0], "超限新建必须日志留痕"

# ---- ③ 并发新建互斥：文件锁串行化 + 锁后重读池再决策 ----
lock_path = module.project_lock_path(target)
assert lock_path.name == f".lock-{project}", lock_path
assert str(lock_path).startswith(str(pathlib.Path.cwd())), "锁文件必须位于本地 dispatch/ 下"
# 持锁期间第二个调用方阻塞，释放后拿到
held_at = []
result = []

def holder():
    with module.project_new_lock(target):
        held_at.append(time.time())
        time.sleep(0.4)

th = threading.Thread(target=holder)
th.start()
for _ in range(50):  # 等第一个拿到锁
    if held_at:
        break
    time.sleep(0.01)
assert held_at, "第一个调用方应拿到锁"
start = time.time()
with module.project_new_lock(target):
    waited = time.time() - start
assert waited >= 0.3, f"第二个调用方必须等第一个释放锁（等了 {waited:.2f}s）"
th.join()
# 锁后重读池再决策：并发方刚建出的可复用会话 → 改复用，不再重复新建
class CreateApi:
    def __init__(self):
        self.created = []
        self.renamed = []
    def create_session(self, workspace_id):
        created = row("s-concurrent-1")
        self.created.append(created["sessionId"])
        return {"sessionId": created["sessionId"]}
    def rename(self, session_id, new_title):
        self.renamed.append((session_id, new_title))

api_concurrent = CreateApi()
args_reuse = argparse.Namespace(reuse=True, force=False, allow_over_3=True, json=False)
# 第二个调用方：锁后重读看到第一个刚建的闲置会话 → 复用，零新建
decided = module.decide_new_session(
    api_concurrent, [row("s-concurrent-1", title_value=title)], target,
    "ws", args_reuse, "工作流", title, title, "lead", lambda r: False)
assert decided["reused"] is True and decided["sessionId"] == "s-concurrent-1", decided
assert decided["source"] == "复用（并发重读）" and decided["running"] is False, decided
assert api_concurrent.created == [], "重读发现可复用会话后不得新建"
# 重读看到忙碌候选 → 返回 running=True，由调用方锁外等待（不重复新建）
busy_decided = module.decide_new_session(
    api_concurrent,
    [row("s-c1", title_value=title, running=True, updated=1),
     row("s-c2", title_value=title, running=True, updated=2),
     row("s-concurrent-1", title_value=title, running=True, updated=3)],
    target, "ws", args_reuse, "工作流", title, title, "lead", lambda r: False)
assert busy_decided["reused"] is True and busy_decided["running"] is True, busy_decided
assert busy_decided["sessionId"] == "s-concurrent-1", busy_decided
# 重读后仍无候选 → 新建（自动路径同名保护：同名运行中会话需 --force 才放行新建）
dup = [row("s-dup", title_value=title, running=True, updated=5)]
try:
    module.decide_new_session(api_concurrent, dup, target, "ws", args_reuse,
                              "工作流", title, title, "lead", lambda r: False)
    raise AssertionError("同名保护应拦自动新建")
except module.DispatchError as error:
    assert "--force" in str(error), str(error)
created = module.decide_new_session(
    api_concurrent, [], target, "ws",
    argparse.Namespace(reuse=True, force=True, allow_over_3=True, json=False),
    "工作流", title, title, "lead", lambda r: False)
assert created["reused"] is False and created["source"] == "新建", created
assert created["sessionId"] == "s-concurrent-1" and api_concurrent.renamed, created

# ---- ④ --cleanup：列出每项目超 3 的空闲 [awf] 会话；--apply 归档 + 写台账 ----
clean_rows = [row("s1", updated=1), row("s2", updated=2), row("s3", running=True, updated=3),
              row("s4", updated=4), row("s5", updated=5)]
groups = module.collect_cleanup_candidates(clean_rows, archived_ids=set())
assert len(groups) == 1, groups
g = groups[0]
kept = sorted(g["keep"], key=lambda r: r["updatedAt"])
assert [r["sessionId"] for r in kept] == ["s3", "s4", "s5"], "保留最近更新 3 个（含运行中）"
assert {r["sessionId"] for r in g["candidates"]} == {"s1", "s2"}, "超限空闲为归档候选"
assert g["skipped"] == [], "运行中的 s3 属于保留，不在跳过清单"
assert module.collect_cleanup_candidates(
    [row("s-a", updated=1), row("s-b", updated=2), row("s-c", updated=3)],
    archived_ids=set()) == [], "恰好 3 个不清理"
second_project = [row("s-x", cwd="/tmp/other-proj", updated=1),
                  row("s-y", cwd="/tmp/other-proj", updated=2),
                  row("s-z", cwd="/tmp/other-proj", updated=3),
                  row("s-w", cwd="/tmp/other-proj", updated=4)]
groups2 = module.collect_cleanup_candidates(second_project, archived_ids=set())
assert len(groups2) == 1 and groups2[0]["project"] == "other-proj", groups2
assert [r["sessionId"] for r in groups2[0]["candidates"]] == ["s-x"], groups2

class CleanupApi:
    """记录 workspace/archiveSession 调用的傀儡 API。"""
    def __init__(self):
        self.archived = []
    def archive_session(self, session_id):
        self.archived.append(session_id)

with tempfile.TemporaryDirectory() as tmp:
    original_cwd = os.getcwd()
    try:
        os.chdir(tmp)
        api_c = CleanupApi()
        # dry-run：只列出，不归档、不写台账
        dry = module.cleanup_sessions(api_c, clean_rows, apply=False, json_mode=False)
        assert dry["dryRun"] is True and dry["archived"] == [] and api_c.archived == [], dry
        assert not pathlib.Path("dispatch/archived-sessions.json").exists(), "dry-run 不写台账"
        # --apply：归档候选并写台账
        applied = module.cleanup_sessions(api_c, clean_rows, apply=True, json_mode=False)
        assert applied["errors"] == [] and applied["ok"] is True, applied
        assert sorted(api_c.archived) == ["s1", "s2"], api_c.archived
        assert {e["sessionId"] for e in applied["archived"]} == {"s1", "s2"}
        assert module.load_archived_session_ids() == {"s1", "s2"}, "归档后写入台账"
        # 台账生效：s1/s2 不再进复用池；--cleanup 也不再列它们
        pool_after = module.project_awf_pool(clean_rows, target)
        assert [r["sessionId"] for r in pool_after] == ["s3", "s4", "s5"], \
            "归档会话（s1/s2）已从池排除，剩余 s3/s4/s5"
        assert module.collect_cleanup_candidates(clean_rows) == [], "已归档不再列为候选"
    finally:
        os.chdir(original_cwd)

# 清理模式 CLI 互斥：--cleanup 不接受 target/task，--apply 不能单独用
for argv in (["--cleanup", "demo", "task.md"],
             ["--cleanup", "--new"],
             ["--apply"],
             ["--forget-archived", "demo", "task.md"]):
    with contextlib.redirect_stderr(io.StringIO()):
        try:
            module.main(argv)
            raise AssertionError(f"{argv} 应被拒绝")
        except SystemExit as code:
            assert code.code == 2, (argv, code.code)
PY
then
  ok "DEV-214 四件套：归档台账 / --new 上限 / 并发互斥 / --cleanup"
else
  bad "DEV-214 四件套断言失败"
fi

# 直接用 importlib 加载源脚本，断言 build_prompt 的 --team 注入、默认异步实现点与缺省行为
if python3 - "$DISPATCH_IMPL" <<'PY'
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

printf '# 任务：TEST-001 冒烟派发\n- 目标项目：演示项目（/演示路径/演示）\n- 任务编号：由目标自排\n- 来源：用户\n- 路由裁决（派发方 → 演示项目）：目标 演示项目 / 通道 派发 / 理由 领域验证\n\n1. 只读验证。\n' > "$TMP/task.md"
( cd "$TMP" && "$DISPATCH_CLI" "$PROJ" task.md --handoff >/dev/null ) \
  && ok "handoff 生成交接单" || bad "handoff 失败"
[ -f "$TMP"/dispatch/handoff/*.md ] && ok "交接单文件存在" || bad "交接单文件缺失"
mkdir -p "$TMP/noworkflow"
if "$DISPATCH_CLI" "$TMP/noworkflow" "$TMP/task.md" --dry-run >"$TMP/out" 2>&1; then
  bad "无工作流时派发应失败"
else
  grep -q 'G1 工作流失败' "$TMP/out" && ok "无工作流时前置检查失败" || bad "无工作流时错误信息不明确"
fi

# 1.5 --prune 端到端：dry-run 不改文件 / --apply 删除（git rm 与 unlink）/ 用法错误
DISPATCH="$DISPATCH_CLI"
PRUNE="$TMP/prune"
PRUNE_TARGET="$TMP/prune-target"
mkdir -p "$PRUNE/dispatch/tasks" "$PRUNE_TARGET/agent-workflow/tasks/dev"
mkdir -p "$PRUNE_TARGET/agent-workflow/tasks/dev/done"
printf '## [DEV-101] 已完成\n' > "$PRUNE_TARGET/agent-workflow/tasks/dev/done/DEV-101.md"
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

- 目标项目：demo01（${PRUNE_TARGET}）
EOF
cat > "$PRUNE/dispatch/tasks/demo01-DEV-101-untracked.md" <<EOF
# demo01 · DEV-101 副本

- 目标项目：demo01（${PRUNE_TARGET}）
EOF
git -C "$PRUNE" add dispatch/tasks/demo01-DEV-101-tracked.md
git -C "$PRUNE" commit -qm "chore: 种子票据（只把 tracked 加入索引）"
cat > "$PRUNE/dispatch/tasks/demo01-DEV-101-untracked.md" <<EOF
# demo01 · DEV-101 副本

- 目标项目：demo01（${PRUNE_TARGET}）
EOF

if ( cd "$PRUNE" && "$DISPATCH" --prune --json > plan.json ); then
  ok "--prune dry-run 退出 0"
else
  bad "--prune dry-run 失败"
fi
if [ -f "$PRUNE/dispatch/tasks/demo01-DEV-101-tracked.md" ] && [ ! -e "$PRUNE/dispatch/archive" ]; then
  ok "dry-run 不删除文件、不建 archive"
else
  bad "dry-run 改动了票据文件"
fi
if python3 - "$PRUNE/plan.json" <<'PY'
import json
import sys

data = json.load(open(sys.argv[1], encoding="utf-8"))
assert data["mode"] == "prune", data
assert data["dryRun"] is True, data
assert data["summary"]["completed"] == 2, data["summary"]
assert data["summary"]["total"] == 2, data["summary"]
for item in data["items"]:
    assert item["status"] == "completed", item
    assert item["taskId"] == "DEV-101", item
    assert "archive" not in item, item
PY
then
  ok "--prune --json 计划字段完整（completed / 任务 ID / 无归档路径）"
else
  bad "--prune --json 计划字段不完整"
fi

if ( cd "$PRUNE" && "$DISPATCH" --prune --apply --json > apply.json ); then
  ok "--prune --apply 退出 0"
else
  bad "--prune --apply 失败"
fi
[ ! -f "$PRUNE/dispatch/tasks/demo01-DEV-101-tracked.md" ] && ok "apply 删除已跟踪票据（git rm）" || bad "已跟踪票据未删除"
[ ! -f "$PRUNE/dispatch/tasks/demo01-DEV-101-untracked.md" ] && ok "apply 删除未跟踪票据" || bad "未跟踪票据未删除"
[ ! -e "$PRUNE/dispatch/archive" ] && ok "不再产生 dispatch/archive" || bad "仍产生 dispatch/archive"
if python3 - "$PRUNE/apply.json" <<'PY'
import json
import sys

data = json.load(open(sys.argv[1], encoding="utf-8"))
assert data["dryRun"] is False, data
assert data["summary"]["deleted"] == 2, data["summary"]
assert data["summary"]["errors"] == 0, data["summary"]
PY
then
  ok "apply 汇总：删除 2、失败 0"
else
  bad "apply 汇总不符"
fi

( cd "$PRUNE" && "$DISPATCH" --prune >/dev/null ) && ok "全部删除后 dry-run 退出 0" || bad "无票据 dry-run 退出非 0"
set +e
( cd "$PRUNE" && "$DISPATCH" --prune demo01 x.md >/dev/null 2>&1 )
prune_positional=$?
( cd "$PRUNE" && "$DISPATCH" --apply >/dev/null 2>&1 )
apply_only=$?
set -e
[ "$prune_positional" = "2" ] && ok "--prune 与位置参数同用退出 2" || bad "--prune 位置参数退出码为 ${prune_positional}（期望 2）"
[ "$apply_only" = "2" ] && ok "--apply 不配 --prune 时退出 2" || bad "--apply 单独使用退出码为 ${apply_only}（期望 2）"

# 2. check 通过
( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null ) && ok "check 通过" || bad "check 未通过"

# 3. status 生成
( cd "$PROJ" && "$KIT_DIR/bin/awf" status >/dev/null )
assert_grep '## 当前进行中' "$PROJ/agent-workflow/tasks/status.md" "status 含当前进行中"

# 4. 进行中任务缺字段 → check 失败（DEV-127 目录式：current/DEV-001.md）
mkdir -p "$PROJ/agent-workflow/tasks/dev/current"
cat > "$PROJ/agent-workflow/tasks/dev/current/DEV-001.md" <<'EOF'
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
cat > "$PROJ/agent-workflow/tasks/dev/current/DEV-001.md" <<'EOF'
## [DEV-001] 补齐字段

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | active |
| Owner | agent |

### 下一步
继续。
EOF
( cd "$PROJ" && "$KIT_DIR/bin/awf" status >/dev/null )
( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null ) && ok "补齐后 check 通过" || bad "补齐后 check 未通过"

# 6. 事实文件变更 → 入口过期 → bootstrap 修复
sed -i '' 's|^purpose:.*|purpose: 变更后的定位|' "$PROJ/agent-workflow/project.yaml" 2>/dev/null \
  || sed -i 's|^purpose:.*|purpose: 变更后的定位|' "$PROJ/agent-workflow/project.yaml"
if ( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null 2>&1 ); then
  bad "project.yaml 变更后 check 应失败"
else
  ok "project.yaml 变更后 check 失败"
fi
( cd "$PROJ" && "$KIT_DIR/bin/awf" bootstrap >/dev/null )
( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null ) && ok "bootstrap 后 check 通过" || bad "bootstrap 后 check 未通过"
assert_grep '变更后的定位' "$PROJ/AGENTS.md" "入口已刷新"

# 7. --force 保留事实文件与任务账本
"$KIT_DIR/bin/awf" init "$PROJ" --name "改名" --force >/dev/null
assert_grep 'purpose: 变更后的定位' "$PROJ/agent-workflow/project.yaml" "--force 保留 project.yaml"
assert_grep 'DEV-001' "$PROJ/agent-workflow/tasks/dev/current/DEV-001.md" "--force 保留任务文件"
assert_grep '变更后的定位' "$PROJ/AGENTS.md" "--force 后入口仍同步"

# 8. 入口外内容不被覆盖
printf '\n## 团队约定\n- 保留我\n' >> "$PROJ/AGENTS.md"
( cd "$PROJ" && "$KIT_DIR/bin/awf" bootstrap >/dev/null )
assert_grep '保留我' "$PROJ/AGENTS.md" "区块外内容保留"
assert_grep 'awf:begin' "$PROJ/AGENTS.md" "受控区块仍存在"

# 9. 全局索引：init 自动登记，bootstrap 自愈刷新，--no-register 可跳过
assert_file "$DSH_AGENTS_HOME/projects.tsv" "projects.tsv"
assert_grep '冒烟项目' "$DSH_AGENTS_HOME/projects.tsv" "init 自动登记别名"
assert_grep '冒烟项目' "$DSH_AGENTS_HOME/AGENTS.md" "全局索引含别名"
( cd "$PROJ" && "$KIT_DIR/bin/awf" projects | grep -q "冒烟项目" ) && ok "projects 列出项目" || bad "projects 未列出项目"
( cd "$PROJ" && "$KIT_DIR/bin/awf" find 冒烟 | grep -q "$PROJ" ) && ok "find 返回路径" || bad "find 未返回路径"
( cd "$PROJ" && "$KIT_DIR/bin/awf" register >/dev/null )
[ "$(wc -l < "$DSH_AGENTS_HOME/projects.tsv" | tr -d ' ')" = "1" ] && ok "重复登记不产生重复行" || bad "登记出现重复行"

# bootstrap 自愈：把路径改错后刷新
sed -i '' "s|$PROJ|/wrong/path|" "$DSH_AGENTS_HOME/projects.tsv" 2>/dev/null \
  || sed -i "s|$PROJ|/wrong/path|" "$DSH_AGENTS_HOME/projects.tsv"
( cd "$PROJ" && "$KIT_DIR/bin/awf" bootstrap >/dev/null )
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
if ( cd "$PROJ" && "$KIT_DIR/bin/awf" bootstrap >/dev/null 2>&1 ); then
  bad "缺少 awf:end 时 bootstrap 未失败"
else
  ok "缺少 awf:end 时 bootstrap 失败"
fi
after_size="$(wc -c < "$PROJ/AGENTS.md" | tr -d ' ')"
[ "$before_size" = "$after_size" ] && ok "bootstrap 失败时不改写文件" || bad "bootstrap 失败时仍改写了文件"
mv "$PROJ/AGENTS.full" "$PROJ/AGENTS.md"

# 11. 非法任务 ID 必须被 check 发现
cat > "$PROJ/agent-workflow/tasks/dev/current/DEV_001.md" <<'AWFBAD'
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
rm -f "$PROJ/agent-workflow/tasks/dev/current/DEV_001.md"

# 12. 派发器：无效目标应返回退出码 2（门失败）
set +e
"$DISPATCH_CLI" no-such-project /dev/null >/dev/null 2>&1
dispatch_code=$?
set -e
[ "$dispatch_code" = "2" ] && ok "awf-dispatch 门失败退出码为 2" || bad "awf-dispatch 退出码为 ${dispatch_code}（期望 2）"

# 13. F1：check 校验状态枚举（非法值失败）
mkdir -p "$PROJ/agent-workflow/tasks/docs/current"
cat > "$PROJ/agent-workflow/tasks/docs/current/DOCS-100.md" <<'F1B'
## [DOCS-100] 非法状态

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | dream |
| Owner | t3 |

### 下一步
改正。
F1B
if out="$(cd "$PROJ" && ./agent-workflow/check_workflow.sh 2>&1)"; then
  bad "F1 非法状态值未被 check 发现"
else
  printf '%s\n' "$out" | grep -q '状态非法' && ok "F1 非法状态值被 check 拒绝" || bad "F1 非法状态值未被点名：$out"
fi
rm -f "$PROJ/agent-workflow/tasks/docs/current/DOCS-100.md"
( cd "$PROJ" && "$KIT_DIR/bin/awf" status >/dev/null )
( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null ) && ok "F1 恢复合法状态后 check 通过" || bad "F1 恢复后 check 未通过"

# 14. F2：status.md 新鲜度（账本改动后未刷新 → 过期失败；DEV-127 目录式）
mkdir -p "$PROJ/agent-workflow/tasks/debug/current"
cat > "$PROJ/agent-workflow/tasks/debug/current/DEBUG-101.md" <<'F2B'
## [DEBUG-101] 新鲜度

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | active |
| Owner | t3 |
| 现象 | x |
| 假设 | y |
| 证伪方法 | z |

### 下一步
跑 status 后复检。
F2B
if out="$(cd "$PROJ" && ./agent-workflow/check_workflow.sh 2>&1)"; then
  bad "F2 账本改动后未刷新 status.md，check 应失败"
else
  printf '%s\n' "$out" | grep -q 'status.md 已过期' && ok "F2 status 过期被 check 发现" || bad "F2 过期信息缺失：$out"
fi
( cd "$PROJ" && "$KIT_DIR/bin/awf" status >/dev/null )
( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null ) && ok "F2 刷新 status 后 check 通过" || bad "F2 刷新后 check 未通过"

# 15. F3：任务文件校验（DEV-127 目录式；非法状态/缺字段被点名）
mkdir -p "$PROJ/agent-workflow/tasks/dev/current"
cat > "$PROJ/agent-workflow/tasks/dev/current/DEV-200.md" <<'EOF'
## [DEV-200] 非法状态

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | xxx |
| Owner | t3 |

### 下一步
（待修）
EOF
if out="$(cd "$PROJ" && ./agent-workflow/check_workflow.sh 2>&1)"; then
  bad "F3 非法状态任务文件未被 check 发现"
else
  printf '%s\n' "$out" | grep -q 'DEV-200' && ok "F3 非法状态任务文件被 check 拒绝" || bad "F3 未点名：$out"
  printf '%s\n' "$out" | grep -q '状态非法' && ok "F3 指明状态非法" || bad "F3 未指明状态非法：$out"
fi
rm -f "$PROJ/agent-workflow/tasks/dev/current/DEV-200.md"
( cd "$PROJ" && "$KIT_DIR/bin/awf" status >/dev/null )
( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null ) && ok "F3 移除非法文件后 check 通过" || bad "F3 修复后 check 未通过"
mv "$PROJ/agent-workflow/tasks/debug/done/README.md" "$PROJ/agent-workflow/tasks/debug/done/README.md.hid"
if ( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null 2>&1 ); then
  bad "F3 缺 done/README.md 未被 check 发现"
else
  ok "F3 缺 done/README.md check 失败"
fi
mv "$PROJ/agent-workflow/tasks/debug/done/README.md.hid" "$PROJ/agent-workflow/tasks/debug/done/README.md"

# 15.1 F3+：旧英文表头（| Status |）→ check FAIL 且输出可直接执行的修复指引
mkdir -p "$PROJ/agent-workflow/tasks/dev/todo"
cat > "$PROJ/agent-workflow/tasks/dev/todo/DEV-102.md" <<'EOF'
## [DEV-102] 旧英文表头任务

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| Status | done |
| Owner | t3 |
EOF
if out="$(cd "$PROJ" && ./agent-workflow/check_workflow.sh 2>&1)"; then
  bad "F3+ 旧英文表头未被 check 发现"
else
  printf '%s\n' "$out" | grep -q 'DEV-102' && ok "F3+ 点名旧表头任务" || bad "F3+ 未点名：$out"
  printf '%s\n' "$out" | grep -q 'Status' && ok "F3+ 指明旧表头 Status" || bad "F3+ 未指明 Status：$out"
  printf '%s\n' "$out" | grep -q '| 状态 |' && ok "F3+ 给出 | Status | → | 状态 | 指引" || bad "F3+ 缺修复指引：$out"
fi
sed -i '' 's/| Status |/| 状态 |/' "$PROJ/agent-workflow/tasks/dev/todo/DEV-102.md" 2>/dev/null \
  || sed -i 's/| Status |/| 状态 |/' "$PROJ/agent-workflow/tasks/dev/todo/DEV-102.md"
( cd "$PROJ" && "$KIT_DIR/bin/awf" status >/dev/null )
( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null ) && ok "F3+ 按指引修复后 check 通过" || bad "F3+ 修复后 check 未通过"

# 15.2 F3+：任务文件正文引用迁移字样不污染状态列与字段检测
cat > "$PROJ/agent-workflow/tasks/dev/current/DEV-103.md" <<'EOF'
## [DEV-103] 正文含迁移字样

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | review |
| Owner | t3 |

### 目标
迁移指引正文：把 `| Status |` 改为 `| 状态 |`；归档块缺「状态」字段时补一行 `| 状态 | 完成 |`。

### 下一步
x
EOF
( cd "$PROJ" && "$KIT_DIR/bin/awf" status >/dev/null )
grep -q '| dev | DEV-103 | P1 | review | t3 | 正文含迁移字样 |' "$PROJ/agent-workflow/tasks/status.md" \
  && ok "F3+ 正文引用迁移字样不污染状态列" \
  || bad "F3+ 状态列被正文污染：$(grep 'DEV-103' "$PROJ/agent-workflow/tasks/status.md")"
( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null ) && ok "F3+ 正文引用迁移字样时 check 通过" || bad "F3+ 正文引用迁移字样时 check 失败"
rm -f "$PROJ/agent-workflow/tasks/dev/current/DEV-001.md" "$PROJ/agent-workflow/tasks/dev/current/DEV-103.md"
( cd "$PROJ" && "$KIT_DIR/bin/awf" status >/dev/null )

# 16. F4：team-flow 文档 approval 语义统一为 automatic（无 staged 审批残留）
if grep -nE '不自己批准|用户点确认|确认后创建成员|不确认就不启动' $KIT_DIR/skills/team-flow/SKILL.md >/dev/null; then
  bad "F4 team-flow 仍有 staged 审批残留：$(grep -nE '不自己批准|用户点确认|确认后创建成员|不确认就不启动' $KIT_DIR/skills/team-flow/SKILL.md | tr '\n' ';')"
else
  ok "F4 team-flow 无 staged 审批残留"
fi
grep -q 'approval=automatic' $KIT_DIR/skills/team-flow/SKILL.md && ok "F4 team-flow 保留 automatic 语义" || bad "F4 team-flow 无 automatic 语义"

# 17. F5：入口（AGENTS.md.tmpl）精简——只含路由与技能指针，细则全部下沉技能（不内联）
F5_PAT='必报点总表（DISPATCH-145|回执规则总表（DISPATCH-145|远程办公状态（remote|状态透明化（DISPATCH-144|回执投递通道（DISPATCH-146|空闲/收尾/自检报平安（DISPATCH-147'
if grep -qE "$F5_PAT" "$KIT_DIR/templates/AGENTS.md.tmpl"; then
  bad "F5 入口模板仍内联 DISPATCH 细则：$(grep -oE "$F5_PAT" "$KIT_DIR/templates/AGENTS.md.tmpl" | sort -u | tr '\n' ';')"
else
  ok "F5 入口模板无 DISPATCH 细则内联（精简为指针）"
fi
# 指针必须存在：入口指向技能 SKILL.md 与 DISPATCH.md
if grep -q '技能库' "$KIT_DIR/templates/AGENTS.md.tmpl" \
  && [ -f "$KIT_DIR/skills/cross-project-dispatch/SKILL.md" ] \
  && [ -f "$KIT_DIR/skills/team-flow/SKILL.md" ]; then
  ok "F5 入口指向技能库；流程技能文件存在"
else
  bad "F5 入口未指向技能库或流程技能缺失"
fi

# 18. F6：kit 形态副本漂移被 check 拒绝（根 → agent-workflow/ 双向）
F6R="$TMP/f6kit"
"$KIT_DIR/bin/awf" init "$F6R" --name f6 --no-register >/dev/null
mkdir -p "$F6R/bin"
cp "$KIT_DIR/bin/awf" "$F6R/bin/awf"
cp -R "$KIT_DIR/templates/." "$F6R/templates/"
chmod +x "$F6R/bin/awf"
if ( cd "$F6R" && ./agent-workflow/check_workflow.sh >/dev/null 2>&1 ); then
  ok "F6 副本一致时 check 通过"
else
  bad "F6 副本一致时 check 未通过"
fi
# DEV-184 技能化：workflows/ 不再生成，漂移测试改以 AGENTS.md.tmpl 为双向副本源
printf '\n> 本地补充内容\n' >> "$F6R/agent-workflow/templates/AGENTS.md.tmpl"
if out="$(cd "$F6R" && ./agent-workflow/check_workflow.sh 2>&1)"; then
  bad "F6 agent 侧模板漂移未被发现"
else
  printf '%s\n' "$out" | grep -q '副本漂移' && ok "F6 agent 侧副本漂移被 check 拒绝" || bad "F6 漂移信息缺失：$out"
fi
cp "$F6R/templates/AGENTS.md.tmpl" "$F6R/agent-workflow/templates/AGENTS.md.tmpl"
printf '\n> 模板新内容\n' >> "$F6R/templates/AGENTS.md.tmpl"
if out="$(cd "$F6R" && ./agent-workflow/check_workflow.sh 2>&1)"; then
  bad "F6 根侧模板漂移未被发现"
else
  printf '%s\n' "$out" | grep -q '副本漂移' && ok "F6 根侧模板漂移被 check 拒绝" || bad "F6 根侧漂移信息缺失"
fi
cp "$KIT_DIR/templates/AGENTS.md.tmpl" "$F6R/templates/AGENTS.md.tmpl"
( cd "$F6R" && ./agent-workflow/check_workflow.sh >/dev/null ) && ok "F6 恢复同步后 check 通过" || bad "F6 恢复同步后 check 未通过"

# 19. F6：release-prep 先检测漂移再覆盖（有漂移拒绝，禁止静默回滚）
RPD="$TMP/rpdrift"
"$KIT_DIR/bin/awf" init "$RPD" --name rpdrift --no-register >/dev/null
mkdir -p "$RPD/bin" "$RPD/test"
cp "$KIT_DIR/bin/awf" "$RPD/bin/awf"
cp -R "$KIT_DIR/templates/." "$RPD/templates/"
chmod +x "$RPD/bin/awf"
printf '0.0.1\n' > "$RPD/VERSION"
printf '# Changelog\n\n## [Unreleased]\n\n### Added\n- x\n' > "$RPD/CHANGELOG.md"
printf '#!/bin/sh\nexit 0\n' > "$RPD/agent-workflow/check_workflow.sh"
printf '#!/bin/sh\nexit 0\n' > "$RPD/test/smoke.sh"
chmod +x "$RPD/agent-workflow/check_workflow.sh" "$RPD/test/smoke.sh"
printf '\n> 本地发版模板改动\n' >> "$RPD/agent-workflow/templates/AGENTS.md.tmpl"
set +e
rp_out="$("$KIT_DIR/bin/awf" release-prep --root "$RPD" 0.5.0 2>&1)"
rp_code=$?
set -e
if [ "$rp_code" != "0" ] && printf '%s\n' "$rp_out" | grep -q '漂移'; then
  ok "F6 release-prep 检测漂移并拒绝覆盖"
else
  bad "F6 release-prep 未拒绝漂移（rc=${rp_code}）：$rp_out"
fi
[ "$(cat "$RPD/VERSION")" = "0.0.1" ] && ok "F6 拒绝后 VERSION 未被改写" || bad "F6 拒绝后 VERSION 被改写"
cp "$RPD/templates/AGENTS.md.tmpl" "$RPD/agent-workflow/templates/AGENTS.md.tmpl"
if ( cd "$RPD" && "$KIT_DIR/bin/awf" release-prep --root "$RPD" 0.5.0 >/dev/null 2>&1 ); then
  ok "F6 消除漂移后 release-prep 成功"
else
  bad "F6 消除漂移后 release-prep 失败"
fi

# 20. RT-1：旧格式迁移默认关闭，--allow-legacy-reuse 显式放行（帮助与文档同步）
if "$DISPATCH_CLI" --help 2>&1 | grep -q -- '--allow-legacy-reuse'; then
  ok "RT-1 --help 列出 --allow-legacy-reuse"
else
  bad "RT-1 --help 未列出 --allow-legacy-reuse"
fi
if grep -q -- '--allow-legacy-reuse' $KIT_DIR/skills/cross-project-dispatch/SKILL.md; then
  ok "RT-1 $KIT_DIR/skills/cross-project-dispatch/SKILL.md 同步 --allow-legacy-reuse"
else
  bad "RT-1 $KIT_DIR/skills/cross-project-dispatch/SKILL.md 缺 --allow-legacy-reuse"
fi

# 20.1 RT-1/2/3 单元回归（mock API / 真实 git 仓库；不接触真实会话）
if python3 - "$DISPATCH_IMPL" <<'PY'
import argparse
import contextlib
import importlib.machinery
import importlib.util
import io
import json
import os
import pathlib
import subprocess
import sys
import tempfile

source = pathlib.Path(sys.argv[1])
loader = importlib.machinery.SourceFileLoader("awf_dispatch_rt_under_test", str(source))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)


def mkrow(session_id, cwd, title="", running=False, blank=False):
    return {"sessionId": session_id, "cwd": cwd, "running": running, "blank": blank,
            "updatedAt": 1,
            "projections": {"values": {"title": title}, "asOfSeq": 1}}


class FakeApi:
    def __init__(self, rows, page=None):
        self.rows = rows
        self.page = page if page is not None else {"records": []}
        self.created = []
        self.renamed = []
        self.prompts = []

    def sessions(self):
        return self.rows

    def rpc(self, method, params, timeout=30):
        if method != "session/page":
            raise module.DispatchError(f"未知 RPC：{method}")
        return self.page

    def create_session(self, workspace_id):
        sid = f"s-created-{len(self.created) + 1}"
        self.created.append(sid)
        return {"sessionId": sid}

    def rename(self, session_id, title):
        self.renamed.append((session_id, title))

    def prompt(self, session_id, text, request_id):
        self.prompts.append((session_id, text))


class BrokenPageApi(FakeApi):
    def rpc(self, method, params, timeout=30):
        raise module.DispatchError("page 不可用")


with tempfile.TemporaryDirectory() as tmp:
    proj = pathlib.Path(tmp) / "proj"
    proj.mkdir()
    module_awf = "工作流"
    canonical = module.awf_session_title("lead", "TEST-001 冒烟")
    legacy = mkrow("s-legacy", str(proj), title=f"{proj.name} · 旧任务")
    user = mkrow("s-user", str(proj), title=f"{proj.name} · 用户的分析记录")

    # RT-1：用户普通会话默认不迁移；probe 确认才迁移
    assert module.select_reuse_session([user], proj, module_awf) is None, \
        "RT-1 默认不得复用用户自建 <项目> · xxx 会话"
    assert module.select_reuse_session([legacy], proj, module_awf) is None, \
        "RT-1 旧格式默认不自动迁移"
    assert module.select_reuse_session([legacy], proj, module_awf,
                                       legacy_probe=lambda r: True)["sessionId"] == "s-legacy"
    assert module.select_reuse_session([legacy], proj, module_awf,
                                       legacy_probe=lambda r: False) is None

    # RT-1：标记探子——消息含派发任务包标记 → True；无标记/读不到 → False
    marker = {"records": [{"event": {"type": "user/message", "seq": 1, "data": {
        "message": {"content": [{"type": "text", "text": "----- 任务包开始 -----\n任务：TEST-1"}]}}}}]}
    assert module.session_has_dispatch_marker(FakeApi([], page=marker), legacy) is True
    assert module.session_has_dispatch_marker(FakeApi([], page={"records": []}), legacy) is False
    assert module.session_has_dispatch_marker(BrokenPageApi([]), legacy) is False, \
        "读不到记录不得赌迁移"

    # RT-1：派发主流程——无标记的用户会话不迁移（新建、不注入）；
    # 有标记 / --allow-legacy-reuse 才迁移复用并改名
    def run_dispatch_rows(api, allow_legacy=False):
        logs = []
        original = (module.preflight, module.append_log, module.emit)
        module.preflight = lambda target, args, need_channel: {
            "api": api, "workspace": {"title": "w", "workspaceId": "id"}, "sessions": api.rows}
        module.append_log = lambda entry: logs.append(entry) or pathlib.Path("/tmp/awf-dispatch-log.md")
        module.emit = lambda message, json_mode=False: None
        args = argparse.Namespace(
            session="", reuse=True, module="", title="", wait=False, timeout=600,
            idle_wait=300, queue_timeout=60, force=False, team=False, json=True, headless=False,
            handoff=False, dry_run=False, add_workspace=False, allow_dirty=False,
            allow_active=False, apply=False, prune=False, web_url="",
            allow_legacy_reuse=allow_legacy, sender="lead")
        text = f"任务：TEST-001 冒烟\n\n- 目标项目：{proj.name}（{proj}）\n- 模块：{module_awf}\n"
        with contextlib.redirect_stdout(io.StringIO()):
            code = module.dispatch_session(
                proj, pathlib.Path("/tmp/TEST-001-task.md"), text,
                f"{proj.name} · TEST-001", "dev", args)
        module.preflight, module.append_log, module.emit = original
        return code, logs

    api = FakeApi([user])
    code, _ = run_dispatch_rows(api)
    assert code == 0 and api.created == ["s-created-1"], "用户会话不得迁移，必须新建"
    assert all(sid != "s-user" for sid, _ in api.renamed), "用户会话不得被改名（RT-1）"
    assert all(sid != "s-user" for sid, _ in api.prompts), "用户会话不得被注入任务（RT-1）"
    assert api.prompts and api.prompts[0][0] == "s-created-1", api.prompts

    api2 = FakeApi([mkrow("s-legacy-m", str(proj), title=f"{proj.name} · 旧任务")],
                   page=marker)
    code, _ = run_dispatch_rows(api2)
    assert code == 0 and api2.created == [] and api2.prompts[0][0] == "s-legacy-m", \
        "含派发标记的旧会话应迁移复用（RT-1）"
    assert ("s-legacy-m", canonical) in api2.renamed

    api3 = FakeApi([mkrow("s-legacy-f", str(proj), title=f"{proj.name} · 旧任务")])
    code, _ = run_dispatch_rows(api3, allow_legacy=True)
    assert code == 0 and api3.created == [] and api3.prompts[0][0] == "s-legacy-f", \
        "--allow-legacy-reuse 应迁移复用（RT-1）"

    # RT-2：headless --wait 非零退出 → 独立退出码 5；退出 0 仍走落地校验
    class FakeProc:
        def __init__(self, outcome):
            self.pid = 4242
            self._outcome = outcome

        def wait(self, timeout=None):
            if isinstance(self._outcome, BaseException):
                raise self._outcome
            return self._outcome

    head_orig = (module.preflight, module.append_log, module.emit,
                 module.git_head_sha, module.git_head, module.wait_for_landing,
                 module.subprocess.Popen, os.environ.get("DSH_BIN"))
    module.preflight = lambda target, args, need_channel: {"api": None, "workspace": {}, "sessions": []}
    module.append_log = lambda entry: pathlib.Path("/tmp/awf-dispatch-log.md")
    module.emit = lambda message, json_mode=False: None
    module.git_head_sha = lambda target: "aaaa"
    module.git_head = lambda target: "aaaa (HEAD -> main)"
    module.subprocess.Popen = lambda *a, **k: FakeProc(7)
    os.environ["DSH_BIN"] = "/bin/sh"
    landing_calls = []
    module.wait_for_landing = lambda target, task_id, initial_head, remaining: (
        landing_calls.append({"task_id": task_id, "initial_head": initial_head}) or "commit")

    def dispatch_headless_case(task_name, proc_outcome, wait_landing, timeout=5,
                               body="任务：任务\n"):
        landing_calls.clear()
        module.subprocess.Popen = lambda *a, **k: FakeProc(proc_outcome)
        module.wait_for_landing = wait_landing
        args = argparse.Namespace(
            session="", reuse=True, module="", title="", wait=True, timeout=timeout,
            idle_wait=300, queue_timeout=60, force=False, team=False, json=True, headless=True,
            handoff=False, dry_run=False, add_workspace=False, allow_dirty=False,
            allow_active=False, apply=False, prune=False, web_url="",
            allow_legacy_reuse=False, sender="lead")
        with tempfile.TemporaryDirectory() as work, \
             contextlib.redirect_stdout(io.StringIO()):
            old_cwd = os.getcwd()
            os.chdir(work)
            try:
                task = pathlib.Path(work) / task_name
                task.write_text(body, encoding="utf-8")
                code = module.dispatch_headless(
                    pathlib.Path(work) / "tgt", task, body,
                    "headless 任务", args)
            finally:
                os.chdir(old_cwd)
        return code

    # 非零退出：独立码 5，不进落地校验
    code = dispatch_headless_case("TEST-101-task.md", 7, lambda *a, **k: "commit")
    assert code == module.EXIT_HEADLESS_FAIL == 5, f"非零退出应变 5，实际 {code}"
    assert landing_calls == [], "非零退出不得走落地校验（RT-2）"

    # 退出 0：仍走 wait_for_landing，初始 HEAD 在启动前采集（RT-3 同契约）
    module.subprocess.Popen = lambda *a, **k: FakeProc(0)
    code = dispatch_headless_case("TEST-102-task.md", 0,
                                  lambda target, task_id, initial_head, remaining: (
                                      landing_calls.append({"task_id": task_id,
                                                            "initial_head": initial_head}) or "commit"))
    assert code == module.EXIT_OK == 0, code
    assert landing_calls and landing_calls[0]["task_id"] == "TEST-102", landing_calls
    assert landing_calls[0]["initial_head"] == "aaaa", \
        "初始 HEAD 必须在进程启动前采集（RT-2/RT-3）"

    # 退出 0 但未落地：按超时语义返回 3（不假装成功）
    seen = []
    code = dispatch_headless_case(
        "TEST-103-task.md", 0,
        lambda target, task_id, initial_head, remaining: (seen.append(task_id) or None))
    assert code == module.EXIT_TIMEOUT == 3, code
    assert seen == ["TEST-103"], "退出 0 后必须校验落地（RT-2）"

    # 进程等待超时仍为 3
    code = dispatch_headless_case(
        "TEST-104-task.md", subprocess.TimeoutExpired("dsh", 5),
        lambda *a, **k: "commit")
    assert code == module.EXIT_TIMEOUT == 3, "headless 进程超时仍为 3"

    # task_id 正文回退：文件名无 ID 时取票据正文（与会话模式对齐）
    body_calls = []
    code = dispatch_headless_case(
        "plain-task.md", 0,
        lambda target, task_id, initial_head, remaining: (
            body_calls.append(task_id) or "commit"),
        body="任务：TEST-305 冒烟\n\n- 目标项目：demo（/tmp/demo）\n- 模块：工作流\n")
    assert code == module.EXIT_OK == 0, code
    assert body_calls == ["TEST-305"], f"文件名无 ID 应回退正文取 ID，实际 {body_calls}"

    (module.preflight, module.append_log, module.emit,
     module.git_head_sha, module.git_head, module.wait_for_landing,
     module.subprocess.Popen) = head_orig[:7]
    if head_orig[7] is None:
        os.environ.pop("DSH_BIN", None)
    else:
        os.environ["DSH_BIN"] = head_orig[7]

    # RT-3：wait_for_landing 落地归因（真实 git 仓库）
    with tempfile.TemporaryDirectory() as repo_tmp:
        repo = pathlib.Path(repo_tmp) / "repo"
        repo.mkdir()
        subprocess.run(["git", "init", "-q", str(repo)], check=True)
        subprocess.run(["git", "-C", str(repo), "config", "user.email", "smoke@test"], check=True)
        subprocess.run(["git", "-C", str(repo), "config", "user.name", "smoke"], check=True)
        (repo / "a.txt").write_text("a", encoding="utf-8")
        subprocess.run(["git", "-C", str(repo), "add", "a.txt"], check=True)
        subprocess.run(["git", "-C", str(repo), "commit", "-qm", "fix: TEST-201 落地"], check=True)
        base = module.git_head_sha(repo)
        assert base and len(base) == 40
        assert module.wait_for_landing(repo, "TEST-201", "", timeout=0.1, interval=0.01) == "commit"

        (repo / "b.txt").write_text("b", encoding="utf-8")
        subprocess.run(["git", "-C", str(repo), "add", "b.txt"], check=True)
        subprocess.run(["git", "-C", str(repo), "commit", "-qm", "chore: 用户无关提交"], check=True)
        assert module.commit_range_has_id(repo, "TEST-201", base) is False
        assert module.commit_range_has_id(repo, "TEST-999", base) is False
        assert module.wait_for_landing(repo, "TEST-201", base, timeout=0.1, interval=0.01) is None, \
            "无关 commit 不得判落地（RT-3）"

        (repo / "c.txt").write_text("c", encoding="utf-8")
        subprocess.run(["git", "-C", str(repo), "add", "c.txt"], check=True)
        subprocess.run(["git", "-C", str(repo), "commit", "-qm", "fix: TEST-202 完成"], check=True)
        assert module.wait_for_landing(repo, "TEST-202", base, timeout=0.1, interval=0.01) == "commit", \
            "含任务 ID 的 commit 才判落地（RT-3）"

        # RT-3 区间归因（P2）：任务 commit 落地后被无关 commit 压顶（<10s 轮询窗口）
        # → initial..HEAD 区间归因仍判落地，不误判 not landed
        buried = pathlib.Path(repo_tmp) / "buried"
        buried.mkdir()
        subprocess.run(["git", "init", "-q", str(buried)], check=True)
        subprocess.run(["git", "-C", str(buried), "config", "user.email", "smoke@test"], check=True)
        subprocess.run(["git", "-C", str(buried), "config", "user.name", "smoke"], check=True)
        (buried / "seed.txt").write_text("s", encoding="utf-8")
        subprocess.run(["git", "-C", str(buried), "add", "seed.txt"], check=True)
        subprocess.run(["git", "-C", str(buried), "commit", "-qm", "chore: 基线"], check=True)
        base_buried = module.git_head_sha(buried)
        (buried / "t.txt").write_text("t", encoding="utf-8")
        subprocess.run(["git", "-C", str(buried), "add", "t.txt"], check=True)
        subprocess.run(["git", "-C", str(buried), "commit", "-qm", "fix: TEST-301 落地"], check=True)
        for i in (1, 2):  # 任务 commit 落地后 10s 内被两个无关 commit 压顶
            (buried / f"n{i}.txt").write_text(f"n{i}", encoding="utf-8")
            subprocess.run(["git", "-C", str(buried), "add", f"n{i}.txt"], check=True)
            subprocess.run(["git", "-C", str(buried), "commit", "-qm", "chore: 无关压顶"], check=True)
        assert module.commit_range_has_id(buried, "TEST-301", base_buried) is True, \
            "区间内含任务 commit 即命中（区间归因）"
        assert module.wait_for_landing(buried, "TEST-301", base_buried, timeout=0.1, interval=0.01) == "commit", \
            "任务 commit 被压顶仍判落地（RT-3 区间归因）"

        # 对照：区间内只有无关 commit 仍不判落地
        buried2 = pathlib.Path(repo_tmp) / "buried2"
        buried2.mkdir()
        subprocess.run(["git", "init", "-q", str(buried2)], check=True)
        subprocess.run(["git", "-C", str(buried2), "config", "user.email", "smoke@test"], check=True)
        subprocess.run(["git", "-C", str(buried2), "config", "user.name", "smoke"], check=True)
        (buried2 / "seed.txt").write_text("s", encoding="utf-8")
        subprocess.run(["git", "-C", str(buried2), "add", "seed.txt"], check=True)
        subprocess.run(["git", "-C", str(buried2), "commit", "-qm", "chore: 基线"], check=True)
        base_b2 = module.git_head_sha(buried2)
        for i in (1, 2):
            (buried2 / f"n{i}.txt").write_text(f"n{i}", encoding="utf-8")
            subprocess.run(["git", "-C", str(buried2), "add", f"n{i}.txt"], check=True)
            subprocess.run(["git", "-C", str(buried2), "commit", "-qm", "chore: 纯无关"], check=True)
        assert module.commit_range_has_id(buried2, "TEST-301", base_b2) is False
        assert module.wait_for_landing(buried2, "TEST-301", base_b2, timeout=0.1, interval=0.01) is None, \
            "区间内无任务 commit 不得判落地"
PY
then
  ok "RT-1/2/3 单元回归全绿（用户会话不迁移 / headless 独立退出码 / 无关 commit 不落地）"
else
  bad "RT-1/2/3 单元回归失败（见上方 Traceback）"
fi

# 20.2 RT-2：$KIT_DIR/skills/cross-project-dispatch/SKILL.md 退出码表同步 headless 独立码（5）
if grep -q '^| 5 |' $KIT_DIR/skills/cross-project-dispatch/SKILL.md && grep -q '非零退出' $KIT_DIR/skills/cross-project-dispatch/SKILL.md; then
  ok "RT-2 $KIT_DIR/skills/cross-project-dispatch/SKILL.md 退出码表含 5（headless 非零退出）"
else
  bad "RT-2 $KIT_DIR/skills/cross-project-dispatch/SKILL.md 退出码表未同步 headless 独立码"
fi
if grep -q '含本任务 ID' $KIT_DIR/skills/cross-project-dispatch/SKILL.md; then
  ok "RT-3 $KIT_DIR/skills/cross-project-dispatch/SKILL.md 落地判定含 commit 归因"
else
  bad "RT-3 $KIT_DIR/skills/cross-project-dispatch/SKILL.md 未写明 commit 归因"
fi

# 21. DEV-115 激活式路由：票据来源校验（ticket_source 解析 + 禁止转派 + 旧票据兼容）
if python3 - "$DISPATCH_IMPL" <<'PY'
import contextlib
import importlib.machinery
import importlib.util
import io
import pathlib
import sys
import tempfile

source = pathlib.Path(sys.argv[1])
loader = importlib.machinery.SourceFileLoader("awf_dispatch_source_under_test", str(source))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)

# ticket_source：缺失 / 用户 → user（向后兼容）；工作流 → workflow
missing = "任务：TEST-1\n\n- 目标项目：proj（/tmp/proj）\n"
assert module.ticket_source(missing) == "user", "缺省来源必须视为用户（向后兼容）"
assert module.ticket_source("- 来源：用户\n任务：TEST-1\n") == "user"
assert module.ticket_source("任务：TEST-1\n\n- 来源：工作流\n- 模块：工作流\n") == "workflow"
assert module.ticket_source("任务：TEST-1\n\n- 来源：Workflow\n") == "workflow"
assert module.ticket_source("任务：TEST-1\n\n- 来源: wf\n") == "workflow"
assert module.ticket_source("任务：TEST-1（来源：用户确认）\n") == "user", "非头部行不得误判"

original_resolve = module.resolve_target
try:
    def run_main(ticket, label):
        err = io.StringIO()
        out = io.StringIO()
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
            code = module.main(["proj", str(ticket), "--dry-run"])
        return code, err.getvalue(), out.getvalue()

    with tempfile.TemporaryDirectory(suffix="-d115") as tmp:
        tmpdir = pathlib.Path(tmp)
        module.resolve_target = lambda value: tmpdir

        # DEV-128：来源=工作流 的票据允许继续转派（去掉禁转派硬 FAIL）；派发时
        # 提示核对转派理由与路由裁决（非阻塞），流程继续走 dry-run 到 G1 预检门
        wf_ticket = pathlib.Path("/tmp/awf-d115-source-workflow.md")
        wf_ticket.write_text("任务：DEV-115 转派\n\n- 目标项目：proj（/tmp/proj）\n"
                             "- 任务编号：由目标自排\n- 来源：工作流\n"
                             "- 路由裁决（kit → proj）：目标 proj / 通道 awf-dispatch / 理由 测试\n",
                             encoding="utf-8")
        code, err, out = run_main(wf_ticket, "workflow")
        assert "禁止转派" not in err, "DEV-128 已移除禁转派 FAIL（不得再出现禁止转派错误）"
        assert "深层转派" in out, f"DEV-128 应提示深层转派（非阻塞），实际 out={out!r}"
        assert code == module.EXIT_FAIL, code  # dry-run 走到 G1 预检失败（非来源拦截）
        assert "G1 工作流失败" in err, err

        # 无来源旧票据不受来源校验影响：走正常前置检查（G1 门失败，非来源拦截）
        old_ticket = pathlib.Path("/tmp/awf-d115-source-old.md")
        old_ticket.write_text("任务：DEV-115 旧票据\n\n- 目标项目：proj（/tmp/proj）\n"
                              "- 任务编号：由目标自排\n- 来源：用户\n"
                              "- 路由裁决（kit → proj）：目标 proj / 通道 awf-dispatch / 理由 测试\n",
                              encoding="utf-8")
        code2, err2, out2 = run_main(old_ticket, "old")
        assert code2 == module.EXIT_FAIL, code2
        assert "禁止转派" not in err2 and "深层转派" not in out2, "旧票据（来源=用户）不得有深层转派提示"
        assert "G1 工作流失败" in err2, err2
finally:
    module.resolve_target = original_resolve
PY
then
  ok "DEV-115 票据来源校验：解析正确 / 工作流来源二次派发被拒 / 旧票据兼容"
else
  bad "DEV-115 票据来源校验失败（见上方 Traceback）"
fi

# 21.2 DEV-115 + DEV-128：协议规则同步（模板路由段 / 流程与派发文档 / 设计文档）
if grep -q '来源：用户 | 工作流' "$KIT_DIR/skills/cross-project-dispatch/SKILL.md" \
   && grep -q '继续转派' "$KIT_DIR/skills/cross-project-dispatch/SKILL.md"; then
  ok "DEV-128 跨项目技能含票据来源字段与继续转派语义"
else
  bad "DEV-128 跨项目技能缺少票据来源/继续转派"
fi
if grep -q '按需继续向下一层' "$KIT_DIR/docs/design.md" \
   && grep -q '深度不限' "$KIT_DIR/docs/design.md"; then
  ok "DEV-128 $KIT_DIR/docs/design.md 拓扑/示意同步深度放开"
else
  bad "DEV-128 $KIT_DIR/docs/design.md 未同步深度放开"
fi
if grep -q '激活派发' "$KIT_DIR/docs/design.md" \
   && grep -q '转派被拒' "$KIT_DIR/docs/design.md"; then
  ok "DEV-115 $KIT_DIR/docs/design.md 含两段示意（激活派发 / 转派被拒）"
else
  bad "DEV-115 $KIT_DIR/docs/design.md 缺少两段示意"
fi

# 22. DEV-117：默认 locale 下中文任务块解析（macOS awk 20200816 en_US.UTF-8 中文 == 恒真防回归）
# 根因：en_US.UTF-8 下多字节中文 `==` 比较恒真（"状态"=="字段"→1），把
# `| 证伪方法 | z |` 的 z 误当状态 → check 报「状态非法：z」。
# 修复：awf 内所有 awk 统一以 LC_ALL=C 包装（awfk），比较退回字节语义。
mkdir -p "$PROJ/agent-workflow/tasks/debug/current"
cat > "$PROJ/agent-workflow/tasks/debug/current/DEBUG-200.md" <<'D117'
## [DEBUG-200] locale 解析回归

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | active |
| Owner | t |
| 现象 | x |
| 假设 | y |
| 证伪方法 | z |

### 下一步
验证默认 locale 下解析正确。
D117
( cd "$PROJ" && "$KIT_DIR/bin/awf" status >/dev/null )

dev117_locale_check() {
  # $1 = LC_ALL 值；空串 = 继承调用环境（即"默认 locale"，不强制 LC_ALL=C）
  local lc="$1" tag log
  tag="${lc:-default}"
  log="$TMP/d117-$tag.log"
  if ( cd "$PROJ" && LC_ALL="$lc" ./agent-workflow/check_workflow.sh ) >"$log" 2>&1; then
    if grep -q '状态非法：z' "$log"; then
      bad "DEV-117 [$tag] 中文任务块被误判：状态非法：z"
    else
      ok "DEV-117 [$tag] 中文任务块解析正确（证伪方法 z 不再误当状态）"
    fi
  else
    bad "DEV-117 [$tag] check 未通过（见 ${log}）"
  fi
}
dev117_locale_check ""          # 默认 locale（继承当前环境，不强制 LC_ALL=C）
if locale -a 2>/dev/null | grep -qx 'en_US.UTF-8'; then
  dev117_locale_check en_US.UTF-8   # 复现 bug 的 locale：修复后必须同样正确
else
  ok "DEV-117 跳过 en_US.UTF-8 专项（系统无该 locale）"
fi

# 22.1 check --with-smoke 开关与默认末尾提示
if "$KIT_DIR/bin/awf" check --help 2>&1 | grep -q -- '--with-smoke'; then
  ok "DEV-117 check --help 列出 --with-smoke"
else
  bad "DEV-117 check --help 未列出 --with-smoke"
fi
if ( cd "$KIT_DIR" && ./bin/awf check ) 2>&1 | grep -q '请运行 bash test/smoke.sh'; then
  ok "DEV-117 check 默认输出末尾提示跑 smoke（kit 形态）"
else
  bad "DEV-117 check 默认未提示跑 smoke"
fi

# 22.2 install-hooks：模板存在 / 安装 / 检查 / 脏账本拒绝提交 / 卸载
assert_file "$KIT_DIR/templates/pre-commit" "templates/pre-commit"
assert_file "$PROJ/agent-workflow/templates/pre-commit" "init 复制的 pre-commit 模板"
git init -q "$PROJ" 2>/dev/null || true
if ( cd "$PROJ" && "$KIT_DIR/bin/awf" install-hooks --check 2>&1 | grep -q 'NONE' ); then
  ok "DEV-117 install-hooks --check 识别未安装状态"
else
  bad "DEV-117 install-hooks --check 未识别未安装状态"
fi
if ( cd "$PROJ" && "$KIT_DIR/bin/awf" install-hooks >/dev/null 2>&1 ) \
   && [ -x "$PROJ/.git/hooks/pre-commit" ]; then
  ok "DEV-117 install-hooks 安装成功且可执行"
else
  bad "DEV-117 install-hooks 安装失败"
fi
if ( cd "$PROJ" && "$KIT_DIR/bin/awf" install-hooks --check 2>&1 | grep -q '已安装且与模板一致' ); then
  ok "DEV-117 install-hooks --check 确认已安装且与模板一致"
else
  bad "DEV-117 install-hooks --check 安装状态不符"
fi
# 构造脏账本（缺状态字段 + status 过期）→ 直接执行钩子应拒绝并输出中文提示
cat > "$PROJ/agent-workflow/tasks/dev/current/DEV-201.md" <<'D117D'
## [DEV-201] 脏块（缺状态）

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| Owner | t |
D117D
if ( cd "$PROJ" && ./.git/hooks/pre-commit ) >"$TMP/d117-hook.log" 2>&1; then
  bad "DEV-117 脏账本未被钩子拒绝"
else
  if grep -q '拒绝本次提交' "$TMP/d117-hook.log"; then
    ok "DEV-117 钩子拒绝脏账本提交（含中文提示）"
  else
    bad "DEV-117 钩子拒绝了但缺中文提示（见 $TMP/d117-hook.log）"
  fi
fi
if ( cd "$PROJ" && "$KIT_DIR/bin/awf" install-hooks --uninstall >/dev/null 2>&1 ) \
   && [ ! -f "$PROJ/.git/hooks/pre-commit" ]; then
  ok "DEV-117 install-hooks --uninstall 卸载成功"
else
  bad "DEV-117 install-hooks --uninstall 卸载失败"
fi
rm -f "$PROJ/agent-workflow/tasks/dev/current/DEV-201.md"
( cd "$PROJ" && "$KIT_DIR/bin/awf" status >/dev/null )

# 23. DEV-118：worker 名牌（role 自述 + find/projects/register 带出）
# init 项目 yaml 无 role 键（DEV-119 后模板不再预置空 role: 行）→ find 回退 name，输出三列
if ( cd "$PROJ" && "$KIT_DIR/bin/awf" find 冒烟 ) 2>&1 \
   | grep -Eq '^[^	]+	[^	]+	[^	]+$'; then
  ok "DEV-118 find 输出三列（id/路径/role），role 缺省不报错"
else
  bad "DEV-118 find 输出未达三列或缺省 role 报错"
fi
if ( cd "$PROJ" && "$KIT_DIR/bin/awf" find 冒烟 2>&1 | grep -q '冒烟项目' ); then
  ok "DEV-118 find 缺省 role 回退到 name（冒烟项目）"
else
  bad "DEV-118 find 缺省 role 未回退到 name"
fi

# 23.1 DEV-119/121：模板源无字面空 role 键（防吞值回归）；init 缺省保留空 role 键（方案 B 跳过空值）
if grep -q '^role: *$' "$KIT_DIR/templates/project.yaml.tmpl"; then
  bad "DEV-119 模板源含字面空 role: 键（会吞用户后填值）"
else
  ok "DEV-119 模板源无字面空 role: 键（防回归，改为 {{ROLE}} 占位）"
fi
if grep -q '^role: *$' "$PROJ/agent-workflow/project.yaml"; then
  ok "DEV-121 init 缺省保留空 role: 键（解析跳过空值，不报错）"
else
  bad "DEV-121 init 缺省未保留空 role 键"
fi
# 追加第二行 role（模拟用户后填）→ find 立即输出该 role，不再回退 name
printf '\nrole: 生成脚手架并维护任务账本\n' >> "$PROJ/agent-workflow/project.yaml"
( cd "$PROJ" && "$KIT_DIR/bin/awf" bootstrap >/dev/null )
if ( cd "$PROJ" && "$KIT_DIR/bin/awf" find 冒烟 | grep -q '生成脚手架并维护任务账本' ); then
  ok "DEV-119 后填 role（追加行）find 立即带出，不被空行吞掉"
else
  bad "DEV-119 后填 role 未生效（空行吞值回归）"
fi
# projects 表格含角色列并带出 role；register 报已登记名牌
if ( cd "$PROJ" && "$KIT_DIR/bin/awf" projects | grep -q '角色' ) \
   && ( cd "$PROJ" && "$KIT_DIR/bin/awf" projects | grep -q '生成脚手架并维护任务账本' ); then
  ok "DEV-118 projects 表格含「角色」列并带出 role"
else
  bad "DEV-118 projects 表格缺角色列/role"
fi
if ( cd "$PROJ" && "$KIT_DIR/bin/awf" register 2>&1 | grep -q '已登记 worker 名牌' ); then
  ok "DEV-118 register 对已有 role 项目提示已登记名牌"
else
  bad "DEV-118 register 名牌提示缺失"
fi

# 23.2 DEV-119：仅空 role / 无数值 role → find 仍回退 name（不回归）
PROJ3="$TMP/proj3"
"$KIT_DIR/bin/awf" init "$PROJ3" --name "空角色项目" >/dev/null 2>&1 || true
if ( cd "$PROJ3" && "$KIT_DIR/bin/awf" find 空角色 2>&1 | grep -q '空角色项目' ); then
  ok "DEV-119 无数值 role 时 find 回退 name（不回归）"
else
  bad "DEV-119 无数值 role 未回退 name"
fi
printf 'role: \n' >> "$PROJ3/agent-workflow/project.yaml"   # 模拟旧模板遗留空键
if ( cd "$PROJ3" && "$KIT_DIR/bin/awf" find 空角色 2>&1 | grep -q '空角色项目' ); then
  ok "DEV-119 仅空 role 键时 find 仍回退 name（解析跳过空值）"
else
  bad "DEV-119 仅空 role 键未回退 name"
fi
# 双 role 键（旧项目：空行在前、有值在后）→ 取第一个有值项
printf 'role: 双键兜底取值\n' >> "$PROJ3/agent-workflow/project.yaml"
if ( cd "$PROJ3" && "$KIT_DIR/bin/awf" find 空角色 | grep -q '双键兜底取值' ); then
  ok "DEV-119 双 role 键 yaml 取到有值项（旧项目兼容）"
else
  bad "DEV-119 双 role 键未取到有值项"
fi

# 23.3 DEV-121：init --role 初始化即登记能力名牌；缺省给出填写提示（保留空键，find 回退）
PROJ4="$TMP/proj4"
"$KIT_DIR/bin/awf" init "$PROJ4" --name "能力项目" --role "擅长冒烟测试" > "$TMP/proj4-init.log" 2>&1
if grep -q '^role: 擅长冒烟测试$' "$PROJ4/agent-workflow/project.yaml"; then
  ok "DEV-121 init --role 写入 project.yaml 的 role 字段"
else
  bad "DEV-121 init --role 未写入 role 字段"
fi
if ( cd "$PROJ4" && "$KIT_DIR/bin/awf" find 能力项目 | grep -q '擅长冒烟测试' ); then
  ok "DEV-121 init --role 后 find 立即带出能力自述"
else
  bad "DEV-121 init --role 后 find 未带出能力自述"
fi
if ( cd "$PROJ4" && ./agent-workflow/check_workflow.sh >/dev/null 2>&1 ); then
  ok "DEV-121 init --role 项目 check 通过"
else
  bad "DEV-121 init --role 项目 check 未通过"
fi
if ! grep -q '填写本项目的 worker 能力自述' "$TMP/proj4-init.log"; then
  ok "DEV-121 有 role 时 init 不输出填写提示"
else
  bad "DEV-121 有 role 时仍输出填写提示"
fi
PROJ5="$TMP/proj5"
"$KIT_DIR/bin/awf" init "$PROJ5" --name "缺省能力" > "$TMP/proj5-init.log" 2>&1
if grep -q '填写本项目的 worker 能力自述' "$TMP/proj5-init.log"; then
  ok "DEV-121 init 缺省 role 时给出填写提示"
else
  bad "DEV-121 init 缺省 role 未给填写提示"
fi
if grep -q '^role: *$' "$PROJ5/agent-workflow/project.yaml" \
   && ( cd "$PROJ5" && "$KIT_DIR/bin/awf" find 缺省能力 2>&1 | grep -q '缺省能力' ); then
  ok "DEV-121 init 缺省保留空 role 键且 find fallback name"
else
  bad "DEV-121 init 缺省空 role 键/fallback 异常"
fi

# 24. DEV-122：派发规则同步 role（--check-role 软校验 + 决策三件套含 role）
# 24.0 构造三场景任务文件（匹配 / 不匹配）
ROLE_TASK_DIR="$TMP/role-tasks"; mkdir -p "$ROLE_TASK_DIR"
printf '# 任务：执行冒烟测试并生成测试报告\n- 目标项目：演示项目（/演示路径/演示）\n- 任务编号：由目标自排\n- 来源：用户\n- 路由裁决（派发方 → 演示项目）：目标 演示项目 / 通道 派发 / 理由 领域验证\n正文：在目标项目执行冒烟测试。\n' > "$ROLE_TASK_DIR/match.md"
printf '# 任务：外汇交易数据分析与图表\n- 目标项目：演示项目（/演示路径/演示）\n- 任务编号：由目标自排\n- 来源：用户\n- 路由裁决（派发方 → 演示项目）：目标 演示项目 / 通道 派发 / 理由 领域验证\n正文：分析外汇交易数据并生成图表。\n' > "$ROLE_TASK_DIR/mismatch.md"
# 24.1 --help 含 --check-role
if "$DISPATCH_CLI" --help 2>&1 | grep -q -- '--check-role'; then
  ok "DEV-122 awf-dispatch --help 含 --check-role"
else
  bad "DEV-122 --help 缺少 --check-role"
fi
# 24.2 决策三件套模板与跨项目规范含 role（防文档回归）
if grep -q 'role' "$KIT_DIR/skills/cross-project-dispatch/SKILL.md" \
   && grep -q 'role' "$DISPATCH_IMPL"; then
  ok "DEV-122 决策三件套模板与跨项目规范含 role 匹配语义"
else
  bad "DEV-122 决策三件套模板/规范缺 role"
fi
# 24.3 --check-role 匹配：输出匹配且无警告、rc=0
if ( cd "$TMP" && "$DISPATCH_CLI" "$PROJ4" "$ROLE_TASK_DIR/match.md" \
     --check-role --dry-run --headless > "$ROLE_TASK_DIR/out-match.log" 2>&1 ); then
  if grep -q 'role 校验：匹配' "$ROLE_TASK_DIR/out-match.log" \
     && ! grep -q '警告：目标 role' "$ROLE_TASK_DIR/out-match.log"; then
    ok "DEV-122 --check-role 匹配：通过且无警告"
  else
    bad "DEV-122 --check-role 匹配场景输出异常"
  fi
else
  bad "DEV-122 --check-role 匹配场景退出码非 0"
fi
# 24.4 --check-role 不匹配：警告但退出码仍 0（软校验不硬拒）
if ( cd "$TMP" && "$DISPATCH_CLI" "$PROJ4" "$ROLE_TASK_DIR/mismatch.md" \
     --check-role --dry-run --headless > "$ROLE_TASK_DIR/out-mismatch.log" 2>&1 ); then
  if grep -q '警告：目标 role' "$ROLE_TASK_DIR/out-mismatch.log"; then
    ok "DEV-122 --check-role 不匹配：警告但退出码 0（软校验）"
  else
    bad "DEV-122 --check-role 不匹配场景缺警告"
  fi
else
  bad "DEV-122 --check-role 不匹配场景退出码非 0"
fi
# 24.5 --allow-role-mismatch 静默不匹配警告
if ( cd "$TMP" && "$DISPATCH_CLI" "$PROJ4" "$ROLE_TASK_DIR/mismatch.md" \
     --check-role --allow-role-mismatch --dry-run --headless > "$ROLE_TASK_DIR/out-silent.log" 2>&1 ); then
  if ! grep -q '警告：目标 role' "$ROLE_TASK_DIR/out-silent.log"; then
    ok "DEV-122 --allow-role-mismatch 静默不匹配警告"
  else
    bad "DEV-122 --allow-role-mismatch 未静默警告"
  fi
else
  bad "DEV-122 --allow-role-mismatch 场景退出码非 0"
fi
# 24.6 无 role：提示但不阻塞、rc=0
if ( cd "$TMP" && "$DISPATCH_CLI" "$PROJ5" "$ROLE_TASK_DIR/match.md" \
     --check-role --dry-run --headless > "$ROLE_TASK_DIR/out-norole.log" 2>&1 ); then
  if grep -q '目标未填 role' "$ROLE_TASK_DIR/out-norole.log"; then
    ok "DEV-122 --check-role 无 role：提示但不阻塞（rc=0）"
  else
    bad "DEV-122 --check-role 无 role 提示缺失"
  fi
else
  bad "DEV-122 --check-role 无 role 场景退出码非 0"
fi

# 25. DEV-123：--check-role 过度匹配修复（泛词停用 + 2/3/4-gram 混合）
ROLE_KIT="擅长 agent 工作流框架：脚手架生成、awf 工具链、校验/发版"
"$KIT_DIR/bin/awf" init "$TMP/proj6" --name "误判回归" --role "$ROLE_KIT" >/dev/null 2>&1
printf '# 任务：生成本周周报并总结 git 提交\n- 目标项目：演示项目（/演示路径/演示）\n- 任务编号：由目标自排\n- 来源：用户\n- 路由裁决（派发方 → 演示项目）：目标 演示项目 / 通道 派发 / 理由 领域验证\n正文：收集本周会话与提交，生成周报。\n' > "$ROLE_TASK_DIR/zhoubao.md"
if ( cd "$TMP" && "$DISPATCH_CLI" "$TMP/proj6" "$ROLE_TASK_DIR/zhoubao.md" \
     --check-role --dry-run --headless > "$ROLE_TASK_DIR/out-kit.log" 2>&1 ); then
  if grep -q '警告：目标 role' "$ROLE_TASK_DIR/out-kit.log"; then
    ok "DEV-123 kit role ↔ 周报任务：不匹配（泛词「生成」不再单独构成依据）"
  else
    bad "DEV-123 kit role ↔ 周报任务仍误判匹配"
  fi
else
  bad "DEV-123 kit 回归场景退出码非 0"
fi
ROLE_ZB="擅长收集 DSH 会话历史与 git 提交，归纳生成日报/周报"
"$KIT_DIR/bin/awf" init "$TMP/proj7" --name "周报匹配" --role "$ROLE_ZB" >/dev/null 2>&1
if ( cd "$TMP" && "$DISPATCH_CLI" "$TMP/proj7" "$ROLE_TASK_DIR/zhoubao.md" \
     --check-role --dry-run --headless > "$ROLE_TASK_DIR/out-zb.log" 2>&1 ); then
  if grep -q 'role 校验：匹配' "$ROLE_TASK_DIR/out-zb.log"; then
    ok "DEV-123 周报 role ↔ 周报任务：匹配保持（领域词「周报」单命中）"
  else
    bad "DEV-123 周报 role ↔ 周报任务未匹配"
  fi
else
  bad "DEV-123 周报匹配场景退出码非 0"
fi
ROLE_UXR="擅长 Rokid UXR SDK 的 Unity 示例开发与真机联调测试"
"$KIT_DIR/bin/awf" init "$TMP/proj8" --name "领域词命中" --role "$ROLE_UXR" >/dev/null 2>&1
printf '# 任务：Unity 真机联调\n- 目标项目：演示项目（/演示路径/演示）\n- 任务编号：由目标自排\n- 来源：用户\n- 路由裁决（派发方 → 演示项目）：目标 演示项目 / 通道 派发 / 理由 领域验证\n正文：在真机联调 Unity 示例。\n' > "$ROLE_TASK_DIR/unity.md"
if ( cd "$TMP" && "$DISPATCH_CLI" "$TMP/proj8" "$ROLE_TASK_DIR/unity.md" \
     --check-role --dry-run --headless > "$ROLE_TASK_DIR/out-uxr.log" 2>&1 ); then
  if grep -q 'role 校验：匹配' "$ROLE_TASK_DIR/out-uxr.log"; then
    ok "DEV-123 领域词（Unity/联调）无泛词交集仍命中匹配"
  else
    bad "DEV-123 领域词场景未匹配"
  fi
else
  bad "DEV-123 领域词场景退出码非 0"
fi

# 26. DEV-124：经验/工具积累闭环（开工读取 + 收尾沉淀 + tools 标准 + check 软提示）
# 26.1 开工顺序含「读同类经验」
if grep -q '过往结论' "$KIT_DIR/templates/AGENTS.md.tmpl" \
   && grep -q 'memory/history' "$KIT_DIR/templates/AGENTS.md.tmpl"; then
  ok "DEV-124 开工顺序含「先读 history 同类经验」"
else
  bad "DEV-124 开工顺序缺读同类经验步骤"
fi
# 26.2 dev/debug 收尾含沉淀到 memory/history 与 tools 收录
if grep -q 'memory/history' "$KIT_DIR/skills/dev/SKILL.md" \
   && grep -q 'memory/history' "$KIT_DIR/skills/debug/SKILL.md" \
   && grep -q 'tools/README.md' "$KIT_DIR/skills/dev/SKILL.md" \
   && grep -q 'tools/README.md' "$KIT_DIR/skills/debug/SKILL.md"; then
  ok "DEV-124 dev/debug 收尾含沉淀 memory/history + tools 收录（技能手册）"
else
  bad "DEV-124 dev/debug 收尾缺沉淀步骤"
fi
# 26.3 init 项目 memory/README 含「可复用/何时沉淀」定义
"$KIT_DIR/bin/awf" init "$TMP/proj9" --name "积累闭环" >/dev/null 2>&1
if grep -q '可复用' "$TMP/proj9/agent-workflow/memory/README.md" \
   && grep -q '何时沉淀' "$TMP/proj9/agent-workflow/memory/README.md"; then
  ok "DEV-124 memory/README 含可复用定义与沉淀时机"
else
  bad "DEV-124 memory/README 缺可复用定义"
fi
# 26.4 init 项目 tools/README 含晋升三要素（可执行/用法注释/归属）
if grep -q 'shebang' "$TMP/proj9/agent-workflow/tools/README.md" \
   && grep -q '用法注释' "$TMP/proj9/agent-workflow/tools/README.md"; then
  ok "DEV-124 tools/README 含晋升三要素"
else
  bad "DEV-124 tools/README 缺晋升三要素"
fi
# 26.5 check 软提示：无沉淀+≥3 归档 → 提示但 rc=0；补沉淀 → 无提示
cat >> "$TMP/proj9/agent-workflow/tasks/dev/done.md" <<'PROJ9EOF'
## [HIST-101] 造数沉淀一

| 字段 | 内容 |
|------|------|
| 优先级 | P3 |
| 状态 | 完成 |
| Owner | smoke |
| 完成日期 | 2026-11-03 |

造数归档。
| HIST-101 | P3 | 造数沉淀一 | 2026-11-03 |

## [HIST-102] 造数沉淀二

| 字段 | 内容 |
|------|------|
| 优先级 | P3 |
| 状态 | 完成 |
| Owner | smoke |
| 完成日期 | 2026-11-03 |

造数归档。
| HIST-102 | P3 | 造数沉淀二 | 2026-11-03 |

## [HIST-103] 造数沉淀三

| 字段 | 内容 |
|------|------|
| 优先级 | P3 |
| 状态 | 完成 |
| Owner | smoke |
| 完成日期 | 2026-11-03 |

造数归档。
| HIST-103 | P3 | 造数沉淀三 | 2026-11-03 |
PROJ9EOF
( cd "$TMP/proj9" && "$KIT_DIR/bin/awf" status >/dev/null 2>&1 \
  && "$KIT_DIR/bin/awf" check > "$TMP/proj9-check1.log" 2>&1 ); P9RC=$?
if [ "$P9RC" -eq 0 ] && grep -q 'memory/history/ 无沉淀' "$TMP/proj9-check1.log"; then
  ok "DEV-124 check 软提示：无沉淀+3 归档 → 提示且 rc=0"
else
  bad "DEV-124 check 软提示未出现（rc=$P9RC）"
fi
printf '# 经验沉淀\n\n- 背景：造数验证\n- 结论：软提示工作正常\n' > "$TMP/proj9/agent-workflow/memory/history/软提示验证_2026-11-04.md"
( cd "$TMP/proj9" && "$KIT_DIR/bin/awf" check > "$TMP/proj9-check2.log" 2>&1 ); P9RC2=$?
if [ "$P9RC2" -eq 0 ] && ! grep -q 'memory/history/ 无沉淀' "$TMP/proj9-check2.log"; then
  ok "DEV-124 check 软提示：有沉淀 → 提示消失（rc=0）"
else
  bad "DEV-124 check 软提示未随沉淀消失（rc=$P9RC2）"
fi

# 27. DEV-126 part C：会话命名 [awf] <目标项目> + 队列等待 --queue-timeout
# 27.1 --help 含新标题约定与队列参数
if "$DISPATCH_CLI" --help 2>&1 | grep -q '\[awf\] <目标项目>' \
   && "$DISPATCH_CLI" --help 2>&1 | grep -q -- '--queue-timeout'; then
  ok "DEV-126 --help 含 [awf] <目标项目> 与 --queue-timeout（队列等待）"
else
  bad "DEV-126 --help 缺新标题约定或 --queue-timeout"
fi
# 27.2 前缀常量保持 [awf]（用户澄清：任务里写 [asf] 是笔误，前缀不变）
if grep -q 'AWF_TITLE_PREFIX = "\[awf\]"' "$DISPATCH_IMPL"; then
  ok "DEV-126 会话前缀仍为 [awf]（标题格式简化、前缀不变）"
else
  bad "DEV-126 前缀偏离 [awf]"
fi
# 28. DEV-127：目录式账本生命周期（认领=current/+active；归档=done/+done/+完成日期；README 由 awf status 生成）
cat > "$PROJ/agent-workflow/tasks/dev/todo/DEV-300.md" <<'D28'
## [DEV-300] 目录式生命周期冒烟

| 字段 | 内容 |
|------|------|
| 优先级 | P2 |
| 状态 | todo |
| Owner | smoke |
| 依赖 | 无 |
| 最近更新 | 2026-11-04 |

### 目标
验证认领/归档的目录语义与 README 检索（DEV-127）。

### 验收标准
- [ ] 认领后 current/ 出现且状态 active
- [ ] 归档后 done/ 出现且状态 done + 完成日期
- [ ] 三目录 README 随 awf status 同步

### 下一步
跑 smoke。
D28
( cd "$PROJ" && "$KIT_DIR/bin/awf" status >/dev/null )
assert_grep 'DEV-300' "$PROJ/agent-workflow/tasks/dev/todo/README.md" "DEV-127 todo/README 列 DEV-300"

# 认领：文件移入 current/ + 状态改 active
mv "$PROJ/agent-workflow/tasks/dev/todo/DEV-300.md" "$PROJ/agent-workflow/tasks/dev/current/DEV-300.md"
sed -i '' 's/| 状态 | todo |/| 状态 | active |/' "$PROJ/agent-workflow/tasks/dev/current/DEV-300.md" 2>/dev/null \
  || sed -i 's/| 状态 | todo |/| 状态 | active |/' "$PROJ/agent-workflow/tasks/dev/current/DEV-300.md"
( cd "$PROJ" && "$KIT_DIR/bin/awf" status >/dev/null )
assert_grep 'DEV-300' "$PROJ/agent-workflow/tasks/dev/current/README.md" "认领后 current/README 列 DEV-300"
if grep -q 'DEV-300' "$PROJ/agent-workflow/tasks/dev/todo/README.md"; then
  bad "认领后 todo/README 不应再有 DEV-300"
else
  ok "认领后 todo/README 已移除 DEV-300"
fi

# 归档：文件移入 done/ + 状态改 done + 完成日期
mv "$PROJ/agent-workflow/tasks/dev/current/DEV-300.md" "$PROJ/agent-workflow/tasks/dev/done/DEV-300.md"
printf '| 完成日期 | %s |\n' "$(date +%Y-%m-%d 2>/dev/null || echo 2026-11-04)" >> "$PROJ/agent-workflow/tasks/dev/done/DEV-300.md"
sed -i '' 's/| 状态 | active |/| 状态 | done |/' "$PROJ/agent-workflow/tasks/dev/done/DEV-300.md" 2>/dev/null \
  || sed -i 's/| 状态 | active |/| 状态 | done |/' "$PROJ/agent-workflow/tasks/dev/done/DEV-300.md"
( cd "$PROJ" && "$KIT_DIR/bin/awf" status >/dev/null )
assert_grep 'DEV-300' "$PROJ/agent-workflow/tasks/dev/done/README.md" "归档后 done/README 列 DEV-300"
if out="$(cd "$PROJ" && ./agent-workflow/check_workflow.sh 2>&1)"; then
  ok "目录式账本生命周期后 check 通过"
else
  bad "目录式生命周期后 check 失败：$(printf '%s\n' "$out" | grep -E 'FAIL|过期' | head -3)"
fi
rm -f "$PROJ/agent-workflow/tasks/dev/done/DEV-300.md"
( cd "$PROJ" && "$KIT_DIR/bin/awf" status >/dev/null )

# 29. DEV-138：派发三规则（默认异步 / 派发即子代理不建队 / 票据瘦身+分析归 worker）
# 29.2 模板与工作流规范同步三规则
if grep -q '派发三规则' "$KIT_DIR/skills/cross-project-dispatch/SKILL.md" \
   && grep -q '默认异步' "$KIT_DIR/skills/cross-project-dispatch/SKILL.md" \
   && grep -q '不启用智能体团队承载派发' "$KIT_DIR/skills/cross-project-dispatch/SKILL.md" \
   && grep -q '票据瘦身' "$KIT_DIR/skills/cross-project-dispatch/SKILL.md" \
   && grep -q '返回 router' "$KIT_DIR/skills/cross-project-dispatch/SKILL.md"; then
  ok "DEV-138 技能索引路由段含派发三规则"
else
  bad "DEV-138 技能索引路由段缺派发三规则"
fi
if [ -d "$KIT_DIR/templates/workflows" ]; then
  bad "DEV-138 技能化后不应有 templates/workflows/ 目录（技能即源）"
elif [ -d "$KIT_DIR/agent-workflow/workflows" ]; then
  bad "DEV-138 技能化后项目内不应有 workflows/ 目录"
else
  ok "DEV-138 技能化形态：无 workflows 副本（细节在技能 skills/ 各流程技能）"
fi
if grep -q '派发协议三规则' "$KIT_DIR/docs/design.md" \
   && grep -q '不启用智能体团队承载派发' "$KIT_DIR/docs/design.md"; then
  ok "DEV-138 $KIT_DIR/docs/design.md 含派发协议三规则小节"
else
  bad "DEV-138 $KIT_DIR/docs/design.md 缺派发协议三规则"
fi
if grep -q '不启用智能体团队承载派发' "$KIT_DIR/skills/cross-project-dispatch/SKILL.md" \
   && grep -q '启动一个子代理会话' "$KIT_DIR/skills/cross-project-dispatch/SKILL.md"; then
  ok "DEV-138 cross-project 技能写清派发即子代理（不建队承载）"
else
  bad "DEV-138 cross-project 技能未写清派发即子代理"
fi
if grep -q '不启用智能体团队承载派发' "$KIT_DIR/skills/cross-project-dispatch/SKILL.md"; then
  ok "DEV-138 跨项目技能写清派发不建队承载（无默认建队残留）"
else
  bad "DEV-138 跨项目技能未写清不建队承载"
fi
# 29.3 旧语义清除：不再有「团队派发模式（默认」「--wait 是团队模式默认」「每个目标一个 dispatcher」
stale_ok=1
for f in "$KIT_DIR/skills/cross-project-dispatch/SKILL.md" "$KIT_DIR/templates/AGENTS.md.tmpl" \
         "$KIT_DIR/templates/workflows/cross-project.md" "$KIT_DIR/agent-workflow/workflows/cross-project.md"; do
  if grep -q '团队派发模式（默认\|每个目标一个 dispatcher\|--wait 是团队模式' "$f"; then
    stale_ok=0
    bad "DEV-138 旧派发语义残留：$f"
  fi
done
if [ "$stale_ok" -eq 1 ]; then
  ok "DEV-138 派发文档/模板无旧团队派发语义残留"
fi
# 30. 回执契约与投递通道（行为验证见 bin/awf-dispatch；技能文档章节完整性见下）
SKILL_CROSS="$KIT_DIR/skills/cross-project-dispatch/SKILL.md"
for section in "必报点总表" "回执投递通道" "回执正文排版" "远程办公状态" "派发方转达用户回执格式" "僵尸会话与落地判定" "退出码与失败处理"; do
  grep -q "$section" "$SKILL_CROSS" && ok "技能章节齐全：$section" || bad "技能缺章节：$section"
done
# 行为契约：注入文本/脚本必须实现这些语义（来自 bin/awf-dispatch 注入段与实现）
if grep -q '必有回执' "$DISPATCH_IMPL" \
   && grep -q '无回执' "$DISPATCH_IMPL" \
   && grep -q '派发方' "$DISPATCH_IMPL"; then
  ok "DISPATCH 必有回执/失联兜底/投递通道语义在注入文本"
else
  bad "DISPATCH 必有回执/失联兜底/投递通道语义不在注入文本"
fi
# 3.13+ 行为断言（保留原有独立实现块）

# 30.1 派发生命周期闭环（必有回执是主机制，登记 active 作兜底锚点）
if grep -q '派发生命周期' "$KIT_DIR/skills/cross-project-dispatch/SKILL.md" \
   && grep -q '兜底锚点' "$KIT_DIR/skills/cross-project-dispatch/SKILL.md"; then
  ok "DISPATCH-133/134 $KIT_DIR/skills/cross-project-dispatch/SKILL.md 有派发生命周期闭环（五步 + 兜底锚点）"
else
  bad "DISPATCH-133/134 $KIT_DIR/skills/cross-project-dispatch/SKILL.md 缺派发生命周期闭环"
fi
if grep -q '目标 worker' "$KIT_DIR/skills/cross-project-dispatch/SKILL.md" \
   && grep -q '派发时间' "$KIT_DIR/skills/cross-project-dispatch/SKILL.md" \
   && grep -q '验收标准' "$KIT_DIR/skills/cross-project-dispatch/SKILL.md" \
   && grep -q '关联票据' "$KIT_DIR/skills/cross-project-dispatch/SKILL.md"; then
  ok "DISPATCH-133/134 $KIT_DIR/skills/cross-project-dispatch/SKILL.md 提供登记样例字段（目标 worker/关联票据/派发时间/验收标准）"
else
  bad "DISPATCH-133/134 $KIT_DIR/skills/cross-project-dispatch/SKILL.md 登记样例字段缺失"
fi
# 30.2 必有回执是主机制（成功必须回执 / 失败必须回执 / 需用户确认·多轮对话）
if grep -q '必有回执' "$DISPATCH_IMPL" \
   && grep -q '必有回执' "$KIT_DIR/skills/cross-project-dispatch/SKILL.md"; then
  ok "DISPATCH-134 $KIT_DIR/skills/cross-project-dispatch/SKILL.md 必有回执是主机制（成功/失败都必须回执，需用户确认+多轮对话）"
else
  bad "DISPATCH-134 $KIT_DIR/skills/cross-project-dispatch/SKILL.md 缺必有回执语义"
fi
# 30.3 无回执仅当会话失联；登记 active 只是兜底
if grep -q '兜底锚点' "$KIT_DIR/skills/cross-project-dispatch/SKILL.md" \
   && grep -q 'active' "$KIT_DIR/skills/cross-project-dispatch/SKILL.md"; then
  ok "DISPATCH-134 $KIT_DIR/skills/cross-project-dispatch/SKILL.md 无回执仅当会话失联（登记 active 是兜底锚点）"
else
  bad "DISPATCH-134 $KIT_DIR/skills/cross-project-dispatch/SKILL.md 缺兜底语义"
fi
# 30.4 旧表述（代理 FAIL/无回执常规化 / 记忆锚点）已从三处源文本清除
if grep -q '代理 FAIL、超时无回执' "$DISPATCH_IMPL" \
   || grep -q '静默中断' "$DISPATCH_IMPL" \
   || grep -q '记忆锚点' "$DISPATCH_IMPL" \
   || grep -q '记忆锚点' "$KIT_DIR/templates/AGENTS.md.tmpl" \
   || grep -q '记忆锚点' "$DISPATCH_IMPL"; then
  bad "DISPATCH-134 旧表述残留（代理 FAIL/记忆锚点/无回执常规化）"
else
  ok "DISPATCH-134 旧表述已清除（无回执不再是常规路径）"
fi
if diff -q "$KIT_DIR/templates/AGENTS.md.tmpl" \
          "$KIT_DIR/agent-workflow/templates/AGENTS.md.tmpl" >/dev/null \
; then
  ok "DISPATCH-134 模板双副本一致（AGENTS.md.tmpl；workflows 技能化退役）"
else
  bad "DISPATCH-134 模板副本漂移"
fi
# 30.9b DISPATCH-143 术语统一：无「用户暂离/away」残留（文档/代码/模板统一为「远程办公状态（remote）」）
if grep -rn '用户暂离\|away' "$KIT_DIR/docs" "$KIT_DIR/skills" "$KIT_DIR/templates" \
   "$DISPATCH_CLI" "$KIT_DIR/AGENTS.md" 2>/dev/null | grep -v '^Binary'; then
  bad "DISPATCH-143 术语残留：发现「用户暂离/away」，应统一为「远程办公状态（remote）」"
else
  ok "DISPATCH-143 术语统一：无「用户暂离/away」残留，统一为「远程办公状态（remote）」"
fi
if grep -rn '等待最终成功才回执\|闷头执行到最终成功' "$KIT_DIR/docs" "$KIT_DIR/skills" "$KIT_DIR/templates" \
   "$DISPATCH_CLI" "$KIT_DIR/agent-workflow/workflows" 2>/dev/null | grep -v '^Binary'; then
  bad "DISPATCH-144 旧表述残留（等待最终成功才回执/闷头执行），应改为状态转换即回执"
else
  ok "DISPATCH-144 无「等待最终成功才回执/闷头执行」旧表述（状态转换即回执）"
fi
# 只查注入文本（新条款载体）——仓库既有 DEV-138「派发即启动子代理会话」等契约词属既有表述，不算本条款引入
if grep -q '子代理\|主代理' "$DISPATCH_IMPL" 2>/dev/null; then
  bad "DISPATCH-145 注入文本引入「子代理/主代理」新词，应沿用「派发方/目标会话」"
else
  ok "DISPATCH-145 注入文本沿用「派发方/目标会话」表述，未引入子代理/主代理新词"
fi
# 30.13b DISPATCH-146：--report --dry-run 渲染回执消息（不依赖 GUI，本地可复现；含标记/来源/派发单）
if "$DISPATCH_CLI" --report "必报点 3 里程碑完成：DEV-156 已实现回执通道" \
     --to session-demo-0001 --from session-demo-0002 --ticket DISPATCH-146 --dry-run 2>&1 \
   | grep -q '【回执请求】'; then
  ok "DISPATCH-146 --report --dry-run 渲染回执消息（不联网）"
else
  bad "DISPATCH-146 --report --dry-run 未渲染回执消息"
fi
# 30.13c DISPATCH-146：--report 与派发参数互斥（第一个位置参数=回执文本，第二个=非法）
if "$DISPATCH_CLI" --report "x" demo02 2>&1 | grep -q '不能与'; then
  ok "DISPATCH-146 --report 与第二个位置参数互斥（第一个位置参数=回执文本；既有调用方式不变）"
else
  bad "DISPATCH-146 --report 互斥校验缺失"
fi
# 30.13d DISPATCH-146：--report 缺文本 → 干净报错 + 退出码 2（不抛 traceback）
if "$DISPATCH_CLI" --report >/tmp/awf-report-notext.out 2>&1; then
  bad "DISPATCH-146 --report 缺文本应退出码 2"
elif grep -q 'Traceback' /tmp/awf-report-notext.out; then
  bad "DISPATCH-146 --report 缺文本不应抛 traceback"
elif grep -q '需要回执文本' /tmp/awf-report-notext.out; then
  ok "DISPATCH-146 --report 缺文本干净报错 + 退出码 2"
else
  bad "DISPATCH-146 --report 缺文本报错信息缺失"
fi
# 30.14b DISPATCH-147：收尾句可经 --report 通道渲染投递（复用 DEV-156 通道，不新造）
if "$DISPATCH_CLI" --report "任务完成，会话空闲，可续发（来源会话：session-demo）" \
     --to session-demo-0001 --from session-demo-0002 --ticket DISPATCH-147 --dry-run 2>&1 \
   | grep -q '任务完成，会话空闲，可续发'; then
  ok "DISPATCH-147 收尾报平安可经 --report 通道渲染（复用通道，不新造）"
else
  bad "DISPATCH-147 收尾句未走 --report 通道"
fi

# 30.15 DEV-165：回执投递头用「项目名＋会话名」，查不到回退会话 ID
if python3 - "$DISPATCH_IMPL" <<'PY'
import importlib.machinery
import importlib.util
import pathlib
import sys

source = pathlib.Path(sys.argv[1])
loader = importlib.machinery.SourceFileLoader("awf_dispatch_reuse_under_test", str(source))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)


class _FakeSessionsApi:
    def sessions(self):
        return [
            {"sessionId": "s-1", "cwd": "/Users/chenlin/projects/OpenXR-UXR",
             "projections": {"values": {"title": "[awf] [agent-workflow-kit] [打包测试]"}}},
            {"sessionId": "s-2", "cwd": "/tmp/naked", "projections": {"values": {}}},
        ]


api = _FakeSessionsApi()
assert module.session_display_label(api, "s-1") == "OpenXR-UXR「[awf] [agent-workflow-kit] [打包测试]」", \
    module.session_display_label(api, "s-1")
assert module.session_display_label(api, "s-2") == "naked", module.session_display_label(api, "s-2")
assert module.session_display_label(api, "s-miss") == "s-miss"
assert module.session_display_label(None, "") == "未知"
msg = module.render_report_message(
    "s-1", "s-2", "D-1", "正文",
    source_label=module.session_display_label(api, "s-1"),
    target_label=module.session_display_label(api, "s-2"))
assert "- 来源：OpenXR-UXR「[awf] [agent-workflow-kit] [打包测试]」" in msg, msg
assert "- 派发方：naked" in msg, msg
assert "- 派发单：D-1" in msg and "【回执请求】" in msg and "正文" in msg
old = module.render_report_message("s-1", "s-2", "D-1", "正文")
assert "- 来源：s-1" in old and "- 派发方：s-2" in old, old
PY
then
  ok "DEV-165 回执投递头=项目名＋会话名（查不到回退会话 ID）"
else
  bad "DEV-165 回执投递头改造未通过"
fi
# 30.8 旧表述「用户在目标会话内回复即可继续」已从源文本清除
if grep -q '用户在 GUI 目标会话内' "$DISPATCH_IMPL" \
   || grep -q '用户在目标会话内直接回复' "$DISPATCH_IMPL" \
   || grep -q '用户在目标会话内回复继续' "$DISPATCH_IMPL" \
   || grep -q '目标会话多轮对话续聊' "$KIT_DIR/templates/AGENTS.md.tmpl" \
   || grep -q '目标会话多轮对话续聊' "$DISPATCH_IMPL" \
   || grep -q '目标会话多轮对话续聊' "$KIT_DIR/AGENTS.md"; then
  bad "DISPATCH-141 旧表述残留（用户在目标会话内回复即可继续）"
else
  ok "DISPATCH-141 旧表述已清除（用户回复位置=派发端）"
fi

printf '\n通过 %d 项，失败 %d 项\n' "$pass" "$fail"
[ "$fail" -eq 0 ]