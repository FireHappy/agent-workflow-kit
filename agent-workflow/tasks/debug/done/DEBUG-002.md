## [DEBUG-002] 最近完成同日排序回归：最新完成任务不排第一（目录式字母序 / legacy 行序反转）

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | done |
| Owner | lead |
| 协作模式 | single |
| 来源任务 | 用户直接报告（面板最近完成显示的多为旧任务） |
| 修改范围 | dsh-plugin/src/ledger.js（ledgerOf recent 排序次键）、dsh-plugin/test/ledger.test.js（新增 2 组）、dsh-plugin/package.json（0.3.2→0.3.3）、dsh-plugin/README.md（变更说明） |
| 分支/工作区 | dev（agent-workflow-kit） |
| 依赖 | DEV-127 目录式账本（v1.0.0 迁移）+ DEV-102 recent 全局排序 |
| 最近更新 | 2026-11-04 |
| 完成日期 | 2026-11-04 |

### 现象
插件「最近完成」列表的首条不是最近完成的任务：kit 面板显示 DEV-115…122（同日 11-04 批次），而最新完成的 DEV-129…134 被截掉——「为啥好多都是之前的任务」。legacy 项目（rokid_system_components）同日组内顺序反转（表顶最新 DEV-029 排最后）。

### 假设（已证）
`ledgerOf` 的 recent 全局排序**只有日期键**（`b.date.localeCompare(a.date)`，稳定排序保收集序）：
- 目录式（DEV-127）：done 桶按 readdir 收集 → 同日记录按**文件名字母序**（DEV-115…122 恒在 DEV-129…134 前）→ top-8 全是旧批次；
- legacy：表格行**顶部插入**（最新=最小行号），parseDoneRows 同日按**行号倒序**（`b._row - a._row`）→ 当日最早归档的反倒在最前。
顺序发号的任务系统里 ID 数值递增 ≈ 完成先后，可作同日稳定次键。

证伪：real data 复现（kit recent = DEV-115…122 字母序）；三项目修复后验证（kit DEV-134、uxrsample DEV-074、rokid DEV-029 打头）。

### 验收标准
- [ ] ledgerOf：recent 排序 = 日期倒序 + 任务 ID 数值倒序（numId 辅助键）；recent 结构与数量（前 8）不变，前端零改动
- [ ] 单测 35/35：新增目录式同日 ID 倒序、legacy 同日 ID 倒序两组
- [ ] 真实数据三项目（kit/uxrsample/rokid_system_components）最前条 = 各自最新完成任务
- [ ] 版本 0.3.2 → 0.3.3 + README 变更说明；同步已安装副本；check_workflow 全绿；本地 commit 含 DEBUG-002，未 push

### 下一步
实现 + 测试已绿；待归档。
