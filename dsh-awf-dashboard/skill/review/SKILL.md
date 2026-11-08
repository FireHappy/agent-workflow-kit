---
name: review
description: agent-workflow 复核流程（复核→通过/需修改→修复→复审→归档）：独立复核、verdict 判定、findings 追踪与复审闭环。
whenToUse: 开发任务完成待审、需对实现独立复核、或需 review 门禁判定（pass/needs_revision/reject）时——自动加载本技能。
---

# agent-workflow · 复核（技能）

> 由 agent-workflow-scaffold 主技能路由加载（AGENTS.md 开工顺序按任务类型强制加载本技能）。
> 项目内无 workflow 副本：本技能是实体目录（install.sh copy 安装），更新重跑 `./install.sh`。
> 路径约定：以下 `tasks/`、`memory/`、`tools/`、`project.yaml` 均为目标项目 `agent-workflow/` 下的相对路径。

## 适用场景

开发完成待审（dev 子流程，随 dev 一起加载）。复核必须独立重跑验证命令。

## 执行步骤

> review 是 `dev` 的子流程，不单独作为主流程使用。
> 主规范：`../README.md`

---

## 目标

在开发任务归档和提交前，系统性检查正确性、回归风险与设计边界，而不是只做样式浏览。

---

## 触发条件

- 任意 `dev` 任务在归档前
- 任意 `debug` 修复在归档前（改动涉及共享代码时）
- 用户明确要求审查开发任务

---

## Step 1：确认范围

先明确：

- 来源任务 ID
- 改动文件集合（`git diff --stat` / `git status`）
- 预期行为或修复目标
- 未完成的验证项

信息不全时，先回源任务补齐，再开始 review。

---

## Step 2：逐项审查

优先级从高到低：

1. 正确性：逻辑、边界、空值、异常路径
2. 回归风险：调用方是否同步更新、兼容性是否明确
3. 错误处理与资源释放
4. 并发、生命周期、状态一致性
5. 可维护性：是否引入无必要的抽象或重复实现

涉及接口或协议时额外检查：

- 调用方与被调用方是否同时更新
- 兼容层是否明确，是否需要迁移说明
- 文档或示例是否需要同步

---

## Step 3：结论

必须二选一：

**通过**：说明已检查范围，列出剩余风险（如有），然后在来源任务记录 review 结论，并按「收工三步」记一条 `awf log <ID> --type review` 后回读末行（改正文必配 log，见 `skills/dev/SKILL.md`）。

**不通过**：逐条给出位置、风险、原因、建议修复方向，写入 `../memory/cache/review_<主题>_<YYYY-MM-DD>.md`；**必须主动回执派发方**（问题清单 + 修复计划，细则见 `skills/dev/SKILL.md` Step 5 状态透明化）。

---

## Step 4：回流

- 默认不新建 `dev` 任务，审查意见回写原任务的 `current.md`
- 原任务状态从 `review` 改回 `active` 或 `blocked`，更新 `下一步` 与 `最近更新`，并按「收工三步」补一条 `awf log --type review` 后回读末行（改正文必配 log）；**状态转换即回执派发方**：修复开始 / 修复完成待复审 / 复审通过或再次不通过，每步主动回执（当前状态 / 结果 / 下一步 / 预计），不因「还在修复」而沉默（状态透明化，细则见 `skills/cross-project-dispatch/SKILL.md`「必报点总表」）
- 修复完成后**必须重新运行验证命令**，通过后才能重新进入 review
- 只有审查意见已超出原任务范围、形成独立需求时，才拆分到 `tasks/<type>/todo/`

review 本身不替代来源任务的归档与提交动作。

## 自检清单

- [ ] 按状态机推进，每步更新任务块「状态 / 最近更新 / 下一步」
- [ ] 收工三步：改正文 → `awf log` 记一条 → 回读末行；归档前完成最后一条记录（归档后只读）
- [ ] 验证命令实际执行（compile/test），命令不可用写明 `验证阻塞：<原因>` 并置 blocked
- [ ] 收尾：归档（补完成日期）→ 沉淀可复用结论到 memory/history、脚本按 tools 标准收录 → check_workflow.sh 通过 → awf status → 本地 commit（禁 push）

## 禁止事项

- 未验证的判断写「待确认」，不写结论
- 状态只写 active / blocked / review / verify / handoff；一个任务块只有一个 Owner
- 归档后必须跑通过校验；status.md 由 awf status 刷新才算完成
- 手改 `### Execution Log`：该节只由 `awf log` 追加，历史行不改写
- 不自动 push、不改写历史

## 无技能环境兜底

本技能不可用时，按「执行步骤」的状态机自行推进，参照目标项目 `tools/` 手册与 `memory/history`。
