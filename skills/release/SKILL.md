---
name: release
description: agent-workflow 发版流程（探测→bump→CHANGELOG→tag→收尾）：版本号策略、版本落点探测、CHANGELOG 与 tag 规范。
whenToUse: 用户要求发版/升级版本号/打 tag/更新 CHANGELOG、或需 release 工作流（先探测版本方案再 bump）时——自动加载本技能。
---

# agent-workflow · 发版（技能）

> 由 agent-workflow-scaffold 主技能路由加载（AGENTS.md 开工顺序按任务类型强制加载本技能）。
> 项目内无 workflow 副本：本技能是实体目录（install.sh copy 安装），更新重跑 `./install.sh`。
> 路径约定：以下 `tasks/`、`memory/`、`tools/`、`project.yaml` 均为目标项目 `agent-workflow/` 下的相对路径。

## 适用场景

发版 / 版本号 / tag / CHANGELOG。只在用户要求或任务明确要求时发版，推送由用户触发。

## 执行步骤

> 适用：把已验收的改动落成一次可追溯的版本（版本号 / tag / CHANGELOG）。
> 主规范：`../README.md`
> 默认落点：`VERSION`（版本号）、`CHANGELOG.md`（变更记录）、tag 前缀 `v`；
> 均可在 `../project.yaml` 用 `version_file` / `changelog` / `tag_prefix` 覆盖。
> 落点不固定：实际用哪套版本管理方案，以 Step 0 的探测结论为准。
> 已有发版手册时先读对应章节（范例：agent-workflow-kit 的 `../.release.md` §0 版本方案探测表）。

---

## 目标

一次发版产出三样东西：一个明确的语义化版本号、一段可审计的变更记录、一个指向发版提交的注释 tag。
默认只做本地 commit 与本地 tag；**推送、合并、创建 release、发布制品都必须由用户明确触发**。

`release` 是执行手册，不是新的任务类型：发版本身按 `dev` 类型认领（`DEV-xxx`），**发版完成后才归档**；只补发版记录时可归 `docs`。

---

## 何时发版（触发条件）

| 触发 | 前置条件 | 版本位 |
|---|---|---|
| 功能合并后 | 至少一个功能任务已 `review` 通过并归档，处于可交付状态 | minor |
| 修复批次后 | 一批修复已归档且有回归覆盖，不改变公开行为 | patch |
| 不兼容变更 | 公开接口 / 配置字段 / 产物格式 / 默认行为发生破坏性变化 | major |
| 紧急修复 | 线上异常需立即修复 | patch（同日多批可合并为一个版本） |
| 不发版 | 仅内部重构无行为变化、仅文档/注释、验证未通过、任务仍在 `review` | — |

规则：

- 只在用户要求或任务明确要求时发版，不要“顺手”发版
- 一次发版只有一个版本号；未收尾的任务不进入本次版本
- 同一天多个批次优先合并为一个版本，避免 tag 噪音
- 与 `review.md` 的关系：相关任务必须先 review 通过；review 未过不允许发版

---

## Step 0：先探测版本管理方案（先只读探测，确认后再动文件）

发版流程不能假设所有项目一致。先读已有文件与 `git tag` 历史，再决定怎么改；结论写进本次发版任务块，必要时同步 `../project.yaml` 的 `version_file` / `changelog` / `tag_prefix`。

### 版本落点矩阵

| 形态 | 怎么确认 | 改哪里 |
|---|---|---|
| `VERSION`（单行 `X.Y.Z`） | 仓库根有无 `VERSION` / `VERSION.txt` | 只改这一行，无 `v` 前缀、无多余空行 |
| `package.json` 的 `version` | Node 项目 | 根 `package.json`；monorepo 还要看 `packages/*/package.json` |
| `Cargo.toml` | Rust | `[package] version`；workspace 看 `[workspace.package] version` |
| `gradle.properties` | Android / Gradle | `version=` / `VERSION_NAME` |
| `pom.xml` | Maven | 父 POM 与各模块 `<version>`，逐级确认 |
| monorepo 每包一份 | 上面的形态按包重复出现 | 每个受影响包各改一次；有 `sync-*` / `bump-*` 脚本时优先用；只改根版本不算完成 |

### 既有 tag 风格

先跑 `git tag --list --sort=-v:refname`（取前 10 个即可）：

| 历史形态 | 处理 |
|---|---|
| `v1.2.3`（注释 tag） | 沿用，默认风格 |
| `1.2.3` | 沿用，不加 `v` |
| `release-1.2.3` | 沿用 |
| `pkg/v1.2.3`（按包） | monorepo 按包打，一次打齐所有变动的包 |
| 无 tag 历史 | 用 `tag_prefix` 默认值 `vX.Y.Z`，并在任务块记一句“新项目，按默认风格” |

### CHANGELOG 形态

`CHANGELOG.md`（按版本倒序）/ `CHANGELOG.rst` / 每包一份 / 无 changelog（用 GitHub Releases 正文）。
沿用既有文件；完全没有时新建 `CHANGELOG.md`（默认值）。

### 发布动作

- 本地 commit + tag，push 由用户触发
- 推 tag 触发 CI 打包 / npm publish / 镜像构建 / 创建 Release

后者的发布动作同样**由用户触发**；本流程只准备到本地 tag，并把推送命令交给用户。

### 原则

- 先看已有文件与 `git tag` 历史，再问用户；不要用“通常做法”覆盖项目现状
- 沿用既有风格，不混用两种 tag 格式，也不维护两个版本文件
- monorepo 一次改齐所有受影响的包，漏一个包就算发版未完成
- 探测结论不确定、或与用户说法冲突时，停在 Step 0 问清楚，不要边改边猜

---

## Step 1：开始前检查（不通过不发版）

1. **相关任务已 review 通过**：本次纳入版本的功能/修复任务都已通过 review；**当前发版任务允许仍在 `tasks/dev/current/`**，因为它要到发版完成后（Step 6）才归档
2. **范围明确**：写出本次纳入的任务 ID 与 commit 范围（如 `git log --oneline <上一版本tag>..HEAD`）；范围外的改动不混入
3. **工作区只含发版相关改动**：`git status --short` 中只允许版本号 / CHANGELOG / 迁移文档等发版改动；无关的未提交改动先归档提交，或明确排除在本次发版外
4. **校验通过**：按 `../project.yaml` 跑 `gate` 与 `test`，不能跳过；本次涉及模块至少跑一次相关验证；命令不可用时写清阻塞原因，不发版
5. **迁移说明就绪**：存在不兼容变更（major / 配置字段变动 / 产物格式变化）时，升级步骤与回滚方式已写好（CHANGELOG 条目或 `../docs/` 迁移文档）
6. **发版落点已确定**：分支（默认主干末梢）、版本文件、tag 风格均按 Step 0 结论执行

```sh
# 命令来自 project.yaml，不要照抄
git status --short
git log --oneline --decorate -10
git tag --list --sort=-v:refname
# <gate>
# <test>
```

---

## Step 2：版本号落点与版本位

- 语义化版本 `major.minor.patch`：
  - `major`：不兼容变更
  - `minor`：向后兼容的新功能
  - `patch`：向后兼容的缺陷修复
- 版本号只有一个落点（monorepo 例外：每个受影响包的落点都要改齐，版本保持一致）
- 若语言生态有原生版本字段（`package.json` / `Cargo.toml` / `pom.xml` / `gradle.properties`），把 `version_file` 指向它，**只改一处**，避免多处手改漂移
- **锚点位置（重要，DEV-145）**：`version_file` 指向的文件**不得放进 C/C++ 编译器的头文件搜索路径**（如 `-I"."`、Unity IL2CPP 的 Bee clang）。macOS 大小写不敏感文件系统上，仓库根 `VERSION` 文本文件会与 C++ 标准库头 `<version>` 撞名，`#include <version>` 被解析成该文本文件，报 `expected unqualified-id` 并级联大量误报（Linux/CI 大小写敏感不触发）。Unity / C++ 项目应把 `version_file` 指向 `agent-workflow/VERSION` 之类不在头文件搜索路径内的位置
- 版本号变更要能单独审阅，不要夹带无关改动
- 计划 tag 名与版本号一致；重名处理见 Step 5（同版本内、本地未推送才允许移动；否则升版本）

---

## Step 3：更新 CHANGELOG.md

按版本倒序归类，最新版本在最上面。每个版本一个二级标题，条目按四类分组：

```markdown
## [1.2.0] - YYYY-MM-DD

### Added
- 新增 xxx 能力（影响面：xxx）

### Changed
- 调整 xxx 默认行为（不兼容：旧配置需迁移，见 docs/xxx.md）

### Fixed
- 修复 xxx 场景下的崩溃（来源：DEV-012）

### Removed
- 移除废弃的 xxx 参数
```

要求：

- 四类按需使用，没有的类别可以不写，但不要自造类别
- 条目写“用户/调用方感知的变化”，不写实现细节流水账；可选附带任务 ID
- 每次发版把 `Unreleased` 中的内容归入本次版本标题（没有 `Unreleased` 就直接新增版本段）
- 变更记录形态按 Step 0 探测结果：既有文件沿用，每包一份的 monorepo 只更新受影响包
- **禁止修改历史条目**：已发布版本的标题、日期、条目一律只读；发现历史写错时，不在原条目上改写，而是在新版本中追加一条更正说明（如 `Fixed: 更正 1.1.0 条目中 xxx 的描述`）
- 日期用 `YYYY-MM-DD`；同一天多次发版合并为一条，不重复建标题
- 不写“未验证”的条目；验证未完成的改动不发版

---

## Step 4：提交前检查（五项全过才提交）

1. **CHANGELOG 已更新**：本次版本条目齐全（Added/Changed/Fixed/Removed），`Unreleased` 已归位，历史条目未被改写
2. **VERSION 与 CHANGELOG 一致**：版本号文件内容 = CHANGELOG 标题版本 = 计划 tag（`v` 前缀按项目既有风格）；monorepo 各包版本一致
3. **git diff 自查**：`git diff` 与 `git diff --cached` 里没有混入范围外改动；版本号与 CHANGELOG 是仅有的实质变更（迁移文档除外）
4. **工作区干净**：`git status --short` 只剩本次发版待提交文件，没有未跟踪的临时文件
5. **复跑 `gate` / `test`**：版本号与 CHANGELOG 改动后的最终状态再跑一次，结果写进发版报告

```sh
git diff
git diff --cached
git status --short
# <gate>
# <test>
```

---

## Step 5：发版提交与打 tag

1. 只提交版本号文件与 `CHANGELOG.md`（必要时含迁移文档），提交信息按项目风格，如 `release: vX.Y.Z`
2. 在该发版提交上打**注释 tag**（`-a`，带一行说明；不要轻量 tag）：

```sh
# 把 VERSION 换成 project.yaml 里 version_file 的路径；tag 名按 Step 0 的既有风格
git add VERSION CHANGELOG.md
git commit -m "release: vX.Y.Z"
git tag -a vX.Y.Z -m "release vX.Y.Z"
git show vX.Y.Z --stat   # 确认 tag 指向发版提交
```

### tag 的时机

- tag 锚定的是**改动集合的最后一个提交**，不要求先有 `release:` 提交
- 版本号未定可以先不打 tag，记一条“待打 tag”，push 前补打：`git tag -a vX.Y.Z <commit>`（commit 用 `git log --oneline` 确认，别凭记忆）
- 版本记录单独提交时，tag 打在该提交上；版本记录延后时，tag 先落在改动提交上

### tag 可以移动（分级）

tag 是引用，不是快照；后续有新提交时允许把 tag 移到包含完整改动的提交上：

| 状态 | 能否移动 | 做法 |
|---|---|---|
| 本地、未推送 | **可以，自由移动** | `git tag -f vX.Y.Z <commit>` |
| 已推送，仅自己使用 | 可以，但需**用户明确同意** | `git tag -f vX.Y.Z <commit> && git push --force origin vX.Y.Z` |
| 已推送，有协作者 / CI 在用 | 默认不动；先说明影响再决定 | 同上一行，或直接发更正版本 |

移动的约束：

- **只允许同版本内移动**：`v0.3.0` 只能移到更完整的 `v0.3.0` 内容；不能用移动把 `v0.2.1` 变成 `v0.3.0` 的内容
- 移动后同步 `VERSION` 与 `CHANGELOG.md`，避免 tag 与版本记录脱节
- 已推送 tag 的移动会改写远端引用（CI、缓存、镜像可能不自动更新），先告诉用户影响
- 单方面 `git push --force` 属于铁律禁止动作：必须用户明确触发，流程不得自行执行
- 移动前后都用 `git show <tag> --stat` 确认落点

其他要求：

- 不发跨版本重名的 tag；版本号冲突时升到下一个版本
- 发版前确认 `version_file` 与 tag 名一致，避免“VERSION 1.2.0 / tag v1.3.0”

---

## Step 6：发布后动作（默认全部停在本地）

- 本地 commit 与本地 tag 完成后即算发版完成
- **归档发版任务**：把本次发版任务从 `tasks/dev/current/` 移到 `tasks/dev/done/`（发版任务的归档点在这里，Step 1 允许它留在 `current/`；`awf release-prep` 自动完成移动+状态 done+完成日期），再运行 `awf status` 刷新摘要
- 以下动作**必须用户明确触发**，不得自动执行：
  - `git push` / `git push --tags`
  - 合并到主干或其他分支
  - 创建 GitHub/GitLab Release、上传制品、发布到包管理器、触发发布流水线
- 本仓库铁律：只允许本地 commit，**禁止 push**；推送与合并由用户明确触发
- 收尾向用户报告可用命令，让用户自己执行：

```sh
git push origin HEAD
git push origin vX.Y.Z
```

报告至少包含：新版本号 / 变更文件 / 实际执行的校验命令与结果 / 未解决点。

---

## Step 7：回滚

已发布版本出问题时，回滚同样走本流程：

1. **保留 tag**：不删除、不移动**已推送**的 tag，它是问题版本的唯一标识；本地尚未推送的误打 tag 可按 Step 5 的分级规则在同版本内调整
2. **用 revert 提交回退**：`git revert <发版提交或问题提交>`（一次合并提交用 `git revert -m 1 <merge>`），不使用 `reset`
3. **升 patch 版本**：回滚本身也发一个新版本（如 `1.2.4` 回滚 `1.2.3`），CHANGELOG 写 `Fixed` / `Changed` 说明回退了什么、影响范围
4. **重新校验**：回滚后必须重跑 `gate` / `test`，并验证问题场景消失
5. **打新 tag**：在新发版提交上按既有风格打注释 tag
6. **禁止**：未经用户同意的 `git push --force`、`git reset` 远端历史、删除远端 tag；误发版本用新版本更正并在 CHANGELOG 说明
7. 回滚原因、影响面、用户需采取的动作写入 CHANGELOG 与（必要时）迁移文档

---

## 必问用户

- Step 0 探测结论不明确（多个版本文件、tag 风格混用、monorepo 包版本不一致）
- 本次是否发版，以及版本位（major / minor / patch）判断有分歧
- 存在不兼容变更，但迁移方案未定
- 需要移动**已推送**的 tag、或任何 force push / 重写历史
- 需要推送、合并、创建 release 或发布制品（本流程不会自动做）
- 校验命令不可用（环境、凭据、设备缺失）

---

## 检查清单

- [ ] Step 0 探测完成：版本落点 / tag 风格 / CHANGELOG 形态 / 发布动作已记录在任务块
- [ ] 相关任务已 review 通过；本次范围已列出；发版任务仍在 `tasks/dev/current/`，待发版完成后归档
- [ ] 开始前检查：`gate` / `test` 通过，工作区只含发版相关改动
- [ ] 提交前检查：CHANGELOG 已更新、VERSION 与 CHANGELOG 一致、`git diff` 已自查、工作区干净
- [ ] 不兼容变更已写迁移说明与回滚方式
- [ ] 版本号文件已更新为语义化版本号；monorepo 各受影响包已改齐
- [ ] CHANGELOG 按 Added/Changed/Fixed/Removed 归类，历史条目未改动
- [ ] 发版提交只含版本号与 CHANGELOG（及迁移文档），注释 tag 打在发版提交或改动提交上（见 Step 5）
- [ ] tag 未跨版本移动；已推送 tag 未在未获用户同意时移动
- [ ] 未执行任何 push / 合并 / 发布动作；已给用户可复制的推送命令
- [ ] 发版任务已归档到 `tasks/dev/done/`，并跑过 `awf status`
- [ ] 回滚方案已确认：保留 tag + revert 提交，不强推

## 自检清单

- [ ] 按状态机推进，每步更新任务块「状态 / 最近更新 / 下一步」
- [ ] 验证命令实际执行（compile/test），命令不可用写明 `验证阻塞：<原因>` 并置 blocked
- [ ] 收尾：归档（补完成日期）→ 沉淀可复用结论到 memory/history、脚本按 tools 标准收录 → check_workflow.sh 通过 → awf status → 本地 commit（禁 push）

## 禁止事项

- 未验证的判断写「待确认」，不写结论
- 状态只写 active / blocked / review / verify / handoff；一个任务块只有一个 Owner
- 归档后必须跑通过校验；status.md 由 awf status 刷新才算完成
- 不自动 push、不改写历史

## 无技能环境兜底

本技能不可用时，按「执行步骤」的状态机自行推进，参照目标项目 `tools/` 手册与 `memory/history`。
