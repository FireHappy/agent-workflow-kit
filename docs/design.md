# 设计说明

## 一句话

把「项目事实」与「生成物」分开：事实写在项目里，入口和状态由工具生成，生成结果可校验。

## 三层结构

| 层 | 位置 | 内容 | 谁维护 |
|---|---|---|---|
| 框架 | `agent-workflow/` | 规范正文、工作流、账本、工具 | 技能生成后随项目演进 |
| 事实 | `agent-workflow/project.yaml` | 名字、别名、校验命令、并行切分、共享写点 | 人 |
| 入口 | `<repo>/AGENTS.md` | 开工顺序、铁律、验证命令、并行提示 | `awf bootstrap` 生成 |

全局还有一层：`~/.agents/projects.tsv`（数据）与 `~/.agents/AGENTS.md`（视图），用于跨项目定位。

## 为什么入口是产物

1. 各 harness 只读仓库里的文件；入口必须落在仓库根，不能放在技能目录里。
2. 入口里的规则是通用的，事实是每个项目不同的；用模板 + 变量把两者分开，避免手写漂移。
3. 入口带 `digest`：事实或模板变了但没重建，`awf check` 直接失败。

```text
<!-- awf:begin v1 digest:xxxxxxxx -->
...（受控区块）
<!-- awf:end -->
```

`bootstrap` 只替换区块内部，区块外由人自由编辑，因此“团队约定”不会被覆盖。

## 为什么 status 是产物

`tasks/status.md` 是 `tasks/*/current.md`、`todo.md`、`done.md` 的投影。手抄三份必然漂移，所以：

- `awf status` 生成 `<!-- awf:status:begin -->` 区块；
- 区块外保留“已验证功能 / 临时记录”等人工内容；
- 归档前必须跑 `check`，失败即不算完成。

## 校验策略

`awf check` 检查四类：

1. 框架文件齐全（入口、事实、五份流程、模板、状态）。
2. `AGENTS.md` 的 digest 与 `project.yaml` + 模板一致。
3. 每个进行中任务块包含 `状态` / `Owner` / `下一步`。
4. 退出码 = 失败项数量，可直接给 pre-commit / CI 用。

确定性检查优先于“请记得更新”这类文字约束。

## 全局索引

- 数据：`~/.agents/projects.tsv`，一行一个项目（`id | 别名 | 路径 | 入口`）。
- 视图：`~/.agents/AGENTS.md`，由 `awf register` 渲染，DSH 作为用户级上下文注入。
- 自愈：`awf init` 自动登记；`bootstrap` 只刷新已登记项目的路径，避免意外写入。

索引只放指针，不放项目细节；它是上下文里最泛化的一层，必须保持小。

## 并行约定

`project.yaml` 的 `scopes` 描述可并行单元，`serialized` 描述任何并行单元都不得同时修改的文件（如 `manifest.json`、`tasks/**`）。

配套原则：账本单写者。子任务只返回结果，由主线合并 `current.md`，避免多写者冲突。

## 跨项目派发

跨项目不是把 cwd 切过去，而是先过四道门：目标工作流、目标工作区、可写、会话通道。全过时用 `awf-dispatch` 在目标工作区创建正式会话，任务留在会话里可继续追问；headless 仅作为无人值守回退。

核心与适配分离：`workflows/cross-project.md` 是 harness 无关规范，`bin/awf-dispatch` 是 DSH 适配器；其他 harness 可用 GUI 手工会话，语义相同。

## 版本

`VERSION` 是技能版本；入口区块记录 `v<version>`。升级项目是显式动作：替换 `bin/awf`、`bin/awf-dispatch`、`cross-project.md` 与入口模板，再 `bootstrap` + `check`。
