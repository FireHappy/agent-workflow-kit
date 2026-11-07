# agent-workflow 技能索引

> 本文件是**技能路由表**（唯一入口）：按任务类型选一个技能加载，细节都在该技能内，项目内无流程副本。
> AGENTS.md 只写「读本索引」，不重复本表——**新增技能只改此文件**，无需动 AGENTS.md 模板。

## 路由表（按任务类型选择，只加载一个）

| 任务类型 | 技能 | 状态机 |
|---|---|---|
| 功能开发 / 重构 / 优化 | `skills/dev/SKILL.md` | 认领→方案→实现→验证→Review→归档 |
| 崩溃 / 报错 / 行为异常 | `skills/debug/SKILL.md` | 认领→诊断→收集证据→验证假设→修复→归档 |
| 文档 / 架构分析 | `skills/docs/SKILL.md` | 认领→大纲与核实→撰写→审阅→归档 |
| 开发完成待审（dev 子流程） | `skills/review/SKILL.md` | 复核→通过/需修改→修复→复审→归档 |
| 跨项目派发 / 交接 | `skills/cross-project-dispatch/SKILL.md` | G1-G4 门→派发→回执→核验→归档 |
| 发版 / 版本号 / tag / CHANGELOG | `skills/release/SKILL.md` | 探测→bump→CHANGELOG→tag→收尾 |
| 团队执行 / 多角色协办 | `skills/team-flow/SKILL.md` | 先登记→建队→三轨→质量合同→队长收尾 |
| 升级 / 整理已有工作流 | `skills/upgrade/SKILL.md` | 定位→预览→执行→修复→提交（保留账本历史） |
| Unity 打包 + 安装 | `skills/unity-build-install/SKILL.md` | 场景预检→工具判定→通道（MCP/batch）→构建→校验→安装启动 |
| Unity MCP 操作编辑器 | `skills/unity-mcp/SKILL.md` | check→安装→启动→选实例→ping/state→构建/控制台 |

## 使用方式

1. 按上表识别任务类型 → 加载对应技能（skill 名 = 目录名）
2. 技能内容是该流程的**完整执行手册**（状态机、验收、自检、禁止事项）
3. 主技能 `agent-workflow-scaffold`（仓库根 `SKILL.md`）负责脚手架生成/安装/校验，不是流程手册

## 新增技能的约定

- 在 `skills/<name>/` 新建目录 + `SKILL.md`（frontmatter：`name` / `description` / `whenToUse` 三字段）
- 在本路由表加一行（任务类型 → 技能）
- 跑 `./install.sh` 同步技能实体（copy 模式）或确认 link 生效
- 无需修改任何 AGENTS.md 模板或项目入口
