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

## 后续迭代（DEV-217/218/219 全部完成，2026-11-08）

- ~~**copy 源收敛**~~：DEV-217 已落地——copy 默认源 = kit 仓库白名单（SKILL.md/skills/*/templates/*/test/* + bin/awf），产物平铺 `skills/`（框架技能与 8 个流程技能同级），manifest.source 版本契约（插件版本=package.json、骨架版=模板内），`--check` 逐文件 sha256 + 版本漂移。插件 1.6.0→1.7.0。
- **版本契约**（DEV-217）：FRAMEWORK_VERSION 放 `templates/`（根+副本）；init/upgrade 读模板；插件版本信号读 `dsh-awf-dashboard/package.json`；技能实体根 VERSION/FRAMEWORK_VERSION 退役（install.sh 不写并清理）。**改模板才 bump 骨架版；流程技能更新不触发项目 upgrade。**
- **重复文件治理（DEV-218 已完成）**：技能源迁入插件 `dsh-awf-dashboard/skills/`（唯一开发路径）后，git 重复从 22 组/49 文件降至 10 组/21 文件；根 `skills/`、`bin/`、`templates/`、`SKILL.md` 副本删除；`agent-workflow/templates/` 保留（check required，项目骨架必需）。
- 全局技能实体同步（./install.sh）纳入发版流程；validate 纳入门禁前先治理 kit 历史账本数据债务。
## DEV-218 / DEV-219 追加结论（2026-11-08）

- **技能源唯一化（DEV-218）**：`dsh-awf-dashboard/skills/` = 全项目技能唯一源；`install.sh` 从插件安装；`test/`、AGENTS 模板、`project.yaml` 引用改插件路径；`copy-workflow-assets.mjs` 与 manifest 退役。**踩坑**：① 批量 `dispatch/ → .dispatch/` 替换误伤 `cross-project-dispatch/`（需二次修复）；② `.gitignore` 被同一替换改成 `/..dispatch/`（双点笔误，需 `git check-ignore` 验证）；③ `awf-dispatch` 内 `Path.cwd()/"dispatch"` 独立字符串未被替换，锁测试每次重建根 dispatch——清索引后仍复现，最终以「grep 全部 dispatch 字面量 + 实体 install 同步」闭环；④ 测试残留锁文件泄漏进 git（需 git rm --cached + 断言强化防回归）。
- **版本锚点统一（DEV-219）**：kit 发布版本锚点 = `dsh-awf-dashboard/package.json`（`version_file`），删除 `agent-workflow/VERSION`；`awf release-prep` JSON 锚点用 python3 精准改写**顶层** version 字段（sed 会把 npm `scripts.version` 生命周期脚本也改掉——**绝不用 sed 处理 JSON**）；非字符串/非法 JSON/缺 version 键一律拒绝且不损坏原文件；插件 `readProjectRelease` 支持 JSON 锚点。
- **发版 1.7.0**：commit cc74f1b + tag v1.7.0（含 DEV-217/218/219；未推送，push 由用户触发）。
- **最终版本体系**：发布版 = `package.json`；骨架版 = `templates/FRAMEWORK_VERSION`；项目实例 = `agent-workflow/FRAMEWORK_VERSION`；流程技能更新不触发项目升级。

## 面板 UI 借鉴回退（2026-11-08，用户判断「感觉没啥用」）

- DEV-221（汇总行 chips + 停滞/逾期筛选）与 DEV-222（统计卡 2×2 + 8 周趋势 + 筛选分段，复刻 dsh-task-ledger 观感）均经用户试用判定**无实际价值，已整体回退**；面板保持 v1.7.0 原版（当前任务 / 待办 / 最近完成 三区轻量行，只读）。
- 相关 commit 已被外部 reset 丢弃（daa7aaf 等），回退后仅保留「历史任务归档」恢复（540f1e7）。
- **教训**：UI 借鉴要克制——用户对面板的既定偏好是「只读、紧凑、无额外装饰」（DEV-026/044/179 一再确认）；未明确要求时**不要主动加统计卡/趋势图/筛选**等「信息密度」改造，即便参照成熟产品。面板只做账本事实展示。

## 派发复用 v2（DEV-224）+ 全局幂等复核（2026-11-08）

- **复用规则（DEV-224）**：入池 = 目标项目 cwd + 标题 `[awf]` 开头 + 未归档（**去掉 blank 过滤**）；池内 `running=False` 取 updatedAt 最新复用；都忙 → 轮询等待任一空闲（`--queue-timeout`，默认不新建）；池空/`--new` 才新建；**取消每项目 3 个上限**（`--allow-over-3` 兼容 no-op）。
- **并发治理**：全局登记表 `$DSH_HOME/.awf-dispatch/sessions.json`（`sessions[sid]={state,owner,since,until}`）+ `flock` 文件锁；`pick_claim_session` 锁内"重读池+排除已占用+running 空闲+原子占用"；发送后 `release_session`（10s 冷却，TTL 600s 兜底）。复核 PASS（smoke 242/0、并发模拟 A–E）。
- **空回合问题（重要）**：复用旧会话时偶发——消息注入成功（inbox spliced）但回合空转（turn/start → inbox → turn/end，无 assistant/工具输出；重发一次仍空），会话配置正常、上下文压力无异常；用 `--new` 新建会话立即正常。疑似宿主冷会话/空回合问题（社区插件 `nlflora/dsh-empty-turn-guard` 同类）。
  - **建议修复（待实施）**：`awf-dispatch` 发送后短轮询会话事件，检测"turn 结束且零 assistant/工具"→ 自动 `--new` 重发一次并记录「空回合自愈」；避免复用旧会话时静默失败。
- **全局 v1.7.0 幂等复核**：7 目标全部复用（零新建），6 个已最新；**finderpathbar 发现真实差异**（模板仍旧版 + 空 bin/）→ 同步 v1.7.0 模板 + bootstrap（digest 4b5dd747）+ 删空 bin/，commit 0e4c5e8。教训：升级后要跑一次"幂等复核"，能抓出上次未落地的项目。
- 其他坑：`.dispatch/` 未被部分项目 `.gitignore` 覆盖（仅提示，勿误判为脏改动）。

## 派发文件瘦身（DEV-225，2026-11-08）

用户反馈「派发技能很多问题，没必要本地生成这么多派发文件」。优化：
- **回执默认不落盘**：`--report` 只走通道投递；逐回执 JSON 写入 `.dispatch/reports/` 改为显式 `--save-report`（此前 7 个项目共 27 个回执 JSON）。
- **锁文件全局化**：`$DSH_HOME/.awf-dispatch/locks/.lock-<project>`，不在项目 `.dispatch/` 生成（此前每个派发项目根部残留 `.lock-*`）。
- **免票据派发**：`--task-text "<文本>"` 直接派发，不写 `.dispatch/tasks/`（内部临时文件用完即删）——之前的"每任务一个票据 md"可避免。
- **日志上限**：log.md >120KB 只保留最近 400 行；存量 log 987→200 行。
- **清理存量**：本仓库 `.dispatch` 18→2 文件（archived-sessions + log.md）；7 个目标项目 `.dispatch` 全清。
- 验证：smoke 242/0、install、check 全过、`--task-text --dry-run --allow-dirty` rc=0 且无票据生成。
