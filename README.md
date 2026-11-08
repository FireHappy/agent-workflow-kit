# agent-workflow-kit

一套与 harness 无关的 agent 工作流脚手架：任务账本 + 流程规范 + 仓库根 `AGENTS.md` 入口 + 全局项目索引。

- **一份技能，N 个项目**：技能只提供生成器与模板，项目事实写在各自的 `project.yaml`。
- **生成器在内，入口在外**：`AGENTS.md` 是产物，落在工作流目录之外，Codex / DSH / Claude Code 都能直接读。
- **可校验**：入口带 digest，`awf check` 能发现它与事实文件脱节；`status.md` 由脚本生成。
- **跨项目会话派发**：目标有工作流且已登记工作区时，在目标工作区创建会话执行，用户可继续追问。

## 目录

```text
agent-workflow-kit/
├── AGENTS.md / CLAUDE.md    # 仓库入口与指针
├── README.md / CHANGELOG.md # 项目说明 / 变更记录
├── prompt.md                # 无 shell 环境的提示词版
├── dsh-awf-dashboard/       # DSH 插件（看板）+ **技能唯一源**
│   └── skills/              # 框架技能 agent-workflow-scaffold（SKILL.md / bin/awf / templates/ / test/）+ 8 个流程技能（同级平铺）
├── test/                    # 冒烟 / 升级回归 / 全局索引并发测试
├── docs/design.md           # 设计取舍（含激活式 Router 协议）
├── install.sh               # 从 dsh-awf-dashboard/skills/ 安装全部技能到 ~/.dsh/skills
└── agent-workflow/          # kit 自身工作流账本与骨架（含 agent-workflow/VERSION 发布锚点）
```

## 安装（新机器）

```bash
git clone <repo-url> ~/Documents/GitHub/agent-workflow-kit
cd ~/Documents/GitHub/agent-workflow-kit
./install.sh            # 默认符号链接：改仓库即改技能
# 或：./install.sh copy  # Windows / 不希望联动时用拷贝
```

install 后 DSH 在下一次请求前把所有技能加入技能目录：`agent-workflow-scaffold`（脚手架）+ 8 个流程技能（dev / debug / docs / review / cross-project-dispatch / release / team-flow / upgrade）各为顶层技能（`~/.dsh/skills/<name>/`），凭 frontmatter 的 `whenToUse` 自动匹配加载——`AGENTS.md` 只需「按任务类型加载对应技能」，不列举清单。

## 在项目里使用

```bash
# 生成框架（空项目或已有仓库）
~/Documents/GitHub/agent-workflow-kit/dsh-awf-dashboard/skills/agent-workflow-scaffold/bin/awf init . --name "我的项目" --purpose "一句话定位"

# 改完项目事实后刷新入口
~/.dsh/skills/agent-workflow-scaffold/bin/awf bootstrap

# 校验 / 状态
./agent-workflow/check_workflow.sh
~/.dsh/skills/agent-workflow-scaffold/bin/awf status

# 跨项目派发（目标有工作流且已登记工作区；默认只发送不等待，--wait 才等待回合结束）
~/.dsh/skills/cross-project-dispatch/scripts/awf-dispatch demo02 .dispatch/tasks/DEV-003.md
```

生成结果：

```text
<项目>/
├── AGENTS.md                 入口（生成物，位于工作流目录之外）
├── CLAUDE.md                 Claude Code 指针
└── agent-workflow/
    ├── project.yaml          项目事实（唯一输入）
    ├── README.md             规范正文
    ├── tasks/                status + todo/current/done
    ├── memory/               cache / history
    ├── tools/                操作手册
    ├── templates/            入口模板
    ├── bin/awf               bootstrap / check / status / register / projects / find
    └── check_workflow.sh     兼容入口

（v1.2.0 技能化：无 workflows/ 目录——流程细节在技能 agent-workflow-scaffold 的
skills/ 各流程技能，AGENTS.md 路由内联状态机 + 强制加载技能即流程入口）
```

### 忽略工作流入库（团队项目）

团队项目的共享仓库不想带本机私有工作流时，可一键把工作流写进 `.gitignore`（幂等，可重复执行）：

```bash
# 新建项目：init 时直接忽略
~/Documents/GitHub/agent-workflow-kit/dsh-awf-dashboard/skills/agent-workflow-scaffold/bin/awf init . --name "我的项目" --gitignore

# 存量项目补忽略
~/.dsh/skills/agent-workflow-scaffold/bin/awf gitignore
```

忽略范围：`/agent-workflow/`、`/AGENTS.md`、`/CLAUDE.md`（根锚定，写入项目根 `.gitignore`，带固定标记行、不重复追加）。之后 `check` / `status` / `bootstrap` 等仍是本地常用命令，只是不再入库。

## 跨项目派发

派发工具由 `cross-project-dispatch` 技能自带（`scripts/awf-dispatch`），可独立安装、复制和更新；不再提供 `bin/awf-dispatch` 或脚手架技能下的旧入口。

当任务目标在另一个仓库时，先检查目标是否有工作流、是否已登记为当前 harness 的工作区；都满足后，优先在**目标工作区的会话**中执行，而不是默认 headless。

派发遵循**激活式 router** 协议：路由能力只在直接面对**用户原始请求**的节点临时激活（任务票据头部带「来源：用户 | 工作流」标记，缺省=用户，向后兼容）；「来源：工作流」票据允许按需继续转派（深度不限），转派时在票据头部更新「路由裁决」，来源=工作流的再次派发只提示核对转派理由、不拦截。每个 worker 可在项目 `project.yaml` 填 `role` 作**名牌**（一句话自述，`awf find` / `awf projects` 检索时带出；缺省回退 name），router 检索工作群时可见。设计权衡与「激活派发 / 转派被拒」两段示意见 [docs/design.md](docs/design.md)「激活式 Router」，名牌说明见同文「worker 名牌（role）」，票据来源字段与派发器校验见 [skills/cross-project-dispatch/SKILL.md](skills/cross-project-dispatch/SKILL.md)「任务票据来源」。`templates/AGENTS.md.tmpl` 任务路由段与`skills/cross-project-dispatch/SKILL.md` 已内置同一规则。

```bash
~/.dsh/skills/cross-project-dispatch/scripts/awf-dispatch <别名|目录> <任务文件>
~/.dsh/skills/cross-project-dispatch/scripts/awf-dispatch demo02 task.md --dry-run   # 只做前置检查
~/.dsh/skills/cross-project-dispatch/scripts/awf-dispatch demo02 task.md --headless # GUI 不可用时
~/.dsh/skills/cross-project-dispatch/scripts/awf-dispatch demo02 task.md --handoff  # 只生成交接单
~/.dsh/skills/cross-project-dispatch/scripts/awf-dispatch demo02 task.md --team     # 任务包附团队执行建议
```

四道前置门、回退矩阵与任务包格式见技能 `skills/cross-project-dispatch/SKILL.md`（DSH 顶层技能）。

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

冒烟测试已并入日常门禁：`awf check` 默认在校验末尾提示运行 smoke，`awf check --with-smoke` 全过后自动执行；`awf install-hooks` 可安装 git pre-commit 钩子（提交前自动跑 `check_workflow.sh`，未过即拒绝）。locale 相关说明与门禁细节见 [agent-workflow/memory/history/macOS_awk_locale_enforcement_2026-11-04.md](agent-workflow/memory/history/macOS_awk_locale_enforcement_2026-11-04.md)。

CI（GitHub Actions）在每次 push 时运行同一套测试。

## 升级已有项目

新版本发布后，已有项目的工作流不会自动更新；升级是**显式操作**（一等命令，取代「自行推断拷贝哪些文件」的隐式流程）：

```bash
/path/to/agent-workflow-kit/bin/awf upgrade <项目目录>    # 复制新框架 → bootstrap 刷新入口 → check 校验
/path/to/agent-workflow-kit/bin/awf upgrade <项目目录> --dry-run   # 只预览变更/保留清单
```

- **变更清单**：`agent-workflow/templates/AGENTS.md.tmpl`、`README.md`、`check_workflow.sh` 等骨架契约 + 登记目标骨架版 `agent-workflow/FRAMEWORK_VERSION`（v1.2.0+ 技能化：流程细节在技能，项目只随骨架版本差量同步骨架）；
- **保留清单**：`agent-workflow/project.yaml`、`tasks/**`（账本历史）、`memory/**`、`tools/**` 与 `AGENTS.md` 区块外内容；
- **升级判定 = 骨架版本差量**：目标骨架版与源相同 → 默认跳过（`--force` 强刷）；不同/缺失 → 复制骨架 + 写目标 `FRAMEWORK_VERSION`。技能更新只在技能实体（重跑 `./install.sh`），不需升级项目；upgrade 不再把 kit 技能版写项目版本锚点。
- 升级后跑 `./agent-workflow/check_workflow.sh`；旧账本格式问题（归档块缺「状态」字段、旧英文表头 `| Status |`）会得到**可直接执行的修复指引**，无需推断；
- 升级流程细节（变更清单/保留清单/旧账本迁移/双版本模型）见技能 `skills/upgrade/SKILL.md`（DSH 顶层技能）。

批量升级多个项目时，每个目标在**自己的工作区会话**里执行升级；团队不承载跨仓库任务（任务路由见技能 `skills/upgrade/SKILL.md` 与 `skills/cross-project-dispatch/SKILL.md`）。

## 版本

- **双版本模型（DEV-205）**：技能版本 Skill-Version = `agent-workflow/VERSION`（semver，任何发版 bump；插件显示、技能实体安装消费）；骨架版本 Framework-Version = `agent-workflow/FRAMEWORK_VERSION`（固定路径，仅骨架契约——bin/awf、AGENTS.md.tmpl、project.yaml.tmpl、账本结构、check 门禁、pre-commit、README.md 骨架文件——变化时 bump；`awf upgrade` 判定与插件 outdated 消费）。
- **两版解耦**：技能更新只重装技能实体（install.sh），不触发项目全量升级；项目升级按骨架版差量判定（相同默认跳过，`--force` 强刷；不同/缺失复制骨架并登记目标骨架版）。`FRAMEWORK_VERSION` 勿放项目根（与锚点铁律同位置规范），init/upgrade 自动登记，不进 project.yaml 键、不走 version_file。
- `AGENTS.md` 受控区块会记录 `v<version>` 与 `digest`。
- 版本锚点位置：默认 `agent-workflow/VERSION`（DEV-198/SP-302：勿放项目根——macOS 大小写不敏感 FS 上根 `VERSION` 会遮蔽 libc++ `<version>` 头，Unity IL2CPP 全量构建报错；`awf check` 对根 `VERSION` 给迁移软提示）。
- 发布：`git tag v0.1.0 && git push --tags`。

## 推送

```bash
git remote add origin git@github.com:<你的账号>/agent-workflow-kit.git
git push -u origin main --tags
```

未配置 SSH 时也可用 `https://github.com/<账号>/agent-workflow-kit.git`。
