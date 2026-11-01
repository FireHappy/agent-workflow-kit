# 全局状态摘要

<!-- awf:status:begin -->
> 本区块由 `agent-workflow/bin/awf status` 生成，请勿手改。
> 数据来源：`tasks/*/current.md`、`tasks/*/todo.md`、`tasks/*/done.md`。

## 当前进行中

（无）

## 待处理

| 工作流 | 任务ID | 优先级 | 描述 | 登记日期 |
|--------|--------|--------|------|----------|
| dev | DEV-025 | P0 | 插件前端全量分层拆分：HTML 模板/CSS 样式/JS 逻辑/业务模块（视图组件、主题令牌、API 层、账本解析、流程常量）各自独立文件，不再全部堆在 client.js 单文件 | 2026-11-01 |
| dev | DEV-026 | P1 | 「开始任务」接 AgentTeams 真执行（方案 B）：开始=建队 DAG 执行，暂停=暂停团队，恢复=继续，完成=回填账本点亮步骤条 | 2026-11-01 |
| dev | DEV-032 | P3 | bin/awf 最近完成 sort 列错位：`sort -t' | 2026-11-02 |
| dev | DEV-033 | P1 | UI 刷新机制改事件推送：外部状态变更（归档/状态流转）时服务端通知 UI 立即刷新，替代当前 15s 轮询（POLL_MS=15000）；需服务端事件通道 + 客户端订阅 | 2026-11-02 |

## 最近完成

| 工作流 | 任务ID | 优先级 | 描述 | 完成日期 |
|--------|--------|--------|------|----------|
| docs | DOCS-003 | P1 | 默认路由：需求先转团队计划、主对话只做路由与验收，含 1 队/写点/跨项目约束 | 2026-10-31 |
| dev | DEV-022 | P1 | 页签改名 Agent Workflow + 交互增强（初始化/开始任务/归档查看/CRUD/暂停继续/删除回退/UI 重构） | 2026-11-01 |
| dev | DEV-010 | P2 | 派发票据生命周期：`--prune` 默认 dry-run，按 commit/`done.md` 判定归档；7 张已完成票据入 archive | 2026-10-31 |
| docs | DOCS-005 | P1 | 派发即建队规则固化 + 模板 harness 中立化 + 两套五项术语统一；发版 0.4.0 | 2026-10-31 |
| docs | DOCS-006 | P1 | 架构审查报告归档 | 2026-11-01 |
| dev | DEV-029 | P1 | 归档时序修正：review 返回 pass（验证完成）当场先改任务状态为「归档」，done.md 移入/status 刷新/commit 是状态改归档之后的落纸动作；needs_revision→修复→复审闭环实测（status.md 过期致 check FAIL 教训：状态变更后必须立即 awf status 刷新摘要） | 2026-11-02 |
| dev | DEV-028 | P1 | 工作流 review 规范补齐：review 必须由独立子 agent 执行并等待返回 pass 才能归档；结论三态 pass/needs_revision/reject；进入 review 前验收标准须 100% 勾选；状态流转纪律（active→verify→review→归档）强制 + 双重检查；归档状态修改明确语义 | 2026-11-02 |
| docs | DOCS-002 | P1 | 团队执行流程三轨契约：docs / dev / debug 与现有工作流一一对应，含发起口令与例外 | 2026-10-31 |
| docs | DOCS-004 | P1 | 团队启动改为 automatic：用户授权不再逐次确认，保留 3 行计划摘要与即时叫停 | 2026-10-31 |
| dev | DEV-030 | P3 | review 状态徽章文案「待复核」→「复核中」（与进行中/验证中持续动作语义一致），同步测试断言与 README 文档，GUI 实测 DEV-102 徽章显示「复核中」 | 2026-11-02 |
| dev | DEV-011 | P1 | awf-dispatch 会话复用（项目 × 模块）：默认复用同模块空闲会话保留上下文，会话命名 `[awf] <项目> · <模块>`，新增 --new/--session/--module/--idle-wait；发版 0.4.1 | 2026-10-31 |
| dev | DEV-031 | P2 | awf status 最近完成 bug：done.md 新条目在顶部，tail -n 8 取旧行致最新归档不显示；修复为 head -n 8 + bootstrap 同步 bin 副本，实测最近完成含 DEV-030/028/029/024 | 2026-11-02 |
| docs | DOCS-007 | P1 | agent-workflow-kit 整体框架审查 v2：插件职责收敛与当前 blocker | 2026-11-01 |
| dev | DEV-024 | P1 | Agent Workflow 面板整体 UI 设计优化：单列任务卡/实现vs验收进度语义/步骤条无裁剪/优先级徽章统一等宽/按钮无中间状态文案/checkItems 只统计验收标准段（14/14 而非 14/17）/模板注释块不再被解析 | 2026-11-01 |

*最后更新：2026-11-02 00:51*
<!-- awf:status:end -->
