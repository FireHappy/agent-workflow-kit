# 安装 agent-workflow 框架（awf init）

- 目标项目：rokid-openxr-loader（/Users/chenlin/projects/OpenXR-UXR/rokid_openxr_loader）
- 任务 ID：awf-init-20261102
- 类型：docs
- 模块：通用

## 一句话目标
为尚无 agent-workflow 框架的项目安装当前版本框架：用 kit 根部的 bin/awf init 在目标目录生成 agent-workflow/ 与仓库根 AGENTS.md，并登记到全局索引。

## 修改范围
- agent-workflow/（bin/awf、bin/awf-dispatch、templates/、README.md、workflows/*.md、check_workflow.sh、project.yaml、tasks/）
- 仓库根 AGENTS.md（由 init 生成受控区块）
- 全局索引 ~/.agents/AGENTS.md（由 init --register 自动登记）
- 目标当前无框架，init 全新生成框架

## 明确不做
- 不 touch 目标仓库现有业务代码；不 push；只本地 commit

## 步骤（必须实际执行）
1. 在目标仓库工作目录运行：
   /Users/chenlin/Documents/GitHub/agent-workflow-kit/bin/awf init /Users/chenlin/projects/OpenXR-UXR/rokid_openxr_loader
2. 确认输出显示框架生成完成、AGENTS.md 已写、已登记全局索引
3. 运行目标 ./agent-workflow/check_workflow.sh，确认退出码 0

## 账本要求
- 生成后在 tasks/docs/current.md 认领本任务（状态 active，Owner = 你自己，验收标准照抄），完成后归档到 tasks/docs/done.md

## 提交要求
- 本地 commit，提交消息必须含任务 ID（awf-init-20261102）；禁止 push

## 回报格式（任务包五项）
- 状态：成功 / 失败 / 阻塞
- 变更文件：init 生成的文件列表
- 验证结果：check 退出码 + 输出摘要
- commit：commit hash + 消息
- 阻塞：若失败，写明具体原因
