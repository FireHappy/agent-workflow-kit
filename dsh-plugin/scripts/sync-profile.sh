#!/usr/bin/env bash
# dsh-awf-dashboard 开发同步脚本
#
# pnpm 对 file: 依赖是「安装时打包快照」，本仓库改完代码后，副本不会自动更新。
# 运行本脚本把最新源码复制进 profile 已安装的副本，之后刷新/重启 DSH 即可生效。
#
# 用法：
#   ./scripts/sync-profile.sh [profile=dsh-profiles/desktop]
set -eu

cd "$(dirname "$0")/.."
PROFILE="${1:-desktop}"
DEST="$HOME/.dsh/profiles/$PROFILE/node_modules/dsh-awf-dashboard"

if [ ! -d "$DEST" ]; then
  echo "未找到已安装的插件副本：$DEST" >&2
  echo "请先在 profile 里 pnpm add file:$(pwd) 并加入 bundles" >&2
  exit 1
fi

for item in package.json cordis.patch.yml README.md lib src; do
  rm -rf "$DEST/$item"
  cp -R "$item" "$DEST/$item"
done
echo "已同步到 $DEST"
echo "提示：刷新 DSH 页面或重启 DSH 后生效（宿主需重读 profile bundles 时需重启）"