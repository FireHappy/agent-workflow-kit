# 已完成

| 任务ID | 优先级 | 描述 | 完成日期 |
|--------|--------|------|----------|
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
