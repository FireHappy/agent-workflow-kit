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
| dev | DEV-119 | P1 | 修复 role 名牌不生效：模板移除空 role 键（方案 A）+ yaml_get 跳过空值键行（方案 B）；旧模板项目实测后填 role 立即带出；三 locale smoke 144/0 | 2026-11-04 |
| dev | DEV-118 | P2 | worker 名牌：project.yaml 可选 role 字段，find/projects/register 寻址带出（缺省回退 name，yaml 单一事实源）；三 locale smoke 140/0 | 2026-11-04 |
| dev | DEV-117 | P1 | locale 中文解析修复（awfk LC_ALL=C 包装）+ smoke 并入日常门禁（--with-smoke + pre-commit 钩子）；三 locale 下 smoke 135/0，钩子拒脏提交验证通过 | 2026-11-04 |
| dev | DEV-116 | P1 | 全局框架升级至 DEV-115 激活式 Router：周报/pluto/FinderPathBar 升级（2 提交，pluto 框架被 gitignore）；uxrsample/openxr-uxr/dsh-settings/naboo 按规则跳过（改动或在途任务） | 2026-11-04 |
| dev | DEV-115 | P1 | 激活式 Router 协议：任务票据「来源：用户 | 2026-11-04 |
| dev | DEV-106 | P1 | 任务查看器接入 md 编辑阅读器：SourcePanel + 归档查看「阅读（mdToHtml 渲染）/ 编辑（textarea）」双模式；轻量渲染器全转义防 XSS | 2026-11-03 |
| dev | DEV-105 | P1 | release-prep 0.6.0：一键发版装配 | 2026-11-03 |
| dev | DEV-103 | P1 | 看板初始化改走 agent 完整配置：/awf/init/agent 子代理读项目上下文生成完整骨架（project.yaml + AGENTS.md 区块 + workflows/templates/bin + 初始账本），替代空模板；引导卡初始化中状态 + 按钮 | 2026-11-03 |

*最后更新：2026-11-04 09:17*
<!-- awf:status:end -->
