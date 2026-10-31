# Agent Workflow 工作流规范

> AI agent 与人类协作者共用。目标：任务可恢复、可审计、可并行，且不绑定某个 harness。

---

## 核心原则

1. **单一事实来源**：持久化状态只写 `tasks/`；`tasks/status.md` 是摘要，由 `awf status` 生成。
2. **任务先于流程**：先识别任务，再选择唯一一个匹配的工作流文件。
3. **状态可恢复**：中断后，读 `tasks/status.md` 和对应 `current.md` 即可接手。
4. **并行显式协调**：必须有 Owner、修改范围、下一步；共享写点不允许并行。
5. **验证优先于结论**：未验证的判断写“待确认”。
6. **流程不绑工具**：构建/测试命令来自 `project.yaml`，不写死技术栈。

---

## 目录职责

| 目录 | 用途 | 是否生成 |
|------|------|----------|
| `workflows/` | 如何执行某类任务 | 手工维护 |
| `tasks/` | 持久化任务状态（唯一事实来源） | 部分生成 |
| `memory/cache/` | 临时证据与中间结论 | 手工 |
| `memory/history/` | 长期归档 | 手工 |
| `docs/` | 架构与设计文档（按需创建） | 手工 |
| `tools/` | 操作手册（构建、测试、调试） | 手工 |
| `project.yaml` | 项目事实（唯一输入） | 手工 |
| `bin/awf` | 生成与校验工具 | 工具 |
| `../AGENTS.md` | 仓库根入口 | `awf bootstrap` 生成 |

---

## 启动流程

每次对话开始：

1. 读 `tasks/status.md`
2. 判断任务类型，只加载一个流程：
   - 功能开发 → `workflows/dev.md`
   - 问题排查 → `workflows/debug.md`
   - 文档撰写 → `workflows/docs.md`
   - 开发完成待审 → `workflows/review.md`
   - 跨项目派发 → `workflows/cross-project.md`
3. 有进行中任务则读对应 `tasks/<type>/current.md`
4. 判断下一动作：恢复自己的任务 → 认领无 Owner 的高优先级任务 → 提议开始最优先待办

**不要**在启动时同时加载所有流程文件。

---

## 任务模型

工作流类型：`dev`（功能/重构/优化）、`debug`（异常排查）、`docs`（文档/分析）、`review`（dev 的审查子流程）。`cross-project` 是路由流程，不新增任务类型；任务仍落在目标项目的 `dev` / `debug` / `docs`。

状态：`active`（执行中）、`blocked`（阻塞）、`review`（待审）、`verify`（待构建/测试/人工验证）、`handoff`（等待接手）。

任务 ID：`DEV-001`、`DEBUG-001`、`DOCS-001`、`REVIEW-001`，创建后不复用。

优先级只写 `P0` / `P1` / `P2` / `P3`，排序 `P0 > P1 > P2 > P3`；同优先级 `debug > dev > docs`。用户指令高于默认排序。

---

## 任务块模板

写入 `tasks/<type>/current.md`，一个文件可以有多个任务块：

```markdown
## [DEV-001] 任务标题

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | active |
| Owner | agent-name / human / unassigned |
| 协作模式 | single / parallel |
| 来源任务 | 无 / DEBUG-003 / 用户直接触发 |
| 修改范围 | 模块 / 目录 / 关键文件 |
| 分支/工作区 | 分支名 / worktree 标识 / N/A |
| 依赖 | 无 |
| 最近更新 | YYYY-MM-DD |

### 目标
一句话说明交付什么。

### 实现方案 / 排查方案
2-6 行核心思路，详细设计放 `docs/`。

### 验收标准
- [ ] 校验命令通过
- [ ] 目标行为符合预期
- [ ] 没有已知回归

### 假设（debug 必填）
- 假设：...
- 证伪方法：...

### 下一步
下一位 agent 可直接接手的最小动作。
```

`awf check` 会校验每个任务块是否包含 `状态`、`Owner`、`### 下一步`。

---

## 状态流转

唯一主路径：`todo.md -> current.md -> done.md`。

规则：

1. 禁止跳过 `current.md`
2. 一个任务块只能有一个 Owner
3. 并行时可以有多个任务块，但同一任务块不能多人修改
4. 子流程必须保留来源任务
5. 任务完成时由 `awf status` 刷新 `tasks/status.md`
6. 归档前必须通过 `./check_workflow.sh`

---

## 并行协作

适合并行：可按目录/模块清晰拆分；一部分实现、一部分验证或文档；主任务需要长时间等待。

不要并行：频繁改同一文件或同一函数；根因仍不明；验收依赖大量共享上下文。

规则：

1. 先拆任务，再并行，每个子任务有独立修改范围
2. 每个子任务写 Owner 和下一步，没有 Owner 视为未开始
3. `project.yaml` 的 `serialized` 列出的文件只能由主线修改
4. 账本（`current.md` / `status.md`）只由主线写，子任务返回结构化结果
5. 子任务先 `verify/review`，再由主任务 Owner 合流归档
6. 实现与复核尽量由不同会话/角色承担；复核必须独立重跑验证命令，不接受只读自述

> 当前 harness 支持多角色协作（如 DSH 的 AgentTeams）时，任务**默认优先派发给团队**，三轨流程见 kit 的 `docs/team-flow.md`；不支持时退回单会话，本模板不绑定具体 harness。

---

## 跨项目派发

当任务目标在另一个仓库时，先过四道前置门：

1. 目标有完整 `agent-workflow/` 与 `AGENTS.md`
2. 目标已登记为当前 harness 的工作区（DSH：GUI 工作区列表）
3. 目标没有未提交改动 / 其他 active 任务
4. 目标工作区可创建会话

全过时优先在**目标工作区的会话**中执行，不要默认 headless；详细流程见 `workflows/cross-project.md`。DSH 可用 `./agent-workflow/bin/awf-dispatch <别名|目录> <任务文件>` 自动检查并创建会话。

---

## 生成与校验

```sh
./agent-workflow/bin/awf status       # 从 tasks/ 生成 status.md
./agent-workflow/bin/awf check        # 校验框架、入口新鲜度、任务字段
./agent-workflow/bin/awf bootstrap    # 按 project.yaml 重建 AGENTS.md 区块
./agent-workflow/check_workflow.sh    # 等价于 awf check
```

`awf check` 退出码等于失败项数量，可直接用于 pre-commit 或 CI。

---

## 缓存与归档

- `memory/cache/`：日志片段、假设与证伪结果、待确认问题。超过 7 天清理或转存。
- `memory/history/`：完整修复过程、技术决策、可复用结论。
- 命名：`<主题>_<YYYY-MM-DD>.md`；长期任务在文件内写 `<!-- long-term: true -->`。

`done.md` 归档链接格式：

```markdown
[查看归档](../../memory/history/<文件名>.md)
```

---

## 安全边界

1. 归档后提交一次本地 commit，**不自动 push 或合并**
2. 发现严重回归先记录影响范围并停下，与用户确认回滚或修复策略
3. 未知字段、协议、外部依赖必须查证，查不到就标记阻塞并询问
4. 验证命令不可用时必须显式记录（环境缺失、设备不可用、权限不足）

---

## 新项目接入

```sh
/path/to/awf-kit/bin/awf init <项目目录> --name "项目名" --purpose "一句话定位"
```

然后编辑 `agent-workflow/project.yaml`（校验命令、并行切分、共享写点），再运行 `awf bootstrap`。
