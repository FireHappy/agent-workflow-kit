## [DEBUG-004] 看板误报「工作流可升级」：技能实体路径仍指向 ~/.dsh/skills（DEV-235 迁移遗漏）+ kit 回退路径错层

| 字段 | 内容 |
|------|------|
| 优先级 | P0 |
| 状态 | done |
| Owner | lead |
| 协作模式 | single |
| 来源 | 用户报「其他的库我看到了需要升级的提示」→ 指定排查 uxrsample（2026-11-16） |
| 修改范围 | 仅 `dsh-awf-dashboard/lib/index.js`（版本信号路径解析 + 判定链守卫）、`dsh-awf-dashboard/test/ledger.test.js`（回归用例）、`dsh-awf-dashboard/package.json`（版本号）、`dsh-awf-dashboard/README.md`（变更记录） |
| 依赖 | 无（纯文件路径 + 纯函数判定）；验证需已登记项目真实数据 |
| 最近更新 | 2026-11-16 |
| 完成日期 | 2026-11-16 |

### 现象
DSH 右侧看板的项目版本条对 uxrsample（以及其他已登记项目）显示「工作流可升级：v1.1.6 → 1.8.1（骨架版本迁移，awf upgrade 补写）」，但：
- uxrsample `agent-workflow/FRAMEWORK_VERSION` = `1.5.0`
- kit 技能实体 `agent-workflow-scaffold/templates/FRAMEWORK_VERSION` = `1.5.0`
- 按双版本模型（DEV-205）骨架版相同 → 应为 `latest`，不应提示升级

### 假设与验证

假设 1：`skillEntityDir()` 仍读 `$DSH_HOME/skills/agent-workflow-scaffold`（默认 `~/.dsh/skills`），而 DEV-235 已移除该目录 → `latestFramework` 读不到（null）。
证据：`~/.dsh/skills/` 为空（0 条目，2026-11-15 08:53 清空）；`~/.agents/skills/agent-workflow-scaffold` 为软链实体，`templates/FRAMEWORK_VERSION` = 1.5.0。
结果：**成立**。

假设 2：kit 回退路径错层——代码读 `join(kit.path,'templates','FRAMEWORK_VERSION')`，真实 kit 无根 `templates/`（模板在 `agent-workflow/templates/` 与 `dsh-awf-dashboard/skills/agent-workflow-scaffold/templates/`）→ 回退也 null。
证据：`ls kit/templates` → No such file or directory；`ls kit/agent-workflow/templates` → 有 FRAMEWORK_VERSION。
结果：**成立**。

假设 3：两条都 null 后判定链继续下滑到「回退链 2 发布版 semver」，把项目发布版 1.1.6 与插件版本 1.8.1 比较 → 误判 outdated。
证据：复现脚本（与 lib/index.js 同式路径公式）对 9 个已登记项目全部输出 `status=outdated`，`chain=3 发布版semver链`，`latestFramework=null`、`latestAWF=null`。
结果：**成立**。

根因（两条缺陷叠加）：
1. **DEV-235 迁移遗漏**：技能实体路径常量未随技能落点迁移（`~/.dsh/skills` → `~/.agents/skills`）。
2. **kit 回退路径错层**：`templates/FRAMEWORK_VERSION` 少一层（真实布局在 `agent-workflow/templates/` 或 kit 内置技能实体）。
3. **判定链缺守卫**：项目有骨架版但 kit 侧骨架版不可读时，不应滑到「发布版 vs 插件版本」的错误比较，应判 `unknown`。

### 修复方案
- `skillEntityDirs()`：按优先级返回候选实体目录 —— `$AGENTS_HOME/skills/...`（DEV-235 主入口，`AGENTS_HOME`/`DSH_AGENTS_HOME`）→ `$DSH_HOME/skills/...`（旧入口兼容）→ `<kit>/dsh-awf-dashboard/skills/...`（kit 内置实体）。
- 版本文件读取改为「候选路径逐个试，取第一个非空」：骨架版候选含 `<kit>/agent-workflow/templates/FRAMEWORK_VERSION` 与历史 `<kit>/templates/...`；AWF 脚本候选含 `<kit>/agent-workflow/bin/awf`。
- `versionStatus` 增守卫：项目 `installedFramework` 可读而 `latestFramework` 不可读 → `unknown`（不误报可升级）；semver 不可比时仍可走回退链。

### 验收标准
- [x] 真实数据：9 个已登记项目 `versionStatus` 全部 `latest`（骨架版 1.5.0 = 1.5.0），uxrsample 无升级提示
- [x] 单测：新增「主入口 ~/.agents/skills 实体优先」「kit 真实布局回退」「kit 侧骨架版不可读 → unknown」用例，`node --test` 全绿
- [x] `node --check lib/index.js` 通过
- [x] 已安装副本同步（scripts/sync-profile.sh）+ 版本号 1.8.2 + README 变更记录
- [x] `./agent-workflow/check_workflow.sh` 通过；`awf status` 刷新 status.md
- [x] 本地 commit（禁 push）

### 结论（已修复）
`versionStatus` 对 9 个已登记项目 + kit 自身全部返回 `latest`（installed 1.5.0 = latest 1.5.0，upgradeTo null）；`kitVersions()` 实测 `{latestFramework:"1.5.0", latestAWF:1, skillVersion:"1.8.1"→"1.8.2"}`，不再依赖已删除的 `~/.dsh/skills`。判定守卫使「项目骨架版可读 + kit 侧不可读」组合返回 `unknown` 而非 outdated。

### 下一步
无（已归档）。

### Execution Log
- 2026-11-16 08:56 · log · @擅长 agent 工作流框架：脚手架生成、awf 工具链、校验/发版 · 根因定位：skillEntityDirs 仍读 ~/.dsh/skills（DEV-235 已移除）+ kit 回退路径错层（应为 kit/agent-workflow/templates）+ 判定链无守卫 → latestFramework 恒 null → 下滑到发布版 vs 插件版本误判 outdated（9 项目实测全中）
- 2026-11-16 08:56 · log · @擅长 agent 工作流框架：脚手架生成、awf 工具链、校验/发版 · 修复：技能实体多候选（$AGENTS_HOME/skills→旧 $DSH_HOME/skills→kit 内置实体）+ kit 骨架版/AWF 候选补 agent-workflow 层 + unknown 守卫；单测 60/60（新增 2 组），真实数据 10 项目恢复 latest，副本已同步 1.8.2
