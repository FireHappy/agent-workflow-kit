# 看板误报「工作流可升级」：技能实体路径迁移遗漏 + kit 回退路径错层（2026-11-16，DEBUG-004）

## 结论（可复用）

DSH 看板版本条的 `outdated` 判定链一旦「最新骨架版」读不到，会**静默下滑**到「项目发布版 vs 插件版本」的比较——两者不同口径，必然误报。同类问题的定位口径：先打印 `kitVersions()` 与 `versionStatus()` 的实际字段值，看 `latestFramework` 是否为 null，再看判定链落到了哪一环。

## 根因（两条叠加）

1. **技能实体落点迁移遗漏**：`dsh-awf-dashboard/lib/index.js` 的 `skillEntityDir()` 硬编码 `$DSH_HOME/skills/agent-workflow-scaffold`（默认 `~/.dsh/skills`）。DEV-235 统一技能入口到 `~/.agents/skills` 并清空 `~/.dsh/skills` 后，该路径为空 → 实体骨架版读不到。
2. **kit 回退路径错层**：回退读 `<kit>/templates/FRAMEWORK_VERSION`，而真实 kit 无根 `templates/`（在 `<kit>/agent-workflow/templates/` 与 `<kit>/dsh-awf-dashboard/skills/agent-workflow-scaffold/templates/`）。测试夹具当时也写成根 `templates/`，把缺陷掩盖了。

结果：`latestFramework === null` → 骨架链跳过 → 回退链 2 用项目发布版（如 1.1.6）比插件版本（1.8.1）→ 全部项目 `outdated`，提示「骨架版本迁移，awf upgrade 补写」——**纯误报，不能照着点升级**。

## 修法（1.8.2）

- `skillEntityDirs()` 多候选：`$AGENTS_HOME/skills`（`AGENTS_HOME`/`DSH_AGENTS_HOME`，DEV-235 主入口）→ `$DSH_HOME/skills`（存量兼容）→ `<kit>/dsh-awf-dashboard/skills/agent-workflow-scaffold`（开发仓库形态）。
- 版本文件改「候选路径取第一个非空」：骨架版候选补 `<kit>/agent-workflow/templates/FRAMEWORK_VERSION`（历史根 `templates/` 保留）；AWF 脚本候选补 `<kit>/agent-workflow/bin/awf`。
- `versionStatus` 守卫：项目 `installedFramework` 可读而 `latestFramework` 不可读 → `unknown`（不可判），不再下滑误报。
- 测试夹具改为**真实 kit 布局**（`agent-workflow/templates/`），避免夹具掩盖路径缺陷；新增 2 组用例（主入口实体优先、kit 侧不可读 → unknown）。

## 验证口径

- `node --test`：60/60；`node --check lib/index.js`。
- 真实数据：10 个项目（kit + 8 登记项目 + uxrsample）全部 `latest`，`installedFramework=v1.5.0 = latestFramework=v1.5.0`。
- 副本：`bash dsh-awf-dashboard/scripts/sync-profile.sh` 同步到 desktop profile（1.8.2），重启 DSH / 刷新 GUI 后生效。
- `./agent-workflow/check_workflow.sh` 全部通过。

## 教训

- 技能/工具落点迁移（`~/.dsh/skills` → `~/.agents/skills`）要同时 grep 插件与脚本里的**路径常量**，不只 `install.sh`。
- 判定链的回退分支要区分「不可判」与「落后」；跨口径比较必须先有守卫。
- 测试夹具必须镜像真实仓库布局，否则回退路径写错也测不出来。
