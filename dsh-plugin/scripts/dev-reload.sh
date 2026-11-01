#!/usr/bin/env bash
# dsh-awf-dashboard 快速响应脚本
#
# 判断本次改动类型，给「最小生效路径」：
#   [client] 只改了前端（lib/client.js、test/client-chunk.test.js）
#            → 同步 profile + 刷新页面即生效，无需重启 DSH
#   [server] 改了服务端（lib/index.js、src/ledger.js）
#            → 同步 profile + 需要重启 DSH（cordis 进程内加载）
#   [both]   两侧都改了 → 重启
#
# 用法：
#   ./scripts/dev-reload.sh              # 自动检测 git 改动类型
#   ./scripts/dev-reload.sh --server     # 强制按服务端处理
#   ./scripts/dev-reload.sh --client     # 强制按前端处理
set -eu

cd "$(dirname "$0")/../.."   # 脚本在 dsh-plugin/scripts/ 下，回两级到仓库根

PROFILE="${DSH_AWF_PROFILE:-desktop}"
DEST="$HOME/.dsh/profiles/$PROFILE/node_modules/dsh-awf-dashboard"

if [ ! -d "$DEST" ]; then
  echo "未找到已安装的插件副本：$DEST（先 pnpm add file:$(pwd)）" >&2
  exit 1
fi

MODE="${1:-auto}"

# 检测 git 改动（未提交 + 已暂存）——兼容仓库根完整路径检测
changed_server=0
changed_client=0
if git rev-parse --git-dir >/dev/null 2>&1; then
  GIT_FILES="$(git status --porcelain -- dsh-plugin/lib dsh-plugin/src dsh-plugin/test dsh-plugin/scripts 2>/dev/null | awk '{print $2}')"
  for f in $GIT_FILES; do
    case "$f" in
      dsh-plugin/lib/client.js|dsh-plugin/test/client-chunk.test.js) changed_client=1 ;;
      dsh-plugin/lib/index.js|dsh-plugin/src/*.js) changed_server=1 ;;
    esac
  done
fi

# 显式模式覆盖
if [ "$MODE" = "--server" ]; then changed_server=1; changed_client=0
elif [ "$MODE" = "--client" ]; then changed_client=1; changed_server=0
fi

KIND="client"
if [ "$changed_server" = "1" ] && [ "$changed_client" = "1" ] && [ "$MODE" = "auto" ]; then KIND="both"
elif [ "$changed_server" = "1" ]; then KIND="server"
fi

# 同步（两者都需要；源码在仓库根下的 dsh-plugin/）
for item in package.json cordis.patch.yml README.md lib src; do
  rm -rf "$DEST/$item"
  cp -R "dsh-plugin/$item" "$DEST/$item"
done
echo "✓ 已同步到 $DEST"

case "$KIND" in
  client)
    echo "ℹ 改动类型：前端（client.js/测试）"
    echo "→ 只需刷新 DSH 页面即生效，无需重启"
    ;;
  server)
    echo "ℹ 改动类型：服务端（ledger.js / index.js）"
    echo "→ 需要重启 DSH 宿主（cordis 进程内加载服务端模块）"
    ;;
  both)
    echo "ℹ 改动类型：前端 + 服务端"
    echo "→ 需要重启 DSH 宿主"
    ;;
esac