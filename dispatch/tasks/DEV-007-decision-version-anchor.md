# 决定：DEV-007 版本锚点裁决（用户选定 C）

- 目标项目：FinderPathBar（/Users/chenlin/Documents/GitHub/FinderPathBar）
- 任务编号：DEV-007（续发既有任务，沿用原编号）
- 来源：用户
- 路由裁决（dsh-im → finderpathbar）：目标 finderpathbar / 通道 awf-dispatch --session（既有 DEV-007 会话 session-c5a7ebdc，21:22 续发过）/ 理由 解除 DEV-007 blocked（DISPATCH-141 契约：需用户确认的决策回派发端转述）
- 派发方关联单号：DISPATCH-135 续发（DEV-147 v1.1.2 升级批次）

## 用户裁决

**选项 C：调整 project.yaml 的 version_file 配置**（不选 A 直接写根 VERSION，不选 B 覆盖 Info.plist 应用版本）。

## 执行要求

1. **杜绝 plist 破坏**：v1.1.2 升级不得把 `Resources/Info.plist` 整文件覆盖成 `"1.1.2"`（当前 project.yaml 的 `version_file` 指向 Info.plist，kit v1.1.2 upgrade 会整文件写版本——必须先改配置再 upgrade）
2. **调整 project.yaml**：把 `version_file` 从 `Resources/Info.plist` 改到不会破坏文件的落点。合理做法参考：
   - 首选：`version_file` 指向仓库根 `VERSION`（FinderPathBar 的框架版本锚点一贯在根 VERSION，v1.0.0/v1.1.0/v1.1.1 三次升级都是；Swift 项目无 IL2CPP 撞名问题，version_file 机制本不必要）
   - 或拆出框架锚点字段：`version_file: VERSION`、`app_version_file: Resources/Info.plist` 之类（若 kit v1.1.2 支持区分框架/应用锚点，则保持 Info.plist 仅登记应用版本）
   - 务必核对 `release.md` 发版落点（Step 0 探测结论）与未来发版流程，使发版探测与升级写入一致
3. **Info.plist 语义保护**：`CFBundleShortVersionString`（应用版本）不得被写成 1.1.2，应用版本保持 1.0.0
4. 随后执行 `awf upgrade`（v1.1.2）→ 版本锚点 = 1.1.2（新落点）→ `check_workflow.sh` 0 FAIL → 本地 commit（禁 push）→ 回报

## 回报格式

version_file 改动前后对比 / 版本锚点新值 / Info.plist 是否未动 / check 结果 / commit / 阻塞。