# 正在开发

> 任务从 `todo.md` 移入此文件开始执行，完成后移入 `done.md`。
> 优先级只写 `P0` / `P1` / `P2` / `P3`。
> `awf status` 会解析本文件，任务块格式必须保持：`## [ID] 标题` + 字段表 + `### 下一步`。

## [DEV-106] 任务查看器接入 md 编辑阅读器（预览/编辑双模式）

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | active |
| Owner | lead |
| 协作模式 | single |
| 来源任务 | 用户直接触发（2026-11-03：截图对比后提出——源文件面板当前是纯 textarea/只读 pre，期望像截图②③的 md 编辑器有「预览」渲染 + 「编辑」双模式） |
| 修改范围 | dsh-plugin/lib/client.js（新增 mdToHtml 轻量渲染器 + SourcePanel 接入「阅读/编辑」tab 切换） |
| 分支/工作区 | dev（agent-workflow-kit） |
| 依赖 | v0.6.0 发版完成；stash@{0} 已有 mdToHtml 半成品 |
| 最近更新 | 2026-11-03 |

### 目标
源文件面板（SourcePanel，打开任务块原文/归档查看用）接入 md 编辑阅读器：内容区支持「阅读（markdown 渲染）/ 编辑（原文 textarea）」双模式切换，阅读模式用内置轻量 mdToHtml 渲染器（安全转义，支持标题/列表/粗体/行内代码/代码块/表格/链接/引用/分隔线），无需外部依赖。

### 验收标准
- [x] mdToHtml：HTML 全转义防 XSS；支持 # 标题 / ## 任务块 / - 列表 / 数字列表 / **粗体** / `行内代码` / ``` 代码块 / | 表格 | / [链接](url) / > 引用 / --- 分隔线
- [x] SourcePanel 内容区加「阅读 / 编辑」tab 条；阅读=mdToHtml 渲染结果（只读、样式对齐面板），编辑=现有 textarea（保留草稿/保存逻辑）
- [x] 只读态（未进编辑）默认显示「阅读」tab；点「编辑」进编辑态；保存后回阅读态
- [x] node --check 通过；check_workflow 全绿；profile 同步；本地 commit（禁 push）
- [x] 归档查看弹层同样走 md 渲染（与源文件面板阅读态一致）

### 下一步
恢复 stash@{0}（mdToHtml）→ SourcePanel 接入双模式 → 验证 → 提交。
