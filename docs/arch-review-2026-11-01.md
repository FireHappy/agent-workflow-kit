# agent-workflow-kit 架构审查报告

- 日期：2026-11-01
- 方式：官方智能体团队（arch-review-v2）两名 reviewer 并行分域只读审查
  - t1 reviewer-design：架构与治理域（单一事实源 / digest / 分层中立 / 两级复核 / 账本 / 职责边界）
  - t2 reviewer-runtime：运行时与派发链路域（awf-dispatch 全路径 / 会话复用 / 等落地 / 退出码 / 扩展性 / 官方插件对齐 / smoke 缺口）
- 佐证：`bash test/smoke.sh` 89/89 实测通过；`./agent-workflow/check_workflow.sh` 全绿（digest f68a3383）；t2 两项定向 probe 实证
- 总 verdict：**机制层扎实，9×P1（无 P0）+ 11×P2 + 10 条 smoke 缺口；修完 P1 可转 pass**

---

## 一、P1 findings（9 项，须修）

### 架构与治理域（t1，6 项）

| # | 位置 | 问题 | 最小修法 |
|---|---|---|---|
| F1 | `bin/awf:579-617` | `check` 的 `check_current_file` 只查 状态/Owner/下一步 字段存在与 ID 格式，**不校验状态枚举** ∈ {active,blocked,review,verify,handoff}（铁律 AGENTS.md:22 无机械兜底） | awk 对状态值做枚举匹配 |
| F2 | `bin/awf:619-644` | `check` 只查 status.md 存在，**不校验新鲜度**（铁律「status.md 必须由 awf status 刷新」无强制） | check 临时渲染 status 与现有文件 diff |
| F3 | `bin/awf:667-678` | `check` 只扫 current.md，**done.md 归档块无机械校验**（铁律「归档后必须跑校验」半落空） | done.md 跑同样块解析并加入 required |
| F4 | `docs/team-flow.md:191-192,200-202 vs 216` | §4.2/§5「等用户确认、不自己批准」与 §6「approval=automatic 跳过审批」**同文件直接矛盾** | §4.2/§5 同步为 automatic 语义 |
| F5 | `templates/workflows/cross-project.md:20,22,76,79,94,110-112,140-144` + `CHANGELOG.md:46` | 应 harness 中立的模板仍含 DSH 专属机制（GUI/workspace.json/session 错误码/Ungrouped/headless 语义），而 CHANGELOG 声称 0.4.0 已中立化——**名不副实** | 模板收敛为抽象步骤，DSH 细节降级指向 docs/dispatch.md 与 skill 层 |
| F6 | `bin/awf:174-179,462-478,657` + `docs/release.md:96` | 根 `bin/`、`templates/` 与 `agent-workflow/{bin,templates,workflows}/` **双副本漂移无检测**；`release-prep` 的 `init . --force` 会用 root 副本无条件覆盖 agent-workflow 侧改动（无 --keep-docs）→ 本地改过 agent-workflow 侧工作流会在发版时被静默回滚且 check 全绿 | kit check 增加三对副本 diff 作 FAIL；release-prep 先 diff 或 --keep-docs 再覆盖；DEV-001（todo.md 已登记）升级为 P1 |

### 运行时域（t2，3 项）

| # | 位置 | 问题 | 最小修法 |
|---|---|---|---|
| RT-1 | `bin/awf-dispatch:511-516,560-572` | **旧格式迁移误吞用户普通会话**：任何标题以 `<项目> · ` 开头的非 `[awf]` 空闲会话（如用户自建「agent-demo02 · 用户的分析记录」）会被当旧格式复用 + 改名 + 注入任务（已实证） | 迁移判定要求会话消息含派发任务包标记，或改显式 `--allow-legacy-reuse` |
| RT-2 | `bin/awf-dispatch:1627-1649` | **headless --wait 退出码违约**：非零退出返回 3（文档语义=超时/未落地），「执行失败」被误导向「重试」；成功路径也无落地校验（无初始 HEAD/done 检查），与会话模式契约不一致 | 启动前记初始 HEAD，退出 0 后也走 wait_for_landing；非零退出独立状态并改文档表 |
| RT-3 | `bin/awf-dispatch:1192-1193 + 744-765` | **落地判定误判窗口**：初始 HEAD 在 idle-wait（最长 300s）前采集，期间无关会话/用户 commit 会被判为本任务落地，且不校验 commit 是否含任务 ID | HEAD 变化后补「最新 commit 含任务 ID 或 done.md 宽限期内出现」校验；HEAD 采集移到 prompt 发送前一刻 |

---

## 二、P2 findings（11 项，排期修）

| # | 域 | 位置 | 问题 |
|---|---|---|---|
| F7 | 治理 | `bin/awf:14,174-179,658`；AGENTS.md v1 标记 | digest 不含 AWF_VERSION / bin 生成逻辑，版本升级不被校验 |
| F8 | 治理 | — | todo → current → done 迁移一致性无校验 |
| F9 | 治理 | `docs/team-flow.md` §2 vs §3.5 | 轨道 B（强制 review-test）与快速车道（0 轮 reviewer）「默认」二义 |
| F10 | 治理 | — | captain/dispatcher 跨项目写入仅靠文档约束（G3 只防并行写者）——治理观察项 |
| P2-4 | 运行时 | `bin/awf-dispatch:611` | 等待轮询每 3s 全量 session/list（2.5MB × ~200 次 / 600s --wait） |
| P2-5 | 运行时 | `bin/awf-dispatch:1263` | 复用路径优先用 preflight 快照判 running，跳过空闲等待（竞态） |
| P2-6 | 运行时 | `bin/awf-dispatch:133-140` | 别名模糊命中多条无歧义报错，静默取首条（实证「demo」→ demo01） |
| P2-7 | 运行时 | `bin/awf-dispatch:552` | `blank` 字段缺失即永不复用，应按 False 处理 |
| P2-8 | 运行时 | `bin/awf-dispatch:629` | wait_for_turn updatedAt 毫秒假设无单位防御，单位漂移时僵尸检测退化为 rc3 |
| P2-9 | 运行时 | `docs/team-flow.md:163` | 快速车道门禁命令错误：`py_compile bin/awf`（bash 脚本）必失败（已实证 SyntaxError）；应为 `bash -n bin/awf && python3 -m py_compile bin/awf-dispatch` |
| P2-10 | 运行时 | `bin/awf-dispatch:56,1159-1162` | DEFAULT_WEB_URL 硬编码 51439 vs 实际 GUI 49800；G4 失败提示误附「加工作区」建议 |
| P2-11 | 运行时 | `bin/awf-dispatch:1143,262-273` | G3 check-then-act 非原子（建议发送前复核或文档化竞态）；check_active 把 blocked/review 也当 active |

---

## 三、smoke 覆盖缺口（10 条具体用例）

1. 用户普通会话 `<项目> · ` 前缀不迁移（RT-1 回归）
2. `resolve_target` 歧义 / registry 坏行
3. DshApi.rpc HTTPError 401/404 → rc2 映射（mock urllib）
4. preflight G3：脏改动默认失败 + `--allow-dirty` 通过；active 默认失败 + `--allow-active` 通过（现只测 G1）
5. G2 workspace 缺失（fixture workspace.json）
6. headless `--wait` 非零退出（RT-2 回归）与 TimeOutExpired → rc3
7. wait_for_turn updatedAt 非毫秒/缺失、page 超 300 条截断时 turn_ended
8. `--prune` 仅 HEAD 有 done.md（git show 路径）、目标非 git → unknown
9. wait_for_landing task_id 空串跳过 done（防空 regex 全命中）
10. Ctrl-C rc130、`--json` stderr/stdout 分流

---

## 四、亮点（保留）

- digest 内容级精确 + write_agents 区块守卫 + bootstrap 失败不改写（无破坏路径）
- `git_head_sha` 三态（失败 None / 空仓库 "" / sha）+「读取失败不当 HEAD 变化」边界扎实
- turn_activity 按事件时间戳/turn 号过滤历史，防历史输出掩盖僵尸判定（smoke history_activity 覆盖）
- 失败模式分型清晰：会话消失(SESSION_GONE) ≠ 空闲超时 ≠ 僵尸 ≠ 未落地 ≠ 超时，恢复建议各自明确
- session/list 单次拉取合并 G4 探针 + 复用（smoke 断言 calls==1）
- 会话模式退出码 0/2/3/4 自洽（「0≠成功」贯穿文档）；`--prune` 双证据判定 + 冲突不覆盖 + git mv/os.rename 分流
- smoke 89/89 全 mock（僵尸/落地/复用/--prune 逻辑单测，无真实会话依赖）；单写者纪律三处重复强化
- G3 硬门比官方插件「只警告」更严（双刃但方向正确）

---

## 五、建议执行顺序

1. **P1-立即**：RT-1（误吞用户会话）、RT-2（headless 退出码）、RT-3（落地误判）——三类真实误判路径
2. **P1-近期**：F4（文档矛盾）、F5（模板中立）、F1/F2/F3（check 机械兜底）、F6（副本漂移 + release-prep 回滚保护）
3. **P2 + smoke 缺口**：随常规开发批次消化（含 DEV-001 升级）
---

## 六、P1 修复状态（2026-11-01 已闭环）

| 批次 | commit | 复核 | 证据 |
|---|---|---|---|
| F1-F6（check 兜底×3 / approval 统一 / 模板中立 / 副本漂移+release-prep 保护） | `fb0e45f` | t5 r1 pass + t7 r2 终审 pass | 对抗实测（故意坏账本三连拦截、漂移注入 FAIL、release-prep 拒绝覆盖零写入）；F5 DSH 词 0 命中 |
| RT-1/2/3（误吞会话 / headless 退出码 5 / 落地误判窗口） | `9eb3296` | t6 r1 pass | 12 项定向 probe（mock API + 真实 git 仓库），RT-1 三态 / RT-2 四态 / RT-3 ID 边界 DEV-007≠DEV-0071 |
| 账本收尾（DEV-001 归档、status 刷新） | `0666aa7` | check 全绿 | F2 新鲜度拦截曾真实触发（归档后未刷新即 FAIL） |

**升级量**：smoke 89 → **113**（+24 项）；check 27 → 28 项；退出码新增 **5**（headless 执行失败）；awf-dispatch 新增 `--allow-legacy-reuse`。

## 七、后续清单（P2 批次，未修，按优先级）

1. **RT-3 残余漏判（medium）**：任务 commit 落地后 10s 内被无关 commit 压顶 → wait_for_landing 误判 not landed；改 `git log initial..HEAD` 区间归因（任一含任务 ID 即落地）
2. **SKILL.md:68 未同步（medium）**：仍写旧语义「唯一旧格式空闲会话自动迁移」，参数表缺 `--allow-legacy-reuse`、无退出码 5；技能是分发产物，需与 docs/dispatch.md 同步
3. **_legacy_candidates 死代码（low）**：`bin/awf-dispatch:535-560` 无调用点，且 blank 过滤与 docstring 相反——删除或接线修正
4. **headless task_id 回退（low）**：`:1693` 仅取文件名，会话模式有 text 回退——对齐
5. **模板措辞统一（low）**：`templates/workflows/cross-project.md` GUI×2（:92,:146）+ sessionId×1（:158）→「图形界面/会话 ID」；smoke F5 门禁正则补 gui/sessionId
6. **下游存量项目旧格式 done.md** 跑新 check 会报格式错（无 P0-P3/日期列）——预期强制收严，CHANGELOG 已注明；升级存量项目时注意
