---
name: debug
description: agent-workflow 问题排查流程（认领→诊断→证据→假设→修复→归档）：崩溃/报错/行为异常的排查方法论与回归验证。
whenToUse: 用户报告崩溃/报错/行为异常、启动 DEBUG-xxx 排查任务、或需先证据后结论的排查流程时——自动加载本技能。
---

# agent-workflow · 问题排查（技能）

> 由 agent-workflow-scaffold 主技能路由加载（AGENTS.md 开工顺序按任务类型强制加载本技能）。
> 项目内无 workflow 副本：本技能随仓库符号链接自动更新，项目零升级。
> 路径约定：以下 `tasks/`、`memory/`、`tools/`、`project.yaml` 均为目标项目 `agent-workflow/` 下的相对路径。

## 适用场景

崩溃 / 报错 / 行为异常。先证据后结论，修复必回归。

## 执行步骤

> 状态入口：`../tasks/debug/`
> 主规范：`../README.md`

---

## 目标

把「现象」收敛到「根因 + 已验证修复」或「明确阻塞条件」，而不是堆日志和猜测。

---

## Step 1：认领

1. 从 `../tasks/debug/todo/`（todo/README.md 检索）或用户输入提取问题，分配唯一 `DEBUG-xxx`
2. 认领：把 `todo/DEBUG-xxx.md` 移动到 `current/DEBUG-xxx.md` 并把 `| 状态 |` 改为 `active`；文件必填：现象、状态、Owner、来源任务、修改范围、依赖、最近更新、假设、证伪方法、下一步
3. 缺少复现条件时，标记 `blocked` 并写明缺失信息，不要直接开始修复

---

## Step 2：选择诊断方式

用成本最低的方法先缩小范围：

- 日志、代码路径、配置比对（通用）
- 构建产物、依赖版本、环境差异
- 设备、网络、权限等外部条件

证据统一沉淀到 `../memory/cache/`。

---

## Step 3：收集证据

至少覆盖其中一部分：

- 复现步骤与输入条件
- 关键日志（完整错误，不截断堆栈）
- 调用链 / 生命周期 / 线程信息
- 最近相关改动（`git log` / `git diff`）

每条假设写成可证伪格式：

```text
假设：...
证据：...
证伪方法：...
结果：待验证 / 成立 / 不成立
```

---

## Step 4：验证假设

1. 选当前最强假设
2. 做最小验证动作
3. 更新结论
4. 假设被证伪时明确标记，再切换方向

根因足够明确后再进入修复；不要在根因不明时大范围试错。

---

## Step 5：修复与回归

- 优先修根因，不做表层遮挡
- 变更尽量小，但不牺牲正确性
- 修复后重新执行验证命令（`../project.yaml`）或最小复现
- 回归范围：原复现 + 受影响模块的验证命令；能补自动化用例时优先补
- 修复演变成结构性改造时，创建 `dev` 子任务并保留 debug 上下文
- 通过后状态改 `review`，按 `review.md` 审查；复核由非修复者重跑回归命令（单人时换会话）

---

## Step 6：归档

1. 归档：把 `current/DEBUG-xxx.md` 移到 `done/DEBUG-xxx.md`，状态改 `done` 并补 `| 完成日期 |`；索引 `README.md` 由 `awf status` 重生成
2. 有**可复用结论**（根因/修法/复现/规避）→ 追加或新建 `../memory/history/<主题>_<YYYY-MM-DD>.md`（标准见 `../memory/README.md`）；有**新写的可复用诊断/修复脚本** → 按 `../tools/README.md` 晋升三要素收录进 `tools/`
3. 清理对应 `../memory/cache/`
4. 运行 `./agent-workflow/check_workflow.sh` 通过
5. 运行 `./agent-workflow/bin/awf status` 刷新摘要
6. 提交一次本地 git commit（**禁止 push**）

未证实的风险要在完成摘要里单独列出。

---

## 必问用户

- 无法复现
- 缺少崩溃日志、输入样本或环境条件
- 有多个修复策略且代价差异明显
- 问题已超出当前任务范围

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
