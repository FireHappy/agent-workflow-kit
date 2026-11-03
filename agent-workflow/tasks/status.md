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
| dev | DEV-115 | P1 | 激活式 Router 协议：任务票据「来源：用户 | 2026-11-04 |
| dev | DEV-106 | P1 | 任务查看器接入 md 编辑阅读器：SourcePanel + 归档查看「阅读（mdToHtml 渲染）/ 编辑（textarea）」双模式；轻量渲染器全转义防 XSS | 2026-11-03 |
| dev | DEV-105 | P1 | release-prep 0.6.0：一键发版装配 | 2026-11-03 |
| dev | DEV-103 | P1 | 看板初始化改走 agent 完整配置：/awf/init/agent 子代理读项目上下文生成完整骨架（project.yaml + AGENTS.md 区块 + workflows/templates/bin + 初始账本），替代空模板；引导卡初始化中状态 + 按钮 | 2026-11-03 |
| dev | DEV-102 | P1 | 最近完成适配块式归档（parseDoneRows 行+块合并去重、块式优先）+ recent 全局倒序聚合（修复 DEV-101 遗留）；插件 0.2.3 | 2026-11-03 |
| dev | DEV-101 | P1 | 最近完成兼容 4/5/6 列归档行（parseDoneRows：desc=第3列、行内首日期、同日稳定倒序）；插件 0.2.2 | 2026-11-03 |
| dev | DEV-100 | P1 | 待办区兼容 5 列表格（parseTodoRows 4/5 列、deps 并入 desc）+ 各类型 tab 数量徽章 + 0 条常驻渲染（标题不重复数量）；插件 0.2.1 | 2026-11-03 |
| dev | DEV-043 | P2 | 任务卡查看/编辑源文件 + 升级按钮更新中动画：三类入口统一源文件面板（current/done/todo 可编辑保存）、列表滚动容器、ESC 关闭弹框 | 2026-11-03 |

*最后更新：2026-11-04 07:45*
<!-- awf:status:end -->
