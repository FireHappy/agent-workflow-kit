## [Unreleased]

### Changed
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
