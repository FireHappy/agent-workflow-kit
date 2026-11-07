#!/usr/bin/env bash
# unity-build-install/install-apk.sh — adb 安装 + 默认启动 + 日志摘要
# 用法:
#   bash install-apk.sh <APK路径> [包名] [设备IP或serial] [--no-launch]
# 设备: 可给 IP（如 192.168.1.5 或 192.168.1.5:5555）——先检查连接，未连接先 adb connect；
#       不给则用当前已连接设备（多台时取第一台并提示）。
# 默认启动: 安装完成后自动启动应用（force-stop + monkey LAUNCHER）；--no-launch 跳过。
set -uo pipefail

APK="${1:?用法: $0 <APK路径> [包名] [设备] [--no-launch]}"
[ -f "$APK" ] || { echo "APK 不存在: $APK"; exit 1; }

PKG=""
DEVICE=""
NO_LAUNCH=0
for a in "${@:2}"; do
  case "$a" in
    --no-launch|-n) NO_LAUNCH=1 ;;
    *) [ -z "$PKG" ] && PKG="$a" || DEVICE="$a" ;;
  esac
done
PKG="${PKG:-com.rokid.uxrsample_openxr}"

connected_devices() { adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1}'; }

# ---------- 设备解析: 有 IP/serial -> 先检查连接，未连接先尝试连接 ----------
if [ -n "$DEVICE" ]; then
  # 纯 IP 补无线调试默认端口 :5555
  if [[ "$DEVICE" != *":"* ]]; then SERIAL_TARGET="$DEVICE:5555"; else SERIAL_TARGET="$DEVICE"; fi
  echo ">>> 设备目标: $DEVICE —— 先检查连接"
  if connected_devices | grep -qx "$SERIAL_TARGET" || connected_devices | grep -qx "$DEVICE"; then
    SERIAL="$SERIAL_TARGET"
    echo ">>> 已连接: $SERIAL"
  else
    echo ">>> 未连接，尝试 adb connect $SERIAL_TARGET"
    adb connect "$SERIAL_TARGET" | tail -1
    sleep 1
    if adb -s "$SERIAL_TARGET" get-state 2>/dev/null | grep -qx 'device'; then
      SERIAL="$SERIAL_TARGET"
      echo ">>> 连接成功: $SERIAL"
    else
      echo ">>> 连接失败。排查: 设备与电脑同一 WiFi / 开发者选项-无线调试(或先 USB 连一次执行 adb tcpip 5555 授权) / IP 与端口是否正确"
      exit 2
    fi
  fi
else
  # 未指定设备 → 1) 先检查有线（USB）设备（serial 不含冒号）；2) 没有再看无线已连接（含冒号）
  USB=$(connected_devices | grep -v ':' | head -1)
  if [ -n "$USB" ]; then
    SERIAL="$USB"
    echo ">>> 使用有线(USB)设备: $SERIAL"
  else
    WIFI=$(connected_devices | grep ':' | head -1)
    if [ -z "$WIFI" ]; then
      echo ">>> 无已连接设备。可直接给设备 IP 重试: $0 <apk> <包名> <IP>（会先检查连接、未连接先尝试连接）"
      exit 2
    fi
    SERIAL="$WIFI"
    echo ">>> 无有线设备，使用无线已连接设备: $SERIAL"
  fi
  [ "$(connected_devices | wc -l | tr -d ' ')" -gt 1 ] && echo ">>> 多台设备，取优先 $SERIAL （或用第三参指定 IP/serial）"
fi

A=(adb -s "$SERIAL")

# ---------- 安装 ----------
echo ">>> 安装（覆盖，保留数据）: ${A[*]} install -r $APK"
"${A[@]}" install -r "$APK" | tail -2

# ---------- 默认启动 ----------
if [ "$NO_LAUNCH" = "1" ]; then
  echo ">>> 已跳过启动（--no-launch）"
else
  echo ">>> 默认启动应用: force-stop + monkey LAUNCHER ($PKG)"
  "${A[@]}" shell am force-stop "$PKG" 2>/dev/null
  "${A[@]}" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 2>&1 | tail -2
  sleep 2
  "${A[@]}" shell pidof "$PKG" >/dev/null 2>&1 && echo ">>> 进程已起 ✅ $PKG" || echo ">>> 未检测到进程（若立即崩溃，看下方日志）"
fi

# ---------- 日志摘要 ----------
echo ">>> 日志摘要（Unity/AndroidRuntime/rokid/FATAL，最近 30 条）"
"${A[@]}" logcat -d -t 300 2>/dev/null | grep -E 'Unity|AndroidRuntime|rokid|FATAL' | tail -30 || echo "logcat 无匹配"

echo ">>> 完成。实时日志: ${A[*]} logcat -s Unity"