# 全局状态摘要

<!-- awf:status:begin -->
> 本区块由 `agent-workflow/bin/awf status` 生成，请勿手改。
> 数据来源：`tasks/*/current.md`、`tasks/*/todo.md`、`tasks/*/done.md`。

## 当前进行中

（无）

## 待处理

（无）

## 最近完成

| 工作流 | 任务ID | 优先级 | 描述 | 完成日期 |
|--------|--------|--------|------|----------|
| docs | DOCS-003 | P1 | 默认路由：需求先转团队计划、主对话只做路由与验收，含 1 队/写点/跨项目约束 | 2026-10-31 |
| docs | DOCS-005 | P1 | 派发即建队规则固化 + 模板 harness 中立化 + 两套五项术语统一；发版 0.4.0 | 2026-10-31 |
| docs | DOCS-006 | P1 | 架构审查报告归档 | 2026-11-01 |
| dev | DEV-021 | P1 | 建队账本门禁：awf team-audit + check F7（扫 .agent-teams/ 引用 ID 校验账本登记，未登记 FAIL）+ AGENTS.md 铁律/team-flow §0 同步 | 2026-11-01 |
| dev | DEV-020 | P1 | 工作流进度页签改进：UI 重构（分层卡片/语义徽章/渐变进度条/空态错误态，DSH 主题令牌）+ 默认锚定当前会话项目（useWorkspaces/useSession，localStorage 用户选择优先），实现→复核全 pass | 2026-11-01 |
| dev | DEV-019 | P1 | 工作流进度 DSH 插件：/awf/projects + /awf/ledger 只读账本路由、右侧边栏「工作流进度」页签（项目选择/状态徽章/todo 进度/最近完成/新鲜度/自动刷新）、ledger 单测；修复 better-sidebar 动态注入 | 2026-11-01 |
| dev | DEV-017 | P1 | 工作流路由与「项目升级」语义改进（KIT-DEV-017）：路由按目标仓库逐条决策（小任务单会话/可并行才团队/跨仓库默认 awf-dispatch、团队不承载跨仓库任务）；新增 awf upgrade + docs/upgrade.md；check 迁移 FAIL 输出修复指引（ | 2026-11-01 |
| docs | DOCS-002 | P1 | 团队执行流程三轨契约：docs / dev / debug 与现有工作流一一对应，含发起口令与例外 | 2026-10-31 |
| docs | DOCS-004 | P1 | 团队启动改为 automatic：用户授权不再逐次确认，保留 3 行计划摘要与即时叫停 | 2026-10-31 |
| dev | DEV-018 | P1 | release-prep 0.5.0：一键发版装配 | 2026-11-01 |
| dev | DEV-016 | P3 | registry-concurrency.sh 锁残留断言按锁模式放宽：mkdir 模式断言无残留、flock 模式断言锁文件可正常获取/释放，消除 flock 平台误报 | 2026-11-01 |
| dev | DEV-015 | P1 | awf 全局索引写入并发安全：$AGENTS_HOME 互斥锁（flock / mkdir 自旋 + 陈旧回收）串行化读改写、按 P_ID 合并、test/registry-concurrency.sh 并发回归 | 2026-11-01 |
| dev | DEV-014 | P2 | P2 后续批次：RT-3 区间归因 / SKILL.md 同步 / 死代码清理 / headless 回退 / 模板措辞 + F5 正则 | 2026-11-01 |

*最后更新：2026-11-01 20:20*
<!-- awf:status:end -->
