#!/usr/bin/env bash
# Isolated installation tests: dispatch belongs to its skill, no legacy shim.
# ~/.agents/skills is the only installed skill root.
set -euo pipefail
KIT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'test -n "$TMP" && test -d "$TMP" && rm -rf "$TMP"' EXIT
export DSH_HOME="$TMP/copy home"
export AGENTS_HOME="$TMP/agents home"
bash "$KIT_DIR/install.sh" copy >"$TMP/install.log" 2>&1
SKILL="$AGENTS_HOME/skills/cross-project-dispatch"
[ -L "$SKILL" ]
[ ! -e "$DSH_HOME/skills/cross-project-dispatch" ]
[ -x "$SKILL/scripts/awf-dispatch" ]
[ ! -e "$DSH_HOME/skills/agent-workflow-scaffold" ]
"$SKILL/scripts/awf-dispatch" --help >"$TMP/help"
"$SKILL/scripts/awf-dispatch" --report --dry-run --from isolated --text test >"$TMP/report"
# A skill copied alone must work without scaffold, repository or global installs.
mkdir "$TMP/standalone"
cp -R "$SKILL" "$TMP/standalone/cross-project-dispatch"
DSH_HOME="$TMP/not-installed" "$TMP/standalone/cross-project-dispatch/scripts/awf-dispatch" --report --dry-run --text standalone >"$TMP/standalone-report"
# Repeat install and link installation (including paths with spaces).
bash "$KIT_DIR/install.sh" copy >"$TMP/reinstall.log" 2>&1
AGENTS_HOME="$TMP/link home" bash "$KIT_DIR/install.sh" link >"$TMP/link.log" 2>&1
[ -L "$TMP/link home/skills/cross-project-dispatch" ]
"$TMP/link home/skills/cross-project-dispatch/scripts/awf-dispatch" --help >"$TMP/link-help"
python3 - "$SKILL/scripts/awf-dispatch" <<'PY'
import importlib.machinery, importlib.util, os, pathlib, sys
from unittest.mock import patch
loader = importlib.machinery.SourceFileLoader('dispatch_skill_test', sys.argv[1])
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)
# DEV-212 起会话上限改为常量（满 MAX_SENDER_SESSIONS 时启动独立监听等待空闲）：
# 按项目环境变量覆盖上限的实现已移除，断言当前实现契约（常量存在且为 3）。
assert module.MAX_SENDER_SESSIONS == 3, module.MAX_SENDER_SESSIONS
PY
printf '通过：copy/link 安装、独立复制、CLI、回执 dry-run、Python 导入；无旧派发入口。\n'

# DEV-236：技能入口与 Codex 原生失败边界必须和安装器一致。
SKILL_DOC="$KIT_DIR/dsh-awf-dashboard/skills/cross-project-dispatch/SKILL.md"
CODEX_NATIVE_DOC="$KIT_DIR/dsh-awf-dashboard/skills/cross-project-dispatch/references/codex-native.md"
if grep -q '\${DSH_HOME:-\$HOME/.dsh}/skills' "$SKILL_DOC"; then
  echo 'FAIL: cross-project-dispatch 技能文档仍引用旧的 ~/.dsh/skills 入口' >&2
  exit 1
fi
grep -q '\${AGENTS_HOME:-\$HOME/.agents}/skills/cross-project-dispatch' "$SKILL_DOC"
grep -q '不静默重试、不重复创建' "$CODEX_NATIVE_DOC"
grep -q '用户明确允许 DSH 回退' "$CODEX_NATIVE_DOC"
printf '通过：技能入口统一为 ~/.agents/skills，Codex 原生失败边界已覆盖。\n'
