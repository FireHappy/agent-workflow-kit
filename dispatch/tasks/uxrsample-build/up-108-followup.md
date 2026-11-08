# UP-108-FU uxrsample APK 验收不符：产物不存在，请核实

- 来源：工作流
- 目标项目：uxrsample（/Users/chenlin/Documents/GitHub/uxrsample）
- 任务编号：UP-108-FU
- 类型：debug
- 模块：打包
- 路由裁决：目标=uxrsample / 通道=awf-dispatch / 理由=派发方独立核验发现验收不符，追问修复

## 用户意图
派发方独立核验 UP-108 完成回执时发现事实不符：
1. `/Users/chenlin/Documents/GitHub/uxrsample/build/uxrsample.apk` **不存在**（build/ 仅有 `_backup_up108/` 旧包 81,148,387 B）；`find -name "*.apk"` 无新产物。
2. 回执引用的构建日志（build.log line 1589）**未找到**；build/ 无 *.log。
3. `git status` 显示 `M ProjectSettings/ProjectSettings.asset`（preloadedAssets 新增 3 条）——与回执「无 ProjectSettings 改动」不符。
4. `Temp/UnityLockfile` 残留（21:13–21:17 有 Unity 活动痕迹）。
5. 提交 50c4e93 的账本记录声称产物 81,161,603 B / mtime 21:15:05 / md5 d387633… / unzip OK —— 但实物不存在。

请核实：构建是否真实完成？APK 实际输出路径在哪（或为何消失）？ProjectSettings 改动来源与是否需要回滚？Temp/UnityLockfile 是否有残留 Unity 进程？若未真实产出，请按 unity-build-install 技能重新执行一次 batch 构建并做四验（BuildReport/ZIP/level0/场景 hash），产物落到 build/uxrsample.apk；若确有产物但路径不同，请给出实际路径与校验。同时如实报告副作用与账本修正（50c4e93 的声称需与实际对齐）。

## 硬约束
- 目标项目与任务 ID：/Users/chenlin/Documents/GitHub/uxrsample / UP-108-FU
- 修改范围：仅构建产物与必要副作用恢复；不改场景/Build Settings；不回滚用户改动
- 明确不做：不安装设备、不 push、不重复构建（除非首次未真实产出）
- 提交要求：修正账本记录（本地 commit，禁 push）

## 验收标准
- [ ] 给出 APK 实际存在证据（路径/大小/mtime/md5/unzip -t）
- [ ] 说明 ProjectSettings 改动来源并处理（保留或恢复，需与用户基线一致）
- [ ] 说明 Temp/UnityLockfile 与 Unity 进程状态
- [ ] 账本 50c4e93 声称与实际对齐；回执：状态 / 证据 / 修复动作 / 阻塞
