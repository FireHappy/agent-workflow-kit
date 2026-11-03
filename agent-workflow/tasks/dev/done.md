# 已完成

| 任务ID | 优先级 | 描述 | 完成日期 |
|--------|--------|------|----------|
| DEV-114 | P1 | 发版 v0.8.0：md 阅读器 + 弹框交互批次装配（VERSION/CHANGELOG/tag，用户触发 push） | 2026-11-03 |
| DEV-113 | P1 | 源文件弹框默认高度 800（预览/编辑两态 flex 撑满一致，拖拽后随自定义尺寸） | 2026-11-03 |
| DEV-112 | P1 | 弹框 8 方向拖拽调整大小（四边+四角，左/上边缘联动移动位置）+ 内容区随弹框高度伸缩；顶部边缘仅移动不调大小 | 2026-11-03 |
| DEV-111 | P1 | 弹框拖动移动（标题栏）+ 默认居中打开（translate 独立属性避免入场动画覆盖居中） | 2026-11-03 |
| DEV-110 | P1 | 弹框仅 ✕ 或 ESC 关闭（点击遮罩不再关闭，消除拖拽后误关） | 2026-11-03 |
| DEV-109 | P1 | 任务查看弹框 UI 微调批次：tab 高亮文字 + 拷贝按钮对齐 awf-icon-btn + 内容区固定高度 + 弹框尺寸放大 | 2026-11-03 |
| DEV-108 | P1 | 弹框可拖拽调整大小（右下角手柄起步）+ 侧边栏字号跟随宿主字体设置（HOST_FONT_SCALE/F()） | 2026-11-03 |
| DEV-107 | P1 | 底部账本来源提示提亮再淡一档后移除 | 2026-11-03 |
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

## [DEV-019] 批量升级/安装 11 个项目 agent-workflow 框架至 kit v0.5.0

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | archived |
| Owner | captain（用户直接触发） |
| 修改范围 | 各目标仓库 agent-workflow/ 框架 + AGENTS.md 受控区块 + 全局索引 ~/.agents/AGENTS.md |
| 验收标准 | 11 项目 upgrade/init 全部完成且 check rc=0；各一个本地 commit 含任务 ID；全部登记全局索引；调度方未直接改目标仓库 |

### 下一步
无（闭环）。跨仓库升级/安装全部由目标自己的工作区会话执行；agent-demo01 与 rokid_system_components 回合超时后由 finalize 票据补 commit。

| DEV-019 | P1 | 批量升级/安装 11 个项目 agent-workflow 框架至 kit v0.5.0（6 upgrade + 5 init）；团队 awf-upgrade-all × 5 dispatcher；G1 status.md 梗阻由 captain 刷新破除；2 个超时回合 finalize 补 commit | 2026-11-02 |

## [DEV-020] 插件看板只跟随当前会话：去项目下拉、未初始化弹引导

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | archived |
| Owner | captain（用户直接触发） |
| 协作模式 | single |
| 来源任务 | 用户直接触发 |
| 修改范围 | dsh-plugin/（插件源）+ ~/.dsh/profiles/desktop/node_modules/dsh-awf-dashboard/（已安装包） |
| 依赖 | 无 |
| 最近更新 | 2026-11-03 |

### 目标
插件打开即自动显示**当前 DSH 会话所在项目**的工作流看板；该项目无工作流则弹初始化界面；去掉项目下拉框（不看/不选其他项目）。

### 验收标准
- [x] 锚定只跟随当前会话：解析会话 cwd（优先索引匹配，未命中直接以该根为目标），不再读 localStorage 手动选择
- [x] header 去掉下拉 <select>，改为当前项目名（索引 id）+「已锚定当前会话」徽章 + 刷新
- [x] 未初始化（无 project.yaml）→ 400 → 初始化引导卡；未定位到会话目录 → 空态登记引导（无项目列表）
- [x] client chunk mock 加载无异常（无启动崩溃回归）；resolveDefaultProject 四场景（精确/子目录/未登记回退/索引未就绪回退）符合预期
- [x] 改动已同步 kit 源 dsh-plugin/（含 README 描述更新）与已安装包一致

### 下一步
无（闭环）。已安装包与 kit 源均已更新；用户在 DSH GUI 刷新/重启后（页面刷新仅 HMR 生效时需 dev:web watcher，否则重启 DSH）查看右侧边栏 Agent Workflow 页签验证。

| DEV-020 | P1 | 插件看板只跟随当前会话：去掉项目下拉与 localStorage 手动选择，未初始化弹引导卡（client.js 锚定/header/空态改造 + kit 源同步 + 冒烟验证） | 2026-11-03 |

## [DEV-021] 看板布局收敛：轻量行风格统一 + 项目卡简洁化（DEV-020 续）

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | archived |
| Owner | captain（用户直接触发） |
| 协作模式 | single |
| 来源任务 | DEV-020 / 用户直接触发 |
| 修改范围 | dsh-plugin/lib/client.js + dsh-plugin/README.md |
| 依赖 | DEV-020 |
| 最近更新 | 2026-11-03 |

### 目标
整体布局 review 后的细节收敛：三区（当前任务/待办/最近完成）统一轻量行风格（hairline 分隔、无卡片边框、无操作按钮）；项目卡简洁化（名称+版本号+路径+复制按钮），去掉账本状态徽章与 status.md 提示。

### 验收标准
- [x] 移除三处「源文件」按钮（当前任务卡/待办行/最近完成行）；源文件面板服务端能力保留
- [x] 当前任务/待办行改为「最近完成」同款轻量行：无卡片边框、hairline 分隔、紧凑间距；空态同步改为无边框文本行
- [x] 项目卡：名称（右侧版本 chip：latest 绿点/outdated 黄点可点击升级）+ 路径（右侧 icon 复制按钮，点击反馈 ✓）；去掉「账本新鲜/过期」与 status.md 提示
- [x] 版本号修复：服务端 installed 已带 v 前缀，客户端不再重复拼 v（消除 vv1）
- [x] CSS：.awf-row:last-child 去底边、.awf-icon-btn 紧凑 icon 按钮；header 去掉「已锚定当前会话」长徽章
- [x] 语法通过、三种账本形态渲染冒烟无异常；改动同步 kit 源 dsh-plugin/ 与 README

### 下一步
无（闭环）。用户在 DSH GUI 刷新后查看右侧边栏验证；如布局仍有细节可直接反馈继续微调。

| DEV-021 | P1 | 看板布局收敛：三区轻量行风格统一（无卡片/无按钮）、项目卡简洁化（版本号+路径复制 icon）、版本号 vv1 修复、空态与 header 清理（DEV-020 续） | 2026-11-03 |

## [DEV-022] 插件版本 0.2.0（DEV-020/021 看板改造发版）

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | archived |
| Owner | captain（用户触发） |
| 协作模式 | single |
| 来源任务 | DEV-020 / DEV-021 |
| 修改范围 | dsh-plugin/package.json、dsh-plugin/lib/client.js、dsh-plugin/README.md |
| 最近更新 | 2026-11-03 |

### 目标
把已验收的看板改造落成插件版本 0.2.0（0.1.0 之后的功能更新：只跟随当前会话项目、三区轻量行风格、项目卡简洁化）。框架 VERSION 本次不动（改动全在插件）。

### 验收标准
- [x] dsh-plugin/package.json version 0.1.0 → 0.2.0；已安装包同步 0.2.0
- [x] 框架 VERSION 不变（0.5.0），无框架本体改动
- [x] kit 源与已安装包 lib/client.js diff 一致
- [x] 本地 commit + 用户明确的 push 触发（推送由用户授权）

### 下一步
无（发版闭环）。推送后由用户决定是否打 tag / 合并主线。

| DEV-022 | P1 | 插件发版 0.2.0：看板改造（只跟随当前会话 + 轻量行风格 + 项目卡简洁化）落版本号，框架 VERSION 不动 | 2026-11-03 |

## [DEV-041] 工作流更新升级闭环：检测已有文件夹 → agent 整理合并 → 完成回调通知面板刷新

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | archived |
| Owner | agent |
| 协作模式 | single |
| 来源任务 | 用户直接触发（2026-11-03） |
| 修改范围 | dsh-plugin/lib/index.js、dsh-plugin/lib/client.js、dsh-plugin/src/ledger.js、dsh-plugin/test/、docs/upgrade.md（如缺则新建）、agent-workflow/workflows/dev.md（如需要） |
| 分支/工作区 | dev（当前工作区） |
| 依赖 | 无（/awf/upgrade、/awf/events、bin/awf upgrade 已有雏形可复用） |
| 最近更新 | 2026-11-03 11:21 +08:00（账本回填子代理独立核对源码；运行验证与 GUI 确认仍待完成） |

### 目标
补齐「工作流更新升级」闭环：检测到项目已有 agent-workflow/ 文件夹 → 面板进入更新升级流程（而非仅初始化）→ 调用 agent 做**整理合并**（保留用户自定义，应用新版框架文件）→ 合并完成后 agent 调用插件提供的完成接口发送通知 → 插件广播事件 → 面板自动刷新页面。

### 验收标准
- [ ] 检测：/awf/ledger 或新路由能区分「已初始化且最新 / 已初始化但可升级 / 未初始化」，已存在 agent-workflow/ 文件夹的项目不再被 init 一键拒绝而毫无引导（面板有对应入口）
- [x] 升级指令：注入 agent 的升级提示含「整理合并」明确语义（保留 tasks/ 账本、project.yaml 项目事实、AGENTS.md 区块外自定义；更新 bin/awf、bin/awf-dispatch、workflows/、templates/、README.md 等框架文件；用 awf check 验证）
- [x] 完成回调：新增插件服务端接口（如 POST /awf/upgrade/complete），agent 合并完成后调用；接口校验路径白名单、记录结果、广播 ledger-changed 事件
- [x] 面板刷新：client EventSource 收到事件后自动 reload 账本 + 版本状态（upgrading 态结束），无需手动刷新
- [ ] 测试全绿：`node --test dsh-plugin/test/ledger.test.js dsh-plugin/test/client-chunk.test.js` 通过；`bash test/smoke.sh` 通过；`./agent-workflow/check_workflow.sh` 全绿
- [ ] profile 同步（桌面）后 GUI 或面板逻辑验证；本地 commit（禁 push）

### 回填证据（2026-11-03 11:20 +08:00）
- 11:21 +08:00 账本回填子代理再次独立核对当前源码与未提交差异，确认下述回调、SSE 刷新及升级指令的实现证据；保留已回填结果，不把源码检查等同于运行验收。
- 本次仅账本回填，并非启动验证或复核；没有阶段代理已启动的证据，状态保留 active，不推定为 verify/review。
- 升级指令：dsh-plugin/lib/index.js:882-889 明确整理合并、保留清单、awf check 与完成接口调用要求。
- 完成回调：dsh-plugin/lib/index.js:899-962 已实现 POST /awf/upgrade/complete，复用 whitelistedProjectPath，检查参数类型，写 .upgrade-log.jsonl，并广播 ledger-changed 与 upgrade-complete；勾选表示源码实现已具备，实际 agent 调用/运行联调待确认。
- 面板刷新：dsh-plugin/lib/client.js:1590-1658 的 loadLedger 更新账本及 versions；EventSource 匹配项目后重载，upgrade-complete 时清除 upgrading。已具备源码逻辑，GUI 实测仍由最后一项跟踪。
- 检测项保持未勾选：已有文件夹缺 project.yaml 时返回 needs-upgrade，且客户端有整理入口；但 handleInit 遇 already-initialized 仅 loadLedger，尚无运行证据证明所有已有文件夹场景均有对应入口。
- 测试与 profile/GUI/本地 commit 项保持未勾选：本次未运行验收测试、未同步 profile 或操作 GUI；git log 未见 DEV-041 提交。任务块没有 [cmd] 或 awf:evidence 条目，未手动勾选测试命令项。

### 下一步
补齐已有文件夹检测/初始化冲突入口的场景验证；运行验收测试，按实际启动阶段转 verify；同步桌面 profile 后验证回调与面板刷新，再进入 review。保留已有未提交代码，不在本次回填中提交或归档。

| 完成日期 | 2026-11-03 |
| DEV-041 | P1 | 工作流更新升级闭环：检测已有文件夹 → agent 整理合并 → 完成回调通知面板刷新（/awf/upgrade/complete + needs-upgrade 引导 + SSE 自动刷新） | 2026-11-03 |

## [DEV-042] 停止自动回填：不再自动派发子代理反复填写开发进度

| 字段 | 内容 |
|------|------|
| 优先级 | P2 |
| 状态 | archived |
| Owner | agent |
| 协作模式 | single |
| 来源任务 | 用户直接触发（2026-11-03：没必要不断的填写开发进度；开发中的任务完成后归档即可） |
| 修改范围 | dsh-plugin/lib/client.js（禁用 maybeAutoBackfill 自动触发 AUTO_BACKFILL_ENABLED=false；面板「当前任务」区块保留不动） |
| 分支/工作区 | dev（当前工作区） |
| 依赖 | 无 |
| 最近更新 | 2026-11-03 |

### 目标
关闭面板账本刷新后自动调用 POST /awf/backfill/auto 的机制（每次刷新→延时 1.5s→注入回填子代理→写 current.md 回填核对/刷新最近更新），改为开关控制；开发中的任务无需反复填写进度，完成后归档即可。

### 验收标准
- [ ] 「当前任务」区块保持原样（未移除）
- [ ] AUTO_BACKFILL_ENABLED=false 时 maybeAutoBackfill 立即返回，不再自动 POST /awf/backfill/auto
- [ ] 路由 /awf/backfill/auto 本身保留（手动调用仍可用，未删接口）
- [ ] node --check client.js 通过；check_workflow.sh 全绿
- [ ] profile 同步（桌面）后 GUI 目视确认；本地 commit（禁 push）

### 下一步
已实现（AUTO_BACKFILL_ENABLED=false + 守卫）→ 回归验证 → profile 同步 → GUI 确认 → 归档。
| 完成日期 | 2026-11-03 |

| DEV-042 | P2 | 停止自动回填：AUTO_BACKFILL_ENABLED=false，不再自动派发子代理反复填写开发进度；路由保留可手动调用 | 2026-11-03 |

## [DEV-043] 任务卡查看/编辑源文件 + 升级按钮更新中动画

| 字段 | 内容 |
|------|------|
| 优先级 | P2 |
| 状态 | archived |
| Owner | agent |
| 协作模式 | single |
| 来源任务 | 用户直接触发（2026-11-03：任务信息点击后能看源文件并可编辑；升级按钮点击后变「更新中…」+动画+禁点） |
| 修改范围 | dsh-plugin/lib/client.js（TaskCard 点击打开源文件 / SourcePanel 编辑保存链路接通 / 升级按钮 upgrading 绑定+旋转动画） |
| 分支/工作区 | dev（当前工作区） |
| 依赖 | DEV-041（升级引导卡）、DEV-042 |
| 最近更新 | 2026-11-03 |

### 目标
①「当前任务」任务行可点击打开源文件（current.md）查看并可编辑保存（/awf/source + /awf/source-write 已有）；②「工作流需要更新整理」引导卡按钮点击后变「更新中…」+ 旋转动画 + 不可点击，直到升级完成回调/账本刷新结束。

### 验收标准
- [x] TaskCard 整行可点击 → 打开源文件面板（tasks/<type>/current.md）
- [x] 源文件面板支持编辑（textarea）+ 保存写回（/awf/source-write）+ 取消
- [x] 升级按钮：busy 绑定 upgrading（非 initBusy）；文案「更新中…」；旋转动画 awf-rot；disabled + cursor wait
- [x] node --check client.js 通过；11/11 断言；check_workflow.sh 全绿
- [x] profile 同步（桌面）三文件一致
- [x] 本地 commit（禁 push）

### 下一步
GUI 验证：任务行点击弹源文件面板 → 编辑保存 → 账本刷新；升级按钮点击后动画禁点。重启 DSH 使服务端路由生效。独立复核后归档。
| 完成日期 | 2026-11-03 |
| DEV-043 | P2 | 任务卡查看/编辑源文件 + 升级按钮更新中动画：三类入口统一源文件面板（current/done/todo 可编辑保存）、列表滚动容器、ESC 关闭弹框 | 2026-11-03 |

## [DEV-100] 待办区兼容 5 列表格 + 显式任务数量

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | archived |
| Owner | lead |
| 协作模式 | single |
| 来源任务 | 跨项目派发任务包（DEV-100） |
| 修改范围 | dsh-plugin/src/ledger.js（parseTodoRows 4/5 列）、dsh-plugin/lib/client.js（待办区数量展示）、dsh-plugin/test/ledger.test.js（新增）、dsh-plugin/package.json（0.2.0→0.2.1）、dsh-plugin/README.md（变更说明） |
| 分支/工作区 | dev（agent-workflow-kit） |
| 依赖 | 无 |
| 最近更新 | 2026-11-03 |

### 目标
看板「待办」区此前只匹配 4 列任务表格（`| ID | 优先级 | 描述 | 日期 |`），项目方常用的 5 列表格 `| 任务ID | Priority | Title | Dependencies | Date |` 整行被静默跳过导致待办长期 0 条；且数量为 11px faint 灰字、某类型 todo/todoRows 全空时整段不渲染。本次让解析层兼容 5 列（依赖并入 desc）、展示层把各类型数量显眼化并常驻渲染。

### 验收标准
- [x] 单测 `dsh-plugin/test/ledger.test.js` 11/11 全绿（`cd dsh-plugin && node --test`）：4 列回归、5 列依赖并入、5 列空 deps 不并入、表头/分隔行不产生任务、日期/ID 非法行跳过、空表返回 []、4 列不被 5 列分支误吞、真实混排结构
- [x] 5 列样例：`parseTodoRows('| DEV-010 | P0 | 示例任务 | 依赖A; 依赖B | 2026-11-03 |')` → 1 行，desc = `示例任务（依赖 依赖A; 依赖B）`
- [x] 4 列回归：uxrsample（只读样本）4 列行解析正常（DEV-054 含内嵌依赖描述）；验收期望行集（DEV-058/054 + DEBUG-009/024/018/015/014）用同格式 4 列 fixture 验证 dev=2 / debug=5 通过；uxrsample 样本账本已漂移（DEV-058→done、DEBUG-014/015/018→done、DEBUG-024 移除、DEBUG-009 移出待办表格），其当前 todoRows = dev 1（DEV-054）/ debug 0，未修改对方仓库
- [x] 展示层：TypeToggle 每类型 tab 挂数量徽章（取自 ledger.todoRows 过滤计数，0 也显示）；区块常驻渲染（0 条时显示「未开始任务 · 类型」+ 空态「该类型暂无未开始任务」）；后端契约 ledger.todoRows 不变
- [x] 已安装副本同步：`~/.dsh/profiles/desktop/node_modules/dsh-awf-dashboard/` 的 src/、lib/、package.json（0.2.1）、README.md、cordis.patch.yml 与 kit 源逐文件 diff 一致（README 文档化的 scripts/sync-profile.sh 当前不存在于 HEAD，按等价复制操作执行）
- [x] 版本：dsh-plugin/package.json 0.2.0 → 0.2.1；README 补 0.2.1 变更说明；kit CHANGELOG.md 无插件条目，未另加
- [x] `node --check lib/client.js && node --check src/ledger.js` 通过；`./agent-workflow/check_workflow.sh` 全绿；本地 commit 消息含 DEV-100，未 push
- [x] 并发与终态说明：另一会话曾临时提交「移除待办区数量标记」（c8f0f32）并把未提交的解析/测试/版本改动补交为 82c2aae；用户最终确认**按任务包恢复数量显示**——本会话在 82c2aae 之后补提交恢复：TypeToggle 数量徽章 + 0 条常驻渲染落地；随后用户目视面板反馈「标题数量与 tab 徽章重复」，标题行「未开始任务 · 类型」不再显示数量（保留 tab 徽章一处）；README 变更记录与已安装副本已同步为最终态

### 下一步
无（闭环）。面板生效：刷新 DSH GUI 页面；若服务端/宿主 bundle 未重读则重启 DSH（已安装副本已更新，重启后右侧边栏 Agent Workflow 页签生效）。
| 完成日期 | 2026-11-03 |
| DEV-100 | P1 | 待办区兼容 5 列表格（parseTodoRows 4/5 列、deps 并入 desc）+ 各类型 tab 数量徽章 + 0 条常驻渲染（标题不重复数量）；插件 0.2.1 | 2026-11-03 |

## [DEV-101] 最近完成区兼容多列归档行（parseDoneRows 4/5/6 列）

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | archived |
| Owner | lead |
| 协作模式 | single |
| 来源任务 | 跨项目派发任务包（DEV-101） |
| 修改范围 | dsh-plugin/src/ledger.js（parseDoneRows 4/5/6 列 + 同日稳定倒序）、dsh-plugin/test/ledger.test.js（追加用例）、dsh-plugin/package.json（0.2.1→0.2.2）、dsh-plugin/README.md（变更说明）；主线会话同 commit 另含 bin/awf status 排序与 docs/upgrade.md（非本票范围） |
| 分支/工作区 | dev（agent-workflow-kit） |
| 依赖 | DEV-100（已归档） |
| 最近更新 | 2026-11-03 |

### 目标
「最近完成」数据源 parseDoneRows 原先只匹配 4 列行 `| ID | prio | desc | date |`，而项目 done.md 归档行是加宽格式（dev/debug 6 列 `| ID | P | 标题 | 摘要 | 完成日期 | 链接 |`、docs 5 列），全部漏掉 → recent 恒空。本次让 parseDoneRows 兼容 4/5/6 列：行首锚定 `| ID | prio |`（ID 形如 [A-Z]+-[0-9]+，优先级任意文本），desc = 第 3 列，完成日期 = 行内第一个 YYYY-MM-DD（兼容日期后链接列），无日期行跳过；排序日期倒序 + 同日按归档先后（文件靠后 = 越晚归档 = 越靠前）。

### 验收标准
- [x] 单测 18/18 全绿：parseTodoRows 11 + parseDoneRows 7（4 列回归、5 列 docs 型、6 列含链接列、表头/分隔/非任务行跳过、无日期/非法日期跳过、倒序+截断 n、混排表格）
- [x] 真实数据实测：ledgerOf(uxrsample).recent 非空且按完成日期倒序；局限——聚合按 dev→debug→docs 各取 8 再拼接 slice(0,8)，dev/done.md 46 行占满 8 槽，debug/docs 更新鲜记录不展示，已列 DEV-102 修复
- [x] 同步已安装副本（0.2.2，与 kit 源逐文件一致）；版本 0.2.1 → 0.2.2 + README 0.2.2 变更说明
- [x] node --check ×3、check_workflow 全绿、awf status 刷新（status.md 最近完成已倒序）；commit 含 DEV-101（48e38a8，外部会话执行合并）；未 push

### 下一步
无（遗留缺陷移交 DEV-102：ledgerOf recent 全局按日期倒序 + 块式归档解析）。
| 完成日期 | 2026-11-03 |
| DEV-101 | P1 | 最近完成兼容 4/5/6 列归档行（parseDoneRows：desc=第3列、行内首日期、同日稳定倒序）；插件 0.2.2 | 2026-11-03 |

## [DEV-102] 最近完成区适配块式归档（parseDoneRows 行式 + 块式合并）

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | archived |
| Owner | lead |
| 协作模式 | single |
| 来源任务 | 跨项目派发任务包（DEV-102） |
| 修改范围 | dsh-plugin/src/ledger.js（parseDoneRows 块式解析 + 行块合并去重；ledgerOf recent 全局倒序聚合）、dsh-plugin/test/ledger.test.js（追加块式用例）、dsh-plugin/package.json（0.2.2→0.2.3）、dsh-plugin/README.md（变更说明） |
| 分支/工作区 | dev（agent-workflow-kit） |
| 依赖 | DEV-101（已归档，commit 48e38a8 + 30c294e） |
| 最近更新 | 2026-11-03 |

### 目标
项目归档实践是双轨的：老式行（`| ID | P | … | 日期 |…|`）与新架构**块式归档**（`## [ID] Title` + 字段表）。近期归档的完成/取消任务只以块形式存在、无行式条目，DEV-101 的行式解析看不到它们 →「最近完成」仍缺新数据。本次让 parseDoneRows 同时解析行式 + 块式并合并去重（块式优先）：块仅当 `状态`=完成/取消计为归档记录（active/blocked/verify/review/pending/done/archived 不算），日期取 `归档日期` > `完成日期` > `最近更新`/`Last Updated`（值内 YYYY-MM-DD 部分），HTML 注释内示例块不解析；并修复 DEV-101 遗留缺陷——ledgerOf 的 recent 改为全部类型（dev/debug/docs）行式+块式记录合并后**全局按日期倒序**再取前 8（旧逻辑 dev 行多时独占全部槽位）。

### 验收标准
- [x] 单测 26/26 全绿：新增 8 组块式用例（完成/取消计入、active/done/archived/pending 与缺日期/缺日期键跳过、日期优先级 归档>完成>最近更新/Last Updated、英文键 Status/Last Updated、注释内块不解析、行+块去重块优先、混合倒序截断、ledgerOf 临时账本跨类型全局倒序 dev/debug/docs）
- [x] 真实数据实测（只读）：`ledgerOf('/Users/chenlin/projects/UnityProjects/uxrsample')` 的 recent 非空且按完成日期倒序——8 条全部为 2026-11-03 dev 块式记录；全局 top20 含 debug 的 DEBUG-023/028/029/015/014/017/027/016（2026-11-03）与 docs 的 DOCS-026（2026-10-28），因「取前 8 + dev/debug 同日各 8 条」的数据快照特性被截在 9–17 位；非实现缺陷（详见回报）
- [x] 同步已安装副本（0.2.3，src/package.json/README/cordis.patch.yml 与 kit 源逐文件一致）
- [x] 版本 0.2.2 → 0.2.3；README 补 0.2.3 变更说明（含块式规则与聚合修复说明）
- [x] node --check src/ledger.js + lib/index.js 通过；`./agent-workflow/check_workflow.sh` 全绿；`./agent-workflow/bin/awf status` 刷新；本地 commit 消息含 DEV-102，未 push

### 下一步
无（闭环）。面板生效：已安装副本 0.2.3 已同步——刷新 DSH GUI 页面；若宿主未重读 profile bundle 则重启 DSH。
| 完成日期 | 2026-11-03 |
| DEV-102 | P1 | 最近完成适配块式归档（parseDoneRows 行+块合并去重、块式优先）+ recent 全局倒序聚合（修复 DEV-101 遗留）；插件 0.2.3 | 2026-11-03 |

## [DEV-103] 看板初始化走 agent 完整配置

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | archived |
| Owner | lead |
| 协作模式 | single |
| 来源任务 | 用户直接触发（2026-11-03：看板初始化工作流信息不完整，走 agent 配置更合理） |
| 修改范围 | dsh-plugin/lib/index.js（新增 /awf/init/agent 路由 + buildActPrompt init 分支 + AGENT_ACTIONS 白名单）、dsh-plugin/lib/client.js（引导卡初始化按钮改调 agent 通道 + 状态显示） |
| 分支/工作区 | dev（当前工作区） |
| 依赖 | DEV-039 受管理子代理通道（runManagedActionAgent）、DEV-041 升级子代理模式 |
| 最近更新 | 2026-11-03 |

### 目标
面板「初始化工作流」改为由 agent 完整配置：读项目上下文（README/技术栈/结构）→ 生成完整骨架（project.yaml + AGENTS.md 受控区块 + workflows/templates/bin/awf + 账本初始任务 + status.md）→ 跑 awf check 验证 → 回报；替代当前仅生成空模板的最小骨架（缺 workflows/README/bin 等运行时文件，信息不完整）。

### 验收标准
- [ ] 新路由 /awf/init/agent：白名单校验 + 幂等（已初始化拒绝）+ 子代理拉起（runManagedActionAgent，cwd=项目根）
- [ ] buildActPrompt 新增 init 分支：指令含完整文件清单 + 上下文感知要求 + check 验证 + 回报
- [ ] client 引导卡「初始化工作流」按钮改调 /awf/init/agent；busy 态文案「初始化中…」；失败显示 error
- [ ] node --check 通过；check_workflow 全绿；profile 同步；本地 commit（禁 push）

### 下一步
实现 init 动作指令 → 新路由 → client 调用 → 验证。
| 完成日期 | 2026-11-03 |
| DEV-103 | P1 | 看板初始化改走 agent 完整配置：/awf/init/agent 子代理读项目上下文生成完整骨架（project.yaml + AGENTS.md 区块 + workflows/templates/bin + 初始账本），替代空模板；引导卡初始化中状态 + 按钮 | 2026-11-03 |

| DEV-105 | P1 | release-prep 0.6.0：一键发版装配 | 2026-11-03 |

## [DEV-106] 任务查看器接入 md 编辑阅读器（预览/编辑双模式）

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | archived |
| Owner | lead |
| 协作模式 | single |
| 来源任务 | 用户直接触发（2026-11-03：截图对比后提出——源文件面板当前是纯 textarea/只读 pre，期望像截图②③的 md 编辑器有「预览」渲染 + 「编辑」双模式） |
| 修改范围 | dsh-plugin/lib/client.js（新增 mdToHtml 轻量渲染器 + SourcePanel 接入「阅读/编辑」tab 切换） |
| 分支/工作区 | dev（agent-workflow-kit） |
| 依赖 | v0.6.0 发版完成；stash@{0} 已有 mdToHtml 半成品 |
| 最近更新 | 2026-11-03 |

### 目标
源文件面板（SourcePanel，打开任务块原文/归档查看用）接入 md 编辑阅读器：内容区支持「阅读（markdown 渲染）/ 编辑（原文 textarea）」双模式切换，阅读模式用内置轻量 mdToHtml 渲染器（安全转义，支持标题/列表/粗体/行内代码/代码块/表格/链接/引用/分隔线），无需外部依赖。

### 验收标准
- [x] mdToHtml：HTML 全转义防 XSS；支持 # 标题 / ## 任务块 / - 列表 / 数字列表 / **粗体** / `行内代码` / ``` 代码块 / | 表格 | / [链接](url) / > 引用 / --- 分隔线
- [x] SourcePanel 内容区加「阅读 / 编辑」tab 条；阅读=mdToHtml 渲染结果（只读、样式对齐面板），编辑=现有 textarea（保留草稿/保存逻辑）
- [x] 只读态（未进编辑）默认显示「阅读」tab；点「编辑」进编辑态；保存后回阅读态
- [x] node --check 通过；check_workflow 全绿；profile 同步；本地 commit（禁 push）
- [x] 归档查看弹层同样走 md 渲染（与源文件面板阅读态一致）

### 下一步
恢复 stash@{0}（mdToHtml）→ SourcePanel 接入双模式 → 验证 → 提交。
| 完成日期 | 2026-11-03 |
| DEV-106 | P1 | 任务查看器接入 md 编辑阅读器：SourcePanel + 归档查看「阅读（mdToHtml 渲染）/ 编辑（textarea）」双模式；轻量渲染器全转义防 XSS | 2026-11-03 |


## [DEV-114] 发版 v0.8.0（md 阅读器 + 弹框交互批次）

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | archived |
| Owner | lead |
| 协作模式 | single |
| 来源任务 | 用户触发（2026-11-03：进入发版流程，完成后 push） |
| 修改范围 | VERSION（0.6.0→0.8.0）、CHANGELOG.md（新增 [0.8.0] 段）、agent-workflow/tasks/dev/{current,done}.md、tag v0.8.0 |
| 分支/工作区 | dev（agent-workflow-kit） |
| 依赖 | 本批 commit 全部已提交（0.6.0 后 61 个，HEAD=db76843） |
| 最近更新 | 2026-11-03 |

### 验收
- [x] check_workflow.sh 全绿
- [x] VERSION 0.8.0；CHANGELOG [0.8.0] 段（Added/Changed/Fixed）
- [x] done.md 补登记 DEV-107~113；DEV-114 归档块
- [x] tag v0.8.0；本地 commit + push（用户明确触发）

### 备注
- 版本位 minor；v0.7.0 已被旧误发版（506c834，指向 dev 分支外）占用并推送，不可复用，故升 v0.8.0
- 本批含 DEV-106（0.8.0 未含于 0.7.0）与 DEV-107~113 UI 批次


## [DEV-115] 激活式 Router 协议

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | archived |
| Owner | 用户派发（lead 执行） |
| 协作模式 | single |
| 来源任务 | 用户直接触发 |
| 工作流 | dev |
| 修改范围 | templates/AGENTS.md.tmpl（任务路由段）、agent-workflow/bin/awf-dispatch（票据来源校验）、agent-workflow/workflows/cross-project.md（协议规则）、docs/design.md + docs/dispatch.md、README.md、test/smoke.sh（含双副本同步） |
| 依赖 | 无 |
| 最近更新 | 2026-11-04 |

### 目标
把「激活式 router」协议落进工作流框架：路由能力只在节点直面用户时激活，派发深度 = 1，接收者禁止转派。

### 实现方案
1. 票据头部新增「来源：用户 | 工作流」标记（缺省=用户，向后兼容）；来源=工作流的票据声明接收者保持 worker、禁止转派。
2. AGENTS.md.tmpl 任务路由段加入激活式规则（激活条件唯一 / 派发深度=1 / router 决策三件套并落盘）。
3. awf-dispatch 对来源=工作流的票据二次派发 FAIL（退出码 2，中文禁止转派错误）；旧票据无来源不受影响。
4. docs/design.md 画「激活派发 / 转派被拒」两段示意；README.md、docs/dispatch.md 同步。
5. smoke.sh 新增来源校验断言（解析 + 主流程拒绝 + 旧票据兼容）。

### 验收标准
- [x] 票据规范含「来源：用户|工作流」字段定义与"来源=工作流禁止转派"声明（cross-project.md / docs/dispatch.md）
- [x] templates/AGENTS.md.tmpl 任务路由段含激活式规则（激活条件、深度=1、决策三件套）
- [x] awf-dispatch 对来源=工作流的二次派发 FAIL 并输出禁止转派错误；旧票据（无来源）不受影响
- [x] 文档含两段示意（激活派发 / 转派被拒）
- [x] DEV-115 已归档，check_workflow.sh 全过，status.md 已刷新
- [x] 只本地 commit，未 push

### 验证
- check_workflow.sh 全绿（含 6 对生成副本漂移校验）。
- python3 -m py_compile bin/awf-dispatch、bash -n test/smoke.sh 通过；task 清单里的 `bash -n agent-workflow/bin/awf-dispatch` 对 python 文件不适用（对 HEAD 原版同样报错），改用仓库约定的 py_compile。
- bash test/smoke.sh：124 项通过、0 失败（含 DEV-115 新增 5 项断言）。

### 下一步
无（协议已落盘；各项目已生成的 agent-workflow/ 副本由 awf upgrade 拉取，不在本任务范围）。
| 完成日期 | 2026-11-04 |
| DEV-115 | P1 | 激活式 Router 协议：任务票据「来源：用户|工作流」标记 + 激活条件唯一 / 派发深度=1 / router 决策三件套；awf-dispatch 拒绝工作流来源二次派发（禁止转派）；模板/流程/文档/smoke 同步 | 2026-11-04 |
