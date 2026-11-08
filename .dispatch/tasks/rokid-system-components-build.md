# 系统组件 · 打包（Unity Android APK）

- 来源：用户（要求给系统组件项目打包）
- 目标项目：rokid_system_components（/Users/chenlin/Documents/GitHub/rokid_system_components）
- 任务编号：由目标自排
- 模块：打包
- 路由裁决：目标=rokid_system_components / 通道=awf-dispatch / 理由=跨仓库打包任务，按技能「任务路由」派发到目标工作区会话执行

## 用户意图
给系统组件项目（Rokid 系统组件 / NewHandMenu）做 Unity Android 打包（按 unity-build-install 技能流程），产出 APK 并回报产物与构建校验结果。

## 硬约束
- 目标项目与任务编号：rokid_system_components，任务 ID 由目标自排；按目标项目 AGENTS.md 与对应流程技能执行
- 打包规则（unity-build-install 技能硬性约束）：先检查项目自带打包工具（check-build-tools.sh），有则优先用；无则 Unity 默认打包流程；**任何情况不配置/添加场景，只打默认场景**；不擅自修改场景或覆盖用户变更（构建后核验场景零改动）
- 修改范围：仅构建所需（构建配置/产物）；不做与打包无关的代码修改
- 明确不做：不 push；不新增/改动其他项目；不改动用户已做的场景/资源变更
- 提交要求：只允许本地 commit，禁止 push
- 分析归属：前置分析（工具判定/通道选择/端口探测/弹框处理）在本会话内用目标仓库 tools/ 与 memory/history 完成，有疑问返回派发方决策
- 设备：有可用设备则按技能默认安装并启动；无设备则给出产物路径与安装说明

## 验收标准
- [ ] 按 unity-build-install 技能完成打包：产物 APK 存在（给出路径与时间戳），构建校验通过（totalErrors=0 / BuildReport 口径）
- [ ] 场景零改动核验（git diff / 状态）无意外变更
- [ ] 装到设备（若设备可用）/ 或说明设备状态；仅本地 commit（禁 push）
- [ ] 回执格式：状态 / 产物路径 / 验证结果 / commit / 阻塞
