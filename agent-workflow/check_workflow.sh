#!/bin/sh
# 兼容入口：等价于 agent-workflow/bin/awf check
exec "$(dirname "$0")/bin/awf" check "$@"
