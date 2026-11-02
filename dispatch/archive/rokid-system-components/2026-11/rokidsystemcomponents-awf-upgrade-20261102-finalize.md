# rokid_system_components 升级收尾：本地 commit

- 目标项目：rokid-system-components（/Users/chenlin/Documents/GitHub/rokid_system_components）
- 任务 ID：awf-upgrade-20261102
- 类型：dev
- 模块：通用

## 一句话目标
工作流升级（awf upgrade）的框架文件已就位但未提交：把已就位的升级改动提交为本地 commit（消息含任务 ID awf-upgrade-20261102），禁止 push。

## 现状（已由 captain 核验）
- 目标有 7 个未提交改动：AGENTS.md（受控区块）、agent-workflow/README.md、templates/AGENTS.md.tmpl、workflows/cross-project.md（upgrade 覆盖）+ 账本 tasks/dev/current.md、tasks/docs/current.md、tasks/status.md
- check_workflow.sh 应已通过（upgrade 内置校验），复跑确认即可
- 不需要重复执行 awf upgrade；只做核对 + commit

## 步骤（必须实际执行）
1. git status 确认待提交文件；diff 快速核对均为 upgrade 覆盖物/账本
2. 排除 .DS_Store、__pycache__ 等杂项
3. 复跑 ./agent-workflow/check_workflow.sh，确认 rc=0
4. 提交消息：chore: 升级 agent-workflow 框架至 kit v0.5.0（awf-upgrade-20261102）
5. 只本地 commit，禁止 push

## 回报格式
- 状态：成功 / 失败 / 阻塞
- commit：hash + 消息（若发现已有同主题 commit 则报告已存在，不重复提交）
- 验证结果：check rc
- 阻塞：若失败写明原因
