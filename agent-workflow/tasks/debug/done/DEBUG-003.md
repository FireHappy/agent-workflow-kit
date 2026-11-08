## [DEBUG-003] awf-dispatch 锁屏探针 SIGSEGV：CFBooleanGetValue 句柄用错 → 指针截断（跨项目派发单 KIT-DEBUG-001 续）

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | done |
| Owner | lead |
| 协作模式 | single |
| 来源任务 | 跨项目派发 DEBUG-001 续（派发单 KIT-DEBUG-001；dsh-settings 排查会话；派发方 session-b988c2ba-d2a7-4e11-8bb6-5d01d6823a0d）。本地规范化编号 DEBUG-003：awf 账本 ID 正则 `^[A-Z]+-[0-9]+$` 不支持 KIT- 前缀，按仓库惯例（KIT-DEV-017→DEV-017）归档 |
| 修改范围 | 仅 `dsh-awf-dashboard/skills/cross-project-dispatch/scripts/awf-dispatch` 第 749 行（一字句柄修正） |
| 依赖 | 机器为 macOS（CoreGraphics/CoreFoundation ctypes 探针） |
| 最近更新 | 2026-11-08 |
| 完成日期 | 2026-11-08 |

### 现象
macOS 用户报告 `~/Library/Logs/DiagnosticReports/Python-*.ips` 反复出现（2026-11-07～08 共 27 次）Python SIGSEGV @ CFBooleanGetValue。崩溃点指向 `awf-dispatch` 锁屏探针 `_session_locked_cg()`。

### 假设（已由派发方证实，待本会话复验修复）
`awf-dispatch` 第 742-743 行声明了 `cf.CFBooleanGetValue.argtypes=[ctypes.c_void_p]` / `restype=c_uint8`（正确），但第 749 行调用写成 cg 句柄的 `CFBooleanGetValue(v)`（用了 cg 句柄，该函数句柄未设 argtypes；正确声明在 cf 句柄上）。ctypes 对未声明 argtypes 的函数默认把参数按 32 位 `c_int` 传递，64 位 CFBooleanRef 指针被截断（kCFBooleanTrue 真实地址 `0x204983eb8` → `0x4983eb8`），`CF_IS_OBJC` 读无效地址 → SIGSEGV。

证伪方法/回归对照（隔离子进程验证）：
- bug 写法（cg 句柄调 CFBooleanGetValue，未设 argtypes）→ 段错误 exit=139
- 修复写法（cf 句柄调 CFBooleanGetValue，已设 argtypes/restype）→ 返回 1，exit=0 不崩
- `awf-dispatch --screen-state` 修复后输出 on，不崩

### 验收标准
- [ ] `grep -rn "cg.CFBooleanGetValue"` kit 全仓无残留（__pycache__/备份除外）
- [ ] `awf-dispatch --screen-state` 运行不崩（kit 源版本）
- [ ] 对照实验：cf 版本返回 1 不崩；cg 版本同输入必崩（139）
- [ ] kit 校验（check_workflow.sh / smoke）通过
- [ ] 回执：状态 / 变更文件 / commit / 验证结果 / 阻塞

### 下一步
修复第 749 行 → 对照实验 → kit 校验 → 归档 commit（禁 push）。

### Execution Log
- 2026-11-08 22:21 · archive · @擅长 agent 工作流框架：脚手架生成、awf 工具链、校验/发版 · 派发方核验缺项补齐：awf-dispatch 749 行 cf 句柄修复复验（md5 与本机一致、已入提交 1efbf84）；本会话完成账本收尾——状态 done、补完成日期、由 KIT-DEBUG-001 规范化编号 DEBUG-003 并归档 done/（KIT- 前缀不符 awf ID 正则，先例 KIT-DEV-017→DEV-017），check 0 FAIL 后 awf status 刷新，本地 commit（禁 push）
