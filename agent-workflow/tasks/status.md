# 全局状态摘要

<!-- awf:status:begin -->
> 本区块由 `~/.dsh/skills/agent-workflow-scaffold/bin/awf status` 生成，请勿手改。
> 数据来源：`tasks/<type>/<ID>.md`（单任务文件；todo/current/done README 为检索视图）。

## 当前进行中

（无）

## 待处理

（无）

## 最近完成

| 工作流 | 任务ID | 优先级 | 描述 | 完成日期 |
|--------|--------|--------|------|----------|
| dev | DEV-231 | P1 | 派发去重：同票据 + 同项目 + 同内容 24h 幂等（补严谨握手） | 2026-11-11 |
| dev | DEV-229 | P1 | 恢复每项目 [awf] 会话硬上限 ≤3（满 3 排队等空闲）+ 并发/忙碌/等待测试循环 | 2026-11-10 |
| dev | DEV-230 | P1 | awf-dispatch 复用会话启动确认 + 坏会话自动隔离重发（含真实/单元测试） | 2026-11-10 |
| debug | DEBUG-003 | P1 | awf-dispatch 锁屏探针 SIGSEGV：CFBooleanGetValue 句柄用错 → 指针截断（跨项目派发单 KIT-DEBUG-001 续） | 2026-11-08 |
| dev | DEFAULT-20261108 | P1 | 派发默认行为改为「每次新建」（--reuse 显式） | 2026-11-08 |
| dev | DEV-194 | P1 | 派发 v1.4.0 升级至全部登记项目（10 目标） | 2026-11-08 |
| dev | DEV-196 | P1 | 打包 openxr-runtime（Rokid OpenXR Runtime inProcessStation3Release APK） | 2026-11-08 |
| dev | DEV-216 | P1 | 借鉴 dsh-task-ledger 落地 5 项(执行记录/validate/纪律/插件单源化/派生指标) | 2026-11-08 |

*最后更新：2026-11-11 04:22*
<!-- awf:status:end -->
