# 正在开发

> 任务从 `todo.md` 移入此文件开始执行，完成后移入 `done.md`。
> 优先级只写 `P0` / `P1` / `P2` / `P3`。
> `awf status` 会解析本文件，任务块格式必须保持：`## [ID] 标题` + 字段表 + `### 下一步`。

## [DEV-101] 最近完成区兼容多列归档行（parseDoneRows 4/5/6 列）

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | active |
| Owner | lead |
| 协作模式 | single |
| 来源任务 | 跨项目派发任务包（DEV-101） |
| 修改范围 | dsh-plugin/src/ledger.js（仅 parseDoneRows）、dsh-plugin/test/ledger.test.js（追加 parseDoneRows 用例）、dsh-plugin/package.json（版本递增）、dsh-plugin/README.md（变更说明） |
| 分支/工作区 | dev（agent-workflow-kit） |
| 依赖 | DEV-100 已完成并归档（HEAD 3920b4a，工作区干净） |
| 最近更新 | 2026-11-03 |

### 目标
看板「最近完成」数据来自 `parseDoneRows(md, n)`（dsh-plugin/src/ledger.js），与 parseTodoRows 共用同一个 4 列正则 `| ID | prio | desc | date |`；但项目 done.md 归档行是加宽格式（dev/debug 6 列 `| ID | P | 标题 | 摘要 | 完成日期 | 链接 |`、docs 5 列 `| ID | P | 任务 | 摘要 | 完成日期 |`），全部不匹配 → `ledgerOf(path).recent = []` → 最近完成区永远不渲染。本次让 parseDoneRows 兼容 4/5/6 列：行首锚定 `| ID | prio |` 不变，desc = 第 3 列，完成日期 = 行内第一个合法 YYYY-MM-DD（天然兼容日期后还有链接列的行型），无日期行跳过；排序为日期倒序 + 同日按归档先后倒序（越晚归档越靠前）；4 列行结果与旧实现一致（回归）。

### 验收标准
- [x] 单测：`dsh-plugin/test/ledger.test.js` 追加 parseDoneRows 用例（4 列、5 列 docs 型、6 列 dev/debug 型（日期后带链接列）、表头/分隔行跳过、无日期行跳过、倒序 + 截断 n）；`cd dsh-plugin && node --test` 18/18 全绿
- [x] 真实数据实测：`ledgerOf('/Users/chenlin/projects/UnityProjects/uxrsample')` 的 recent 非空且按完成日期倒序（外部会话执行，符合现状语义）
- [x] 同步已安装副本：`~/.dsh/profiles/desktop/node_modules/dsh-awf-dashboard/src/ledger.js`（及 lib/client.js、lib/index.js、README.md、package.json）与 kit 源一致
- [x] 版本：dsh-plugin/package.json 0.2.1 → 0.2.2；README 补 0.2.2 变更说明
- [x] `node --check src/ledger.js && node --check lib/index.js` 通过；`./agent-workflow/check_workflow.sh` 全绿；`./agent-workflow/bin/awf status` 刷新（status.md 最近完成已倒序）；本地 commit 消息含 DEV-101，未 push
- [x] 排序列补充（主线合并）：同日按归档先后倒序（done.md 文件靠后的行 = 越晚归档 = 排越前），status.md 与面板一致；`_row` 仅作排序键，返回前剔除保持 {id,prio,desc,date} 契约

### 下一步
主线已合并外部会话实现 + 叠加排序优化，测试与校验全绿；待 commit 后归档。