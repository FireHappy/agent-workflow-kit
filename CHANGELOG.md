## [Unreleased]

### Fixed
- **满池等待返回值同步 + 并发记账提示（DEV-215）**：`wait_session_ready` 在满池监听返回任一空闲会话后，发送/改名/日志一律以返回会话为准（此前 session_id 只更新在函数局部，等待目标≠发送目标，监听可能白等）；同项目活跃 `[awf]` 会话 >1 时任务包自动注入记账提示（按票据任务编号登记账本/commit），避免并行 worker 自排相同 ID 造成账本覆盖（UXR-POOL 002/003 曾撞 DEV-091）——经 5 连发实测定位

### Added
- **满池修复四件套（DEV-214）**：`awf-dispatch` 满池监听等待逻辑补齐四个缺陷——① **本地归档台账**：`--cleanup --apply` 归档的会话 id 写入 `dispatch/archived-sessions.json`（派发方本地、不入库），组装复用池/统计每项目 `[awf]` 会话数时排除台账记录，已归档会话不再占池（不等待/不计数）；新增 `--forget-archived` 重置台账（其中会话恢复进入复用池）；② **`--new` 上限校验**：目标项目 `[awf]` 池满 3 个且全忙时，`--new` 需显式 `--allow-over-3` 确认（本次超限新建写入派发日志留痕），不再静默绕过每项目 3 个并发上限；③ **并发新建互斥**：同一项目新建决策用文件锁 `dispatch/.lock-<project>` 串行化，拿到锁后重读池再决策——并发方刚建出的可复用会话改为复用、不重复新建；④ **`--cleanup`**：列出每项目超 3 的空闲 `[awf]` 会话（保留最近更新 3 个、运行中跳过），`--apply` 逐个经 `workspace/archiveSession` 归档并写入台账——SKILL 参数表与机制说明同步，smoke 补归档排除/上限确认/锁互斥/清理四类断言（217 项全绿）

## [1.5.0] - 2026-11-07

### Added
- **双版本模型（DEV-205）**：技能版本 Skill-Version（`agent-workflow/VERSION`，发版即 bump，插件显示、技能实体安装消费）与骨架版本 Framework-Version（`agent-workflow/FRAMEWORK_VERSION` 新增=1.0.0，仅骨架契约 bin/awf、AGENTS.md.tmpl、project.yaml.tmpl、账本结构、check 门禁、pre-commit、README.md 骨架文件变化时 bump）解耦——`awf upgrade` 改按骨架版差量判定（相同默认跳过、`--force` 强刷；不同/缺失复制骨架并登记目标骨架版），不再把 kit 技能版写项目版本锚点（version_file 锚点由项目自身发版流程维护）；技能更新只在技能实体 install.sh，不再触发项目全量升级；`init` 登记当前骨架版、`check` 对缺骨架版项目给迁移软提示（不阻塞）、`install.sh` 同步 FRAMEWORK_VERSION 到技能实体、模板/技能文档（upgrade/release）/README/CHANGELOG 同步双版说明与 bump 规则
- **插件版本信号读技能实体优先（DEV-206）**：`skillVersion`/`latestFramework`/`latestAWF` 改为优先读技能库实体 `~/.dsh/skills/agent-workflow-scaffold/{VERSION,FRAMEWORK_VERSION,bin/awf}`（install.sh 同步的安装后唯一事实源，与 `awf upgrade` 的 KFF/KVF 同构），未安装/不可读回退 kit 仓库——插件显示的技能版本即为本机实际生效版本；技能实体存在时 kit 未登记也能正确显示/判定，不再依赖全局索引登记

### Changed
- **版本同步 v1.5.0**：技能版（`agent-workflow/VERSION` 1.4.1→1.5.0）、骨架版（`agent-workflow/FRAMEWORK_VERSION` 1.0.0→1.5.0，本次骨架契约已变）、插件（`dsh-plugin/package.json` 1.3.0→1.5.0，补齐 v1.4.x 未随 kit 同步的插件版本）。本机侧边栏「回报数据」面板已在 v1.4.1（DEV-195）从插件整链移除（ReportsPanel + awf-reports 页签 + `/awf/reports` 路由）；老安装副本（≤1.3.0）仍会显示，升级插件到 1.5.0 并重启 DSH 后消失

## [1.4.1] - 2026-11-07

### Added
- **派发工具随技能自包含（DEV-201）**：跨项目派发实现由 `cross-project-dispatch` 技能自带（`scripts/awf-dispatch`），可独立复制/安装/更新；脚手架旧入口（`bin/awf-dispatch`）移除，仓库 CLI/Python 调用、安装、测试与文档统一指向技能内实现——技能即工具，不再依赖脚手架

### Changed
- **版本锚点迁移框架支持（DEV-198）**：`version_file` 指向 `agent-workflow/VERSION`（非根目录）全链路验证通过（release-prep 读写 / upgrade 锚点写 / bootstrap·check digest 与根 VERSION 无关，dry-run 实证）；`awf check` 新增「项目根存在 VERSION 文件」防踩坑软提示（迁移建议：`git mv VERSION agent-workflow/VERSION` + `version_file` 指过去；不阻塞，纯脚本项目可忽略）——macOS 大小写不敏感 FS 上根 `VERSION` 遮蔽 libc++ `<version>` 头（Unity IL2CPP Bee clang `-I"."` 全量构建报 `expected unqualified-id`，SP-302，uxrsample 2026-11-07 实测）；release 技能/模板注释同步锚点位置规范（Unity/C++ 项目锚点一律放 `agent-workflow/VERSION`），release 技能 Step 5 去 `git add VERSION` 硬编码（改按 version_file 动态取路径）；SP-302 坑沉淀 kit memory
- **派发术语统一为「回执」（DEV-195）**：worker→派发方方向全部改「回执」（回报→回执，含 回执投递通道/回执正文/回执字段/回执时机/回执格式/回执数据），消息标题【回执请求】保持，「回报」「汇报」在派发链路活文件中退役——注入文本、技能（cross-project-dispatch/dev/review/team-flow/upgrade/README）、docs/design.md、根 SKILL.md、插件面板文案、smoke 断言同步
- **票据生命周期统一「用完即删」（DEV-195）**：`awf-dispatch --prune --apply` 从「归档到 dispatch/archive/」改为「真正删除已完成票据（不留存根）」，与 upgrade 技能既有条款对齐；扫描改为递归（覆盖 upgrade-v<版本>/ 子目录票据），删除后向上清空空目录；文档/SKILL/帮助文本同步
- **注入文本精简（v1.4.1 批次）**：`awf-dispatch` 任务包的回执规则从内联 ~60 行压缩为技能指针（必报点/时机/字段/违约指向 `cross-project-dispatch/SKILL.md`），每次派发的附加约定大幅瘦身
- **任务编号清理**：技能（release/team-flow/upgrade）与插件注入文本中的任务编号混入移除——正文指引、示例、历史锚点统一去编号（编号仅留注释追溯）；保留「如 DEV-001」任务 ID 格式示例与工作流 README 格式示例

### Fixed
- **upgrade 回归测试对齐技能化形态（DEV-202/203）**：A 段重写为存量 workflows 存根 + `--slim` 清理断言、B/C/D 段调用改技能路径、措辞对齐新模板；补隔离守卫（全局技能 vs checkout 一致性）、`--slim` 前置自保护、bin 副本清理断言、pre-commit 一致断言——upgrade 回归从「引用退役路径必失败」恢复全绿
- **半初始化项目工作流补全**：rokid-system-components / rokid-uxr-plugin / rokid-openxr-loader 三项目 `awf init` 补全（保留已有骨架、check 通过）；serialized 共享写点残留清理（openxr-uxr / uxrsample，DEV-087）

### Removed
- **脚手架旧派发入口**：`bin/awf-dispatch` 删除（DEV-201），全局技能同步后 `~/.dsh/skills/agent-workflow-scaffold/bin/awf-dispatch` 不再提供

## [1.4.0] - 2026-11-06

### Added
- **技能库顶层化（DEV-191/DEV-192）**：8 个流程技能（dev / debug / docs / review / cross-project-dispatch / release / team-flow / upgrade）提升为 DSH 顶层技能（`~/.dsh/skills/<name>/`），DSH 启动注入 frontmatter、凭 `whenToUse` 自动匹配——`AGENTS.md` 只需「按任务类型加载技能」，入口不再列举清单、不再维护路由索引
- **新增独立技能**：`team-flow`（团队执行三轨）、`upgrade`（awf upgrade 规范）从内嵌章节拆为独立技能
- **技能索引**：`skills/README.md` 作为路由表（任务类型 → 技能），新增技能只改此文件

### Changed
- **AGENTS.md 精简**：路由表、路由决策、回报细则全部收进技能；入口只保留开工顺序 / 铁律 / 校验 / 技能库指针（净删大量内联细则）
- **install.sh 逐技能安装**：一套命令把所有技能装为 DSH 顶层技能（link/copy），并把技能版本（`agent-workflow/VERSION`）同步到实体 `VERSION`
- **版本锚点**：插件「技能版本」读全局索引 kit 仓库 VERSION，「项目版本」读各项目 agent-workflow/VERSION——升级判定为两版差量对比（项目落后 → outdated 提示可升级），非强制同步
- **docs 收技能**：dispatch / team-flow / release / upgrade / enforcement 迁出 docs/（工作流文档归技能）；design / arch-review 保留 docs/（项目文档）

### Fixed
- 跨项目派发技能重写为单 SKILL.md：清理 DISPATCH-xxx 编号噪音（编号降级为附录登记表），参数表补全（--report/--force/--allow-dirty 等）
- smoke 断言收敛：删除「文档措辞同步」类断言（80+ 处），保留行为断言（216 项全绿）——文档措辞不再做冒烟门禁

## [1.3.0] - 2026-11-06

### Added
- **流程技能化（DEV-184）**：6 个流程（dev/debug/docs/review/release/cross-project）细节全部迁入技能 agent-workflow-scaffold 的 `skills/`（每个为规范独立技能：frontmatter + 执行步骤 + 自检清单 + 禁止事项）；项目内 `workflows/` 目录退役（净删 1735 行副本），AGENTS.md 路由内联状态机 + 强制加载技能即流程入口
- **工具技能化（DEV-186）**：`bin/awf`、`bin/awf-dispatch` 迁入技能（项目内不再复制工具副本），项目命令统一调技能路径 `~/.dsh/skills/agent-workflow-scaffold/bin/awf`；`check_workflow.sh` 为接口 shim 指向技能工具；upgrade 不再同步工具、`--slim` 清理存量副本
- **技能实体化（DEV-186）**：install.sh 默认 copy——技能为实体目录（SKILL.md + skills/ + bin/ + templates/ + docs/ + test/），不再符号链接指向项目仓库；更新重跑 `./install.sh`
- **统一测试标准（DEV-186）**：smoke 双形态适配——仓库形态全量 225 断言、技能形态 216 断言（仓库级断言 skip「技能形态不适用」），同一套标准覆盖仓库与技能
- **看板插件 1.2.0/1.3.0 同步**：插件 versionStatus 升级判定改为基于骨架版本（AWF 代次），细节更新不误报；显示脚手架版本

### Changed
- **回报规范完善（DEV-186）**：回报正文排版（DISPATCH-153）完整内联技能；标题措辞「开始执行任务 / 完成任务」；删除冗余技能 cross-project-dispatch（内容被 cross-project 覆盖）
- **init 初始化与升级一致（DEV-183）**：`/awf/init/agent` 改为注入主会话（不再用受管理子代理）；引导卡加「git 忽略工作流」toggle
- **gitignore 框架段（DEV-183）**：init 默认写派发产物忽略段（dispatch/log.md、reports/、headless/、.agent-teams/）

### Fixed
- 版本号 vv1 显示修复（客户端不再重复拼 v 前缀）

## [1.2.0] - 2026-11-06

### Added
- **全局升级 v1.2.0 技能化（DEV-185）**：dsh-settings / finderpathbar / uxrsample 升级落地（锚点 1.2.0、workflows 清理、技能路由就位）

### Changed
- **彻底技能化（DEV-184）**：项目内 workflows/ 退役，细节入技能；check/upgrade/G1 门禁适配技能化形态（workflows 可选、--slim 清理存量）；AGENTS.md 路由内联状态机 + 强制加载技能

### Fixed
- **看板移除静态流程阶段（DEV-182）**：status 静态映射非真实流程数据，行内流程阶段展示移除（纯函数保留待真实数据接入）

## [1.1.7] - 2026-11-06

### Added
- **git 忽略本机私有工作流（DEV-175）**：`awf init --gitignore` + `awf gitignore` 子命令——把 `/agent-workflow/`、`/AGENTS.md`、`/CLAUDE.md` 写入项目 `.gitignore`（根锚定、固定标记行幂等），团队项目把本机私有工作流一键排除入库；usage/README/SKILL/smoke 同步

### Changed
- **kit 自身锚点迁移至 agent-workflow/VERSION（DEV-174，DISPATCH-155）**：kit 版本号统一放 `agent-workflow/VERSION`（版本锚点可配置，DEV-145 的 version_file 机制），`awf upgrade` 源版本由硬编码改读 kit 自身 `version_file`（KVF），upgrade 到目标时动态写锚点

### Fixed
- **派发者规范（--sender 填项目名）**：`awf-dispatch` 注入文本/示例/标题默认 sender 由 lead 角色名改为 cwd 项目名（agent-workflow-kit），用户规范禁止代理名

## [1.1.6] - 2026-11-05

### Fixed
- **`awf-dispatch --screen-state` CoreGraphics 探针段错误（DISPATCH-143 锁屏判定）**：`CFDictionaryGetValue` 的 key 由 `c_char_p` 裸指针改为 `CFStringCreateWithCString`（kCFStringEncodingUTF8）构造 CFStringRef——CFEqual 不再裸指针崩溃（macOS 弹出崩溃报告噪声；探针本已子进程隔离 + pmset 兜底，主流程不崩）；3 次运行验证无崩
## [1.1.5] - 2026-11-05

### Added
- **项目级技能（DEV-17x）**：AGENTS 开工顺序新增第 3 条「项目级技能」声明 + 跨项目路由引用——`skills/cross-project-dispatch/SKILL.md` 相应情况可直接加载/阅读，不依赖全局技能目录；跨项目派发细则**内联** `agent-workflow/workflows/cross-project.md`（权威自包含：四道门 / 三规则 / 必报点 / 回执请求 / 转达回执）
- **回报数据边栏面板（DEV-170 定型）**：better-sidebar「回报数据」页签 + `/awf/reports` 数据层（JSON 落盘，数据与渲染分离）

### Changed
- **回报消息标题【回报投递】→【回执请求】**（接收者视角；客户端 matcher 兼容新旧标题；docs/SKILL/smoke 同步）
- **install.sh 移除 cross-project-dispatch 全局技能安装**（细则已内联工作流）；全局技能目录撤销
- AGENTS 模板调整：开工顺序编号顺延（项目级技能占第 3 条）

### Removed
- DEV-170 失败尝试清理：chat.node 折叠节点 / turnTail 回合尾部卡片 / 会话头部入口 / 诊断标记（宿主不渲染，净删 164 行）

### Fixed
- templates/ 与 agent-workflow/ 生成副本漂移（bootstrap digest 91b6f5cb）
- smoke 断言标题同步 2 处（回执请求）

## [1.1.4] - 2026-11-05

### Added
- **回报投递头「项目名＋会话名」（DEV-165，DISPATCH-146 升级）**：`awf-dispatch --report` 投递头字段「来源会话/派发方会话」→「来源/派发方」，值由 `session_display_label` 解析为「项目名（cwd basename）＋会话标题」（查不到/离线回退原 ID）——剔除裸 UUID，用户一眼可读；smoke 新增 §30.15
- **转达用户回执三态模板（DEV-160/162/163，DISPATCH-152 定稿）**：派发方收回报核验后转达用户按固定回执（✅ 完成 / ⏳ 阻塞进行中 / ❌ 失败·核验不过），字段含发送者/执行内容/改动范围/验证/问题·风险/我的处理（「无需你操作」收尾）；完整可照抄样例与三态用法见 docs/dispatch.md「转达用户回执格式」
- **回报正文排版（DEV-168，DISPATCH-153）**：回报正文用 markdown 结构化骨架（`## ✅ 完成回报（编号 · 任务名）` + 状态/执行内容/改动范围/commit/验证/遗留·风险 列表），禁止 ①②③④ 整段长文本；docs/cross-project/SKILL/AGENTS 模板同步（digest a971603d）
- **框架同步升级 9 项目（DEV-166/167）**：openxr-uxr 试点（含打包回归 DEV-056 通过）→ 全量 8 项目 upgrade + 目标本地提交（weekly-report de58bd6 / naboo 14bad768a / finderpathbar f260788 / uxrsample a7a36b83 / dsh-settings 303ea09 / dsh-im c4d22ee / pluto e5aec99 / rokid-system-components 5f6df373，check 全 0 且禁 push 遵守）；rokid .gitignore 增补遗留待用户决策

### Changed
- 无破坏性变更；DISPATCH-153 新增回报格式约束（向后兼容：旧格式回报仍可读）

### Fixed
- 回报投递头裸会话 UUID 可读性问题（DEV-165）
- 回报正文整段长文本可读性问题（DEV-168）

## [1.1.3] - 2026-11-05

### Added
- **熄屏判定 + 远程办公状态（DEV-150，DISPATCH-143 定义升级）**：`awf-dispatch --screen-state` 判定本机 macOS 显示器状态（on/off/locked/unknown，CoreGraphics 锁屏子进程隔离探针 + `pmset -g log` 最近 Display 转事件，失败保守 unknown 不误报亮屏）；需用户确认/决策前先判定——`off`/`locked`＝**远程办公状态（remote）**（用户不在电脑前、但经 IM 在线随时可决策，不是「暂离/离线」）→ **照常回报**「阻塞：需用户确认 X（远程办公状态，请经 IM 通知用户决策）」并保持会话等待；派发端**主动、立即**经 IM（飞书小迪司）通知用户决策或置待决队列（防遗忘锚点），决策后 `--session` 续发——远程办公路径是正常就绪流程的一部分，不存在「等待用户回来」；`on`（亮屏，用户在电脑前）→ 原 DISPATCH-141 路径；`unknown` → 注明由派发端酌情。注入文本、docs/dispatch.md、docs/design.md、SKILL.md 与跨项目模板（cross-project.md / AGENTS.md.tmpl 双副本）同步，术语统一「远程办公状态（remote）」，smoke 新增 §S5 / §30.9 / §30.9b

### Changed
- **门禁严格度优化（DEV-148，DISPATCH-139）**：P0 等待放宽（queue 默认 180s + 超时前中途状态回报）、P1 `--allow-dirty=tasks` 粒度豁免 + G3 三选项、P2 G1 status.md 瞬态豁免；对应 docs 与 SKILL 同步
- **git worktree 派发隔离评估（DEV-149，DISPATCH-140，docs）**：评估结论 design-ready 但缓做——3 触发信号 + 6 设计要点 + G3 移除/出口 merge 校验替换方案；与 DISPATCH-139 P1/P2 为补充非替代；不改变当前派发行为，仅沉淀评估文档

### Fixed
- 标注：[1.1.2] 条目含重复的「### Changed」块（历史遗留，v1.1.2 起即存在；按发版规则历史段不改写，此处仅作标注说明，内容无重复影响）

## [1.1.2] - 2026-11-04

### Fixed
- **dispatch 审查修复（DEV-144，DISPATCH-138）**：修正派发器 S1/S2（会话选择与命名边界）、M1（多轮 --session 续发的票据/模块解析）、M2（队列与复用的状态一致性）四类问题，smoke 增加对应回归场景

### Changed
- **版本锚点可配置（DEV-145，DISPATCH-143）**：`release-prep` 与 `upgrade`（DEV-133 锚点同步）的版本锚点读写一律改读目标 `agent-workflow/project.yaml` 的 `version_file`（默认仍为仓库根 `VERSION`，未配置的项目行为不变）。锚点**不得放进 clang 头文件搜索路径**（如 `-I"."` / Unity IL2CPP 的 Bee）：macOS 大小写不敏感 FS 上根 `VERSION` 与 C++ 标准库头 `<version>` 撞名，`#include <version>` 被解析成该文本文件报 `expected unqualified-id` 并级联误报（Linux/CI 不触发）。文档（`templates/workflows/release.md` / `docs/release.md` 双副本）同步说明
- **需用户确认时决策回派发端（DISPATCH-141）**：目标 worker 不得在目标会话内向用户提问（ask_user_question 等），按回报格式写「阻塞：需用户确认 X（问题 + 选项 + 建议 + 解除条件）」并保持会话等待、**不擅自行事**；派发方（router）转述用户决策后用 `awf-dispatch --session <会话ID>` 续发，worker 继续。awf-dispatch 注入文本、docs/dispatch.md、docs/design.md 与跨项目模板（AGENTS.md.tmpl / cross-project.md 双副本）同步，替换「用户在目标会话内回复即可继续」旧表述


### Changed
- **版本锚点可配置（DEV-145，DISPATCH-143）**：`release-prep` 与 `upgrade`（DEV-133 锚点同步）的版本锚点读写一律改读目标 `agent-workflow/project.yaml` 的 `version_file`（默认仍为仓库根 `VERSION`，未配置的项目行为不变）。锚点**不得放进 clang 头文件搜索路径**（如 `-I"."` / Unity IL2CPP 的 Bee）：macOS 大小写不敏感 FS 上根 `VERSION` 与 C++ 标准库头 `<version>` 撞名，`#include <version>` 被解析成该文本文件报 `expected unqualified-id` 并级联误报（Linux/CI 不触发）。文档（`templates/workflows/release.md` / `docs/release.md` 双副本）同步说明
- **需用户确认时决策回派发端（DISPATCH-141）**：目标 worker 不得在目标会话内向用户提问（ask_user_question 等），按回报格式写「阻塞：需用户确认 X（问题 + 选项 + 建议 + 解除条件）」并保持会话等待、**不擅自行事**；派发方（router）转述用户决策后用 `awf-dispatch --session <会话ID>` 续发，worker 继续。awf-dispatch 注入文本、docs/dispatch.md、docs/design.md 与跨项目模板（AGENTS.md.tmpl / cross-project.md 双副本）同步，替换「用户在目标会话内回复即可继续」旧表述

## [1.1.1] - 2026-11-04

### Changed
- **派发协议三规则（DEV-138）**：默认异步派发（`--wait` 改为显式开关，`--timeout` 仅对 `--wait` 生效）；派发即启动目标工作区的子代理会话，**不启用智能体团队承载派发**（无 captain/dispatcher 成员层，多目标=多次派发异步互不阻塞）；票据瘦身——router 只写 用户意图/硬约束/验收标准/路由裁决，不写执行步骤、不做前置侦察，前置分析由目标 worker 在自己的会话里用目标仓库 `tools/` 手册与 `memory/history` 完成
- **派发生命周期闭环（DEV-139，配套 DISPATCH-133）**：派发方账本在派发前登记「进行中开发任务」（active：目标 worker/关联票据/派发时间/一句话目标/验收标准），派发方核验收讫后归档 done（补完成日期/结果概要/commit 引用）；失败/无回报保持 active/blocked 不归档，例行扫描追问/重派/上报用户决策，防止「派发了就忘记」
- **必有回报是主机制、登记 active 仅兜底（DEV-140，配套 DISPATCH-134）**：目标会话一旦打开就有回报能力——成功必须回报（commit/产物/验证结果），失败必须回报（环节/错误/阻塞点）；需用户确认时返回「需用户确认 X」并保持会话等待（目标会话多轮对话续聊）；「无回报」仅当会话确实失联（进程退出/会话关闭）才存在，此时登记 active 作为兜底锚点

### Fixed
- 派发文档与模板中「派发即建队、dispatcher 成员层、`--wait` 是团队默认」旧语义全部清除；`--idle-wait` 过期参数说明修正为 `--queue-timeout`
- 派发生命周期章节「无回报是常规路径」表述修正为「必有回报是主机制、登记 active 仅兜底」

## [1.1.0] - 2026-11-04

### Added
- **派发握手流程（DEV-136）**：awf-dispatch 先报「连接成功：会话 <id>（复用/新建）」明确建立连接，再派发任务，默认立即返回（异步）；要结果才加 `--wait`（默认最多等 300s，--timeout 可调）——等待超时不代表失败：任务已送达、目标会话继续执行，可在 GUI 查看（不再长时间空等）
- **会话命名 `[awf] [派发者] [任务名]`（DEV-134）**：派发者 = `--sender` > 票据「派发者：」行 > **调度方项目名**（如 agent-workflow-kit，DEV-136）；任务名 = 票据 `# 标题`/`任务：` 行的短标题（**不再自动拼接任务编号**）；旧格式 `[awf] <项目>` 会话自动归入默认派发者池，复用后升级改名
- **同派发者并发池上限 3（DEV-134）**：同一派发者在同一目标项目最多 3 个 [awf] 会话——池内空闲优先复用（改名接新任务）；都忙且池未满则新建扩充；池满 3 个都忙才排队等待（--queue-timeout，默认 60s）；任务完成不做标题还原

### Changed
- `--wait` 默认等待 300s（原 600s），轮询每 15s 打印「已用/上限」进度，明确可 Ctrl-C 保持异步
- `awf upgrade` 同步版本锚点：目标项目根 `VERSION` 与 kit 不一致时自动写入（DEV-133）
- 会话复用键从「按模块」改为「按项目 + 派发者」：不同模块（同派发者）票据复用同一会话池

### Fixed
- 看板插件点已完成任务误开 `done/README.md` 索引 → 改为读单任务文件 `done/<ID>.md`（DEV-132，插件 0.3.1）
- 看板插件版本徽标错误显示 `v1`（框架代号）→ 优先显示项目根 `VERSION` 锚点（DEV-133，插件 0.3.2）
- 看板「最近完成」同日批次排序回归：完成日期 + 任务 ID 双键倒序（DEBUG-002，插件 0.3.3）

## [1.0.0] - 2026-11-04

### Added
- **目录式任务账本（DEV-127）**：`tasks/<type>/{todo,current,done}/<ID>.md` 单任务文件（状态=所在目录），三个目录各一个 `README.md` 检索索引（由 `awf status` 生成）；`awf status` 幂等迁移旧形态——含块大文件拆为单任务文件（archived/完成/Archive 归一为 done）、todo 表行生成待办文件、空表删除；check F1-F6 三目录扫描 + 9 个目录 README required 校验；看板插件 dsh-awf-dashboard 0.3.0 读写目录式（DEV-129）
- awf-dispatch 会话命名 `[awf] <目标项目>` + 批量派发队列等待 `--queue-timeout 60s`（DEV-126）
- 去掉「来源=工作流禁转派」硬校验（DEV-128）：继续转派只提示核对转派理由，不拦截、不 FAIL

### Changed
- 认领/归档语义：认领= `todo/` → `current/` 移文件 + 状态改 active；归档= `current/` → `done/` + 状态 done + 补完成日期（`awf release-prep` 自动归档）
- status.md 数据来源 = 目录任务文件（账本改动后未跑 `awf status` → check 报「已过期」）；三目录 README 为检索视图、请勿手改
- smoke 新增第 28 节目录式生命周期断言（认领/归档/README 同步/check），176/0

### Fixed
- en_US.UTF-8 下 `task_field` 中文键比较恒真、done 段 `sort` 排序错位（DEV-117 同款 locale 坑的目录式变体）：全部 awk 走 awfk、sort 固定 `LC_ALL=C`

## [0.9.0] - 2026-11-04

### Added
- 激活式 Router 协议（DEV-115）：任务票据「来源：用户 | 工作流」标记、派发深度 = 1、来源=工作流禁转派（`awf-dispatch` 直接 FAIL，退出码 2）；全局升级至该协议版本（DEV-116）
- worker 名牌 role（DEV-118）：`awf find` 输出 `id	路径	角色`、`awf projects` 增「角色」列、`awf register` 登记/提示回显；role 单一事实源在 yaml，不改索引（DEV-120 全网填写）
- init --role 初始化即登记能力名牌（DEV-121）：{{ROLE}} 模板占位、空键兜底解析、缺省填写提示
- 经验/工具积累闭环（DEV-124）：开工读 memory/history 同类经验、收尾沉淀可复用结论到 history/脚本按 tools 晋升三要素收录、`awf check` 软提示兜底（只提示不 FAIL）
- awf-dispatch --check-role 软校验（DEV-122）：目标 role 与任务关键词交集匹配通过/不匹配警告/无 role 提示，均不硬拒（退出码不变）；--allow-role-mismatch 可静默警告

### Changed
- router 决策三件套含「读各 worker 的 role（特长），按任务意图筛选候选」（DEV-122：AGENTS.md.tmpl 与 cross-project.md 同步）
- 路由裁决理由必备项（DEV-122）：理由须含目标 role 与任务意图的匹配说明（cross-project.md 第 4 条）；匹配不到写「无匹配，建议用户确认」不得硬凑
- 开工顺序加「先读 history 同类经验」、收尾加沉淀动作（DEV-124）

### Fixed
- macOS awk 中文比较 locale 错乱（DEV-117）：awfk LC_ALL=C 包装统一 awk 调用 + smoke 并入日常门禁（--with-smoke + pre-commit 钩子模板 + install-hooks）
- role 空行吞值（DEV-119）：模板去字面空 role 键（{{ROLE}} 占位）+ yaml_get 跳过空值行，双键取有值项
- --check-role 过度匹配（DEV-123）：泛词停用表（31 词）+ 中文 2/3/4-gram 混合，领域词单命中即匹配；kit↔周报泛词误判回归修复

## [0.8.0] - 2026-11-03

### Added
- 任务查看器接入 md 编辑阅读器（DEV-106）：SourcePanel + 归档查看「预览（mdToHtml 渲染）/ 编辑（textarea）」双模式；轻量渲染器全转义防 XSS
- 任务查看 tab 改为「预览/编辑」分段控件（选中项 accent 高亮文字 + 底部指示条，不铺满）
- 弹框边缘拖拽调整大小（DEV-108 强化）：右宽/下高/右下角，扩展为 8 方向热区（四边+四角），左/上边缘联动移动位置
- 弹框拖动移动（标题栏 cursor:move，位置钳制视口内）；弹框默认居中打开
- 弹框仅 ✕ 或 ESC 关闭（点击遮罩不关闭，避免拖拽后误关）
- 任务查看弹框「拷贝」按钮样式对齐标题路径 awf-icon-btn（⧉/成功 ✓）
- 源文件弹框默认尺寸 800×800（内容区 flex 撑满，预览/编辑两态高度一致；拖拽后随自定义尺寸）

### Changed
- 侧边栏字号跟随宿主对话框字体大小设置（DEV-108：HOST_FONT_SCALE + F() 全面板缩放）
- 任务查看弹框字号放大批次（描述 14 / 正文 13 / tab 12）；mdToHtml 预览字号接入 F() 缩放
- 移除底部「账本数据来源」提示行；移除预览态底部重复「编辑」按钮；源文件面板默认预览、预览高度对齐编辑

### Fixed
- mdToHtml 表格渲染错位：表头/分隔行处理 + 定宽列布局 + 长文本断行
- 预览/编辑 tab 空内容（children 被 h() 第三参数 null 覆盖）
- 弹框切换高度跳动（预览/编辑内容区固定一致；按钮行高度补偿）
- 弹框默认尺寸各档调大（ModalShell 460→560→720；源文件 800）

---

## [0.6.0] - 2026-11-03

### Added
- 看板只跟随当前会话（DEV-020）：去掉项目下拉与 localStorage 手动选择，未命中索引直接锚定会话根，未初始化弹引导卡
- 任务卡查看/编辑源文件（DEV-043）：任务块点击打开源文件面板，查看 markdown 原文 / 直接编辑保存；归档查看复用同一面板；ESC 关闭弹框；当前任务/待办列表加滚动容器；保存按钮默认禁用（修改后激活）
- 工作流升级闭环（DEV-041）：检测框架版本落后 → 注入 agent 升级指令（整理合并保留自定义内容 + 账本格式规范 + awf check 验证）→ 升级中按钮动画 → 完成后 SSE 刷新；归档查看复用源文件面板
- 待办区兼容 5 列任务表格（DEV-100）：`| ID | prio | title | deps | date |` 5 列行 deps 并入描述；类型 tab 数量徽章（标题去重）
- 最近完成倒序（DEV-101/102）：parseDoneRows 兼容 4/5/6 列归档行（desc=第3列、日期=行内首个 YYYY-MM-DD）；排序改为日期倒序优先 + 同日按归档先后倒序；适配块式归档（行式+块式合并去重、块式优先）+ recent 全局按日期倒序聚合（修复 dev 行多占满全部槽位问题）
- 看板初始化 agent 化（DEV-103）：新增 POST /awf/init/agent，agent 读项目上下文生成完整骨架（project.yaml + AGENTS.md 区块 + workflows/templates/bin + 标准4列账本 + 初始真实任务）→ awf check/status 验证，替代仅空模板的最小骨架；引导卡「初始化中…」状态 + 旋转动画
- 面板动作子代理通道（DEV-039）：start/return-todo/delete/progress-backfill 判断型动作由宿主受管理子代理执行（不经主会话）；buildActPrompt 动作指令构建器 + AGENT_ACTIONS 白名单
- 文本提亮批次：待办行 / 最近完成行 / 底部账本来源提示 / 引导卡说明文字 dim→sub，与主文本一致

### Changed
- 看板布局收敛（DEV-021）：三区统一轻量行风格（去卡片/按钮/源文件入口），项目卡简洁化（版本号+路径复制 icon），顶部工具条移除
- 移除待办数量标记又恢复为 tab 徽章（DEV-100 终态）：用户目视反馈 tab 徽章与标题数量重复，保留 tab 徽章一处、标题不重复
- 删除操作从程序写链路改为 agent 判断（DEV-033 延续）；删除测试任务 DEV-099

### Fixed
- 插件版本 vv1 显示修复（DEV-021）
- 归档查看不显示：done.md 加宽格式（dev/debug 6 列、docs 5 列）不匹配 4 列正则 → 最近完成区永远为空（DEV-101 修复）
- 最近完成仍缺新数据：近期归档只以块形式存在无行式条目，行式解析看不到（DEV-102 块式归档修复）
- 底部提示/待办/最近完成文字过灰看不清（提亮批次）

---

## [0.5.0] - 2026-11-01

### Added
- `check` 机械兜底（F1-F3）：状态字段枚举校验（`active/blocked/review/verify/handoff`，非法值即失败）；`status.md` 新鲜度校验（账本改动后未跑 `awf status` 即失败）；`done.md` 归档块/归档行校验（缺文件、非法 ID、缺优先级或完成日期即失败）
- `check` 生成副本漂移检测（F6）：`bin/awf`、`bin/awf-dispatch`、`templates/` 与 `agent-workflow/` 对应副本不一致即失败
- `release-prep` 生成副本漂移保护（F6）：先检测漂移再覆盖，有漂移拒绝执行，不再静默回滚 agent-workflow 侧改动
- `awf-dispatch --allow-legacy-reuse`（RT-1）：显式放行旧格式会话迁移；默认仅当会话消息含派发任务包标记时自动迁移
- `awf upgrade [目录] [--dry-run] [--force]`（KIT-DEV-017）：升级已有项目工作流的一等操作——同步 `bin/awf`、`bin/awf-dispatch`、模板与 workflows，保留 project.yaml / tasks / memory / tools / AGENTS.md 区块外内容，随后自动 `bootstrap` + `check`；自定义 `check_workflow.sh` 默认保留并告警、`--force` 才替换；配套 `docs/upgrade.md`（步骤 / 变更清单 / 保留清单 / 验证命令），并有可重跑的 `test/upgrade.sh` 回归

### Changed
- 模板 harness 中立化落地（F5）：`templates/workflows/cross-project.md` 移除全部 DSH 专有词（workspace.json / headless / Ungrouped / 会话错误码），收敛为抽象步骤，细节下沉 `docs/dispatch.md` 与派发技能层；`templates/README.md`、`templates/AGENTS.md.tmpl` 同步收敛
- `docs/team-flow.md` §4.2 / §5 / §6 / §7 的 approval 语义统一为 `automatic`（F4）：不再 staged 审批，建队前贴 3 行计划摘要、可立即叫停
- 会话复用不再自动迁移旧格式会话（RT-1）：用户自建的 `<项目> · xxx` 普通会话不会被复用/改名/注入任务；只有会话消息含派发任务包标记、或显式 `--allow-legacy-reuse` 才迁移
- `--wait` 落地判定增加 commit 归因（RT-3）：初始 HEAD 改为任务发送前一刻采集；HEAD 变化后还需最新 commit 含任务 ID（或账本 done.md 归档）才算落地，无关 commit 不再误判
- `--wait` 落地归因改区间判定（RT-3 区间归因）：`initial..HEAD` 区间内任一 commit 含任务 ID 即判落地，任务 commit 落地后 10s 内被无关 commit 压顶不再误判 not landed
- headless 任务 ID 与会话模式对齐：文件名优先、票据正文回退（正文里的任务 ID 也能归因落地）
- headless `--wait` 与会话模式契约对齐（RT-2）：进程退出 0 后仍校验落地（初始 HEAD 在启动前采集）；进程超时未结束仍为退出码 3
- cross-project 模板措辞统一（F5 补全）：GUI×2 / sessionId×1 改为「图形界面 / 会话 ID」，smoke F5 门禁正则补 gui/sessionId
- 任务路由改为「先判目标仓库」逐条决策（KIT-DEV-017，模板 + workflows/cross-project.md + README）：目标仓库 == 当前工作区 → 小任务单会话、可并行拆分才用团队；≠ → 默认 `awf-dispatch` 派到目标项目自己的工作区会话执行；**团队不承载跨仓库任务**（附 2026-11-01 七人团队改六仓库反例）；账本与 commit 始终归主线、只本地 commit 禁 push
- `check` 迁移兼容与修复指引（KIT-DEV-017）：归档块缺「状态」字段或旧英文表头 `| Status |` 时 FAIL 并输出可直接执行的修复指引（`| Status |` → `| 状态 |`，保留归档原值）；`awf status` 兼容读取 `| Status |` 表头；字段检测锚定字段表行，任务块正文引用迁移字样不再污染状态列

### Fixed
- 更正 0.4.0「模板中立化」名不副实：cross-project 模板当时仍含 DSH 专有词，本次全部移除并下沉文档与技能层
- `awf-dispatch` headless 非零退出不再伪装成超时（RT-2）：新增独立退出码 5（执行失败），`docs/dispatch.md` 退出码表同步更新
- 删除无调用点的 `_legacy_candidates`（旧格式迁移逻辑已内联在 `select_reuse_session` 的 probe 分支，死代码移除避免语义漂移）
- `skills/cross-project-dispatch/SKILL.md` 同步新语义：--allow-legacy-reuse 参数、退出码 5、旧格式迁移需派发标记且默认关闭
- 全局索引写入并发安全（DEV-015）：`register` / `bootstrap` 的全局索引写入加锁（flock 优先，本机无 flock 时 mkdir 自旋回退），N=8 并发 register/bootstrap 无丢失更新
- `release-prep` 顺序修复（0.5.0 发版批次发现）：写账本块后先刷新 `status.md` 再校验，避免 F1-F3「status.md 新鲜度」门禁在发版装配时误拦截
- `test/registry-concurrency.sh` 锁残留断言按锁模式放宽（DEV-016）：mkdir 模式断言无残留、flock 模式断言锁可正常获取/释放，消除 flock 平台误报

## [0.4.2] - 2026-10-31

### Added
- `awf-dispatch` 无进展快失败：回合 <5s 且零输出/零工具调用判为僵尸会话，立即以退出码 4 结束并建议 `--new`，不再空转到超时
- `awf-dispatch` 等落地：回合结束后轮询目标 HEAD / 账本 done.md，提交或归档才返回 0；超时才返回 3 并区分「回合已结束但任务未落地」
- `awf release-prep <X.Y.Z>`：一键发版装配（init/bootstrap + 账本登记归档 + VERSION/CHANGELOG + check/smoke + status），不自动 git 写操作
- 两级复核策略（docs/team-flow.md §3.5）：新增功能/小调整走快速车道（自带测试 + captain 快验），架构级才走 reviewer 全量复核

### Changed
- `session/list` 拉取合并为一次（G4 探针与复用查找共用缓存）
- 机械/可验证任务（升级、同步、拷贝）默认直做，不重复派生子任务复核

### Fixed
- `git_head_sha` 失败语义：git 读取失败返回 None、空仓库返回 ""，落地判定只比较有效 SHA，避免把读取失败误判为"已提交"
- 等待空闲时会话消失与超时分开报错

# Changelog

本仓库遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)：
`MAJOR.MINOR.PATCH`。历史条目只追加更正，不改写。

## [0.4.1] - 2026-10-31

### Added
- `awf-dispatch` 会话复用：默认按「项目 + 模块」复用目标工作区已有空闲会话（标题 `[awf] <项目> · <模块>`），同一需求/模块的上下文跨派发保留，不再每次新建会话
- 新选项：`--module <名>`（> 票据「模块：」行 > 默认「通用」）、`--new`（强制新建）、`--session <id>`（指定会话）、`--idle-wait <秒>`（等待会话空闲上限，默认 300）
- 会话命名规范：`[awf] <项目名> · <模块名>`（沿用旧标题的会话在复用/新建时迁移改名）

### Changed
- `--json` / 日志 / `dispatch/log.md` 记录会话来源（复用/新建）、sessionId、模块名
- 上下文压力不参与会话选择；≥ 0.9 时仅提示可考虑 `--new`（上下文增长交给 harness 压缩）

### Fixed
- `--new` 不再调用 `session/list`（避免复用查找把新建路径带崩；G4 通道探针保留）
- 复用旧标题改名后日志/JSON 输出新标题
- 等待空闲时会话消失与超时分开报错（消失 → 重新派发；超时 → 加长 `--idle-wait` 或 `--new`）

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
