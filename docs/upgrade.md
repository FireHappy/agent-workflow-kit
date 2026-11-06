# 升级已有项目的工作流

> 适用：项目已用旧版 agent-workflow 框架（生成物过期、校验规则变化、模板漂移），需要升级到当前 kit 版本。
> 工具：`awf upgrade`（一等操作；本文是它的规范与验收标准）。
> 背景：2026-11-01 批量升级 6 个项目时，各执行者自行推断拷贝范围（有人覆盖了项目自定义的 check_workflow.sh、有人改 done.md 表头），说明「升级」必须显式化为可执行流程。

## 一句话

用 kit 的框架文件覆盖项目的 `agent-workflow/` 生成物，再 `bootstrap` 刷新入口、`check` 校验；**项目事实与账本历史一律保留**。

## 什么时候用

- 项目仍在用旧版本（`check` 提示入口过期 / 模板漂移 / 校验规则不符）
- 批量升级多个项目：**每个目标项目在自己的工作区会话里执行**，调度方不代写（见 `agent-workflow/workflows/cross-project.md` 的「任务路由」——团队不承载跨仓库任务）
- **不要用**：项目完全没有 agent-workflow（→ `awf init`）；只想改某份工作流内容（→ 直接编辑该项目文件）

## 显式步骤

1. **定位与归属**：确认目标项目有 `agent-workflow/project.yaml`；在目标项目自己的工作区会话执行，调度方不直接改目标仓库。
2. **预览**：`/path/to/kit/bin/awf upgrade <项目目录> --dry-run` —— 只打印将变更/保留的文件，不改写任何文件。
3. **执行**：`/path/to/kit/bin/awf upgrade <项目目录>` —— 依次自动完成：
   - 复制框架文件（见下「变更清单」）；
   - `./agent-workflow/bin/awf bootstrap` 刷新 `AGENTS.md` 受控区块（区块外内容保留）；
   - `./agent-workflow/bin/awf check` 校验（退出码 = 失败项数量）。
4. **修复**：`check` 的 FAIL 按输出自解释处理；旧账本迁移问题见「旧账本迁移」节。
5. **提交**：目标项目只本地 commit（消息含任务 ID），**禁止 push**。

## 变更清单（覆盖为 kit 版本）

| 文件 | 说明 |
|---|---|
| `agent-workflow/bin/awf` | 生成/校验工具（新增 `upgrade`、check 迁移修复指引随版本生效） |
| `agent-workflow/bin/awf-dispatch` | 跨项目派发器 |
| `agent-workflow/templates/AGENTS.md.tmpl` | 入口模板（任务路由等规则随之更新） |
| `agent-workflow/README.md` | 规范正文 |
| `agent-workflow/workflows/*.md` | dev / debug / docs / review / cross-project / release |
| `agent-workflow/check_workflow.sh` | 标准 3 行兼容入口（自定义门禁见下节） |
| `AGENTS.md` 受控区块 | 由 `awf bootstrap` 重建（区块外内容保留） |

## 保留清单（一律不动）

- `agent-workflow/project.yaml`（项目事实，唯一输入）
- `agent-workflow/tasks/**`（账本：todo / current / done / status；status.md 由 `awf status` 刷新）
- `agent-workflow/memory/**`、`agent-workflow/tools/**`
- `AGENTS.md` 受控区块外内容（团队约定等）

## 自定义 check_workflow.sh 怎么办

标准 `check_workflow.sh` 只有 3 行（等价 `bin/awf check`）。若目标项目把它扩展成自定义门禁（例如 12.5KB 脚本），**默认保留原文件**，`awf upgrade` 会告警不覆盖；确认可替换时加 `--force`。建议升级前把自定义逻辑迁移到 `tools/` 或独立脚本，再使用标准入口——不要静默丢失项目门禁（2026-11-01 教训）。

## 旧账本迁移（check 自带修复指引）

新校验器要求归档块含「状态」字段；旧项目若用英文表头 `| Status |`，`awf check` 会 FAIL 并直接给出可执行指引：

- `| Status |` → `| 状态 |`（**保留归档原值**，如 `| 状态 | 完成 |`）
- 缺整个字段 → 在字段表补一行 `| 状态 | <归档时状态> |`（历史归档可写 `完成`）

只修正表头/补字段，**不批量改写已记入的归档原值**；`awf status` 同样兼容读取 `| Status |` 表头，升级后摘要不丢状态列。

## 任务表格格式规范（新，升级必查）

面板「待办」区只识别**标准 4 列**任务表格行，其他列数会被静默跳过导致任务看不见。升级整理合并时统一转为标准格式：

- **标准 4 列**：`| 任务ID | 优先级 | 描述 | 登记日期 |`（dev/debug/docs 各类型表头略有差异：任务ID/问题描述/文档主题，锚定规则一致）
- **5 列**（`| 任务ID | Priority | Title | Dependencies | Date |`）→ 依赖并入描述，转标准 4 列：`描述（依赖 X）`
- **其他畸形行** → 以最接近字段推断转换；无法推断的保留原文并回报 note
- 同时确认 `current.md`/`done.md` 任务块格式：`## [ID] 标题` + 字段表（含 `状态`）+ `### 下一步`

升级完成后用 `./agent-workflow/bin/awf status` 刷新摘要，确认待办行能正常解析（面板自动轮询账本，格式修复后立即可见）。

## 验证命令（必须实际执行）

```sh
/path/to/kit/bin/awf upgrade <项目目录> --dry-run      # 预览
/path/to/kit/bin/awf upgrade <项目目录>                # 执行（rc=check 失败项数量）
cd <项目目录> && ./agent-workflow/check_workflow.sh    # 退出码 0
cd <项目目录> && ./agent-workflow/bin/awf status       # 刷新摘要
```

## 验收标准

- [ ] `upgrade --dry-run` 与实际执行打印的变更/保留清单一致
- [ ] 升级后 `agent-workflow/bin/awf`、`templates/AGENTS.md.tmpl`、`README.md`、`workflows/*.md` 与 kit 一致
- [ ] `project.yaml` / `tasks/**` / `memory/**` / `tools/**` 逐字节保留
- [ ] `check` 退出码 0；旧账本格式问题输出含可直接执行的修复指引
- [ ] 只本地 commit（消息含任务 ID），未 push
## v1.2.0 技能化迁移（DEV-184）

- 项目内不再有 `agent-workflow/workflows/` 目录：流程细节全部在技能 agent-workflow-scaffold（`skills/` 各流程技能），AGENTS.md 路由内联状态机 + 强制加载技能即流程入口。
- 存量项目（带 workflows/ 副本）：`./bin/awf upgrade <项目> --slim` 清理副本迁移到技能化形态（细节已在技能，副本不再需要）。
- 骨架版本（agent-workflow/VERSION）只管 bin/awf、AGENTS.md.tmpl、账本结构等稳定契约；流程细节更新只改技能仓库（符号链接自动生效），项目零升级。
