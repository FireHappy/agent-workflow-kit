---
name: unity-mcp
description: "AnkleBreaker Unity MCP 使用技能：通过 MCP 连接并操作 Unity 编辑器（选实例、ping/state、编译轮询、Console、Play Mode、Player 构建）。先检查项目是否安装 com.anklebreaker.unity-mcp，未安装则先装（写 manifest.json 依赖，不手改 packages-lock.json），再连接。触发场景：任何需要操作 Unity 编辑器状态/场景/构建/日志的请求；'用 MCP 操作 Unity''连接 Unity''Unity 装 MCP 了吗' 等。"
---

# unity-mcp — AnkleBreaker Unity MCP 使用技能

通过 **AnkleBreaker** `com.anklebreaker.unity-mcp` 连接并操作 Unity 编辑器。本机已验证项目：uxrsample（Unity 2022.3.62f3c1）。

## 触发规则（硬性）

- 需要读/改 Unity 编辑器状态（编译、场景、GameObject、Console、Play Mode、构建、截图、Profile）→ 本技能
- 用户问「Unity MCP 装了吗 / 怎么连 / 用 MCP 打包」→ 本技能
- 官方 Unity MCP（com.unity.ai.assistant）**不可用**（要求 Unity 6.0+ 且官方已弃用）——本项目用 AnkleBreaker，不要尝试装官方。

## 第 1 步：检查项目是否安装了 MCP 插件

```bash
bash <skill-dir>/scripts/check-mcp.sh <工程根目录>
```

判定：读 `<工程>/Packages/manifest.json` 的 `dependencies`：

- 有 `"com.anklebreaker.unity-mcp"`（git 依赖）→ 已安装，进第 2 步
- 无 → **先安装**（第 1.5 步）

### 第 1.5 步：未安装 → 安装

1. 加依赖：把 `"com.anklebreaker.unity-mcp": "https://github.com/AnkleBreaker-Studio/unity-mcp-plugin.git"` 写进 `manifest.json` 的 `dependencies`（python/patch 精确插入，保持 JSON 合法）。
2. **不手改 `packages-lock.json`**（Unity 拥有它，冲突/锁文件问题交给 Unity 解决）。
3. 让 Unity 导入：编辑器开着则等它自动 resolve（可观察 Library/PackageCache 出现 `com.anklebreaker.unity-mcp@<hash>`）；没开则打开/重启项目等导入。
4. 验证安装：`ls <工程>/Library/PackageCache | grep anklebreaker` 或重跑 check-mcp.sh。

## 第 1.7 步：确保编辑器已启动（项目没开 → 先启动项目）

目标：目标工程必须处于**编辑器打开**状态（MCP 依赖运行中的编辑器进程）。**默认先检查，没启动就启动，再继续连接。**

1. 检测是否已启动（任一成立即已开）：
   - 端口监听：`lsof -iTCP:<port> -sTCP:LISTEN` 有 Unity 进程（本机惯用 :7891）
   - 实例存活：读 `~/.local/share/UnityMCP/instances.json` 中 `projectPath == <工程>` 的 `processId`，`ps -p <pid>` 存在
   - Unity 进程：`pgrep -f "Unity.*<工程目录名>"` 非空
2. 未启动 → **启动项目**（编辑器正常模式，**不要 `-batchmode`**；MCP 需要编辑器 UI 进程）：
   - 主：用 Hub 编辑器绝对路径后台启动
     `<版本>/Unity.app/Contents/MacOS/Unity -projectPath <工程根> &`
     （版本从 instances.json 的 `unityVersion` 或 `ls /Applications/Unity/Hub/Editor/` 取，如 `2022.3.62f3c1`）
   - 兜底：`open -a Unity --args -projectPath <工程根>`（LaunchServices 按关联版本打开；Hub 多版本时也可 `open -a "Unity Hub" --args -projectPath <工程根>`）
3. 等待就绪（首次启动慢，给足超时）：
   - 轮询（每 15s，最长 3-5 分钟）：端口监听出现 → instances.json 出现对应 processId → `unity_editor_ping` 成功
   - 就绪后进入第 2 步选实例
4. 启动失败（进程起不来 / 持续无端口 / ping 不通）：读启动日志（`/tmp/unity-<工程名>.log` 或 Console）诊断：许可证弹窗、工程被锁（Library 占用）、版本不符等；**上报阻塞原因，不静默换 batch**。

## 第 2 步：选实例并连接

1. 编辑器已启动（第 1.7 步保证）且插件装入（`lsof -iTCP:<port> -sTCP:LISTEN` 可见 Unity；本机惯用 :7891）。
2. 实例清单：读 `~/.local/share/UnityMCP/instances.json`，找 `projectPath == <工程>` 的条目（含 port、unityVersion、processId）。
3. 多实例且歧义 → **问用户选哪个 port**，不猜。
4. 连接：`unity_select_instance <port>` → `unity_editor_ping` → `unity_editor_state`；后续每个 `unity_*` 调用带该 port。

## 第 3 步：操作规则（记牢）

1. 宿主暴露 `mcp__unity_mcp__unity_*` / `unity_*` 工具时：**一律经 MCP 工具**操作编辑器——不要直调 `http://localhost:<port>/api/...`（HTTP bridge 是 MCP 服务器内部实现，直连丢 queueing/retry/身份/多实例路由）。宿主确实没有 MCP 工具时，才可降级走 HTTP execute-code（见 unity-build-install 降级通道，历史实测 2026-11-04）。
2. 改 C#/资源后：轮询 `unity_editor_state` 直到 compilation/import 完成，再用 `unity_console_log` 查错，再继续。
3. 复现/受控实验前：`unity_console_clear` 清旧消息，避免误判证据。
4. 编辑内复现用 `unity_play_mode`；**Player 构建优先直接按按钮**——项目有打包菜单项时用 `editor/execute-menu-item`（参数 `menuPath`，如 `Tools/Build Android APK`；实现为 `EditorApplication.ExecuteMenuItem`）直接触发该按钮；没有菜单按钮再用 `unity_build` / `StartBuild`（Build Settings Build 按钮同一入口，跟随项目默认场景，**不要传自定义场景集**，与 unity-build-install 打包决策约束一致）。
5. 高级能力用 `unity_list_advanced_tools` 发现 + `unity_advanced_tool` 调用。
6. **永不手写 Unity `.meta` 文件**。

## 标准验证流程

1. 确认选中实例的 `projectPath` 与目标工程一致
2. `unity_editor_state` 报 compilation 完成
3. `unity_console_log` 读错误
4. 跑最小相关的 Play Mode / 构建验证
5. 复查 Console；项目既有无关失败单独上报

## 恢复

- 无实例：先查 manifest 是否装了插件 → 未启动则按第 1.7 步**启动项目**（等待端口/实例出现）→ 等包 resolve 后重扫
- 编辑器开着但无响应：刷新实例发现，重试 `unity_editor_ping`；仍不行重启编辑器（关进程 → 第 1.7 步重开）
- 多于一个实例匹配：不猜，显式选目标 port
- MCP 始终不可用：上报连接阻塞原因，**不要静默换到别的 Unity 自动化栈**

## 与本技能组的关系

- `unity-build-install`：Unity 打包 + 安装（内置打包决策约束：有工具优先/默认打包/不配置场景；通道 A 即本技能；通道 B 命令行 batch）