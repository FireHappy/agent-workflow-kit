# 全局状态摘要

<!-- awf:status:begin -->
> 本区块由 `agent-workflow/bin/awf status` 生成，请勿手改。
> 数据来源：`tasks/*/current.md`、`tasks/*/todo.md`、`tasks/*/done.md`。

## 当前进行中

（无）

## 待处理

| 工作流 | 任务ID | 优先级 | 描述 | 登记日期 |
|--------|--------|--------|------|----------|
| dev | DEV-001 | P2 | 评估自举副本（`bin/awf` vs `agent-workflow/bin/awf`、`templates/` vs `agent-workflow/templates/`）的漂移检测，减少对 `init --force` 手工覆盖的依赖 | 2026-10-31 |

## 最近完成

| 工作流 | 任务ID | 优先级 | 描述 | 完成日期 |
|--------|--------|--------|------|----------|
| dev | DEV-002 | P1 | 跨项目派发流程：cross-project 工作流 + awf-dispatch 会话派发器 + 派发技能，并同步 demo01/demo02 | 2026-10-31 |
| dev | DEV-006 | P1 | 工作流插件化：团队流程随技能分发、跨项目技能补 --team、三个核心流程模板补独立复核与回归、版本 0.2.0 | 2026-10-31 |
| dev | DEV-003 | P1 | 工作流审阅修复批次：bootstrap 标记守卫、非法 ID 显式失败、收尾顺序与 review 定位、dry-run 假阳性、日志截断与版本管理 | 2026-10-31 |
| docs | DOCS-002 | P1 | 团队执行流程三轨契约：docs / dev / debug 与现有工作流一一对应，含发起口令与例外 | 2026-10-31 |
| dev | DEV-005 | P1 | 团队协作集成优化：建队前登记账本、质量合同交给插件门禁、review 走 repair 循环、注入段补复核独立性与证据回报 | 2026-10-31 |
| dev | DEV-004 | P1 | `awf-dispatch --team`：任务包追加团队执行建议（缺省不变、可降级），smoke 覆盖注入与参数传递 | 2026-10-31 |

*最后更新：2026-10-31 19:01*
<!-- awf:status:end -->
