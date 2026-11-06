#!/usr/bin/env bash
# 把本仓库安装为 DSH 技能。默认符号链接（改仓库即改技能），copy 用于 Windows 或不希望联动。
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-link}"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
SKILLS="$DSH_HOME/skills"

case "$MODE" in
  link|--link) MODE="link" ;;
  copy|--copy) MODE="copy" ;;
  *) echo "用法: ./install.sh [link|copy]" >&2; exit 1 ;;
esac

mkdir -p "$SKILLS"

install_skill() {
  local name="$1" src="$2" dest="$SKILLS/$1"
  if [ ! -e "$src" ]; then
    echo "缺少技能源：$src" >&2
    exit 1
  fi
  if [ -e "$dest" ] && [ ! -L "$dest" ]; then
    local backup_dir="$DSH_HOME/skill-backups"
    mkdir -p "$backup_dir"
    local bak="$backup_dir/$name.$(date +%Y%m%d%H%M%S)"
    mv "$dest" "$bak"
    echo "已备份旧技能目录：$bak"
  fi
  rm -f "$dest"
  if [ "$MODE" = "link" ]; then
    ln -s "$src" "$dest"
  else
    cp -R "$src" "$dest"
  fi
  echo "已安装：${dest}（${MODE}）"
}

install_skill "agent-workflow-scaffold" "$REPO"

# DEV-186 工具技能化：bin/awf、bin/awf-dispatch 是技能的一部分（agent-workflow-scaffold
# = kit 仓库符号链接）。项目内命令直接用技能路径：
#   ~/.dsh/skills/agent-workflow-scaffold/bin/awf
#   ~/.dsh/skills/agent-workflow-scaffold/bin/awf-dispatch
chmod +x "$REPO/bin/awf" "$REPO/bin/awf-dispatch" "$REPO/test/smoke.sh" 2>/dev/null || true
chmod +x "$SKILLS/agent-workflow-scaffold/bin/awf" \
         "$SKILLS/agent-workflow-scaffold/bin/awf-dispatch" \
         "$SKILLS/agent-workflow-scaffold/test/smoke.sh" 2>/dev/null || true

echo "验证：bash \"$SKILLS/agent-workflow-scaffold/test/smoke.sh\""
