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
├── bin/awf                  # init / bootstrap / check / status / register / projects / find / release-prep / upgrade
├── bin/awf-dispatch         # 跨项目派发（DSH 工作区会话适配）
├── skills/cross-project-dispatch/SKILL.md  # 配套技能：跨项目派发
├── templates/               # 生成用的规范与入口模板
├── test/smoke.sh            # 冒烟测试
├── test/upgrade.sh          # 升级回归测试（awf upgrade 全流程）
├── test/registry-concurrency.sh  # 全局索引并发回归测试
├── docs/design.md           # 设计取舍（含激活式 Router 协议）
├── docs/dispatch.md         # 跨项目派发（会话优先 / 无人值守 / handoff）
├── docs/team-flow.md        # 团队执行流程（三轨 + 派发模式）
├── docs/upgrade.md          # 升级已有项目的工作流（awf upgrade 规范）
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

# 跨项目派发（目标有工作流且已登记工作区；默认只发送不等待，--wait 才等待回合结束）
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

### 忽略工作流入库（团队项目）

团队项目的共享仓库不想带本机私有工作流时，可一键把工作流写进 `.gitignore`（幂等，可重复执行）：

```bash
# 新建项目：init 时直接忽略
~/Documents/GitHub/agent-workflow-kit/bin/awf init . --name "我的项目" --gitignore

# 存量项目补忽略
./agent-workflow/bin/awf gitignore
```

忽略范围：`/agent-workflow/`、`/AGENTS.md`、`/CLAUDE.md`（根锚定，写入项目根 `.gitignore`，带固定标记行、不重复追加）。之后 `check` / `status` / `bootstrap` 等仍是本地常用命令，只是不再入库。

## 跨项目派发

当任务目标在另一个仓库时，先检查目标是否有工作流、是否已登记为当前 harness 的工作区；都满足后，优先在**目标工作区的会话**中执行，而不是默认 headless。

派发遵循**激活式 router** 协议：路由能力只在直接面对**用户原始请求**的节点临时激活（任务票据头部带「来源：用户 | 工作流」标记，缺省=用户，向后兼容）；派发深度 = 1——收到「来源：工作流」任务的节点保持 worker、**禁止转派**，`awf-dispatch` 对工作流来源票据的二次派发直接拒绝（退出码 2）。每个 worker 可在项目 `project.yaml` 填 `role` 作**名牌**（一句话自述，`awf find` / `awf projects` 检索时带出；缺省回退 name），router 检索工作群时可见。设计权衡与「激活派发 / 转派被拒」两段示意见 [docs/design.md](docs/design.md)「激活式 Router」，名牌说明见同文「worker 名牌（role）」，票据来源字段与派发器校验见 [docs/dispatch.md](docs/dispatch.md)「任务票据来源」。`templates/AGENTS.md.tmpl` 任务路由段与生成的 `agent-workflow/workflows/cross-project.md` 已内置同一规则。

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
bash test/smoke.sh        # init / check / status / bootstrap / --force / 全局索引 / 派发 CLI / 迁移修复指引 / locale 回归
bash test/upgrade.sh      # awf upgrade：干净升级 / 旧账本迁移 / 自定义门禁保留 / 边界拒绝
bash test/registry-concurrency.sh  # 全局索引并发写入无丢失更新
```

冒烟测试已并入日常门禁：`awf check` 默认在校验末尾提示运行 smoke，`awf check --with-smoke` 全过后自动执行；`awf install-hooks` 可安装 git pre-commit 钩子（提交前自动跑 `check_workflow.sh`，未过即拒绝）。locale 相关说明与门禁细节见 [docs/enforcement.md](docs/enforcement.md)。

CI（GitHub Actions）在每次 push 时运行同一套测试。

## 升级已有项目

新版本发布后，已有项目的工作流不会自动更新；升级是**显式操作**（一等命令，取代「自行推断拷贝哪些文件」的隐式流程）：

```bash
/path/to/agent-workflow-kit/bin/awf upgrade <项目目录>    # 复制新框架 → bootstrap 刷新入口 → check 校验
/path/to/agent-workflow-kit/bin/awf upgrade <项目目录> --dry-run   # 只预览变更/保留清单
```

- **变更清单**：`agent-workflow/` 下的 `bin/awf`、`bin/awf-dispatch`、`templates/AGENTS.md.tmpl`、`README.md`、`workflows/*.md`、`check_workflow.sh`（项目自定义门禁默认保留，`--force` 才覆盖）；
- **保留清单**：`agent-workflow/project.yaml`、`tasks/**`（账本历史）、`memory/**`、`tools/**` 与 `AGENTS.md` 区块外内容；
- 升级后跑 `./agent-workflow/check_workflow.sh`；旧账本格式问题（归档块缺「状态」字段、旧英文表头 `| Status |`）会得到**可直接执行的修复指引**，无需推断；
- 步骤、验收标准与批量升级注意点见 [docs/upgrade.md](docs/upgrade.md)。

批量升级多个项目时，每个目标在**自己的工作区会话**里执行升级；团队不承载跨仓库任务（任务路由见模板「任务路由」与 [docs/team-flow.md](docs/team-flow.md)）。

## 版本

- `VERSION` 为技能版本；`AGENTS.md` 受控区块会记录 `v<version>` 与 `digest`。
- 发布：`git tag v0.1.0 && git push --tags`。

## 推送

```bash
git remote add origin git@github.com:<你的账号>/agent-workflow-kit.git
git push -u origin main --tags
```

未配置 SSH 时也可用 `https://github.com/<账号>/agent-workflow-kit.git`。
