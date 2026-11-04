# Review：awf-dispatch 审查修复（S1/S2/M1/M2）

- **审查日期**：2026-11-04
- **reviewer**：reviewer（独立会话）
- **审查对象**（工作树状态，分支 `dev`，未提交）：
  - `agent-workflow/bin/awf-dispatch`（+67 行）与 `bin/awf-dispatch`（+67 行，双副本）
  - `test/smoke.sh`（新增 S1/S2/M1/M2 断言 + 最小票据补齐）
  - `docs/dispatch.md`（blocked 回报条款，+1 行）
  - 关联产物（不在审查改动范围，作为上下文）：`agent-workflow/tasks/dev/current/DEV-144.md`（任务块）、`tasks/dev/current/README.md`、`tasks/status.md`（账本登记）
- **结论**：**通过**（剩余非阻塞风险 2 项见文末）

## 逐项审查记录

### S1（严重，check_active 目录式失效）—— 通过

- 检查内容：`check_active` 双 glob 扫描 `tasks/<type>/current/<ID>.md` 目录式任务单文件 + 旧 `tasks/<type>/current.md` 大文件；`current/README.md` 检索索引按文件名跳过；`--allow-active` 语义不变（返回「N 个 active 任务（已允许）」）。
- 结论：逻辑正确。独立边界验证：目录式 + 旧大文件混合布局均检出；无 `## [ID]` 标题的噪音文件（如 `备注.md`、单井号标题、README 索引）不误报；清理后返回「无 active 任务」。
- 真实账本端到端：对本仓库 dry-run，G3 正确报出 `DEV-144`（目录式账本，修复前旧 glob 必然漏检）；`--allow-active` 时报「1 个 active 任务（已允许）」。
- 残余风险（非阻塞）：① 目录式判定依赖 `## [ID]` 标题而非文件内状态字段，current/ 下无该标题的任务文件会漏检（漏检而非误报）；② 同一类型同时存在 `current.md` 与 `current/` 的过渡仓会重复列出同任务（仅展示层）；③ 非 UTF-8 任务文件 `read_text` 抛 UnicodeDecodeError 走退出码 1，属既有行为（旧分支同样），非本次引入。

### S2（严重，blocked 不回报 → 双向等待死锁）—— 通过

- 检查内容：`build_prompt` 注入的补充约定新增「blocked 或需派发方/用户动作时**必须回报派发方**——写明阻塞点/原因/解除条件并保持会话等待，不得静默停等（引用 DEV-143 实证）」；`docs/dispatch.md` 新增独立条款「blocked 也必须回报（DISPATCH-138 补充）」，并写明派发方收到后的处置（更新 dispatch/log.md 与账本状态）。
- 结论：两处条款齐备且语义一致；原提示语（任务包头尾、禁 push、回报格式等）未被破坏或删改；smoke 断言 `blocked`/`必须回报派发方`/`解除条件`/`静默停等` 均在提示语中。

### M1（中等，read_task 票据零校验）—— 通过

- 检查内容：`read_task` 新增四必备字段（目标项目/任务编号/来源/路由裁决）正则校验：`^\s*(?:[-*]\s*)?<key>\s*(?:[（(].*?[）)])?\s*[：:]\s*\S`。缺失即 raise DispatchError（退出码 2 契约不变），错误信息按「字段（字段行格式）」逐项明示缺项，不缺的字段不误报。
- 结论：正则兼容性验证通过——全角/半角冒号、`路由裁决（a → b）：…` 与接口文档式 `路由裁决：目标=… / 通道=… / 理由=…` 两种格式、括号可有可无、行首缩进/`*` 列表符号、空行前置、值含中文括号（`目标项目：演示项目（/演示路径/演示）`）均不误伤；缺一项只报那一项（partial 用例验证「路由裁决」缺报且不误报「目标项目」）。
- 生效范围：`main` 在所有模式（dry-run/handoff/headless/session）之前调用 read_task，即全模式统一收口；CLI 实测坏票据 exit=2 且四缺项明示、好票据正常过 M1 进入 G1 门。
- 残余风险（非阻塞）：① 校验为按行启发式——正文里出现「目标项目：…」这类行也会满足该字段（不分头部/正文），定位为「防显然坏票据」守卫而非合规证明，可接受；② **文档同步缺口**：`docs/dispatch.md`「生成」规则（§票据归档，约 :341）仍只写「正文必须有 `- 目标项目：<别名>（<绝对路径>）` 一行」，未同步 4 字段要求——照该文档生成的票据会被 M1 拒发，建议后续补一句 4 字段要求（本次任务范围外，未改）。

### M2（中等，--session 归属不校验）—— 通过

- 检查内容：`dispatch_session` 的 `--session` 分支在 cwd 校验后新增归属判定：标题以 `[awf]` 开头且派发者段存在 → 与本此派发者（`--sender` > 票据「派发者：」> 调度方项目名，与建会话同名逻辑同源）不同即 DispatchError（提示串台/--new/先在该会话续跑原任务）；`[awf]` 无派发者段（旧格式）→ 风险提示放行；非 `[awf]`/无标题 → 风险提示放行。均经 `emit`（json 模式走 stderr，不污染 stdout JSON）。
- 结论：判定与测试断言完全一致——其他派发者拒发且 `prompts` 为空（未发送）、本派发者放行并发送到指定会话（日志含「复用（--session 指定）」）、普通会话放行且有「风险提示」。独立变体验证 6/6：本/他派发者、旧格式、非 [awf]、无标题、纯前缀。
- 边界说明：精确匹配派发者名，`--sender` 显式覆盖场景下与原名不一致会被拒（错误信息已给出解除路径），属按契约的严格行为。

## 接口 / 退出码契约

- EXIT_OK=0 / 2 / 3 / 4 / 5 未变；新增 DispatchError（M1 缺字段、M2 串台）均收敛到退出码 2；`--session` 互斥与 argparse 校验未受影响（smoke 既有断言仍绿）。

## 验证命令与真实输出摘要

| 命令 | 结果 |
|------|------|
| `bash -n test/smoke.sh` | 通过（无语法错误） |
| `bash test/smoke.sh`（默认 locale） | **通过 195 项，失败 0 项**（exit 0，无 Traceback） |
| `LC_ALL=C bash test/smoke.sh` | **通过 195 项，失败 0 项**（exit 0，无 Traceback） |
| `python3 -m py_compile agent-workflow/bin/awf-dispatch bin/awf-dispatch` | 通过 |
| `diff -q agent-workflow/bin/awf-dispatch bin/awf-dispatch` | 无输出（双副本一致） |
| `./agent-workflow/check_workflow.sh` | 「全部检查通过」（exit 0），含「bin/awf-dispatch 与 agent-workflow/bin/awf-dispatch 副本一致」 |

补充（独立重跑，非实现者自述）：
- 独立边界验证 12/12 ok：M1 正则 5 种格式变体 + 缺项不误报；S1 混合布局/不误报/--allow-active；S2 条款注入与原提示语保留；M2 6 变体判定。
- CLI 端到端：坏票据 exit=2 且四缺项明示；好票据过 M1 到 G1 门；对本仓库 dry-run 真实检出 `DEV-144`（目录式账本 S1 修复实证）；`--allow-active` 放行语义与文案正确。
- 双 locale 输出均含「通过 195 项，失败 0 项」；S1/S2/M1/M2 新断言位于 smoke 的 python 断言块内（bash 标签「会话复用：选择不看压力 / [awf] 优先 / running 等待 / --session 互斥」），双 locale 该块均 ok。

## 最终结论

**通过**。四项修复（S1 目录式 active 检出、S2 blocked 回报条款双处落点、M1 票据四字段校验、M2 --session 归属校验）实现正确、测试覆盖到位、双副本一致、退出码契约未变，全部验证命令独立重跑通过（双 locale 195/0、check_workflow 全绿、无漂移）。

剩余风险（非阻塞，建议后续跟进）：
1. `docs/dispatch.md` 票据「生成」规则未同步 M1 的 4 必需字段（文档过时，会误导用户造出被拒票据）。→ **已于 2026-11-04 按本建议补上**（§票据生命周期「生成」行补 4 字段要求；doc-only，不影响本次审查结论）。
2. M1 为按行启发式守卫（正文含字段行即满足）、S1 基于 `## [ID]` 标题判定——均为「防明显坏/漏」而非完全合规证明，边界行为可接受。