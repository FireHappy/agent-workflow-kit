# 已完成

| 任务ID | 优先级 | 描述 | 完成日期 |
|--------|--------|------|----------|
| DEV-024 | P1 | Agent Workflow 面板整体 UI 设计优化：单列任务卡/实现vs验收进度语义/步骤条无裁剪/优先级徽章统一等宽/按钮无中间状态文案/checkItems 只统计验收标准段（14/14 而非 14/17）/模板注释块不再被解析 | 2026-11-01 |
| DEV-028 | P1 | 工作流 review 规范补齐：review 必须由独立子 agent 执行并等待返回 pass 才能归档；结论三态 pass/needs_revision/reject；进入 review 前验收标准须 100% 勾选；状态流转纪律（active→verify→review→归档）强制 + 双重检查；归档状态修改明确语义 | 2026-11-02 |
| DEV-029 | P1 | 归档时序修正：review 返回 pass（验证完成）当场先改任务状态为「归档」，done.md 移入/status 刷新/commit 是状态改归档之后的落纸动作；needs_revision→修复→复审闭环实测（status.md 过期致 check FAIL 教训：状态变更后必须立即 awf status 刷新摘要） | 2026-11-02 |
| DEV-022 | P1 | 页签改名 Agent Workflow + 交互增强（初始化/开始任务/归档查看/CRUD/暂停继续/删除回退/UI 重构） | 2026-11-01 |
| DEV-011 | P1 | awf-dispatch 会话复用（项目 × 模块）：默认复用同模块空闲会话保留上下文，会话命名 `[awf] <项目> · <模块>`，新增 --new/--session/--module/--idle-wait；发版 0.4.1 | 2026-10-31 |
| DEV-010 | P2 | 派发票据生命周期：`--prune` 默认 dry-run，按 commit/`done.md` 判定归档；7 张已完成票据入 archive | 2026-10-31 |
| DEV-008 | P1 | awf-dispatch 默认异步：立即返回会话 ID、`--wait` 才阻塞；headless 后台化；超时返回 3 | 2026-10-31 |
| DEV-009 | P1 | 发版工作流 release.md + 发版手册 docs/release.md + CHANGELOG；版本 0.3.0 | 2026-10-31 |
| DEV-007 | P1 | 任务路由：检测到团队能力时所有任务默认优先派发，无能力则单会话；写入入口模板/README/技能/流程 | 2026-10-31 |
| DEV-006 | P1 | 工作流插件化：团队流程随技能分发、跨项目技能补 --team、三个核心流程模板补独立复核与回归、版本 0.2.0 | 2026-10-31 |
| DEV-005 | P1 | 团队协作集成优化：建队前登记账本、质量合同交给插件门禁、review 走 repair 循环、注入段补复核独立性与证据回报 | 2026-10-31 |
| DEV-004 | P1 | `awf-dispatch --team`：任务包追加团队执行建议（缺省不变、可降级），smoke 覆盖注入与参数传递 | 2026-10-31 |
| DEV-003 | P1 | 工作流审阅修复批次：bootstrap 标记守卫、非法 ID 显式失败、收尾顺序与 review 定位、dry-run 假阳性、日志截断与版本管理 | 2026-10-31 |
| DEV-002 | P1 | 跨项目派发流程：cross-project 工作流 + awf-dispatch 会话派发器 + 派发技能，并同步 demo01/demo02 | 2026-10-31 |
| DEV-012 | P1 | release-prep 0.4.2：一键发版装配 | 2026-10-31 |
| DEV-001 | P2 | 自举副本漂移检测（F6）：check 对 bin/awf、bin/awf-dispatch、templates 三对副本漂移即 FAIL，release-prep 先检测再覆盖不静默回滚 | 2026-11-01 |

## [DEV-001] 自举副本漂移检测（F6）

| 字段 | 值 |
|------|------|
| 状态 | done |
| 优先级 | P2 |
| Owner | chenlin |
| 协作模式 | single |
| 完成日期 | 2026-11-01 |

### 目标

check 对 bin/awf、bin/awf-dispatch、templates 三对副本漂移即 FAIL；release-prep 先检测再覆盖，不静默回滚。

### 验收标准

- [x] check 检测 bin/awf vs agent-workflow/bin/awf、bin/awf-dispatch vs agent-workflow/bin/awf-dispatch、templates vs agent-workflow/templates 漂移即 FAIL
- [x] release-prep 先比对漂移，漂移时明确报错，不静默覆盖
- [x] check_workflow.sh 与 awf check 通过

## [DEV-013] 架构审查 P1 修复批次（F1-F6 + RT-1/2/3）

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | archived |
| Owner | lead |
| 修改范围 | bin/awf、bin/awf-dispatch、templates/、docs/team-flow.md、docs/dispatch.md、test/smoke.sh、CHANGELOG.md、agent-workflow/ 双副本 |
| 验收标准 | 9×P1 全部修复；smoke 113/113；check 全绿；t5/t6/t7 复核 pass |

### 下一步
P2 后续批次：RT-3 区间归因（medium）、SKILL.md 同步（medium）、_legacy_candidates 死代码、headless 正文回退、模板 GUI/sessionId 措辞 + F5 正则。

| DEV-013 | P1 | 架构审查 P1 修复批次：check 兜底×3 / approval 统一 / 模板中立 / 副本漂移 + 误吞会话 / headless 退出码 5 / 落地误判 | 2026-11-01 |
## [DEV-014] P2 后续批次（RT-3 区间归因 + SKILL 同步 + 清理）

| 字段 | 内容 |
|------|------|
| 优先级 | P2 |
| 状态 | archived |
| Owner | lead |
| 修改范围 | bin/awf-dispatch、skills/cross-project-dispatch/SKILL.md、templates/workflows/cross-project.md、test/smoke.sh、agent-workflow/ 双副本 |
| 验收标准 | 5 项 P2 全部落地；smoke 113/113；check 全绿；captain 快验通过 |

### 下一步
无（P2 批次闭环）。跨项目 skill 分发副本（$DSH_HOME/skills）待下次 install 时同步。

| DEV-014 | P2 | P2 后续批次：RT-3 区间归因 / SKILL.md 同步 / 死代码清理 / headless 回退 / 模板措辞 + F5 正则 | 2026-11-01 |

## [DEV-015] awf 全局索引写入并发安全（无丢失更新）

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | archived |
| Owner | wg-kit |
| 协作模式 | single |
| 来源任务 | 团队任务 t8（awf-update 批量升级 0.4.2 后修复） |
| 修改范围 | bin/awf、agent-workflow/bin/awf、test/registry-concurrency.sh |
| 分支/工作区 | main（agent-workflow-kit） |
| 依赖 | t1–t7 全部完成（避免与并行 bootstrap 抢写全局索引） |
| 最近更新 | 2026-11-01 |

### 目标
让 awf 全局索引写入（~/.agents/projects.tsv 与 AGENTS.md 受控区块）在多个进程并发执行 awf register/bootstrap 时无丢失更新：在 $AGENTS_HOME 下用互斥锁串行化读改写（优先 flock，退化为 mkdir 原子自旋锁 + 陈旧锁超时回收），锁内重新读 REGISTRY、按 P_ID 合并后原子替换，并同步生成副本与新增可重跑的并发回归测试。

### 验收标准
- [x] N≥4 个不同项目并行 register/bootstrap 后，projects.tsv 与 AGENTS.md 表格均含全部 N 行（test/registry-concurrency.sh 证明）
- [x] 单项目 register/bootstrap/status/check 的行为与输出与修改前一致（test/smoke.sh 回归）
- [x] 锁跨进程互斥、带超时与陈旧锁回收、不死锁；macOS（本机）验证可用，POSIX 兼容
- [x] 修改后 bin/awf 与 agent-workflow/bin/awf 内容一致，check_workflow.sh 退出码 0
- [x] 不 bump VERSION/CHANGELOG、不改 project.yaml、不 push

### 下一步
无（并发锁闭环）。Linux 环境可补 flock 分支实测。

| DEV-015 | P1 | awf 全局索引写入并发安全：$AGENTS_HOME 互斥锁（flock / mkdir 自旋 + 陈旧回收）串行化读改写、按 P_ID 合并、test/registry-concurrency.sh 并发回归 | 2026-11-01 |

## [DEV-016] 修复 registry-concurrency.sh 锁残留断言对 flock 平台的误报

| 字段 | 内容 |
|------|------|
| 优先级 | P3 |
| 状态 | archived |
| Owner | wg-kit |
| 协作模式 | single |
| 来源任务 | 团队任务 t10（t9 复核观察） |
| 修改范围 | test/registry-concurrency.sh |
| 分支/工作区 | main（agent-workflow-kit） |
| 依赖 | t8（并发锁实现） |
| 最近更新 | 2026-11-01 |

### 目标
registry_lock 优先 flock（锁文件常驻不删除），无 flock 时退化 mkdir 自旋锁（释放时 rmdir 删除锁目录）。测试尾部 `[ ! -e .awf-registry.lock ]` 在 flock 平台会误报失败：改为按实际锁模式分支断言——mkdir 模式断言无残留；flock 模式断言锁文件存在且可正常获取/释放。

### 验收标准
- [x] 本机（macOS 无 flock → mkdir 路径）测试通过：bash test/registry-concurrency.sh 退出码 0
- [x] 测试仍可重跑、DSH_AGENTS_HOME 隔离、N≥4 默认 8 不变
- [x] check_workflow.sh 退出码 0；本地 commit 未 push

### 下一步
无（低风险修复闭环）。

| DEV-016 | P3 | registry-concurrency.sh 锁残留断言按锁模式放宽：mkdir 模式断言无残留、flock 模式断言锁文件可正常获取/释放，消除 flock 平台误报 | 2026-11-01 |

## [DEV-017] 工作流路由与「项目升级」语义改进（KIT-DEV-017）

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | archived |
| Owner | wg-kit |
| 协作模式 | single |
| 来源任务 | 派发方票据 KIT-DEV-017（2026-11-01 awf-update 团队教训） |
| 修改范围 | templates/AGENTS.md.tmpl、templates/workflows/cross-project.md、templates/README.md、bin/awf、docs/upgrade.md、docs/design.md、docs/team-flow.md、README.md、test/upgrade.sh、test/smoke.sh、agent-workflow/ 双副本 |
| 分支/工作区 | main（agent-workflow-kit） |
| 依赖 | 无 |
| 最近更新 | 2026-11-01 |

### 目标
把「任务路由」「项目工作流升级」「旧账本迁移兼容」的规则明确化、可执行、有文档、有指引：路由按「目标仓库 == 当前工作区」逐条决策（小任务单会话、可并行才团队、跨仓库默认 awf-dispatch、团队不承载跨仓库任务）；新增 `awf upgrade` 一等操作与 docs/upgrade.md；check 对归档块缺「状态」/旧英文表头 `| Status |` 输出可直接执行的修复指引；字段检测锚定表格行，正文引用迁移字样不污染状态列。

### 验收标准
- [x] templates/AGENTS.md.tmpl 与 workflows/cross-project.md 含可逐条执行的路由决策（== 当前工作区 → 单会话/团队；≠ → 默认 awf-dispatch；团队不承载跨仓库任务，附 2026-11-01 反例）
- [x] 「升级已有项目的工作流」有显式文档 docs/upgrade.md（步骤/变更清单/保留清单/验证命令）；awf upgrade 可运行且有 test/upgrade.sh 可重跑测试（init → 制造旧版框架 → upgrade → check → 断言与 kit 一致）
- [x] awf check 对归档块缺「状态」/旧英文表头 FAIL 输出含 `| Status |` → `| 状态 |` 修复指引（保留归档原值）
- [x] ./agent-workflow/check_workflow.sh 退出码 0（28 项 ok）；README 已更新
- [x] 改动全部在 agent-workflow-kit 仓库内；本地 commit 消息含 KIT-DEV-017；未 push

### 下一步
无（闭环）。升级已显式化为 awf upgrade + docs/upgrade.md；后续对已生成项目可逐项目在各自工作区会话派发执行（团队不承载跨仓库任务）。

| DEV-017 | P1 | 工作流路由与「项目升级」语义改进（KIT-DEV-017）：路由按目标仓库逐条决策（小任务单会话/可并行才团队/跨仓库默认 awf-dispatch、团队不承载跨仓库任务）；新增 awf upgrade + docs/upgrade.md；check 迁移 FAIL 输出修复指引（| Status | → | 状态 |） | 2026-11-01 |

| DEV-018 | P1 | release-prep 0.5.0：一键发版装配 | 2026-11-01 |
| DEV-019 | P1 | 工作流进度 DSH 插件：/awf/projects + /awf/ledger 只读账本路由、右侧边栏「工作流进度」页签（项目选择/状态徽章/todo 进度/最近完成/新鲜度/自动刷新）、ledger 单测；修复 better-sidebar 动态注入 | 2026-11-01 |
| DEV-021 | P1 | 建队账本门禁：awf team-audit + check F7（扫 .agent-teams/ 引用 ID 校验账本登记，未登记 FAIL）+ AGENTS.md 铁律/team-flow §0 同步 | 2026-11-01 |
| DEV-020 | P1 | 工作流进度页签改进：UI 重构（分层卡片/语义徽章/渐变进度条/空态错误态，DSH 主题令牌）+ 默认锚定当前会话项目（useWorkspaces/useSession，localStorage 用户选择优先），实现→复核全 pass | 2026-11-01 |

## [DEV-019] 工作流进度 DSH 插件（dsh-awf-dashboard）

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | active |
| Owner | wg-kit |
| 协作模式 | single |
| 来源任务 | 用户直接触发（插件化工作流，DSH 可视化进度） |
| 修改范围 | dsh-plugin/（package.json / cordis.patch.yml / src / lib / test / docs）、账本 |
| 分支/工作区 | main（agent-workflow-kit） |
| 依赖 | 无 |
| 最近更新 | 2026-11-01 |

### 目标
把 agent-workflow 工作流插件化为 DSH 客户端插件 `dsh-awf-dashboard`：在处理需求时可在 DSH GUI 右侧边栏「工作流进度」页签可视化查看项目账本（当前任务状态 / todo 进度 / 最近完成 / status.md 新鲜度），源码与测试随 kit 分发，可安装进桌面 profile 的 bundles。

### 验收标准
- [ ] 服务端只读路由 /awf/projects + /awf/ledger 输出结构化的账本 JSON（解析复用 KIT-DEV-017 的字段表行锚定规则）
- [ ] 客户端右侧边栏出现「工作流进度」页签：项目选择、当前任务状态徽章、todo 进度条、最近完成、新鲜度提示；自动刷新
- [ ] ledger 解析器有可重跑单元测试（node:test，无需 GUI）
- [ ] 安装进桌面 profile 后 GUI 验证通过；文档说明安装/卸载
- [ ] ./agent-workflow/check_workflow.sh 退出码 0；改动全在 kit 仓库内；本地 commit 含 KIT-DEV-019

### 下一步
重启 DSH 验证：web 引导不再崩溃、「工作流进度」页签出现。若仍失败，把 `dsh.profile.bundles` 里的 `dsh-awf-dashboard` 移除即可恢复（依赖与副本已就绪）。

> 事故记录（2026-11-01）：首次安装后 DSH web 引导崩溃（`web boot: 1 entry did not activate`，entry pending 等待 `@deepseek-ai/dsh-client-locale / dsh-client-ui-slots / dsh-client-ui-sidebar-right / dsh-client-modules`）。根因：`dsh.client.inject` 声明了宿主未提供的服务。修复：inject 收敛为 `locale + dsh-client-ui-slots`（与可正常启动的 dsh-at-file / dsh-builtin-browser 完全一致），删除 `manifestVersion`，peerDeps 对齐；客户端 chunk 的 `inject` 导出与 manifest 保持一致（测试自动校验两者相等）。

## [DEV-021] 建队账本门禁：awf team-audit + check F7

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | active |
| Owner | wg-kit |
| 协作模式 | single |
| 来源任务 | 用户指摘（DEV-019 改进建队漏登记账本） |
| 修改范围 | bin/awf（+agent-workflow/bin/awf 副本）、templates/AGENTS.md.tmpl（+agent-workflow/templates/ 副本）、AGENTS.md（bootstrap 重生成）、docs/team-flow.md |
| 分支/工作区 | main（agent-workflow-kit） |
| 依赖 | 无 |
| 最近更新 | 2026-11-01 |

### 目标
把「建队前先登记账本」从文档建议升级为机械门禁：新增 `awf team-audit` 子命令 + `awf check` 的 F7 检查，扫描 `.agent-teams/*/team.json` 引用的任务 ID 是否已在账本登记；未登记即 FAIL。同步强化 templates/AGENTS.md.tmpl 铁律与 docs/team-flow.md §0。

### 验收标准
- [ ] awf team-audit：团队引用已登记 ID 时通过（exit 0）；引用未登记 ID 时报告并 exit 1
- [ ] awf check：存在 .agent-teams/ 且未登记时 FAIL（F7）；登记正常时全部通过
- [ ] 生成副本同步：bin/awf ↔ agent-workflow/bin/awf、两份 AGENTS.md.tmpl 无漂移
- [ ] 模板铁律与 AGENTS.md（bootstrap 后）含建队登记条款；docs/team-flow.md §0 含门禁说明与验证命令
- [ ] ./agent-workflow/check_workflow.sh 退出码 0；本地 commit 含 KIT-DEV-021（禁止 push）

### 下一步
归档本块；DEV-020 团队完成后按同样流程归档并 commit。

> 背景（2026-11-01）：DEV-019 改进（DEV-020）建队时漏登记账本，用户指出「AGENTS.md 还有问题」。根因：team-flow.md §0 早已写明「先登记再建队」，但 check 无机楃验证 → 靠自觉必然漏。改为 F7 机械兜底。

## [DEV-020] 工作流进度页签改进：UI 重构 + 默认锚定当前项目

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | active |
| Owner | wg-kit |
| 协作模式 | single |
| 来源任务 | 用户直接触发（DEV-019 后续改进） |
| 修改范围 | dsh-plugin/lib/client.js、dsh-plugin/test/、dsh-plugin/README.md、账本 |
| 分支/工作区 | main（agent-workflow-kit） |
| 依赖 | DEV-019 |
| 最近更新 | 2026-11-01 |

### 目标
改进右侧边栏「工作流进度」页签：① UI 重构（当前手写平铺样式难看，需视觉层级/语义配色/空态错误态设计，用 DSH 主题变量、纯手写 h() 无构建步骤）；② 页签打开默认自动锚定当前 DSH 会话所属项目（宿主注入 useWorkspaces/useSession 取工作区根与 /awf/projects 索引匹配，localStorage 用户选择优先），不再强制手动选择项目。保留项目切换、15s 自动刷新、手动刷新、账本只读。

### 验收标准
- [ ] UI 重构：项目卡 / 当前任务 / todo 进度条 / 最近完成 / 分区标题 / 空态错误态有明显质感提升，DSH 主题变量适配明暗
- [ ] 默认锚定：页签打开自动选中当前会话项目并加载账本；localStorage 用户选择优先
- [ ] 不回归：项目切换 / 15s 自动刷新 / 手动刷新 / 只读约束均保留
- [ ] node --test dsh-plugin/test/ledger.test.js dsh-plugin/test/client-chunk.test.js 全绿；sync-profile 后 GUI 实测默认打开当前项目
- [ ] check_workflow.sh 退出码 0；本地 commit 含 KIT-DEV-020（禁止 push）

### 下一步
实现与复核由 AgentTeams（kit-dev-019-improve）推进中：ui-developer 实现 → ui-reviewer 复核；通过后归档并 commit。

> 补充（2026-11-01）：本任务由 AgentTeams 团队执行（ui-developer / ui-reviewer，implementation → review 质量门禁）。团队建队时漏了账本登记，此块为补登。

## [DEV-022] 页签改名 Agent Workflow + 交互增强（初始化/开始任务/归档查看）

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | done |
| Owner | wg-kit |
| 协作模式 | single |
| 来源任务 | 用户直接触发（DEV-020 后续；命名讨论后定为 Agent Workflow） |
| 修改范围 | dsh-plugin/（lib/client.js / lib/index.js / src/ledger.js / test / README） |
| 分支/工作区 | main（agent-workflow-kit） |
| 依赖 | DEV-020 |
| 最近更新 | 2026-11-01 |

### 目标
① 页签名称从「工作流进度」改为 **Agent Workflow**；② 未初始化 agent-workflow 的项目打开页签时提供「初始化工作流」入口（服务端写路由，校验项目根安全）；③ 未开始任务可点击直接开始（把待办置为进行中，写账本）；④ 最近完成只显示最近 5 条，点击可查看归档文件（服务端只读归档路由）。

### 验收标准
- [ ] 页签标题显示 Agent Workflow（注册 title、TabTitle、README、测试快照同步）
- [ ] 未初始化项目：页签显示初始化引导，点击初始化成功创建 agent-workflow 框架（受限白名单：仅目标项目根、不越权写其他路径）
- [ ] 待办进度区未开始任务有「开始」按钮，点击后状态变为进行中（写 current.md/todo.md，遵循账本规则）
- [ ] 最近完成仅显示 5 条；点击条目打开归档详情（读 done.md 全文/该任务块）
- [ ] 服务端写路由遵循连接认证围栏 + 路径安全校验（同 /awf/* 现有风格，不执行任意命令）
- [ ] node --test dsh-plugin/test/*.test.js 全绿（含新逻辑单测）；sync-profile 后 GUI 实测通过
- [ ] check_workflow.sh 退出码 0；本地 commit 含 KIT-DEV-022（禁止 push）
- [ ] todo 任务增删改查（表格行 CRUD：新增/编辑/删除 + GET 列表）
- [ ] 当前进行中任务增删改查（字段原位编辑/暂停→blocked/继续→active/删除）
- [ ] 删除任务回退修改：dry-run 只读清单 → 弹框二次确认（清单+警示+「删除并回退/仅删除账本」+取消）→ 白名单 git restore（仅修改范围文件、无 shell 注入、cwd=项目根）→ current 移除 + done 记「已撤销」；非 git/无修改范围拒绝执行回退
- [ ] 任务看板 UI 质感升级（参考 AgentTeams 团队面板卡片风格：多徽章/层级/hover）
- [ ] 进行中任务绘制工作流步骤条（dev：认领→方案→实现→验证→Review→归档；debug：认领→选择诊断方式→收集证据→验证假设→修复与回归→归档；docs：认领→大纲与核实→撰写→审阅→归档）并标注当前阶段

### 下一步
按仓库路由评估执行方式（涉及服务端写路由与安全边界，建议先定方案再动手；可拆：前端交互 / 服务端路由 / 归档查看）。

> 需求补充（2026-11-01）：用户明确——页签名 Agent Workflow；未来希望「在未初始化的项目中打开可初始化工作流」；最近完成显示太多（只留 5 条），点击可查归档文件。
> 需求补充 2（2026-11-01）：todo 任务支持**增删改查**；进行中任务支持**暂停/继续/删除**；删除需**回退相关修改**（安全设计：dry-run 清单 → 白名单 git restore 修改范围文件 → 账本移除 + done 记「已撤销」；修改范围未记录则提示无法自动回退）。
> 需求补充 3（2026-11-01）：**当前进行中任务同样支持增删改查**（编辑任务块字段）；暂停/继续=状态在 active↔blocked 间切换；删除=回退修改（同上）。
> 需求补充 4（2026-11-01）：删除任务触发回退前必须**弹框二次确认**（展示将回退文件清单 + 警示文案 + 确认/取消；「删除并回退」与「仅删除账本」明确分列）。
> 需求补充 5（2026-11-01）：**任务看板 UI 质感升级**——参考 DSH AgentTeams 团队面板的任务卡片风格（更丰富的徽章/层级/状态视觉），并**绘制进行中任务对应的工作流步骤**（dev：认领→方案→实现→验证→复核→归档；debug / docs 各有对应步骤），标注当前任务所处阶段。
> 需求补充 6（2026-11-01）：当前进行中任务必须**可见暂停状态**（如 blocked→徽章显示「已暂停」），并提供**开始 & 暂停按钮**（active 显示暂停按钮、blocked 显示开始按钮，点击即切换）。
> 需求补充 7（2026-11-01）：**待办区优化**——按任务类型分类（dev/debug/docs）用 toggle 切换展示；**去掉待办的进度条**（todo.md 为表格行、无 checkbox，进度恒 0/0 无意义）；确有进度语义时进度条只用于「当前进行中任务」的完成度（如含 - [ ] 子项的 current 任务块）。
> 需求补充 8（2026-11-01）：**编辑任务时可直接打开对应的 .md 源文件**（current.md / todo.md / done.md）——提供「打开源文件」入口：优先调宿主能力打开文件；不可行则前端内展示源文件只读内容 + 本地路径（供系统编辑器打开）。
> 需求补充 9（2026-11-01）：**流程步骤条/任务看板布局难看**——参考 DSH AgentTeams 面板的实际布局重构（卡片×徽章×状态点×分组的视觉语言），不用「一排小圆粒」式步骤条；布局与间距按 AgentTeams 面板质感对齐。

## [DEV-023] 步骤条 icon 裁剪修复与三态激活语义

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | done |
| Owner | agent |
| 协作模式 | single |
| 来源任务 | 用户反馈（2026-11-01） |
| 修改范围 | dsh-plugin/lib/client.js（步骤条节点样式与计数）、dsh-plugin/test/client-chunk.test.js |
| 分支/工作区 | 主分支 |
| 依赖 | 无 |
| 最近更新 | 2026-11-01 |
| 完成日期 | 2026-11-01 |

### 目标

修复用户反馈的步骤条问题：① 当前节点「最上面被裁剪」；② 激活 icon 显示不清；③ 补上「已完成/当前/待办」计数，让验证/Review/归档三态的「未到（灰色）」与「未激活（异常）」语义明确区分。

### 验收标准

- [x] 当前节点改用 CSS 白点（6px，margin auto 双居中）且不再有 overflow:hidden 裁剪，节点完整显示
- [x] 完成节点用清晰 ✓，暂停节点用 ⏸，未到节点空心
- [x] 步骤条顶部显示「✓ 已完成 N / 当前 · 阶段 / 待办 N」计数
- [x] active→实现、verify→验证、review→Review、blocked→暂停 的状态映射正确
- [x] 测试全绿：`node --test dsh-plugin/test/ledger.test.js dsh-plugin/test/client-chunk.test.js` 58 项通过
- [x] profile 副本同步：`bash dsh-plugin/scripts/sync-profile.sh desktop`

### 下一步

- [x] 验证 1：跑单元测试 58/58 全绿
- [x] 验证 2：GUI 实测（当前节点白点完整、计数显示、三态类名）
- [x] 验证 3：归档并提交（本地 commit，禁 push）

| DEV-023 | P1 | 步骤条 icon 裁剪修复（当前节点 CSS 白点 + 去 overflow 裁剪、✓/⏸/空心三态清晰）+ 顶部 已完成/当前/待办 计数 + 三态激活语义（active→实现/verify→验证/review→Review） | 2026-11-01 |
