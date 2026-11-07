#!/usr/bin/env bash
# handle-popups.sh — 构建期弹框检测与转写（v4：不做穷举规则，交给语义理解）
#
# 用法:
#   bash handle-popups.sh scan <工程根目录>     # 截图 + OCR 转写弹框文字与按钮坐标（默认）
#   bash handle-popups.sh click <按钮文字>       # 按 OCR 识别到的按钮文字坐标点击
#
# 设计原则（2026-11-06）：
#   弹框无法穷举（白名单/按钮词永远追不上新弹框）→ 本脚本只做两件事：
#   1) scan：截图 → mac-ocr 转写**全部弹框文字** + 识别按钮候选块（中英文按钮词）及其坐标，
#      由调用方（agent）读文字理解语义后决定：点哪个按钮 / 停下问用户 / 继续等
#   2) click <文字>：把已识别的按钮文字换算屏幕坐标点击（osascript，需辅助功能权限）
#   危险判定（Delete/Overwrite/License/Download 等）由 agent 语义判断，不在此硬编码
#
# 依赖: 录屏权限（screencapture）+ 辅助功能权限（osascript）+ mac-ocr 技能
# 返回: scan 0=找到候选按钮并已输出文本; 1=无弹框文字; 3=环境不可用
set -u
OCR_SH="/Users/chenlin/.dsh/skills/mac-ocr/scripts/ocr.sh"
SHOT="/tmp/unity_popup_scan.png"
MODE="${1:-scan}"
BTN="${2:-}"

# 按钮候选词（中英文；OCR 识别到的独立短文本块即视为按钮）
BTN_WORDS="Yes|No|OK|Continue|Ignore|Cancel|Apply|确定|取消|继续|忽略|是|否|不保存|Don't Save"

scan_mode() {
  [ -x "$OCR_SH" ] || { echo "缺 mac-ocr: $OCR_SH"; return 3; }
  # 区域截图：只截 Unity 第一个窗口（主窗口，模态弹框附着其上），不打扰其它窗口/不让 Unity 抢焦点
  WINFO="$(osascript -e 'tell application "System Events" to tell process "Unity" to get {position, size} of window 1' 2>/dev/null)"
  [ -n "$WINFO" ] || { echo "拿不到 Unity 窗口几何"; return 3; }
  # 输出形如 "626, 164, 260, 347"（AppleScript 拍平的 x, y, w, h；window 1 为最前/弹框窗口）
  GEO="$(echo "$WINFO" | sed -E 's/^\{?([-0-9]+), *([-0-9]+)\}?, *\{?([0-9]+), *([0-9]+)\}?$/\1 \2 \3 \4/')"
  X="$(echo "$GEO" | awk '{print $1}')"; Y="$(echo "$GEO" | awk '{print $2}')"
  W="$(echo "$GEO" | awk '{print $3}')"; H="$(echo "$GEO" | awk '{print $4}')"
  [ -n "$W" ] && [ "$W" -gt 0 ] 2>/dev/null || { echo "窗口几何异常: $WINFO"; return 3; }
  # 负坐标（多屏）截取会失败；clamp 到主屏原点
  [ "$X" -lt 0 ] && X=0; [ "$Y" -lt 0 ] && Y=0
  screencapture -x -R"$X","$Y","$W","$H" "$SHOT" 2>/dev/null || { echo "screencapture 区域截图失败"; return 3; }
  echo "$X $Y" > /tmp/unity_popup_region   # 供 click 偏移换算
  PIX_W="$W"; PIX_H="$H"
  [ -n "$PIX_W" ] && [ -n "$PIX_H" ] || { echo "取不到截图尺寸"; return 3; }
  JSON="$(bash "$OCR_SH" "$SHOT" --json 2>/dev/null | sed -n '/^{/,$p')"
  [ -n "$JSON" ] || { echo "OCR 无输出"; return 3; }

  PIX_W="$PIX_W" PIX_H="$PIX_H" BTN_WORDS="$BTN_WORDS" python3 - "$JSON" <<'PYEOF'
import json,sys,re,os
d=json.loads(sys.argv[1])
items=d.get("items",d if isinstance(d,list) else [])
W=int(float(os.environ['PIX_W'])); H=int(float(os.environ['PIX_H']))
words=re.compile('^('+os.environ['BTN_WORDS']+')$')
# 阅读顺序：y 从上到下，行内 x 左到右
items.sort(key=lambda it:(-it["y"], it["x"]))
print("=== OCR 转写（阅读顺序）===")
for it in items:
    t=it.get("text","").strip()
    if t: print(t)
print("=== 按钮候选 ===")
found=0
for it in items:
    t=it.get("text","").strip()
    if words.match(t):
        cx=int((it["x"]+it["w"]/2)*W); cy=int((1-(it["y"]+it["h"]/2))*H)
        print(f"[{t}] @({cx},{cy})")
        found+=1
print(f"=== 候选按钮数: {found} ===")
sys.exit(0 if found else 1)
PYEOF
}

click_mode() {
  [ -n "$BTN" ] || { echo "用法: handle-popups.sh click <按钮文字>"; return 3; }
  [ -f "$SHOT" ] || { echo "无截图，先运行 scan"; return 3; }
  # 读区域偏移（scan 时保存）→ 点击需加回屏幕偏移
  OFFSET="$(cat /tmp/unity_popup_region 2>/dev/null)"
  OX=0; OY=0
  [ -n "$OFFSET" ] && { OX="$(echo "$OFFSET" | awk '{print $1}')"; OY="$(echo "$OFFSET" | awk '{print $2}')"; }
  PIX_W=$(sips -g pixelWidth "$SHOT" 2>/dev/null | awk '/pixelWidth/{print $2}')
  PIX_H=$(sips -g pixelHeight "$SHOT" 2>/dev/null | awk '/pixelHeight/{print $2}')
  JSON="$(bash "$OCR_SH" "$SHOT" --json 2>/dev/null | sed -n '/^{/,$p')"
  [ -n "$JSON" ] || { echo "OCR 无输出"; return 3; }
  XY=$(PIX_W="$PIX_W" PIX_H="$PIX_H" BTN="$BTN" python3 - "$JSON" <<'PYEOF'
import json,sys,os
d=json.loads(sys.argv[1])
items=d.get("items",d if isinstance(d,list) else [])
W=int(float(os.environ['PIX_W'])); H=int(float(os.environ['PIX_H']))
want=os.environ['BTN']
for it in items:
    if it.get("text","").strip()==want:
        cx=int((it["x"]+it["w"]/2)*W); cy=int((1-(it["y"]+it["h"]/2))*H)
        print(f"{cx} {cy}"); sys.exit(0)
sys.exit(1)
PYEOF
)
  [ -n "$XY" ] || { echo "OCR 未识别到按钮文字 [$BTN]"; return 1; }
  set -- $XY
  SX=$(( $1 + OX )); SY=$(( $2 + OY ))
  osascript -e "tell application \"System Events\" to click at {$SX, $SY}" 2>/dev/null && { echo "已点击 [$BTN] @($SX,$SY)"; return 0; }
  echo "坐标点击失败（无辅助功能权限？）"; return 3
}

case "$MODE" in
  scan)  scan_mode ;;
  click) click_mode ;;
  *) echo "用法: handle-popups.sh scan [工程] | click <按钮文字>"; exit 3 ;;
esac
exit $?
