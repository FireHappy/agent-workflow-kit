#!/usr/bin/env bash
# unity-build-install/check-build-tools.sh — 检测 Unity 项目自带打包工具
# 判定口径：Assets/Editor 下可 -executeMethod 的静态无参方法 或 打包菜单项
# 用法: bash <skill-dir>/scripts/check-build-tools.sh <工程根目录>
set -uo pipefail

PROJECT="${1:-/Users/chenlin/projects/UnityProjects/uxrsample}"
[ -f "$PROJECT/ProjectSettings/ProjectSettings.asset" ] || { echo "不是 Unity 工程: $PROJECT"; exit 1; }

echo "== 打包工具检测: $PROJECT =="
echo "--- 1) Assets/**/Editor 下的构建候选方法（static void / public static，带 Build 语义）---"
CANDIDATES=$(grep -rEn 'MenuItem\s*\(\s*"(Tools|Build|Rokid|UXR)[^"]*[Bb]uild' "$PROJECT/Assets" --include='*.cs' -l 2>/dev/null | head -10)
if [ -n "$CANDIDATES" ]; then
  echo "打包菜单项（可经 MCP editor/execute-menu-item 直接按的按钮路径）："
  while IFS= read -r f; do grep -Eoh 'MenuItem[ \t]*\([ \t]*"[^"]*"' "$f"; done <<< "$CANDIDATES" \
    | grep -oE '"[^"]*"' | tr -d '"' | sed 's/^/  (menuPath) /' | head -10
fi

METHODS=$(grep -rEn '^\s*(public\s+)?static\s+void\s+\w+\s*\(\s*\)' "$PROJECT/Assets" --include='*.cs' 2>/dev/null \
  | grep -iE 'build|apk|package|export' | head -20)
if [ -n "$METHODS" ]; then
  echo "可 -executeMethod 的候选（类名.方法名）："
  echo "$METHODS" | while IFS=: read -r f line rest; do
    cls=$(basename "$f" .cs)
    name=$(echo "$rest" | grep -oE 'static\s+void\s+\w+' | awk '{print $3}')
    echo "  $cls.$name   ($f:$line)"
  done
fi

echo "--- 2) 结论 ---"
if [ -n "$CANDIDATES" ] || [ -n "$METHODS" ]; then
  echo "有打包工具 → 按 unity-build-install 打包决策第 2 步优先使用（executeMethod 名单见上）"
else
  echo "无项目自带打包工具 → 按 unity-build-install 打包决策第 3 步走 Unity 默认打包（默认场景，不配置场景）"
fi

echo "--- 3) MCP 默认打包通道可用性（非项目工具，仅提示）---"
MCPDIR=$(ls -d "$PROJECT"/Packages/com.anklebreaker.unity-mcp* "$PROJECT"/Library/PackageCache/com.anklebreaker.unity-mcp* 2>/dev/null | head -1)
if [ -n "$MCPDIR" ]; then
  echo "MCP 插件已装（$MCPDIR ），可用 unity_build 走默认打包（跟随项目默认场景）"
else
  echo "MCP 插件未装（需要时见 unity-mcp 技能先安装）"
fi