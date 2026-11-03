# 正在开发

> 任务从 `todo.md` 移入此文件开始执行，完成后移入 `done.md`。
> 优先级只写 `P0` / `P1` / `P2` / `P3`。
> `awf status` 会解析本文件，任务块格式必须保持：`## [ID] 标题` + 字段表 + `### 下一步`。


## [DEV-102] 看板初始化走 agent 完整配置

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | active |
| Owner | lead |
| 协作模式 | single |
| 来源任务 | 用户直接触发（2026-11-03：看板初始化工作流信息不完整，走 agent 配置更合理） |
| 修改范围 | dsh-plugin/lib/index.js（新增 /awf/init/agent 路由 + buildActPrompt init 分支 + AGENT_ACTIONS 白名单）、dsh-plugin/lib/client.js（引导卡初始化按钮改调 agent 通道 + 状态显示） |
| 分支/工作区 | dev（当前工作区） |
| 依赖 | DEV-039 受管理子代理通道（runManagedActionAgent）、DEV-041 升级子代理模式 |
| 最近更新 | 2026-11-03 |

### 目标
面板「初始化工作流」改为由 agent 完整配置：读项目上下文（README/技术栈/结构）→ 生成完整骨架（project.yaml + AGENTS.md 受控区块 + workflows/templates/bin/awf + 账本初始任务 + status.md）→ 跑 awf check 验证 → 回报；替代当前仅生成空模板的最小骨架（缺 workflows/README/bin 等运行时文件，信息不完整）。

### 验收标准
- [ ] 新路由 /awf/init/agent：白名单校验 + 幂等（已初始化拒绝）+ 子代理拉起（runManagedActionAgent，cwd=项目根）
- [ ] buildActPrompt 新增 init 分支：指令含完整文件清单 + 上下文感知要求 + check 验证 + 回报
- [ ] client 引导卡「初始化工作流」按钮改调 /awf/init/agent；busy 态文案「初始化中…」；失败显示 error
- [ ] node --check 通过；check_workflow 全绿；profile 同步；本地 commit（禁 push）

### 下一步
实现 init 动作指令 → 新路由 → client 调用 → 验证。
