# 借鉴 dsh-task-ledger 落地 5 项（DEV-216）设计回顾与踩坑

日期：2026-11-08 ｜ 结论来源：DEV-216（3 实现 + 3 复核，AgentTeams 质量合同）｜ 借鉴来源：https://github.com/cq-guojia/dsh-task-ledger

## 落地了什么

1. **awf log**（bin/awf 新子命令）：给任务文档 `### Execution Log` 节追加 `- 时间 · 类型 · @谁 · 说明`，只增不改；无节自动补（兼容旧 `### 执行记录`）；已归档拒绝追加。配套铁律「改正文必配 log（收工三步）」「Execution Log 禁止手改」。
2. **awf validate**：只读一致性体检（字段表/状态枚举/完成日期/README 索引对齐），发现问题输出清单并非零退出，绝不改文件。注意：kit 自身历史账本会有大量数据债务（缺完成日期等），纳入 CI 前需先清理或放宽——**validate 目前是手动体检工具，不是门禁**。
3. **技能授权纪律**（dev 技能 + AGENTS.md 铁律 3 条）：建任务不主动；「删除」只认原话 + 二次确认；暂停/取消/结案区分；收工三步。
4. **插件 dsh-awf-dashboard 1.6.0**（原 dsh-plugin 更名）：
   - 单源双形态：`scripts/copy-workflow-assets.mjs`（--list/--copy/--check）把技能实体 + 仓库 bin/awf 生成内嵌副本（skill/ + manifest.json 逐文件 sha256），装插件即装工作流，--check 防漂移。
   - 停滞/逾期派生指标：`deriveTaskAging`（stale≥3天/overdue≥7天，无时间戳→null 不编造），看板行内 `awf-aging` 徽章（固定单行无动画）。

## 踩坑（同类任务必读）

1. **工作区外部重置事故**：执行中途 git 树被整体重置到 HEAD，未提交改动全部消失（无 stash、git 无法恢复）。**DSH workspace-changes 对象库可找回完整快照**（tree 级），用临时 GIT_INDEX_FILE + checkout-index 选择性恢复（见 /tmp/dsh-recovery-dev216/README.txt 思路）。教训：长团队任务的实现产物应尽早 commit 固化，或每日落盘。
2. **AGENTS.md 受控区块铁律必须同步进模板**：直接改 AGENTS.md 铁律区会 bootstrap 覆盖；要同时改 `templates/AGENTS.md.tmpl`（源）与 `agent-workflow/templates/AGENTS.md.tmpl`（副本），再跑 awf bootstrap（digest 更新），否则 check 报「入口已过期/生成副本漂移」双 FAIL。
3. **copy 脚本源 = 本机技能实体（install 后）**：`--copy` 的内嵌 skills/templates 内容取决于实体新旧——发版前必须先 `./install.sh` 同步实体再 copy，否则包内技能是旧规则（CLI 以仓库 bin/awf 为源，两者不同步会新旧混杂）。**勿用 --skill-dir 指向仓库根**：会把 `.agent-teams/**` 运行时状态当应内嵌文件打进去。
4. **目录改名在 git 显示为「删除 + 未跟踪」**：dsh-plugin → dsh-awf-dashboard 需 `git add -A` 由 git 识别 rename，单独 add 会丢历史。
5. **派生指标与注释**：任务文件骨架里的 HTML 注释示例字段（`<!-- … -->`）会污染字段解析，解析必须 comment-aware（parseBlocks/deriveTaskAging 均已处理，新增解析逻辑照做）。

## 后续待办（DEV-217 —— 已完成，2026-11-08）

- ~~**copy 源收敛**~~：DEV-217 已落地——copy 默认源 = kit 仓库白名单（SKILL.md/skills/*/templates/*/test/* + bin/awf），产物平铺 `skills/`（框架技能与 8 个流程技能同级），manifest.source 版本契约（插件版本=package.json、骨架版=模板内），`--check` 逐文件 sha256 + 版本漂移。插件 1.6.0→1.7.0。
- **版本契约**（DEV-217）：FRAMEWORK_VERSION 放 `templates/`（根+副本）；init/upgrade 读模板；插件版本信号读 `dsh-awf-dashboard/package.json`；技能实体根 VERSION/FRAMEWORK_VERSION 退役（install.sh 不写并清理）。**改模板才 bump 骨架版；流程技能更新不触发项目 upgrade。**
- **重复文件治理（待做）**：git 中仍有 ~49 个内容重复文件（哈希统计 22 组），主要是源↔副本：插件内嵌 `skills/`（~30 个，计划改为构建产物：.gitignore + npm prepack 生成，不进 git）、`agent-workflow/templates/` 的 3 个 + FRAMEWORK_VERSION 副本（需改 check 排放宽，暂缓）。
- 全局技能实体同步（./install.sh）纳入发版流程；validate 纳入门禁前先治理 kit 历史账本数据债务。