#!/usr/bin/env bash
# ocr_click.sh — OCR 兜底点击：截图 + 识别弹框确认按钮（Yes/OK/Continue/Don't Save）坐标并点击
#
# 用法: bash <skill-dir>/scripts/ocr_click.sh <弹框关键词> [确认按钮文字=自动]
# 依赖: macOS 录屏权限（screencapture）+ 辅助功能权限（osascript click at）+ mac-ocr 技能（ocr.sh）
# 返回: 0=已点击确认按钮; 1=未识别到/权限缺失
set -u
KEY="${1:?用法: ocr_click.sh <弹框关键词> [按钮文字]}"
BTN="${2:-}"  # 空则按关键词自动推断: Ignore/continue → Yes; Save → Don't Save; 默认 OK/Continue/Yes
OCR_SH="/Users/chenlin/.dsh/skills/mac-ocr/scripts/ocr.sh"
[ -x "$OCR_SH" ] || { echo "缺 mac-ocr 技能脚本: $OCR_SH"; exit 1; }

# 1) 截图（全屏）
SHOT="/tmp/unity_popup_ocr.png"
screencapture -x "$SHOT" 2>/dev/null || { echo "screencapture 失败（无录屏权限？）"; exit 1; }

# 2) OCR 识别按钮文字块（mac-ocr --json，bottomLeft 原点归一化坐标）
JSON="$(bash "$OCR_SH" "$SHOT" --json 2>/dev/null)"
[ -n "$JSON" ] || { echo "OCR 无输出"; exit 1; }

# 3) 选目标按钮文字
if [ -z "$BTN" ]; then
  case "$KEY" in
    *[Ii]gnore*|*Input*|*JDK*|*SDK*) BTN="Yes" ;;
    *[Ss]ave*) BTN="Don't Save" ;;
    *) BTN="OK" ;;
  esac
fi

# 4) 在 OCR 结果中找按钮文字块（归一化坐标 x,y,w,h；origin bottomLeft）→ 换算屏幕像素点击
PIX_W=$(sips -g pixelWidth "$SHOT" 2>/dev/null | awk '/pixelWidth/{print $2}')
PIX_H=$(sips -g pixelHeight "$SHOT" 2>/dev/null | awk '/pixelHeight/{print $2}')
[ -n "$PIX_W" ] && [ -n "$PIX_H" ] || { echo "取不到截图尺寸"; exit 1; }

found=""
while IFS= read -r line; do
  # 每行形如 {"text": "...", "x": .., "y": .., "w": .., "h": ..}
  t="$(echo "$line" | python3 -c 'import json,sys;print(json.loads(sys.stdin.read()).get("text",""))' 2>/dev/null)"
  case "$t" in
    *"$BTN"*) found="$line"; break ;;
  esac
done < <(echo "$JSON" | python3 -c '
import json,sys
d=json.load(sys.stdin)
items=d.get("items",d if isinstance(d,list) else [])
for it in items: print(json.dumps(it))
')

if [ -z "$found" ]; then
  echo "OCR 未识别到按钮 [$BTN]（弹框关键词 [$KEY]）；OCR 全文：" ; echo "$JSON" | python3 -c 'import json,sys;d=json.load(sys.stdin);items=d.get("items",d if isinstance(d,list) else []);[print(i.get("text","")) for i in items]' 2>/dev/null | head -12
  exit 1
fi

# 5) 坐标换算：bottomLeft 原点 → 屏幕坐标（topLeft 原点）
CX="$(echo "$found" | python3 -c 'import json,sys;d=json.loads(sys.stdin.read());print((d["x"]+d["w"]/2)*'"$PIX_W"')')"
CY="$(echo "$found" | python3 -c 'import json,sys;d=json.loads(sys.stdin.read());print((1-(d["y"]+d["h"]/2))*'"$PIX_H"')')"

# 6) 点击（osascript 需要辅助功能权限）
osascript -e "tell application \"System Events\" to click at {${CX%.*}, ${CY%.*}}" 2>/dev/null && { echo "OCR 点击 [$BTN] @(${CX%.*},${CY%.*})"; exit 0; }
echo "osascript 坐标点击失败（无辅助功能权限？）"; exit 1
