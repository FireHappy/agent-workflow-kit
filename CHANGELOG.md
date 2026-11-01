## [0.6.0] - 2026-11-02

### Added
- Agent Workflow 工作流进度 DSH 插件（DEV-019~022）：右侧边栏「Agent Workflow」页签，项目选择/任务卡/状态徽章/待办进度/最近完成/账本新鲜度/自动刷新；初始化/开始任务/归档查看 + 任务 CRUD/暂停继续/删除回退（弹框确认）
- 建队账本门禁（DEV-021）：`awf team-audit` + `check` F7——扫描 `.agent-teams/` 引用 ID 校验账本登记，未登记 FAIL
- 步骤条三态激活语义（DEV-023）：active→实现 / verify→验证 / review→Review，顶部 已完成/当前/待办 计数，icon 裁剪修复（当前节点白点 + 去 overflow）
- `dev-reload.sh`（DEV-024）：自动检测前端（刷新即生效）/ 服务端（需重启）改动类型，给出最小生效路径

### Changed
- 面板整体 UI 设计优化（DEV-024）：单列任务卡 / 实现 vs 验收进度双语义 / 步骤条无裁剪 / 优先级徽章统一等宽 / 按钮无中间状态文案；checkItems 只统计「验收标准」段（14/14 而非 14/17），HTML 注释模板块不再被解析为任务
- review 状态徽章文案「待复核」→「复核中」（DEV-030，与进行中/验证中持续动作语义一致）
- review 流程规范补齐（DEV-028）：review 必须由独立子 agent 执行并等待返回 pass 才能归档；结论三态 pass / needs_revision / reject；进入 review 前验收标准须 100% 勾选；状态流转纪律（active→verify→review→归档）强制 + 双重检查（自查 + 独立复查）
- 归档时序规范（DEV-029）：review 返回 pass（验证完成）当场先改任务状态为「归档」，done.md 移入 / status 刷新 / commit 是状态改归档之后的落纸动作；状态字段变更后必须立即 `awf status` 刷新摘要

### Fixed
- `awf status` 最近完成不显示最新归档任务（DEV-031）：done.md 新条目在顶部，`tail -n 8` 误取旧行，改 `head -n 8` + bootstrap 同步副本

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
