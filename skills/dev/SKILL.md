---
name: dev
description: agent-workflow 功能开发流程（认领→方案→实现→验证→Review→归档）：任务认领、状态机流转、验证与收尾规范。
whenToUse: 用户要求开发/重构/优化功能、启动 DEV-xxx 任务、或需按 agent-workflow 状态机推进开发任务时——自动加载本技能。
---

# agent-workflow · 功能开发（技能）

> 由 agent-workflow-scaffold 主技能路由加载（AGENTS.md 开工顺序按任务类型强制加载本技能）。
> 项目内无 workflow 副本：本技能是实体目录（install.sh copy 安装），更新重跑 `./install.sh`。
> 路径约定：以下 `tasks/`、`memory/`、`tools/`、`project.yaml` 均为目标项目 `agent-workflow/` 下的相对路径。

## 适用场景

功能开发 / 重构 / 优化。需要时触发 debug 或 docs 子流程。

## 执行步骤

> 状态入口：`../tasks/dev/`
> 主规范：`../README.md`
> 校验命令：见 `../project.yaml`

---

## 目标

把需求推进到「已实现 + 已验证 + 已 review + 已归档」，需要时触发 debug 或 docs 子流程。

---

## Step 1：认领

1. 从 `../tasks/dev/todo/`（todo/README.md 检索）或用户指令确认任务，分配唯一 `DEV-xxx`
2. 认领：把 `todo/DEV-xxx.md` 移到 `current/DEV-xxx.md` 并把 `| 状态 |` 改为 `active`；文件至少包含：优先级、状态、Owner、协作模式、来源任务、修改范围、依赖、最近更新、目标、验收标准、下一步；目录索引 `README.md` 由 `awf status` 重生成，不要手改
3. 需求不清晰时先澄清，不进入实现

---

## Step 2：方案

- 单 agent、小范围改动：直接实现
- 跨模块或多人并行：先拆子任务，写清修改范围与共享写点
- 根因或依赖不明：先补分析，不要盲改
- 优先复用现有模块，做最小闭环变更，并写明风险与验证方式

详细设计写 `../docs/`，`current/DEV-xxx.md` 里只留 2-6 行摘要。

---

## Step 3：实现

- 优先改已有文件，避免无必要的新抽象
- 发现新问题先记到 `../memory/cache/`，避免主任务上下文丢失
- 发现阻塞依赖：状态改 `blocked`，写清阻塞点与解除条件
- 并行时严格遵守各自的修改范围

如果本质上是缺陷排查，创建 `debug` 子任务，不要把它写成 dev 的日志堆。

---

## Step 4：验证（强制）

按 `../project.yaml` 的 `compile` / `test` 执行：

```sh
# 示例：命令来自 project.yaml，不要照抄
# <compile>
# <test>
```

要求：

- 写完代码立即验证，不能等到 review 阶段
- 每个开发任务至少有一条可重复的验证方式（测试、编译、最小复现）
- 命令不可用时，在任务块写 `验证阻塞：<原因>`，状态改 `blocked`
- 通过后状态改 `review`

---

## Step 5：Review

所有 dev 任务归档前必须进入 `review` 子流程（见 `review.md`）。

- 不通过：留在当前 dev 任务修复，状态改回 `active` / `blocked`，修复后重新验证再复审
- **状态透明化**：每个状态转换（review 不通过 / 修复开始 / 修复完成待复审 / 复审通过或再次不通过 / 归档完成）**主动回报派发方**（当前状态 / 结果 / 下一步 / 预计），时机不晚于转换后一回合（细则见技能 `skills/cross-project-dispatch/SKILL.md`「必报点总表」）
- 不新建任务，除非审查意见已演变成独立需求
- 复核者不应与实现者是同一执行者；单人开发时至少换一次会话（或隔时）复核
- 复核必须**独立重跑** `project.yaml` 的验证命令，不能只读实现者的自述
- 回归范围：除原任务外，至少覆盖被改动模块的相关测试；无法覆盖时写明理由

---

## Step 6：归档

1. 归档：把 `current/DEV-xxx.md` 移到 `done/DEV-xxx.md`，状态字段改 `done` 并补 `| 完成日期 | YYYY-MM-DD |`（索引由 `awf status` 重生成；迁移旧形态大文件也由 `awf status` 自动拆（含块大文件 → 单任务文件，todo 表行 → 待办文件），旧 `done.md`/`todo.md`/`current.md` 会被移除）
2. 有**可复用结论**（根因/修法/决策/踩坑）→ 追加或新建 `../memory/history/<主题>_<YYYY-MM-DD>.md`（标准见 `../memory/README.md`）；有**新写的可复用脚本/命令** → 按 `../tools/README.md` 晋升三要素收录进 `tools/`
3. 清理对应 `../memory/cache/`
4. 运行 `./agent-workflow/check_workflow.sh` 通过
5. 运行 `~/.dsh/skills/agent-workflow-scaffold/bin/awf status` 刷新摘要
6. 提交一次本地 git commit（**禁止 push**）

---

## 必问用户

- 需求边界不清楚
- 存在两种以上等价但影响不同的实现方案
- 依赖用户提供环境、账号、设备或业务规则
- 修改影响公开行为但预期不明确

## 自检清单

- [ ] 按状态机推进，每步更新任务块「状态 / 最近更新 / 下一步」
- [ ] 验证命令实际执行（compile/test），命令不可用写明 `验证阻塞：<原因>` 并置 blocked
- [ ] 收尾：归档（补完成日期）→ 沉淀可复用结论到 memory/history、脚本按 tools 标准收录 → check_workflow.sh 通过 → awf status → 本地 commit（禁 push）

## 禁止事项

- 未验证的判断写「待确认」，不写结论
- 状态只写 active / blocked / review / verify / handoff；一个任务块只有一个 Owner
- 归档后必须跑通过校验；status.md 由 awf status 刷新才算完成
- 不自动 push、不改写历史

## 无技能环境兜底

本技能不可用时，按「执行步骤」的状态机自行推进，参照目标项目 `tools/` 手册与 `memory/history`。
