# 全局状态摘要

<!-- awf:status:begin -->
> 本区块由 `~/.dsh/skills/agent-workflow-scaffold/bin/awf status` 生成，请勿手改。
> 数据来源：`tasks/<type>/<ID>.md`（单任务文件；todo/current/done README 为检索视图）。

## 当前进行中

| 工作流 | 任务ID | 优先级 | 状态 | Owner | 任务 |
|--------|--------|--------|------|-------|------|
| dev | DEV-194 | P1 | active | lead | 派发 v1.4.0 升级至全部登记项目（10 目标） |
| dev | DEV-196 | P1 | blocked | lead | 打包 openxr-runtime（Rokid OpenXR Runtime inProcessStation3Release APK） |
| dev | DEV-201 | P1 | blocked | lead | 派发打包任务至 rokid_system_components（用户直派） |
| dev | DEV-219 | P2 | active | lead | 版本锚点统一到插件 package.json + 删除 agent-workflow/VERSION |

## 待处理

（无）

## 最近完成

| 工作流 | 任务ID | 优先级 | 描述 | 完成日期 |
|--------|--------|--------|------|----------|
| dev | DEV-216 | P1 | 借鉴 dsh-task-ledger 落地 5 项(执行记录/validate/纪律/插件单源化/派生指标) | 2026-11-08 |
| dev | DEV-217 | P2 | 插件技能副本源收敛:copy 以仓库/发布 tag 为源(技能分发独立化) | 2026-11-08 |
| dev | DEV-218 | P2 | 技能源迁入插件（唯一开发路径）+ 仓库去重 + dispatch 改名 | 2026-11-08 |
| dev | DEV-195 | P1 | 派发术语统一为「回执」+ 票据生命周期统一「用完即删」 | 2026-11-07 |
| dev | DEV-198 | P1 | 版本锚点迁移框架支持：version_file → agent-workflow/VERSION 全链路 + 根 VERSION 防踩坑检查 | 2026-11-07 |
| dev | DEV-201 | P1 | 派发技能自包含，移除旧入口 | 2026-11-07 |
| dev | DEV-202 | P1 | 修复 upgrade 回归测试与新形态不符（workflows/ 退役 + bin 空目录） | 2026-11-07 |
| dev | DEV-203 | P2 | upgrade 回归测试健壮性增强（DEV-202 复核建议 1/2/3/4/5/6） | 2026-11-07 |

*最后更新：2026-11-08 15:17*
<!-- awf:status:end -->
