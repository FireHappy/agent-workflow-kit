#!/usr/bin/env bash
# 把本仓库安装为 DSH 技能。默认符号链接（改仓库即改技能），copy 用于 Windows 或不希望联动。
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-link}"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
SKILLS="$DSH_HOME/skills"
DEST="$SKILLS/agent-workflow-scaffold"

case "$MODE" in
  link|--link) MODE="link" ;;
  copy|--copy) MODE="copy" ;;
  *) echo "用法: ./install.sh [link|copy]" >&2; exit 1 ;;
esac

mkdir -p "$SKILLS"

if [ -e "$DEST" ] && [ ! -L "$DEST" ]; then
  BACKUP_DIR="$DSH_HOME/skill-backups"
  mkdir -p "$BACKUP_DIR"
  BAK="$BACKUP_DIR/agent-workflow-scaffold.$(date +%Y%m%d%H%M%S)"
  mv "$DEST" "$BAK"
  echo "已备份旧技能目录：$BAK"
fi
rm -f "$DEST"

if [ "$MODE" = "link" ]; then
  ln -s "$REPO" "$DEST"
else
  cp -R "$REPO" "$DEST"
fi

chmod +x "$DEST/bin/awf" "$DEST/test/smoke.sh" 2>/dev/null || true

echo "已安装：$DEST（$MODE）"
echo "验证：bash \"$DEST/test/smoke.sh\""
