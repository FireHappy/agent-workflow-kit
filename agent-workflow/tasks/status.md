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
| dev | DEV-021 | P1 | 看板布局收敛：三区轻量行风格统一（无卡片/无按钮）、项目卡简洁化（版本号+路径复制 icon）、版本号 vv1 修复、空态与 header 清理（DEV-020 续） | 2026-11-03 |
| docs | DOCS-005 | P1 | 派发即建队规则固化 + 模板 harness 中立化 + 两套五项术语统一；发版 0.4.0 | 2026-10-31 |
| docs | DOCS-006 | P1 | 架构审查报告归档 | 2026-11-01 |
| dev | DEV-020 | P1 | 插件看板只跟随当前会话：去掉项目下拉与 localStorage 手动选择，未初始化弹引导卡（client.js 锚定/header/空态改造 + kit 源同步 + 冒烟验证） | 2026-11-03 |
| dev | DEV-022 | P1 | 插件发版 0.2.0：看板改造（只跟随当前会话 + 轻量行风格 + 项目卡简洁化）落版本号，框架 VERSION 不动 | 2026-11-03 |
| dev | DEV-019 | P1 | 批量升级/安装 11 个项目 agent-workflow 框架至 kit v0.5.0（6 upgrade + 5 init）；团队 awf-upgrade-all × 5 dispatcher；G1 status.md 梗阻由 captain 刷新破除；2 个超时回合 finalize 补 commit | 2026-11-02 |
| dev | DEV-017 | P1 | 工作流路由与「项目升级」语义改进（KIT-DEV-017）：路由按目标仓库逐条决策（小任务单会话/可并行才团队/跨仓库默认 awf-dispatch、团队不承载跨仓库任务）；新增 awf upgrade + docs/upgrade.md；check 迁移 FAIL 输出修复指引（ | 2026-11-01 |
| docs | DOCS-002 | P1 | 团队执行流程三轨契约：docs / dev / debug 与现有工作流一一对应，含发起口令与例外 | 2026-10-31 |
| docs | DOCS-004 | P1 | 团队启动改为 automatic：用户授权不再逐次确认，保留 3 行计划摘要与即时叫停 | 2026-10-31 |
| dev | DEV-018 | P1 | release-prep 0.5.0：一键发版装配 | 2026-11-01 |
| dev | DEV-016 | P3 | registry-concurrency.sh 锁残留断言按锁模式放宽：mkdir 模式断言无残留、flock 模式断言锁文件可正常获取/释放，消除 flock 平台误报 | 2026-11-01 |
| dev | DEV-015 | P1 | awf 全局索引写入并发安全：$AGENTS_HOME 互斥锁（flock / mkdir 自旋 + 陈旧回收）串行化读改写、按 P_ID 合并、test/registry-concurrency.sh 并发回归 | 2026-11-01 |

*最后更新：2026-11-03 09:12*
<!-- awf:status:end -->
