# tools

本仓库的操作手册：构建、校验、安装、自举刷新、发布。

只写经过验证、可直接执行的命令；实验记录写 `../memory/`，结论写 `../docs/`。

## 环境前置

- macOS 自带 bash 3.2 可用，脚本只用 POSIX 工具（`awk` / `sed` / `grep` / `shasum`）。
- 无需 Node、Python、构建系统；`awf` 是单文件 bash 脚本。

## 校验（提交前必跑）

```sh
# 语法检查（project.yaml 里的 compile）
bash -n bin/awf && bash -n install.sh && bash -n test/smoke.sh

# 冒烟测试（project.yaml 里的 test）：26 项，在临时目录运行，不碰 ~/.agents
bash test/smoke.sh

# 本仓库自身的框架校验（入口 digest + 任务块字段）
./agent-workflow/check_workflow.sh
```

`check_workflow.sh` 的退出码等于失败项数量，可直接用于 CI / pre-commit。

## 安装为 DSH 技能

```sh
./install.sh          # 符号链接：改本仓库即改技能（默认）
./install.sh copy     # 拷贝：Windows 或不希望联动时用
```

安装后 DSH 在下次请求前把 `agent-workflow-scaffold` 加入技能目录。

## 自举刷新（改完生成器/模板之后）

本仓库既是生成器，也是它自己的第一个使用方（dogfood）。目录里存在两份同源文件：

| 源（改这里） | 生成副本（勿手改） |
|--------------|--------------------|
| `bin/awf` | `agent-workflow/bin/awf` |
| `templates/AGENTS.md.tmpl` | `agent-workflow/templates/AGENTS.md.tmpl` |
| `templates/README.md` + `templates/workflows/*.md` | `agent-workflow/README.md` + `agent-workflow/workflows/*.md` |

刷新方式：

```sh
./bin/awf init . --force    # 覆盖规范/模板/副本，保留 project.yaml、tasks/、tools/、memory/
./agent-workflow/check_workflow.sh
```

`--force` 会保留 `project.yaml` 与任务账本，因此可以直接重复执行；刷新后 `AGENTS.md` 的 digest 会更新。

## 全局索引

```sh
./agent-workflow/bin/awf register    # 登记本仓库（写 ~/.agents/projects.tsv 与 AGENTS.md）
./agent-workflow/bin/awf projects    # 列出已登记项目
./agent-workflow/bin/awf find 别名    # 别名 → 路径
```

工作区沙箱不允许写 `~/.agents` 时，`init` / `register` 会失败并提示；需要在允许写用户主目录的会话里补跑一次 `register`。

## 发布

```sh
bash test/smoke.sh
git tag v$(cat VERSION) && git push --tags   # 推送需用户明确触发
```

`VERSION` 是技能版本；`AGENTS.md` 受控区块记录 `v<version>` 与 `digest`。

## 已知限制

- `init --force` 不比对模板与副本的差异，只做覆盖；副本是否漂移靠 `check` 的 digest 间接发现。
- `awf` 只解析 `project.yaml` 的扁平 `key: value`，不支持嵌套 YAML。
- 全局索引写入依赖 `~/.agents` 可写；CI 中用 `--no-register` 或 `DSH_AGENTS_HOME` 指向临时目录。
