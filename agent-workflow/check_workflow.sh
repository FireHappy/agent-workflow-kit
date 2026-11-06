#!/bin/sh
# 兼容入口（DEV-186 工具技能化）：等价于技能 agent-workflow-scaffold 的 bin/awf check。
# 工具在技能（~/.dsh/skills/agent-workflow-scaffold = kit 仓库符号链接），项目内不复制副本。
exec "$HOME/.dsh/skills/agent-workflow-scaffold/bin/awf" check "$@"
