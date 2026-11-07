#!/usr/bin/env bash
# unity-mcp/check-mcp.sh — 检查项目是否安装 AnkleBreaker Unity MCP + 列出运行实例
# 用法: bash <skill-dir>/scripts/check-mcp.sh <工程根目录>
set -uo pipefail

PROJECT="${1:-/Users/chenlin/projects/UnityProjects/uxrsample}"
MANIFEST="$PROJECT/Packages/manifest.json"
PKG="com.anklebreaker.unity-mcp"

[ -f "$MANIFEST" ] || { echo "无 manifest.json: $PROJECT （不是 Unity 工程？）"; exit 1; }

echo "== 1) manifest.json 依赖检查 =="
if python3 -c "
import json,sys
d=json.load(open('$MANIFEST'.replace(\"\n\",\"\"))).get('dependencies',{})
print('已安装:', d.get('$PKG')) if '$PKG' in d else (print('未安装: $PKG 不在 dependencies'), sys.exit(1))
" 2>/dev/null; then
  INSTALLED=1
else
  echo "未安装: $PKG 不在 dependencies"
  INSTALLED=0
fi

echo "== 2) PackageCache 实际导入 =="
FOUND=$(ls -d "$PROJECT/Library/PackageCache/$PKG@"* 2>/dev/null | head -1)
[ -n "$FOUND" ] && echo "已导入: $FOUND" || echo "未导入（编辑器还没 resolve；已装依赖但需 Unity 导入）"

echo "== 3) 运行实例（~/.local/share/UnityMCP/instances.json）=="
INST=$(python3 -c "
import json,os
p=os.path.expanduser('~/.local/share/UnityMCP/instances.json')
try:
  d=json.load(open(p))
except Exception as e:
  print('无 instances.json（{e}）'); raise SystemExit(0)
for i in d:
  print(f\"  port={i['port']}  project={i['projectName']}  pid={i['processId']}\\n    path={i['projectPath']}\")
" 2>/dev/null)
echo "$INST" | grep -q 'port=' && echo "$INST" || echo "无运行实例（需打开 Unity 编辑器）"

echo "== 4) 端口监听 =="
[ -n "$INST" ] && echo "$INST" | grep -o 'port=[0-9]*' | cut -d= -f2 | while read -r P; do
  if lsof -iTCP:"$P" -sTCP:LISTEN >/dev/null 2>&1; then echo "  :$P 在监听（编辑器 MCP 服务存活）"; else echo "  :$P 未监听（实例是残留配置）"; fi
done

[ "$INSTALLED" = "1" ] && exit 0 || exit 0