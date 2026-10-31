# Changelog

本仓库遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)：
`MAJOR.MINOR.PATCH`。历史条目只追加更正，不改写。

## [0.4.0] - 2026-10-31

### Added
- `awf-dispatch --prune [--apply] [--json]`：按 commit 消息或目标 `done.md` 判定已完成票据，归档到 `dispatch/archive/<项目>/<YYYY-MM>/`，默认 dry-run
- 派发票据生命周期说明（docs/dispatch.md、cross-project.md、跨项目派发技能）

### Changed
- 跨项目派发默认建队（派发即建队）：captain 负责拆分/汇总/账本/commit，每个目标一个 dispatcher 成员，成员用 `awf-dispatch --wait` 同步等到回合结束并回报成功/失败、目标 commit、check 结果与退出码；单行修改、只读查询、跑一次校验与建队成本不划算的任务可豁免，但须说明理由（AGENTS.md、docs/team-flow.md、docs/dispatch.md、跨项目派发技能）
- `templates/` 中派发与任务路由文案改为 harness 中立：去掉具体产品名与工具名，只描述「多会话/多角色协作」「派发工具（若 harness 提供）」（README.md、AGENTS.md.tmpl、workflows/cross-project.md）

## [0.3.0] - 2026-10-31

### Added
- 发版工作流 `templates/workflows/release.md`：Step 0 版本方案探测、开始前/提交前检查拆分、CHANGELOG 规则、tag 分级与回滚
- 本仓库发版手册 `docs/release.md`：版本落点、发版检查、tag 时机与回滚
- `awf-dispatch` 默认异步：只建会话并发送任务，`--wait` 才等待回合结束；`--headless` 默认后台运行
- `check` 强制要求 `agent-workflow/workflows/release.md`

### Changed
- tag 支持延后补打与分级移动（本地未推送可移；已推送需用户同意），锚定改动提交
- help 补齐退出码 3（等待超时 / headless 非零）

### Fixed
- `release.md` 检查顺序矛盾：发版任务可留在 `current.md`，提交前检查与开始前检查分离
- `--headless --wait` 超时不再抛 traceback，返回退出码 3

## [0.2.1] - 2026-10-31

### Added
- 入口模板新增「任务路由」：检测到团队协作能力时任务默认优先派发，无则单会话
- `SKILL.md` 自检清单增加任务路由项

### Changed
- `templates/README.md` 并行说明改为默认优先派发
- `docs/team-flow.md` §6 写明所有任务优先与唯一跳过条件

## [0.2.0] - 2026-10-31

### Added
- `awf-dispatch --team`：任务包末尾追加团队拆分建议，插件缺失时优雅降级
- 团队执行流程三轨契约（docs / dev / debug）：`docs/team-flow.md`
- 模板补独立复核、回归范围、逐条核对条款
- 发版手册雏形与 `VERSION` 文件（0.2.0）

### Fixed
- `bootstrap` 在受控区块标记不成对时中止，不再静默删除区块后内容
- 非法任务 ID 由 `check` 显式判 FAIL（注释内示例不误报）
- `awf-dispatch --dry-run` 在缺工作区时不再返回假阳性
- 派发日志节选截断加标记；`dispatch/` 入库、`.agent-teams/` 忽略

### Changed
- 收尾顺序统一为「归档 → check → awf status → commit」
- `review` 在入口标注为 dev 子流程
- 派发任务命名示例统一为 `<项目>-<ID>-<slug>.md`；移除悬空的 `neighbors.tsv`

## [0.1.0] - 2026-10-31

### Added
- 初始 agent-workflow 框架：`project.yaml` 单一事实源、`AGENTS.md` 受控入口、任务账本、dev/debug/docs/review 工作流
- `awf` 生成器：init / bootstrap / check / status / register / projects / find
- 跨项目派发：`awf-dispatch`（G1–G4 前置门、DSH 会话适配、`--headless` / `--handoff` 回退）与 cross-project 工作流
- 配套技能：`agent-workflow-scaffold`、`cross-project-dispatch`
