---
name: docs
description: agent-workflow 文档流程（认领→大纲→撰写→审阅→归档）：文档撰写的事实核实、结构与审阅规范。
whenToUse: 用户要求撰写/更新文档、启动 DOCS-xxx 文档任务、或需文档事实核实与审阅流程时——自动加载本技能。
---

# agent-workflow · 文档（技能）

> 由 agent-workflow-scaffold 主技能路由加载（AGENTS.md 开工顺序按任务类型强制加载本技能）。
> 项目内无 workflow 副本：本技能随仓库符号链接自动更新，项目零升级。
> 路径约定：以下 `tasks/`、`memory/`、`tools/`、`project.yaml` 均为目标项目 `agent-workflow/` 下的相对路径。

## 适用场景

文档 / 架构分析。撰写前核实事实与引用，不虚构。

## 执行步骤

> 状态入口：`../tasks/docs/`
> 知识目录：`../docs/`
> 历史归档：`../memory/history/`
> 主规范：`../README.md`

---

## 目标

产出事实准确、可复用、可维护的文档，而不是把对话内容搬进 markdown。

---

## Step 1：认领

1. 从 `../tasks/docs/todo/`（todo/README.md 检索）或用户需求识别目标，分配唯一 `DOCS-xxx`
2. 认领：把 `todo/DOCS-xxx.md` 移动到 `current/DOCS-xxx.md` 并把 `| 状态 |` 改为 `active`（目录索引 `README.md` 由 `awf status` 重生成）
3. 明确文档类型与落点：

| 类型 | 放置位置 |
|------|----------|
| 技术背景 / 架构分析 | `../docs/` |
| 操作手册 / 命令说明 | `../tools/` |
| 迭代结论 / 事件复盘 | `../memory/history/` |

---

## Step 2：大纲与核实

开始写之前确认：

- 读者是谁
- 解决什么问题
- 需要哪些代码、日志或历史证据

技术文档以事实为准：

- 先查代码，再写结论
- 不确定的部分标记「待确认」
- 关键结论给出文件路径或日志出处

---

## Step 3：撰写

推荐结构：

1. 背景
2. 核心结论
3. 证据或关键代码路径
4. 风险、限制、未决问题
5. 后续建议

操作手册额外要求：

- 命令可直接执行，或写明前置条件
- 写明适用环境与限制
- 不要照抄会过期的输出

---

## Step 4：审阅

- 事实是否与代码一致
- 相对链接是否有效
- 是否存在明显过期信息
- 是否与已有文档重复或冲突
- 关键结论逐条打开引用的 `file:line` 核对，不接受“看起来对”
- 能换人复核时换人；单人时至少换会话，并重跑文中给出的命令

架构或业务约束类文档，且准确性依赖用户领域知识时，需要向用户确认。

---

## Step 5：归档

1. 归档：把 `current/DOCS-xxx.md` 移到 `done/DOCS-xxx.md`，状态改 `done` 并补 `| 完成日期 |`；索引 `README.md` 由 `awf status` 重生成
2. 文档本身是长期知识时，不必再复制到 `memory/history/`
3. 运行 `./agent-workflow/check_workflow.sh` 通过
4. 运行 `./agent-workflow/bin/awf status` 刷新摘要
5. 提交一次本地 git commit（**禁止 push**）
6. 由其他任务触发时，完成后回到来源任务继续

---

## 必问用户

- 文档面向对象或详略程度不明确
- 业务背景只能由用户确认
- 文档将作为团队规范，需要确认措辞或边界

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
