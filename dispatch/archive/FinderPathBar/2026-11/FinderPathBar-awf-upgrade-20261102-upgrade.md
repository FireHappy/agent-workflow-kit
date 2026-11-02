# 升级 agent-workflow 框架到 kit 最新

- 目标项目：FinderPathBar（/Users/chenlin/Documents/GitHub/FinderPathBar）
- 任务 ID：awf-upgrade-20261102
- 类型：dev
- 模块：通用

## 一句话目标
把本项目的 agent-workflow 框架升级到 agent-workflow-kit 当前版本：用 kit 根部的 bin/awf upgrade 执行，覆盖框架文件、保留全部账本与配置。

## 修改范围
- agent-workflow/bin/awf、bin/awf-dispatch、templates/AGENTS.md.tmpl、README.md、workflows/*.md、check_workflow.sh（由 upgrade 覆盖）
- AGENTS.md 受控区块（由 bootstrap 刷新，区块外保留）

## 明确不做
- 不改动 agent-workflow/project.yaml、tasks/**（账本）、memory/**、tools/**、AGENTS.md 区块外内容
- 不 push；只本地 commit

## 步骤（必须实际执行）
1. 在目标仓库工作目录运行 kit 根部的入口：
   /Users/chenlin/Documents/GitHub/agent-workflow-kit/bin/awf upgrade /Users/chenlin/Documents/GitHub/FinderPathBar
   （注意：必须是 kit 根部的 bin/awf，项目内副本不执行 upgrade）
2. 确认输出「全部检查通过 / 升级完成」；若出现 FAIL，先如实报告原因，不要用 --force 掩盖
3. 若有「自定义 check_workflow.sh 已被保留」的告警，属预期行为，保留原文件即可

## 账本要求
- 在 tasks/dev/current.md 认领本任务（状态 active，Owner = 你自己，验收标准照抄），完成后归档到 tasks/dev/done.md

## 提交要求
- 本地 commit，提交消息必须含任务 ID（awf-upgrade-20261102）；禁止 push

## 回报格式（任务包五项）
- 状态：成功 / 失败 / 阻塞
- 变更文件：upgrade 覆盖或新增的文件列表
- 验证结果：upgrade 输出摘要 + check 退出码
- commit：commit hash + 消息
- 阻塞：若失败，写明具体原因
