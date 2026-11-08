#!/usr/bin/env bash
# Isolated installation tests: dispatch belongs to its skill, no legacy shim.
set -euo pipefail
KIT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'test -n "$TMP" && test -d "$TMP" && rm -rf "$TMP"' EXIT
export DSH_HOME="$TMP/copy home"
bash "$KIT_DIR/install.sh" copy >"$TMP/install.log" 2>&1
SKILL="$DSH_HOME/skills/cross-project-dispatch"
[ -x "$SKILL/scripts/awf-dispatch" ]
[ ! -e "$DSH_HOME/skills/agent-workflow-scaffold/bin/awf-dispatch" ]
"$SKILL/scripts/awf-dispatch" --help >"$TMP/help"
"$SKILL/scripts/awf-dispatch" --report --dry-run --from isolated --text test >"$TMP/report"
# A skill copied alone must work without scaffold, repository or global installs.
mkdir "$TMP/standalone"
cp -R "$SKILL" "$TMP/standalone/cross-project-dispatch"
DSH_HOME="$TMP/not-installed" "$TMP/standalone/cross-project-dispatch/scripts/awf-dispatch" --report --dry-run --text standalone >"$TMP/standalone-report"
# Repeat install and link installation (including paths with spaces).
bash "$KIT_DIR/install.sh" copy >"$TMP/reinstall.log" 2>&1
DSH_HOME="$TMP/link home" bash "$KIT_DIR/install.sh" link >"$TMP/link.log" 2>&1
[ -L "$TMP/link home/skills/cross-project-dispatch" ]
"$TMP/link home/skills/cross-project-dispatch/scripts/awf-dispatch" --help >"$TMP/link-help"
python3 - "$SKILL/scripts/awf-dispatch" <<'PY'
import importlib.machinery, importlib.util, os, pathlib, sys
from unittest.mock import patch
loader = importlib.machinery.SourceFileLoader('dispatch_skill_test', sys.argv[1])
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)
messages = []
module.emit = lambda message, *args, **kwargs: messages.append(message)
with patch.dict(os.environ, {'AWF_MAX_SESSIONS': 'invalid'}, clear=True):
    assert module.resolve_max_global_sessions(pathlib.Path('/tmp/test')) == module.DEFAULT_MAX_GLOBAL_AWF_SESSIONS
assert messages and 'invalid' in messages[0]
PY
printf '通过：copy/link 安装、独立复制、CLI、回执 dry-run、Python 导入；无旧派发入口。\n'
