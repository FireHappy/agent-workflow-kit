---
name: unity-build-install
description: "Unity Android 打包 + 设备安装技能（面向 OpenXR UXR / uxrsample）。内置打包决策约束：先检查项目有无自带打包工具（check-build-tools.sh），有则必须优先用；无则 Unity 默认打包（Build Settings 默认流程）；任何情况不得配置/添加场景，只打默认场景。依赖 unity-mcp 技能连接编辑器（检查/安装 com.anklebreaker.unity-mcp、确保编辑器已启动（未启动先启动项目）、选实例）。执行：先确保 Unity 编辑器已启动（未启动则启动项目）再走 MCP 通道；编辑器无法启动/明确无人值守才降级命令行 batch。装完设备默认启动应用；给设备 IP 先检查连接、未连接先 adb connect。触发：'打包''打 APK''出包''装到设备''重装调试'。"
---

# unity-build-install — Unity 打包 & 安装技能

Unity 工程的打包决策约束 + 执行与安装细则。使用前先按「打包决策（硬约束）」定方式，通道 A 再按 `unity-mcp` 技能连接编辑器。

## 触发规则（硬性）

- 用户要求「打包 / 打 APK / 出包 / 构建 Android」→ 本技能（先走打包决策，再执行）
- 用户要求「装到设备 / 重装 / 跑一下」且已有/现打 APK → 本技能安装段
- 纯代码修改不产包 → 不用本技能

## 任务路由（硬性，先判定再动手）

打包目标可能是**本会话工作区外的另一个项目**，先判定归属再定执行方式：

1. **目标工程 == 当前会话工作区** → 本技能直接执行（本地操作编辑器/MCP）。
2. **目标工程 ≠ 当前会话工作区**（如本会话在 agent-workflow-kit，要打 uxrsample 的包）→ **一律走跨项目派发**（`awf-dispatch`）：写打包票据（含用户意图/硬约束/验收标准）→ 派发到目标工作区自己的会话 → 目标 agent 在其工作区加载本技能执行 → 回报核验。**调度方不直接在主会话操作目标 Unity 工程**（避免 Library 锁冲突、任务归属混乱、越权改目标仓库）。
   - 前置：目标有 agent-workflow 且已登记为当前 harness 工作区（G1-G4 门）；不满足先 `awf init` / `--add-workspace`。
   - 派发票据必须携带本技能的全部硬约束（不配置场景 / 默认打包 / 场景零改动校验），目标 agent 照技能执行。
3. **边界**：纯远程/无人值守且目标无工作区会话 → 明确告知用户不可自动打包，不要越过派发通道直接 batch 到别的仓库。

> 反例教训（2026-11-07）：主会话直接操作 uxrsample 编辑器多次卡住（RokidImageLibraryBuildProcessor DisplayProgressBar 在休眠屏幕下挂起 → MCP 30s 超时），长期占用主线；正确做法是派发到 uxrsample 会话执行。

## 打包决策（硬约束，按序执行，不可跳步）

### 第 0 步：预检场景（只在「默认按钮打包且场景为空」时才问用户）

**读** `ProjectSettings/EditorBuildSettings.asset` 的 `EditorBuildSettings.scenes`（enabled 集合），但**是否提问按场景决定**：

| 情形 | 场景处理 |
|---|---|
| 有打包工具 | **不问**——工具自带场景逻辑（自带场景 / 取默认场景），按工具默认打 |
| Unity 已开启 | **不问**——走 MCP，打**默认打开的场景**（Build Settings 默认流程） |
| 无工具 + Unity 未开启 + 需启动 Unity 走默认按钮 | 若 enabled 场景 ≥ 1 → 继续；**= 0（或文件缺失）→ 停下问用户**：「a. 提供场景路径（我再设置）/ b. 你手动在 Build Settings 添加 / c. 仍按空打（不推荐）」 |

**规则**：**不擅自在第 0 步前置提问**——先在流程中判「有无工具 / Unity 是否开启」，只有真正走到默认按钮打包且场景为空时才问。场景校验基线：`git hash-object ProjectSettings/EditorBuildSettings.asset`（或非 git 用 md5sum）记录构建前值，构建后必须一致。

### 第 1 步：检查项目有无自带打包工具

```bash
bash <skill-dir>/scripts/check-build-tools.sh <工程根目录>
```

判定口径（满足任一即「有打包工具」）：

1. `Assets/Editor/`（或 `Assets/**/Editor/`）下存在**可被 -executeMethod 调用的静态无参方法**（如 `BuildScript.BuildAndroid()`、`BuildApk.Build()`）
2. 存在**打包菜单项**：`MenuItem("Tools/Build ...")` 等
3. 接入 MCP 的 `unity_build` 属执行通道，不算项目工具

### 第 2 步：判 Unity 是否已开启 → 已开启走 MCP（查工具→无工具走默认按钮）；未开启走 batch 或启动

先判定 Unity 编辑器是否已开启（进程 / 端口探测 / instances.json）：

- **端口探测（不写死单一端口）**：扫 `lsof -iTCP:7890-7899 -sTCP:LISTEN`（AnkleBreaker 桥起在 7890-7899 首个空闲；**实际常用 7890**，skill 不再写死 7891）+ `/api/ping` 校验 `projectPath == 目标工程` 才确认命中
- **实例清单**：读 `~/.local/share/UnityMCP/instances.json`，找 `projectPath == 目标工程` 条目（含实际 port、processId），`ps -p <pid>` 确认存活

> **多实例防呆**：扫到多个 Unity 实例/端口时**不猜**——逐实例 `/api/ping` 校验 `projectPath == 目标工程`，唯一命中才用；多个命中或全不中 → 汇报并让用户选（或提示目标工程未开）。

```text
Unity 已开启            → 通道 A（MCP）：先查打包工具 → 有工具用工具；没有工具走 MCP 默认按钮打包
Unity 未开启 + 有打包工具 → 通道 B（batch）：-executeMethod <类名.方法>，不启动编辑器（默认）
Unity 未开启 + 无打包工具 → 按第 3 步启动 Unity → 走默认按钮打包（batch 无 -executeMethod 可挂）
```

**分支 2.1：Unity 已开启（MCP 通道）**
- 查打包工具（check-build-tools.sh）：**有工具** → 按序调用（**不要用 execute-code 调项目工具**——Roslyn 编译上下文不含项目程序集，实测报 `The name 'BuildScript' does not exist`）：
  1. 有菜单项 → `editor/execute-menu-item` 传 menuPath（最贴近用户操作）
  2. 无菜单 → 若 MCP 支持反射（`Type.GetType`）可试，否则告知切 batch 或手动
- 工具若带输出路径/场景等自有参数 → 按工具自身默认值，不替它改
- 工具若带输出路径/场景等自有参数 → 按工具自身默认值，不替它改

**分支 2.2：Unity 未开启 + 有打包工具（batch 默认）**
- `bash <skill-dir>/scripts/build-apk.sh -p <工程> -o build/<产物>.apk -m <类名.方法>`（VERSION 撞名检查内置）
- **不启动编辑器**（batch 直接构建，避免拉起 UI 引入锁/弹框/休眠挂起）
- **多工具选择**：优先「产物名匹配意图」（如要 uxrsample.apk 选产出该名者）；再按「取默认场景的优先于硬编码场景」；仍多个 → 列出全部停问用户，不猜

### 第 3 步：没有打包工具 → 启动 Unity 走默认按钮打包流程

「默认打包」= Build Settings 里 **Build 按钮**行为一致。**无工具时：Unity 未开启才启动**（方向 2.1 中 Unity 已开启则直接走此落地）：

- **场景**：只取 `EditorBuildSettings.scenes` 中 `enabled=true` 的启用集合；**为空 → 先按第 0 步情形「无工具+未开启」问用户，不按空打**
- **目标/配置**：Build Target、IL2CPP、包名等全部跟随 Player Settings 现状
- **落地（按优先级）**：
  1. **直接调用对应的按钮/菜单项**（最贴近用户操作）：有打包菜单项（check-build-tools.sh 会列出 `(menuPath)`）→ MCP `editor/execute-menu-item` 传 menuPath（如 `Tools/Build Android APK`）；AnkleBreaker 插件实现为 `EditorApplication.ExecuteMenuItem(menuPath)`——编辑器未开启先照 unity-mcp 第 1.7 步启动
  2. 无菜单按钮 → MCP 的构建命令（`unity_build` / `StartBuild`，即 Build Settings Build 按钮背后的同一入口），不传自定义场景集，跟随项目默认
  3. MCP 不可用 → 告知用户去编辑器 Build Settings 点 Build，**不擅自在仓库加构建脚本**

### 硬约束（违反即视为打包失败处理）

1. **不得配置场景**：无论 `EditorBuildSettings.scenes` 为空还是已有集合，**禁止**修改 `ProjectSettings/EditorBuildSettings.asset` / `m_Scenes` 添加删除场景。**校验**：git 仓库 `git diff -- ProjectSettings/EditorBuildSettings.asset` 为空；非 git 仓库（无 .git）用 `md5 -q ProjectSettings/EditorBuildSettings.asset` 前后一致 + enabled 场景数（`grep -c "enabled: 1"`）不变。
2. **不得发明打包工具**：项目没有自己的构建脚本时，禁止在 `Assets/Editor/` 新建构建类；直接走默认打包。
3. **不得替工具改参数**：有工具时用工具默认参数与输出路径。
4. 打包后核对场景零改动：`git -C <工程> diff -- ProjectSettings/EditorBuildSettings.asset` 应为空。
5. **构建期弹框**：检测到已知安全弹框 → **自动点击通过**（见下节）；**白名单外/破坏性弹框（覆盖保存、删除、许可证激活、下载安装确认）→ 停下问用户，不擅自点**。

## 通道选择（先判）

0. **默认通道 = 按第 2/3 步工具结论决定，不预先启动 Unity**：
   - **有打包工具** → 默认 **通道 B（batch）** `-executeMethod`；仅当 Unity **已启动**时才走通道 A（MCP）。
   - **没有打包工具** → **才启动 Unity**（照 `unity-mcp` 技能第 1.7 步：Hub 编辑器路径后台启动 → 轮询端口/实例出现，最长 3-5 分钟）→ 通道 A 走默认按钮打包流程。
   - 编辑器**无法启动**（许可证弹窗/工程锁/版本不符，已诊断仍失败）或**明确无人值守无 GUI** → 通道 B（batch）兜底并在汇报说明降级原因（无工具时 batch 等价调用无法挂 -executeMethod → 告知用户去编辑器 Build Settings 点 Build）。

### 通道 A：Unity MCP

- **前置：屏幕唤醒检查**——`system_profiler SPDisplaysDataType | grep "Display Asleep"` 为 Yes 时**先唤醒**（`caffeinate -u -t 3`）或提示用户，**不在休眠状态触发构建**（DisplayProgressBar 在休眠下挂起主线程 → MCP 30s 超时，2026-11-07 实测）。
- 连接：按 `unity-mcp` 技能（实例匹配 projectPath → select port → editor_ping/state → compilation 完成后 console 查错）。
- 构建：**优先直接调按钮/菜单项**——有打包菜单（check-build-tools.sh 的 `(menuPath)` 列表）→ `editor/execute-menu-item` 按该按钮；无菜单且**有项目打包工具**（第 2 步结论）→ 有 batch 用 batch `-executeMethod`，编辑器已开且必须 MCP 时试反射 `Type.GetType("类名").GetMethod("方法")`（Roslyn execute-code 不可调项目工具，实测失败）；**无工具**（第 3 步）→ `unity_build`（跟随项目默认场景）。
- 判据：compilation=0 error；产物时间戳=构建时刻。
- **产物名确认**：构建后 `ls -la build/*.apk` 核对文件名与预期一致（如 `uxrsample.apk`），**不是**误产出 `demo.apk` 等其它名；产物若未被 gitignore 则确认不入库（提示用户，不擅自 commit 产物）。

### 通道 B：命令行 batch

- **有工具**：`bash <skill-dir>/scripts/build-apk.sh -p <工程> -o build/<产物>.apk -m <类名.方法>`（内含 VERSION 撞名检查、可选 -c 清产物、产物校验、RKImage.db 提示）。
- **无工具（默认打包）**：等价调用见「第 3 步」；宿主无执行能力则告知用户去 Build Settings 点 Build。
- 兜底手写（有工具时）：
  ```bash
  /Applications/Unity/Hub/Editor/2022.3.62f3c1/Unity.app/Contents/MacOS/Unity \
    -batchmode -quit -nographics -projectPath <工程> \
    -executeMethod <类名.方法> -logFile /tmp/uxr_build.log
  ```

## 构建期弹框处理（有弹框就自动点击处理掉）

构建（通道 A 编辑器内）期间 Unity 可能弹模态框阻塞主线程/构建：**主线程被弹框占用 → MCP 调用 30s 超时（返回 "Timed out after 30s waiting for main thread" + ticketId，ticket 排队）→ 必须先把弹框处理掉，构建才能跑。**

**确定有弹框**：构建提交返回主线程超时 / ticket 不前进 / 构建卡住无产物 → 跑弹框流程。

**弹框流程（语义理解，2026-11-06 起替代穷举白名单）**：弹框无法穷举（不同弹框永远会有）→ **不写死规则**：

1. 转写：`bash <skill-dir>/scripts/handle-popups.sh scan <工程根>`
   - 截图（只看 Unity 窗口几何区域，不打扰其它窗口）→ mac-ocr 转写**弹框全部文字**（阅读顺序）+ 按钮候选（Yes/No/OK/Continue/Ignore/Cancel/确定/取消…中英文独立短文本块）及屏幕坐标
2. **读文字理解语义**再决定（不要机械套关键词）：
   - 继续/忽略类（如 Unsupported Input Handling 的 "Ignore and continue？"、JDK 检测、SDK 确认）→ `handle-popups.sh click <按钮文字>` 按坐标点击（如 `click Yes`）
   - 破坏性/授权类（覆盖、删除、许可证激活、下载安装确认、登录）→ **停下问用户**，附 OCR 文字
   - 无法判断 → 截图给用户
3. 点击后继续轮询 ticket/产物时间戳，可能还有后续弹框（循环 scan→click）。
4. 已知高频备忘（仅参考，不穷举）：Unsupported Input Handling（Active Input Handling=Both）→ Yes（点后本会话不再弹）；Save/Don't Save/Cancel → Don't Save；Detect JDK → Yes。反复出现 → 提示用户改 Player Settings Active Input Handling 单一模式根治（不擅改项目配置）。
5. 依赖权限：录屏（screencapture）+ 辅助功能（osascript）；权限缺失时报告，不静默。

## 构建失败处理（检查 → 修复 → 重试 → 最终报告）

**任何构建失败都不直接结束**：查日志定位 → 能修则修 → 重试（最多 2 轮）→ 最终无论成败输出结构化报告。

1. **失败判据**：MCP 构建 result=Failed / 产物未生成或时间戳未更新 / 编译日志 totalErrors>0 / 构建超时后仍无产物。
2. **查日志（先诊断再动手）**：
   - MCP：`unity_console_log`（Console 错误行）＋ `unity_editor_state`（compilation 状态）
   - Unity 侧：`<工程>/Library/Logs/Unity/Editor.log` 尾部（构建/IL2CPP/资源错误）
   - 通道 B：batch 的 `-logFile` 指定日志（如 /tmp/uxr_build.log）
   - 弹框阻塞 → 先跑 handle-popups.sh（上节）
3. **修复（按错误分类，能修才修）**：
   - C# 编译错误 → 定位报错文件/行，修复源码后重新编译再打包；改动属示例代码（本工程 Assets/）直接改，属 SDK/运行时仓库 → **派发**（跨项目工作流），不跨仓直改
   - 环境类（JDK/SDK/许可证）→ 按日志指引（确认路径/装组件），不能修的**停下问用户**
   - 场景/构建设置类 → 遵守硬约束（不配场景/不改工具参数），把报错原文给用户定夺
4. **重试**：修复后重新走打包流程（再次触发构建按钮或 batch）；**每轮修复都要有日志依据**，同一错误不无脑重试；连续 2 轮失败 → 停止，进入报告。
5. **最终报告（无论成功失败都输出）**：
   - ✅ 成功：走「验收清单」逐条核对后汇报（决策/通道/时长/产物/安装启动/日志关键行/场景校验）
   - ❌ 失败：汇报 失败环节 / 日志关键错误行 / 已做修复尝试（每轮的修复依据）/ 剩余阻塞点 / 建议下一步（含需要用户决策的事项），**不得只报“打包失败”四个字**

## 安装 & 启动 & 日志（两通道共用）

```bash
bash <skill-dir>/scripts/install-apk.sh <apk路径> [包名] [设备IP或serial] [--no-launch]
```

**设备解析（硬性流程）**：

- 给了设备 IP（如 `192.168.1.5` 或带端口）→ **先检查连接**（`adb devices` 匹配该 serial）；**未连接 → 先 `adb connect <ip>:5555` 尝试连接**（纯 IP 自动补无线调试默认端口）；仍失败则提示排查（同一 WiFi / 开发者选项无线调试 / 先用 USB 连一次 `adb tcpip 5555` 授权），不硬装。
- 不给设备 → **先检查有线（USB）连接的设备**（serial 不含 `:` 的条目优先）；没有有线 → 再看无线已连接设备（含 `:`）；都没有 → 提示提供设备 IP 重试。

**默认启动（硬性）**：安装完成后**默认自动启动打包的应用**（`am force-stop` → `monkey LAUNCHER` → `pidof` 校验进程）；只有显式 `--no-launch` 才跳过。

脚本全流程：设备连接检查/尝试 → `adb install -r`（覆盖安装保留数据）→ 默认启动 → logcat 抓 Unity/AndroidRuntime/rokid/FATAL 摘要。

## 验收清单（构建后逐条核对）

- [ ] 决策与 check-build-tools.sh 输出一致（有/无 + 候选方法清单）
- [ ] 产物存在且时间戳=构建时刻：`ls -la build/*.apk`
- [ ] 全量 IL2CPP 时 `build/*-IL2CPP.symbols.zip` 被重写（增量不会——不重写=增量，正常）
- [ ] 编译日志无 error（totalErrors=0）
- [ ] **场景零改动**：`git -C <工程> diff -- ProjectSettings/EditorBuildSettings.asset` 为空（铁律：不配置场景）
- [ ] 安装成功、应用默认启动、logcat 无 fatal
- [ ] 构建副作用恢复：`git -C <工程> checkout -- Assets/StreamingAssets/RKImage.db`（若被预处理重写）

## 坑（历史实测，2026-11-04 起）

1. **VERSION 撞名**：仓库根绝不能存在名为 `VERSION` 的文件（macOS 大小写不敏感遮蔽 libc++ `<version>`，IL2CPP 全量重编报 `expected unqualified-id`）。已永久修复（锚点在 agent-workflow/VERSION）；构建前 `test -e <工程>/VERSION` 检查。
2. **全量 vs 增量**：CleanBuildCache/新检出 → 全量 ≈207s（2014 编译单元）；增量走 IL2CPP 缓存快很多，symbols 不重写。
3. **RKImage.db 副作用**：构建可能重写 `Assets/StreamingAssets/RKImage.db`（tracked），构建后 `git checkout` 恢复，勿提交。
4. **版本别混**：uxrsample 用 2022.3.62f3c1；6000.3.26f1 是别的用途。
5. **无设备勿安装**：`adb devices` 为空先告知用户（可给设备 IP 自动尝试连接），不要空跑 install。
6. **构建期弹框（2026-11-06 实测）**：`execute-menu-item`/`execute-code` 触发构建后必弹 **Unsupported Input Handling**（Active Input Handling=Both 的 Android 警告），主线程被弹框阻塞 → HTTP 调用 30s 超时、构建不跑——弹框流程见上节（语义理解：scan 转写 → click Yes）；根治：Active Input Handling 改单一模式。
7. **弹框/几何与多屏**：Unity 可能开在第二屏或窗口坐标为负；handle-popups.sh 的窗口几何解析已兼容负坐标，仍异常时用 AX 直接点（按钮名可读时）或全屏截图人工处理。
8. **装错设备（2026-11-06 实测）**：`adb devices` 有线优先可能选到**用户的真机**（serial 无冒号）而非目标 Station3（无线 192.168.3.102:5555）——安装前确认设备型号（`getprop ro.product.model`/serial 与目标一致），避免把 APK 装到手机；大包（~93MB）流式安装偶发失败（`Failed [.../device offline`），禁用流式重试（`ADB_INSTALL_NO_STREAMING=1 adb install -r`）通常成功。
9. **场景被清空（2026-11-06 复现）**：Unity 编辑器启动/会话异常可能把 `EditorBuildSettings.asset` 的 `m_Scenes` 清成 `[]`（昨天 DEV-082 也发生过）——构建后**必须** `git diff -- ProjectSettings/EditorBuildSettings.asset` 核对，非空则 `git -c core.hooksPath=/dev/null checkout --` 还原（LFS hook 缺失会拦 checkout），铁律：不配置场景。

## 脚本清单

| 脚本 | 用途 |
|------|------|
| scripts/check-build-tools.sh | 打包决策第 1 步：检测项目自带打包工具（方法/菜单清单 + 结论） |
| scripts/build-apk.sh | 通道 B：batch 打包（工具优先，-m 必填） |
| scripts/install-apk.sh | 安装 + 默认启动 + 日志（设备 IP 自动连接） |
| scripts/handle-popups.sh | 构建期弹框处理：辅助功能扫描 Unity 窗口/按钮，白名单与按钮特征（Yes/No、Save/Don't Save、Continue/OK）自动点击；按钮不可读时自动降级 OCR |
| scripts/ocr_click.sh | OCR 兜底点击：截图 + mac-ocr 识别弹框确认按钮坐标并点击（需录屏+辅助功能权限） |

## 收尾

向用户汇报：决策结论（工具/默认）、构建通道、时长、产物路径、安装与启动结果、日志关键行、场景校验。产物可用 present 展示。