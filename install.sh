#!/usr/bin/env bash
# 把本仓库安装为 DSH 技能（实体目录，与仓库解耦）。默认 copy；link 用于希望改仓库即改技能。
# DEV-186 技能实体化：技能 = ~/.dsh/skills/agent-workflow-scaffold/ 实体文件（SKILL.md + skills/ + bin/），
# 不指向项目仓库；更新技能重跑 ./install.sh 即可。
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-copy}"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
SKILLS="$DSH_HOME/skills"

case "$MODE" in
  link|--link) MODE="link" ;;
  copy|--copy) MODE="copy" ;;
  *) echo "用法: ./install.sh [copy|link]" >&2; exit 1 ;;
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
  rm -rf "$dest"
  if [ "$MODE" = "link" ]; then
    ln -s "$src" "$dest"
    echo "已安装（link）：${dest}"
  else
    # 实体化：只复制技能内容。主技能复制 SKILL.md + skills/ + bin/ + templates/ + test/；
    # 各流程技能（skills/*/）携带自己的 scripts；其余资源子目录存在才复制。
    # kit 的 docs/ 是项目文档（design/arch-review），不进技能（DEV-191）。
    mkdir -p "$dest"
    cp "$src/SKILL.md" "$dest/SKILL.md"
    # DEV-217 版本契约（清理版号）：实体不再写 VERSION / 根 FRAMEWORK_VERSION——
    #   · 插件/分发版本 = 插件 dsh-awf-dashboard/package.json（插件唯一信号）；
    #   · 骨架版本 = templates/FRAMEWORK_VERSION（模板内，随 templates/ 整体拷贝，见下方循环）。
    # 清理旧版淘汰文件（幂等）：旧实体的版本文件不再被任何读点消费。
    rm -f "$dest/VERSION" "$dest/FRAMEWORK_VERSION"
    for sub in skills bin templates test scripts; do
      [ -d "$src/$sub" ] && cp -R "$src/$sub" "$dest/$sub"
    done
    echo "已安装（copy）：${dest}"
  fi
}

install_skill "agent-workflow-scaffold" "$REPO"

# DEV-192 技能库顶层化：把 skills/*/ 每个流程技能同时安装为 DSH 顶层技能
# （~/.dsh/skills/<name>/，DSH 启动注入 frontmatter，凭 whenToUse 自动匹配）——
# 这样 AGENTS.md 不必列举技能清单，DSH 原生语义匹配即完成路由。
for sk in "$REPO"/skills/*/; do
  [ -d "$sk" ] || continue
  sk_name="$(basename "$sk")"
  [ "$sk_name" = "README.md" ] && continue
  install_skill "$sk_name" "$sk" || exit 1
done

# awf 属脚手架技能；派发实现由 cross-project-dispatch 技能自带。
# 唯一派发入口：${DSH_HOME}/skills/cross-project-dispatch/scripts/awf-dispatch
chmod +x "$SKILLS/agent-workflow-scaffold/bin/awf" \
         "$SKILLS/agent-workflow-scaffold/test/smoke.sh" \
         "$SKILLS/cross-project-dispatch/scripts/awf-dispatch" 2>/dev/null || true

echo "验证：bash \"$SKILLS/agent-workflow-scaffold/test/smoke.sh\""
