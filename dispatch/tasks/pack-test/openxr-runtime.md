# 打包 openxr-runtime（链路测试）

- 目标项目：openxr-uxr（/Users/chenlin/projects/OpenXR-UXR）
- 任务编号：（目标按自身账本体系自排，如 DEV-xxx；禁止 UP-xxx）
- 来源：用户
- 路由裁决：目标=openxr-uxr；通道=awf-dispatch；理由=用户在 kit DEV-160 完成后要求派发一个打包任务做派发链路测试

## 任务

按 OpenXR-UXR 的既有打包流程（tools/ 手册与 memory/history 的上轮打包结论：openxr-runtime / Rokid OpenXR Runtime，目标平台/产物以项目既有打包脚本与上轮结论为准）执行一次 runtime 打包，产出可用的构建产物。

## 硬约束

- 全程在 OpenXR-UXR 工作区会话执行；本地 commit 禁 push（仅当产生产物/脚本改动时提交）
- 需用户确认时按 DISPATCH-141 阻塞回报，不擅自决定

## 验收标准

- [ ] 打包产物生成（路径 / 文件名 / 大小说明）
- [ ] 有可提交改动 → 本地 commit（消息含目标自排任务编号，禁 push）
- [ ] 回报：产物路径、验证结果（构建日志关键行）、commit（如有）
