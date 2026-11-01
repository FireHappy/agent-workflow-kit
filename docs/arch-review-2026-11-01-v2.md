# agent-workflow-kit 架构审查报告（v2）

- 日期：2026-11-01
- 范围：当前工作区的 `bin/awf`、`bin/awf-dispatch`、`dsh-plugin`、模板、账本门禁与回归脚本
- 前置基线：`docs/arch-review-2026-11-01.md` 中记录的 F1-F6、RT-1/2/3 已按提交记录完成；本报告只记录当前仍可复现的问题和结构性结论。
- 当前工作区含用户/团队未提交的 DEV-024 UI 改动；本审查未修改这些文件。

## 结论

框架核心脚本和账本规则已经可用，但插件承担的职责过多：它同时实现看板、初始化、任务迁移、todo CRUD、任务编辑、删除回退和源文件读取。插件因此复制了一套账本写入语义，却没有 CLI 具备的统一锁、原子落盘和完整回归门禁。继续在插件上追加功能会持续扩大不一致面。

建议把插件收敛为**只读看板 + 只读详情**，把初始化、认领、编辑、归档、删除回退统一交给 `awf` CLI 或目标工作区会话。若产品必须保留 GUI 写入，应先做一个服务端单写者事务层，再恢复写接口；不应继续在每个路由里直接读改写 markdown。

## P1：需要先处理

### P1-1 回归脚本在 UTF-8 环境直接失败

- 位置：`bin/awf:1295`、`test/registry-concurrency.sh:23,44,73,110,137`
- 证据：直接运行 `bash test/upgrade.sh` 报 `bin/awf: line 1295: dst（源: unbound variable`；运行 `bash test/registry-concurrency.sh` 报 `line 44: N，锁路径: unbound variable`。设置 `LC_ALL=C` 后两套测试通过。
- 原因：`set -u` 下 `$dst（`、`$N，` 等未加大括号的变量引用会把后面的中文字符解析进变量名。
- 影响：README、release 流程和项目编译命令声称可运行的升级/并发回归在默认中文 macOS 环境不可用；当前 CI 只跑 smoke，未覆盖这两套脚本。
- 建议：所有 shell 插值统一使用 `${name}`，至少修复根入口与生成副本，并把 `test/upgrade.sh`、`test/registry-concurrency.sh` 纳入 CI 和 `project.yaml` 的 `test` 门禁。

### P1-2 看板验收进度的前后端契约断链

- 位置：`dsh-plugin/src/ledger.js:223-225`、`dsh-plugin/lib/client.js:942-963`
- 证据：服务端返回 `{ done, total, items }` 对象；客户端 `TaskCheckProgress` 按数组读取 `items.length`。现有单测只覆盖客户端数组形态，未覆盖服务端真实返回形态。结果是实际看板有验收勾选时不会显示进度。
- 建议：短期让客户端兼容两种输入并补真实响应测试；长期将账本响应定义成一个共享 schema，避免 shell、Node 和前端各自推断字段。

### P1-3 插件写接口没有事务或单写者保护

- 位置：`dsh-plugin/src/ledger.js:562-563`（startTask 两文件顺序写入）、`:711-712`（todo CRUD）、`:1060-1063`（任务编辑）、`:971-985`（删除/归档）。
- 风险：并发点击、自动刷新、agent 会话写账本或进程中断，都可能造成 current/todo 不一致、半写文件或互相覆盖。工作流文档里的“单写者”是协作约束，不能保护插件与 agent 的实际文件操作。
- 建议：优先删除插件写接口；若必须保留，所有写操作集中到一个服务端模块，用项目级锁、临时文件 + rename，并对双文件迁移做可恢复事务。

### P1-4 模糊项目名会静默派发到错误仓库

- 位置：`bin/awf-dispatch:121-144`
- 证据：`resolve_target("demo")` 在含 `demo01`、`demo02` 的索引时直接返回第一行 `/Users/chenlin/Documents/GitHub/agent-demo01`，没有歧义错误。
- 影响：跨项目派发属于写操作，静默选错目标的代价高于一次失败。
- 建议：多个 exact/loose 候选统一退出并列出候选；只有完整 ID、完整别名或显式目录才允许继续。

## P2：应随收敛批次处理

### P2-1 删除回退对已删除/重命名文件不完整

- 位置：`dsh-plugin/src/ledger.js:886-895,960-967`
- 证据：`gitChangedFiles` 先用 `stat(abs)` 过滤路径，已删除的 tracked 文件因此永远不会进入清单；重命名状态返回 `old -> new` 字符串，随后作为单个 path 传给 `git restore` 也无法可靠恢复。
- 建议：优先移除 GUI 删除回退；保留时改用 git porcelain 的路径字段并单独处理 deleted/renamed，补实仓库 fixture 测试。

### P2-2 G3 会把 blocked/review/verify/handoff 也当作 active

- 位置：`bin/awf-dispatch:266-277`
- 证据：`check_active` 只要在 `current.md` 找到 `## [ID]` 就拒绝派发，不读取状态字段；一个 `blocked` 任务也会报“已有 active 任务”。
- 建议：只把 `状态=active` 视为写者，或明确把所有 current 块都定义为占用并同步文档；当前文档语义是前者。

### P2-3 只读路由没有项目白名单

- 位置：`dsh-plugin/lib/index.js:155-179,269-302,304-413`
- 证据：`/awf/ledger`、`/awf/archive`、`/awf/todo`、`/awf/source` 只检查路径绝对且含 `project.yaml`，没有复用 `isAllowedPath`；知道本机路径的已认证 DSH 请求可以读取未登记项目的账本。
- 建议：只读路由也限制到全局索引或当前工作区根；若产品确实需要任意项目预览，应把这个边界写成显式能力并补测试。

### P2-4 DSH 默认端口仍是环境耦合常量

- 位置：`bin/awf-dispatch:58,375,1910`
- 证据：当前代码默认 `51439`；既有审查记录的实机环境为 `49800`。代码只允许环境变量覆盖，默认值与宿主版本不一致时所有会话派发都误报 G4。
- 建议：由宿主提供端口发现或把默认值移到可配置 project/harness 设置；至少在启动探针失败时不要附带与实际原因无关的“添加工作区”建议。

### P2-5 账本解析器存在三套实现，契约没有单一来源

- 位置：`bin/awf` 的 awk 解析、`dsh-plugin/src/ledger.js` 的 Node 解析、`dsh-plugin/lib/client.js` 的前端推断。
- 证据：`checkItems` 已出现服务端对象、客户端数组不一致；状态、归档、todo 表格也分别有独立正则。
- 建议：把 markdown 读写和字段 schema 收敛到 CLI/服务端一个实现，插件只消费稳定 JSON；在过渡期用 fixture 对三层输出做契约测试。

## 建议目标形态

1. `awf` 是唯一账本写者：负责 init、todo/current/done 迁移、状态刷新、check、归档和删除回退。
2. `awf-dispatch` 只负责跨项目门禁、会话投递和结果等待，不直接编辑目标项目账本。
3. DSH 插件保留 `/awf/projects`、`/awf/ledger`、`/awf/archive`、`/awf/source` 四个只读接口；初始化、开始任务、编辑、删除按钮改为复制可执行命令或打开目标工作区会话。
4. 账本响应先固定 JSON schema，再做 UI 优化；UI 任务不再承担数据迁移和文件一致性。
5. CI 至少运行 `check_workflow.sh`、`test/smoke.sh`、`test/upgrade.sh`、`test/registry-concurrency.sh`、Node 单测和 `git diff --check`。

## 已执行验证

- `./agent-workflow/check_workflow.sh`：通过；登记 DOCS-007 后曾因 `status.md` 未刷新失败，运行 `./agent-workflow/bin/awf status` 后恢复通过。
- `node --test dsh-plugin/test/ledger.test.js dsh-plugin/test/client-chunk.test.js`：58/58 通过。
- `bash test/smoke.sh`：通过。
- `bash test/upgrade.sh`：默认 UTF-8 环境失败（P1-1）；`LC_ALL=C bash test/upgrade.sh` 通过。
- `bash test/registry-concurrency.sh 4`：默认 UTF-8 环境失败（P1-1）；`LC_ALL=C bash test/registry-concurrency.sh 4` 通过。
- 定向 probe：确认模糊项目名静默命中首项、blocked 任务被 G3 当成 active、已删除 tracked 文件在回退预检中被误报为 clean。
