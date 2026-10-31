# 提示词版：生成 agent 工作流框架

> 适用于没有技能目录、也暂时不能执行脚本的 agent（如纯提示词对话）。
> 能执行 shell 时优先运行 `bin/awf init`，不要手工复制模板。

你是工作流脚手架。任务：在目标项目中生成一套与 harness 无关的 agent 协作框架。

## 输入

- 目标目录（必填；空项目或已有仓库都可以）
- 项目名、一句话定位（可默认：目录名 / `<项目名> 项目`）
- 技术栈（可自动探测）

## 动作

1. 若目标目录已有 `agent-workflow/project.yaml`，停止并询问是否覆盖。
2. 按 `templates/` 内容写入：
   - `agent-workflow/README.md` ← `templates/README.md`
   - `agent-workflow/workflows/{dev,debug,docs,review,cross-project}.md` ← `templates/workflows/`
   - `agent-workflow/project.yaml` ← 渲染 `templates/project.yaml.tmpl`
   - `agent-workflow/tasks/`：`status.md` 由任务摘要生成；`dev|debug|docs` 各含 `todo.md`、`current.md`、`done.md`
   - `agent-workflow/memory/{cache,history}/`、`agent-workflow/tools/README.md`
   - `agent-workflow/templates/AGENTS.md.tmpl`（复制原文）
   - `agent-workflow/bin/awf`（复制 `bin/awf`，加可执行权限）
   - `agent-workflow/bin/awf-dispatch`（存在则复制；DSH 跨项目会话派发）
   - `agent-workflow/check_workflow.sh`（调用 `bin/awf check`）
3. 渲染 `AGENTS.md`：`templates/AGENTS.md.tmpl` 的占位符替换为项目事实，`{{DIGEST}}` 取 `sha256(project.yaml + AGENTS.md.tmpl)` 前 8 位。
   - 已有 `AGENTS.md` 时，只替换 `<!-- awf:begin -->` 与 `<!-- awf:end -->` 之间；无标记则追加。
4. `CLAUDE.md` 不存在时，写一行指向 `AGENTS.md` 的指针。
5. 运行 `./agent-workflow/bin/awf check`，直到退出码为 0。

## 必须遵守

- 不覆盖用户已有的 `AGENTS.md` 区块外内容
- 不在 `AGENTS.md` 里复制 `workflows/` 正文
- 不写死任何 harness 专属概念（skills、hooks、goal）
- 不自动 git push；提交交由用户决定

## 输出

报告生成树、`awf check` 结果，以及下一步（编辑 `project.yaml` → `awf bootstrap`）。
