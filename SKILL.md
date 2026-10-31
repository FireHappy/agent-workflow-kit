---
name: agent-workflow-scaffold
description: 在空项目或已有仓库中生成可移植的 agent 工作流框架（任务账本、流程规范、AGENTS.md 入口、awf 校验工具），不绑定 DSH/Codex/Claude 任一 harness。
whenToUse: 用户要求为新项目搭建 agent 协作流程、初始化任务账本与状态文件、生成仓库根 AGENTS.md 入口，或把现有项目接入 agent-workflow。
---

# agent-workflow 脚手架

本技能把一套与 harness 无关的工作流框架写入目标项目。核心分工：

- **工作流目录**（`agent-workflow/`）：规范、任务账本、生成与校验工具，可随项目复制。
- **仓库根入口**（`AGENTS.md`）：由工作流生成，落在工作流目录**之外**，任何 agent（Codex、DSH、Claude 等）都能直接读到。

生成器与产物分离，所以同一套框架可以在不同 harness 之间复用，入口文件不会成为第二份规范。

> 跨项目派发是配套技能：见 `skills/cross-project-dispatch/SKILL.md`，流程规范见 `templates/workflows/cross-project.md`。

## 前置检查

1. 确认目标目录。缺省为当前目录；空项目、已有仓库都支持。
2. 目标目录已有 `agent-workflow/project.yaml` 时，**不要覆盖**，先问用户是否 `--force`。
3. 确认本技能目录下存在 `bin/awf`、`templates/`。缺失则报告并停止，不要手写替代实现。

## 执行步骤

1. 采集最少信息（能用默认值就不要问）：
   - 项目名（默认：目录名）
   - 一句话定位（默认：`<项目名> 项目`）
   - 技术栈（默认：自动探测 `Cargo.toml` / `go.mod` / `package.json` / `pom.xml` / `gradle` / Unity `Assets`+`ProjectSettings`）
2. 运行：

   ```sh
   <技能目录>/bin/awf init <目标目录> \
     --name "项目名" \
     --purpose "一句话定位"
   ```

3. 运行校验：`cd <目标目录> && ./agent-workflow/bin/awf check`，必须退出码为 0。
4. 全局索引（默认自动完成）

   `awf init` 会把项目写入 `~/.agents/projects.tsv` 与 `~/.agents/AGENTS.md` 的受控区块；
   `awf bootstrap` 在项目已登记时自动刷新路径与别名（仓库移动/改名后无需手工处理）。

   - 不希望写入：`awf init ... --no-register` 或设置 `AWF_NO_REGISTER=1`
   - 手工补登记：`cd <目标目录> && ./agent-workflow/bin/awf register`
   - 检索：`./agent-workflow/bin/awf projects` / `awf find <别名>`
5. 向用户报告生成树，并说明下一步：
   - 编辑 `agent-workflow/project.yaml`：校验命令、并行切分、共享写点
   - 运行 `./agent-workflow/bin/awf bootstrap` 刷新 `AGENTS.md`
   - 若用户同时使用 DSH，可把 `.dsh/skills/` 指向各自流程（可选，不强制）
6. 用户确认后，按项目既有约定提交一次本地 commit；**不要 push**。

## 生成物

```text
AGENTS.md                       入口（生成物，位于工作流目录之外）
CLAUDE.md                       Claude Code 指针（已存在则不动）
agent-workflow/
├── project.yaml                项目事实（唯一输入）
├── README.md                   规范正文
├── workflows/                  dev / debug / docs / review / cross-project
├── tasks/                      status + dev|debug|docs 的 todo/current/done
├── memory/                     cache / history
├── tools/                      操作手册
├── templates/AGENTS.md.tmpl    入口模板（供 bootstrap 重渲染）
├── bin/awf                     init / bootstrap / check / status
├── bin/awf-dispatch            跨项目派发（DSH 会话适配）
└── check_workflow.sh           兼容入口
```

## 自检清单

- [ ] `awf check` 退出码为 0
- [ ] `AGENTS.md` 含 `<!-- awf:begin ... digest:xxxxxxxx -->`，digest 与 `project.yaml` 一致
- [ ] `tasks/status.md` 由 `awf status` 生成，含生成说明
- [ ] `project.yaml` 的 `compile` / `test` 为空时，入口显示“未配置”而不是假命令
- [ ] 未修改用户已有的 `AGENTS.md` 区块外内容
- [ ] `workflows/cross-project.md` 已生成；入口含“跨项目派发”路由
- [ ] 需要跨项目发现时，`awf projects` 能列出新项目，`awf find <别名>` 能返回路径

## 跨项目派发（配套技能）

目标项目有工作流且已登记为当前 harness 的工作区时，优先在**目标工作区创建会话**执行，不要默认 headless：

```sh
"$KIT/bin/awf-dispatch" <别名|目录> dispatch/tasks/<ID>.md
```

先过 G1–G4（工作流 / 工作区 / 可写 / 通道），失败时按 `--headless` 或 `--handoff` 回退。完整流程见 `skills/cross-project-dispatch/SKILL.md` 与 `templates/workflows/cross-project.md`。

## 禁止事项

- 不要手写 `AGENTS.md` 或 `tasks/*` 来“绕过”脚本生成：入口会与 `project.yaml` 脱节
- 不要在 `AGENTS.md` 里重复 `workflows/*.md` 的正文，入口只放路由、铁律、验证命令
- 不要自动 push、不要改写用户已有的提交历史
- 不要把某个 harness 专属概念写进生成的核心规范；DSH 派发器属于可选适配层（`bin/awf-dispatch`），只在需要时使用

## 无 shell 环境

无法执行 `bin/awf` 时：

1. 读 `templates/README.md`、`templates/workflows/*.md`，按原文写入目标目录
2. 按 `templates/project.yaml.tmpl` 渲染 `project.yaml`
3. 按 `templates/AGENTS.md.tmpl` 渲染入口，`{{DIGEST}}` 用 `sha256(project.yaml + 模板)` 前 8 位
4. 明确告知用户：本次为手工落地，后续请用 `awf check` 复核
