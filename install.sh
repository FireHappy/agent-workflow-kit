#!/usr/bin/env bash
# 单源技能安装：~/.agents/skills/ 是唯一输出目录，实际源是插件仓库。
# 保留 copy 参数仅为兼容旧命令；现在 copy 也按 link 处理，不再生成技能副本。
# 其他 agent 通过 ~/.agents/skills/ 使用技能；更新技能重跑 ./install.sh 即可。
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-link}"
AGENTS_HOME="${AGENTS_HOME:-$HOME/.agents}"
PRIMARY="$AGENTS_HOME/skills"

case "$MODE" in
  link|--link) MODE="link" ;;
  copy|--copy)
    MODE="link"
    echo "提示：copy 参数已兼容为单源 link，不再生成技能副本。" >&2
    ;;
  *) echo "用法: ./install.sh [copy|link]" >&2; exit 1 ;;
esac

mkdir -p "$PRIMARY"

install_skill() {
  local name="$1" src="$2" primary="$PRIMARY/$1"
  if [ ! -e "$src" ]; then
    echo "缺少技能源：$src" >&2
    exit 1
  fi
  # .agents/skills 是唯一内容目录；旧的实体副本先备份，再替换。
  if [ -e "$primary" ] && [ ! -L "$primary" ]; then
    local backup_dir="$AGENTS_HOME/skill-backups"
    mkdir -p "$backup_dir"
    local bak="$backup_dir/$name.$(date +%Y%m%d%H%M%S)"
    mv "$primary" "$bak"
    echo "已备份旧技能目录：$bak"
  fi
  rm -rf "$primary"
  if [ "$MODE" = "link" ]; then
    ln -s "$src" "$primary"
    echo "已安装（link）：${primary}"
  else
    echo "已安装（copy 兼容为 link）：${primary}"
  fi
}

SKILL_SRC="$REPO/dsh-awf-dashboard/skills"
install_skill "agent-workflow-scaffold" "$SKILL_SRC/agent-workflow-scaffold"

# DEV-192 技能库顶层化：把 skills/*/ 每个流程技能安装为共享顶层技能
# （~/.agents/skills/<name>/ 为唯一入口，DSH 通过 user-agents provider 发现，
# 启动注入 frontmatter，凭 whenToUse 自动匹配）——这样 AGENTS.md 不必列举清单。
for sk in "$SKILL_SRC"/*/; do
  [ -d "$sk" ] || continue
  sk_name="$(basename "$sk")"
  [ "$sk_name" = "README.md" ] && continue
  [ "$sk_name" = "agent-workflow-scaffold" ] && continue   # 主技能已单独安装（DEV-218：源在插件 skills/）
  install_skill "$sk_name" "$sk" || exit 1
done

# awf 属脚手架技能；派发实现由 cross-project-dispatch 技能自带。
# 唯一派发入口：${PRIMARY}/cross-project-dispatch/scripts/awf-dispatch
chmod +x "$PRIMARY/agent-workflow-scaffold/bin/awf" \
         "$PRIMARY/agent-workflow-scaffold/test/smoke.sh" \
         "$PRIMARY/cross-project-dispatch/scripts/awf-dispatch" 2>/dev/null || true

echo "验证：bash \"$PRIMARY/agent-workflow-scaffold/test/smoke.sh\""
