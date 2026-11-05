# 派发链路测试：runtime APK 安装测试（2026-11-05）闭环归档

**关联**：DISPATCH-133/138/141/145/146/147/152；目标 OpenXR-UXR（DEV-057）
**状态**：闭环完成

## 链路验证结论（全环节实测）
1. 票据 M1 校验：缺 4 行必惫头部（目标项目/任务编号/来源/路由裁决）被拒（退出码 2）→ 补全后通过
2. 前置门 G1-G4：工作流/工作区/可写/通道全 ok
3. G3 多写者保护：目标已有 active（DEBUG-001）→ `--new --allow-active` 放行（不干扰）
4. 会话上限 3：派发方已有 4 个 [awf] 会话 → `--force` 强制新建（隔离）
5. 异步派发：立即返回会话 ID（session-10dc9439），不钉住主会话
6. 回报通道：受理（必报点1+2）与完成（必报点10+收尾句）均经 `--report` RPC 直投派发方 inbox，未降级
7. 完成核验：设备 libopenxr_rokid.so md5（9846ec…c3ffe）与构建产物逐字节一致；logcat 0 FATAL；in-process 无独立 runtime 进程（客户端 3327 存活=预期）

## 可复用结论
- runtime inProcessStation3Release 安装测试链路已跑通：无线设备（192.168.3.102：5555）→ adb install -r → 启动客户端（com.rokid.uxrsample_openxr）→ in-process 形态验证
- 会话上限 3 注意：派发频繁时超限用 --force（新建）或 --prune（清理），避免会话堆积
- 回报消息标题 2026-11-05 起更名【回执请求】（客户端 matcher 兼容新旧）
