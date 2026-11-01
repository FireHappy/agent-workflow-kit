# 发版手册（agent-workflow-kit）

> 本文是**本仓库的具体发版方案**，不是通用模板。
> 通用流程见 `templates/workflows/release.md`；各项目按自身版本管理方案落地。
> 版本号：`VERSION`（单行 SemVer）· 变更记录：`CHANGELOG.md` · tag 前缀：`v`。

## 0. 发版前先确认：本项目用哪套版本管理

发版流程不能假设所有项目一致。对本仓库，方案是固定的；对**其他项目**发版前必须先探测：

| 探测项 | 本仓库 | 其他项目常见形态 |
|---|---|---|
| 版本号落点 | `VERSION` 单行 `X.Y.Z` | `package.json` 的 `version`、`Cargo.toml`、`gradle.properties`、`pom.xml`、`*.csproj`、VERSION 文件 |
| 版本文件数量 | 1 个 | monorepo 每个包各一份；必要时用 `sync-versions` 之类脚本一次改齐 |
| 既有 tag 风格 | `vX.Y.Z` 注释 tag | `v1.2.3`、`1.2.3`、`release-1.2.3`、按组件 `pkg/v1.2.3` |
| 变更记录 | `CHANGELOG.md`（按版本倒序） | 无 changelog、`CHANGELOG.rst`、GitHub Releases 正文 |
| 发布分支 | main 末梢 | release 分支、GitFlow、trunk + tag |
| 发布动作 | 只本地 commit + tag；push 由用户触发 | 推 tag 触发 CI 打包、npm publish、镜像构建 |

探测优先级：**读已有文件与 `git tag` 历史 > 问用户**。不要用"通常做法"覆盖项目现状；既有 tag 风格一旦存在，就沿用，不要混用两种格式。

## 1. 何时发版

| 触发 | 版本位 | 例子 |
|---|---|---|
| 新增功能 / 工作流能力 | minor | 0.2.0 → 0.3.0 |
| 修复、文档、模板措辞 | patch | 0.2.0 → 0.2.1 |
| 破坏性变更（模板字段删除、命令行为改变、账本格式不兼容） | major | 0.2.x → 1.0.0 |
| 仅内部重构、无行为变化 | 不发版，正常 commit | — |

规则：

- 一次发版只对应一个版本号；未收尾的任务不进本次版本
- 同一天多批改动合并为一个版本，避免 tag 噪音
- **发版是显式动作**：用户没要求就不发，不"顺手"打 tag

## 2. 发版前检查

```sh
./agent-workflow/check_workflow.sh          # 账本与入口一致
bash test/smoke.sh                           # 回归
bash -n bin/awf && bash -n install.sh && bash -n test/smoke.sh
python3 -m py_compile bin/awf-dispatch
git status --short                           # 只允许发版相关改动
git log --oneline -5                         # 确认范围
git tag --list 'v*' --sort=-v:refname | head # 上一个版本
```

同时确认：

- [ ] `CHANGELOG.md` 已写本次版本条目（`[Unreleased]` 移到 `[X.Y.Z] - YYYY-MM-DD`）
- [ ] `VERSION` 与 CHANGELOG 标题版本一致
- [ ] 入口 `AGENTS.md` digest 与 `project.yaml` 一致
- [ ] 生成副本无漂移（`bin/awf`、`bin/awf-dispatch`、`templates/` ↔ `agent-workflow/`；`check` 兜底，有漂移先同步或 `init . --force` 有意刷新）
- [ ] demo01 / demo02 等下游项目是否需要同步升级（见 §5）

## 3. 改版本号与 CHANGELOG

```sh
printf '0.2.2\n' > VERSION
```

`CHANGELOG.md` 结构（新版本在上，历史条目不改写）：

```markdown
## [0.2.2] - 2026-10-31

### Added
- ...

### Changed
- ...

### Fixed
- ...
```

规则：

- 只允许**新增**版本条目；历史条目写错也只在最新版本追加更正说明
- 条目写"行为变化 + 迁移影响"，不贴提交摘要
- 发布 commit 前 `git diff CHANGELOG.md` 自查一遍

## 3.5 release-prep 快速装配（可选）

本仓库提供一条命令完成「改版本号前」的机械装配，把原先 5 分钟的手工步骤压缩为一次执行。在 kit 仓库根运行：

```sh
./bin/awf release-prep 0.4.2          # kit 源码入口（实际写入）
./bin/awf release-prep 0.4.2 --dry-run # 只打印将执行的动作
```

`./agent-workflow/bin/awf` 是 `init --force` 生成的副本，同样带本命令；在已安装的项目里可用该路径。

它**会做**：

0. **先检测生成副本漂移**（`bin/awf`、`bin/awf-dispatch`、`templates/` ↔ `agent-workflow/`）：有漂移立即拒绝，不做任何覆盖——防止 `init . --force` 静默回滚 agent-workflow 侧的工作流改动（本地对 agent-workflow 侧改过内容时，先手工决定同步或有意刷新）；
1. `./bin/awf init . --force --no-register` 刷新生成副本（无漂移时才执行），再 `bootstrap` 刷新 `AGENTS.md` digest；
2. 在 `agent-workflow/tasks/dev/current.md` 写入 `[DEV-XXX] release-prep <版本>` 块（自动取下一个可用 ID），校验通过后归档到 `done.md`；
3. 把 `VERSION` 改为 `<X.Y.Z>`；把 `CHANGELOG.md` 顶部的 `## [Unreleased]` 改为 `## [<X.Y.Z>] - 今天`（没有 Unreleased 时提示手动处理）；
4. 跑 `./agent-workflow/check_workflow.sh` 与 `bash test/smoke.sh`，任一失败即停（账本留在 `current.md`）；
5. 跑 `./agent-workflow/bin/awf status` 刷新 `status.md`；
6. 打印下一步的 `git add -A && git commit … && git tag -a v<X.Y.Z> … && git push …` 命令与建议 commit 消息。

它**不会做**（铁律）：

- 不自动 `git commit`、`git tag`、`git push`；推送必须由用户明确触发；
- 不改写历史 CHANGELOG 条目，不替你判断版本位（major/minor/patch）；
- 不替代 §2 的人工确认（下游项目、tag 风格、发布范围等）。

建议流程：先补好 `CHANGELOG.md` 的 `[Unreleased]` 内容 → 运行 `release-prep` → 检查 `git diff` 与账本 → 按输出命令由人执行 commit/tag/push。

## 4. 提交与打 tag

```sh
git add -A
git commit -m "release: v0.2.2"
git tag -a v0.2.2 -m "agent-workflow-kit v0.2.2"
git log --oneline -1        # 确认 tag 打的正是发版提交
git show v0.2.2 --stat      # 确认 tag 指向
```

### tag 的时机与落点（可以延后）

- tag 锚定的是**改动集合的最后一个提交**，不要求先有一个 `release:` 提交
- 版本号未明确时可以**先不打 tag**；push 前补打即可，顺序不强制
- 事后补打：`git tag -a vX.Y.Z <commit>`，commit 用 `git log --oneline` 确认，别凭记忆
- 若版本记录（VERSION + CHANGELOG）单独提交，tag 打在**该版本记录提交**上；若版本记录延后，tag 先落在改动提交上
- 版本号未定就不要发明临时 tag 名；记一条"待打 tag"，等版本号定了一次打完

### tag 可以移动（分级规则）

tag 是引用，不是快照。后续有新提交时，允许把 tag 移到包含完整改动的提交上：

| 状态 | 能否移动 | 做法 |
|---|---|---|
| 本地、未推送 | **可以，自由移动** | `git tag -f vX.Y.Z <commit>` |
| 已推送，仅自己使用 | 可以，但需用户明确同意 | `git tag -f vX.Y.Z <commit> && git push --force origin vX.Y.Z` |
| 已推送，有协作者/CI 在用 | 默认不动；先说明影响再决定 | 同上，或发更正版本而不是移动 |

移动的约束：

- 只能在同一版本内移动（`v0.3.0` 指到更新的 `v0.3.0` 内容）；不要用移动把 `v0.2.1` 变成 `v0.3.0` 的内容
- 移动后必须同步 `VERSION` 与 `CHANGELOG.md`，否则 tag 与版本记录脱节
- 已推送 tag 移动会改写远端引用：CI、缓存、镜像一旦拉过旧 tag，可能不会自动更新——先告诉用户
- 单方面 force push tag 属于被铁律禁止的动作，必须由用户明确触发

约束：

- tag 必须是**注释 tag**
- **禁止自动 push**：`git push` 与 `git push origin vX.Y.Z` 由用户明确触发
- 若需要 GitHub Release / npm 发布，同样由用户确认后执行

## 5. 下游同步

发版后按需同步 demo01 / demo02 等使用 `agent-workflow` 的项目：

```sh
# 在目标项目里
~/.dsh/skills/agent-workflow-scaffold/bin/awf init . --force
./agent-workflow/check_workflow.sh
git add -A && git commit -m "chore: 升级工作流框架到 <版本>"
```

跨仓库写入走 `awf-dispatch` 派发，不直接改目标仓库。

## 6. 回滚

- **已推送的 tag 不删除、不移动**；本地未推送的 tag 按 §4 分级规则处理
- 用新提交 revert 问题提交，再发一个 patch 版本（`vX.Y.Z+1`）
- 禁止 `git push --force`、禁止 reset 远端
- 如果 tag 已推送且必须撤回，先问用户，再决定删远端 tag 还是发更正版本

## 7. 本次发版记录

| 版本 | 日期 | 范围 | tag |
|---|---|---|---|
| 0.3.0 | 2026-10-31 | 异步派发、release 工作流、模板复核条款 | v0.3.0 |
| 0.4.0 | 2026-10-31 | 派发票据归档、派发即建队规则、模板中立化 | v0.4.0 |

> 发版完成后把「待定/待打」替换为实际值，并同步 `CHANGELOG.md`。
