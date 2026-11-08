# awf-dispatch 熄屏探针 SIGSEGV：ctypes 句柄用错 → 指针截断（KIT-DEBUG-001）

> 归档沉淀（收尾补齐，2026-11-08）。关联任务：KIT-DEBUG-001（跨项目派发 DEBUG-001 续）。

## 根因（可复用结论）

macOS 上 `awf-dispatch` 锁屏探针 `_session_locked_cg()` 以 ctypes 调 CoreFoundation：同一 `CFBooleanGetValue` 函数在两个句柄上都有（`cf` / `cg` 分别为 CoreFoundation / CoreGraphics 动态库句柄），但 **argtypes/restype 只在 `cf` 句柄上声明过**。

- 正确声明：`cf.CFBooleanGetValue.argtypes=[ctypes.c_void_p]` / `restype=c_uint8`
- 错误调用：`cg.CFBooleanGetValue(v)` —— cg 句柄对该函数未设 argtypes，ctypes 默认按 **32 位 `c_int`** 传参，64 位 CFBooleanRef 指针被截断（kCFBooleanTrue 真实地址 `0x204983eb8` → `0x4983eb8`），`CF_IS_OBJC` 读无效地址 → SIGSEGV。

## 复现与回归对照（隔离子进程验证）

- bug 写法（cg 句柄调 CFBooleanGetValue，未设 argtypes）→ 段错误 exit=139
- 修复写法（cf 句柄调 CFBooleanGetValue，已设 argtypes/restype）→ 返回 1，exit=0 不崩
- `awf-dispatch --screen-state` 修复后输出 on，不崩

## 修法

`dsh-awf-dashboard/skills/cross-project-dispatch/scripts/awf-dispatch` 第 749 行：`cg.CFBooleanGetValue(v)` → `cf.CFBooleanGetValue(v)`（一字句柄修正，变更最小）。

## 通用教训

- ctypes 调同一动态库导出函数，**声明与调用必须在同一句柄上**；换句柄 = 丢 argtypes = 指针截断类崩溃。
- 强类型平台（macOS CoreFoundation/CoreGraphics）ctypes 探针请一律显式声明 `argtypes`/`restype`，不确定时先隔离子进程验证再上线。
- 诊断信号：`~/Library/Logs/DiagnosticReports/Python-*.ips` 反复出现即按此方向排查。