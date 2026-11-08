#!/usr/bin/env bash
# dsh-awf-dashboard —— 同步开发中改动到桌面 profile 的已安装副本。
#
# 用法：./scripts/sync-profile.sh [profile]
#   默认 profile = ~/.dsh/profiles/desktop（也可传其他 profile 目录名）。
# 把本插件目录的 lib/ src/ skill/ 与 package.json / README.md / cordis.patch.yml
# 复制到已安装副本（profile 从 node_modules 解析 bundle），随后重启 DSH 生效。
# skill/（DEV-216 内嵌技能/awf CLI 副本）存在时才同步；副本请先经
#   node scripts/copy-workflow-assets.mjs --copy 生成。
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE="${1:-desktop}"
DEST="$HOME/.dsh/profiles/$PROFILE/node_modules/dsh-awf-dashboard"

if [ ! -d "$DEST" ]; then
  echo "未找到已安装副本：$DEST"
  echo "先安装：cd ~/.dsh/profiles/$PROFILE && pnpm add file:$HERE"
  exit 1
fi

mkdir -p "$DEST/lib" "$DEST/src"
# 已同步副本可能是同一 inode（硬链接）：macOS BSD cp 对同 inode 拒绝覆盖。
# cmp 相同则跳过（本就是同一文件），不同才复制。
sync_one() {
  local src="$1" dst="$2"
  if cmp -s "$src" "$dst"; then return 0; fi
  cp -f "$src" "$dst"
}
for f in lib/index.js lib/client.js; do sync_one "$HERE/$f" "$DEST/$f"; done
for f in src/ledger.js src/agents-poc.js src/task-protocol.js src/managed-action-agent.js; do sync_one "$HERE/$f" "$DEST/$f"; done
for f in package.json README.md cordis.patch.yml; do sync_one "$HERE/$f" "$DEST/$f"; done
# DEV-216：内嵌技能/awf CLI 副本整目录同步（先删后拷，避免源已移除文件残留）
if [ -d "$HERE/skill" ]; then
  rm -rf "$DEST/skill"
  cp -R "$HERE/skill" "$DEST/skill"
  echo "已同步内嵌副本 skill/（$(find "$HERE/skill" -type f | wc -l | tr -d ' ') 个文件）"
fi

echo "已同步 $HERE → $DEST（版本：$(node -p "require('$DEST/package.json').version")）"
echo "重启 DSH（或刷新 GUI 页面）后生效。"