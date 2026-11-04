# 待开发

| 任务ID | 优先级 | 描述 | 登记日期 |
|--------|--------|------|----------|
| DEV-127 | P2 | 任务账本拆分（todo/current/done 同理）：done.md（997 行 30+ 块）与 todo/current 均改为按任务拆 tasks/<type>/<ID>.md 单文件，三列表降级为 awf 生成的视图/索引（类似 status.md）；解决面板/agent 读大文件的干扰与低效。改动面：解析器/归档/summary/next-ID/任务查看器/存量迁移，架构级需独立排期+复核 | 2026-11-04 |
| DEV-128 | P1 | 去掉「来源=工作流禁转派」硬校验（DEV-115 派发深度=1 规则）：允许需要时向下一层继续派发；改动面=AGENTS.md.tmpl 激活式路由第 0 条/awf-dispatch 转派校验/docs/design.md+dispatch.md/smoke（原禁转派 FAIL 断言反转）；涉及派发契约，建议连带确认 9 项目模板同步策略 | 2026-11-04 |
