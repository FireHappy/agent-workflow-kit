#!/usr/bin/env bash
# unity-build-install/build-apk.sh — Unity -batchmode 打包（通道 B，编辑器未开/无人值守时用）
# 用法:
#   bash <skill-dir>/scripts/build-apk.sh -p <工程> -o <相对或绝对APK路径> -m <类名.静态方法> [-c]
# 默认: 工程=uxrsample, 输出=build/uxrsample.apk
set -uo pipefail

PROJECT="${UXRSAMPLE_PROJECT:-/Users/chenlin/projects/UnityProjects/uxrsample}"
OUT=""
METHOD=""
CLEAN=0
UNITY="/Applications/Unity/Hub/Editor/2022.3.62f3c1/Unity.app/Contents/MacOS/Unity"

while getopts "p:o:m:c" opt; do
  case "$opt" in
    p) PROJECT="$OPTARG" ;;
    o) OUT="$OPTARG" ;;
    m) METHOD="$OPTARG" ;;
    c) CLEAN=1 ;;
    *) echo "用法: $0 -p <工程> -o <APK> -m <方法> [-c]"; exit 2 ;;
  esac
done

[ -n "$METHOD" ] || { echo "必填 -m <类名.静态方法>，如 BuildScript.BuildAndroid"; exit 2; }
[ -f "$PROJECT/ProjectSettings/ProjectSettings.asset" ] || { echo "不是 Unity 工程: $PROJECT"; exit 2; }
[ -x "$UNITY" ] || { echo "Unity 不存在: $UNITY"; exit 2; }
[ -d "$PROJECT/Packages/com.anklebreaker.unity-mcp" ] && echo "MCP 插件在；若编辑器未开将按 batch 构建（build 不依赖 MCP）"

# 坑 1：仓库根绝不允许 VERSION（macOS 大小写不敏感遮蔽 <version>，IL2CPP 全量必炸）
if [ -e "$PROJECT/VERSION" ]; then
  echo "FATAL: 仓库根存在 VERSION 文件（$PROJECT/VERSION）——IL2CPP 全量重编会撞名，先移走/处理再构建"; exit 3
fi

cd "$PROJECT" || exit 1
LOG="/tmp/uxr_build_$(date +%s).log"

# 可选清旧产物（核对时间戳/全量构建时）
if [ "$CLEAN" = "1" ]; then
  CAND="${OUT#build/}"   # 支持 -o build/x.apk 与 -o x.apk
  rm -f "build/$CAND" "build/${CAND%.apk}"*symbols*.zip 2>/dev/null
  echo "已清旧产物（build/$CAND 及 symbols）"
fi

echo ">>> Unity batch 构建: $METHOD (project=$PROJECT, out=$OUT)"
"$UNITY" -batchmode -quit -nographics -projectPath "$PROJECT" \
  -executeMethod "$METHOD" -logFile "$LOG"
RC=$?
echo ">>> exit=$RC ；日志尾部："
tail -6 "$LOG"

if [ "$RC" -eq 0 ]; then
  APK="$PROJECT/$OUT"
  [ -f "$APK" ] && ls -la "$APK" || { echo "exit=0 但产物缺失: $APK"; exit 4; }
else
  grep -n -i 'error' "$LOG" | tail -5
  exit "$RC"
fi

# 坑 3：构建可能重写 RKImage.db（tracked），提示恢复（不自动 git 操作）
if [ -f "$PROJECT/Assets/StreamingAssets/RKImage.db" ] && \
   ! git -C "$PROJECT" diff --quiet -- Assets/StreamingAssets/RKImage.db 2>/dev/null; then
  echo ">>> 提示: RKImage.db 被构建重写，如需恢复: git -C $PROJECT checkout -- Assets/StreamingAssets/RKImage.db"
fi
echo ">>> 完成: $APK"