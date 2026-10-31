# agent-workflow-kit

一套与 harness 无关的 agent 工作流脚手架：任务账本 + 流程规范 + 仓库根 `AGENTS.md` 入口 + 全局项目索引。

- **一份技能，N 个项目**：技能只提供生成器与模板，项目事实写在各自的 `project.yaml`。
- **生成器在内，入口在外**：`AGENTS.md` 是产物，落在工作流目录之外，Codex / DSH / Claude Code 都能直接读。
- **可校验**：入口带 digest，`awf check` 能发现它与事实文件脱节；`status.md` 由脚本生成。
- **跨项目会话派发**：目标有工作流且已登记工作区时，在目标工作区创建会话执行，用户可继续追问。

## 目录

```text
agent-workflow-kit/
├── SKILL.md                 # 技能入口（脚手架）
├── prompt.md                # 无 shell 环境的提示词版
├── bin/awf                  # init / bootstrap / check / status / register / projects / find
├── bin/awf-dispatch         # 跨项目派发（DSH 工作区会话适配）
├── skills/cross-project-dispatch/SKILL.md  # 配套技能：跨项目派发
├── templates/               # 生成用的规范与入口模板
├── test/smoke.sh            # 冒烟测试
├── docs/design.md           # 设计取舍
├── docs/dispatch.md         # 跨项目派发（会话优先 / headless / handoff）
├── install.sh               # 安装两个技能到 ~/.dsh/skills（link 或 copy）
└── VERSION                  # 版本号
```

## 安装（新机器）

```bash
git clone <repo-url> ~/Documents/GitHub/agent-workflow-kit
cd ~/Documents/GitHub/agent-workflow-kit
./install.sh            # 默认符号链接：改仓库即改技能
# 或：./install.sh copy  # Windows / 不希望联动时用拷贝
```

安装后 DSH 会在下一次请求前把 `agent-workflow-scaffold` 与 `cross-project-dispatch` 加入技能目录；Codex 直接用 `SKILL.md` / `skills/cross-project-dispatch/SKILL.md` 或 `prompt.md` 的内容。

## 在项目里使用

```bash
# 生成框架（空项目或已有仓库）
~/Documents/GitHub/agent-workflow-kit/bin/awf init . --name "我的项目" --purpose "一句话定位"

# 改完项目事实后刷新入口
./agent-workflow/bin/awf bootstrap

# 校验 / 状态
./agent-workflow/check_workflow.sh
./agent-workflow/bin/awf status

# 跨项目派发（目标有工作流且已登记工作区）
./agent-workflow/bin/awf-dispatch demo02 dispatch/tasks/DEV-003.md
```

生成结果：

```text
<项目>/
├── AGENTS.md                 入口（生成物，位于工作流目录之外）
├── CLAUDE.md                 Claude Code 指针
└── agent-workflow/
    ├── project.yaml          项目事实（唯一输入）
    ├── README.md             规范正文
    ├── workflows/            dev / debug / docs / review / cross-project
    ├── tasks/                status + todo/current/done
    ├── memory/               cache / history
    ├── tools/                操作手册
    ├── templates/            入口模板
    ├── bin/awf               bootstrap / check / status / register / projects / find
    ├── bin/awf-dispatch      跨项目派发（DSH 会话适配）
    └── check_workflow.sh     兼容入口
```

## 跨项目派发

当任务目标在另一个仓库时，先检查目标是否有工作流、是否已登记为当前 harness 的工作区；都满足后，优先在**目标工作区的会话**中执行，而不是默认 headless。

```bash
./agent-workflow/bin/awf-dispatch <别名|目录> <任务文件>
./agent-workflow/bin/awf-dispatch demo02 task.md --dry-run   # 只做前置检查
./agent-workflow/bin/awf-dispatch demo02 task.md --headless # GUI 不可用时
./agent-workflow/bin/awf-dispatch demo02 task.md --handoff  # 只生成交接单
./agent-workflow/bin/awf-dispatch demo02 task.md --team     # 任务包附团队执行建议
```

四道前置门、回退矩阵与任务包格式见 [docs/dispatch.md](docs/dispatch.md) 和生成的 `agent-workflow/workflows/cross-project.md`。

## 全局索引

`awf init` 默认把项目登记到 `~/.agents/projects.tsv`，并生成 `~/.agents/AGENTS.md`（用户级上下文，DSH 在任何会话都会注入）。

```bash
awf register              # 手工补登记
awf projects              # 列出项目
awf find 系统组件          # 别名 → 路径
```

- 重复登记按 ID upsert，不产生重复行；
- `bootstrap` 会刷新已登记项目的路径（仓库移动/改名后自愈）；
- 跳过登记：`awf init ... --no-register` 或 `AWF_NO_REGISTER=1`。

## 测试

```bash
bash test/smoke.sh        # init / check / status / bootstrap / --force / 全局索引 / 派发 CLI
```

CI（GitHub Actions）在每次 push 时运行同一套测试。

## 升级

```bash
cd ~/Documents/GitHub/agent-workflow-kit
git pull
bash test/smoke.sh
```

已生成的项目各自保留 `agent-workflow/bin/awf` 与模板副本，不会被自动改写；需要升级某个项目时，把新的 `bin/awf`、`bin/awf-dispatch`、`agent-workflow/workflows/cross-project.md` 与 `templates/AGENTS.md.tmpl` 拷过去，再跑一次 `bootstrap` + `check`。

## 版本

- `VERSION` 为技能版本；`AGENTS.md` 受控区块会记录 `v<version>` 与 `digest`。
- 发布：`git tag v0.1.0 && git push --tags`。

## 推送

```bash
git remote add origin git@github.com:<你的账号>/agent-workflow-kit.git
git push -u origin main --tags
```

未配置 SSH 时也可用 `https://github.com/<账号>/agent-workflow-kit.git`。
