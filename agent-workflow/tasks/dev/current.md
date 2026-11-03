# 正在开发

> 任务从 `todo.md` 移入此文件开始执行，完成后移入 `done.md`。
> 优先级只写 `P0` / `P1` / `P2` / `P3`。
> `awf status` 会解析本文件，任务块格式必须保持：`## [ID] 标题` + 字段表 + `### 下一步`。


## [DEV-042] 停止自动回填：不再自动派发子代理反复填写开发进度

| 字段 | 内容 |
|------|------|
| 优先级 | P2 |
| 状态 | active |
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
## [DEV-041] 工作流更新升级闭环：检测已有文件夹 → agent 整理合并 → 完成回调通知面板刷新

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | active |
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

<!-- 任务块格式示例（ID 用 XXX 占位，不会被解析）：

## [DEV-XXX] 任务标题

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | active |
| Owner | agent / human / unassigned |
| 协作模式 | single / parallel |
| 来源任务 | 无 / DEBUG-003 / 用户直接触发 |
| 修改范围 | 模块 / 目录 / 关键文件 |
| 分支/工作区 | 分支名 / worktree 标识 / N/A |
| 依赖 | 无 |
| 最近更新 | YYYY-MM-DD |

### 目标
一句话说明交付什么。

### 验收标准
- [ ] 校验命令通过
- [ ] 目标行为符合预期
- [ ] 没有已知回归

### 下一步
下一位 agent 可直接接手的最小动作。
-->
