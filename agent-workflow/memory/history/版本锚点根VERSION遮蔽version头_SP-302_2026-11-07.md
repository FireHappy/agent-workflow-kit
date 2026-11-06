# 根目录 VERSION 遮蔽 libc++ `<version>` 头（SP-302）——锚点位置铁律（DEV-198）

日期：2026-11-07 ｜ 结论来源：uxrsample 打包现场（SP-302 记录）→ DEV-198 框架侧支持 ｜ Unity/C++ 项目发版、升级、锚点迁移类 review 必读

## 现象

uxrsample 2026-11-07 全量 IL2CPP 构建（Bee clang++ 带 `-I"."`）报 `expected unqualified-id` 级联大量误报。根因：项目根 git 跟踪文件 `VERSION` 在 macOS 大小写不敏感文件系统上**遮蔽 libc++ 的 `<version>` 头**——libc++ `cstddef` 内 `#include <version>` 被解析成 `./VERSION`（文本内容如 `1.1.1`），首 token 即语法错误并级联。Linux/CI 大小写敏感不触发。

## 结论（铁律）

1. **Unity/C++ 项目版本锚点一律放 `agent-workflow/VERSION`，勿放项目根**：`git mv VERSION agent-workflow/VERSION` + `agent-workflow/project.yaml` 设 `version_file: agent-workflow/VERSION`（uxrsample 已执行 commit b00845f）。纯脚本/文档项目无 clang 头文件搜索路径问题，可保持默认根 `VERSION`（向后兼容）。
2. **框架侧已全链路支持非根锚点**（DEV-145/174 实现，DEV-198 验证）：`release-prep`（读写）、`upgrade`（锚点写入）、`bootstrap`/`check`（digest 只哈希 project.yaml + AGENTS.md.tmpl，与根 VERSION 无关）在 `version_file: agent-workflow/VERSION` 下 dry-run/实测正确——唯一要求：目标 project.yaml 写对 version_file，路径不再有任何硬编码根 VERSION。
3. **`awf check` 对根目录存在 `VERSION` 给软提示（不阻塞）**：带迁移建议（`git mv VERSION agent-workflow/VERSION` + version_file 指过去）；version_file 已指走但仍残留根 VERSION 的提示「残留」分支。纯脚本项目可忽略提示，check 照常通过（fails 不增）。
4. **文档锚点位置规范同步三处**：`templates/project.yaml.tmpl`（含 agent-workflow/templates 双副本）、`skills/release/SKILL.md`（Step 2 锚点铁律 + Step 5 提交命令去 `git add VERSION` 硬编码，改按 version_file 动态取路径）、README 版本节。
5. **改模板/工具后双副本与技能实体都要同步**：templates/ ↔ agent-workflow/templates/ 由 F6 漂移检查兜底；bin/awf ↔ 全局技能实体（~/.dsh/skills/agent-workflow-scaffold）改完跑 `./install.sh`，否则 `awf check`（check_workflow.sh shim 指向技能实体）用的是旧代码。

## 验证（kit 仓库）

- dry-run 实证：`release-prep --dry-run` →「写版本锚点 <root>/agent-workflow/VERSION = 0.7.0」；`upgrade --dry-run` →「将写版本锚点 <root>/agent-workflow/VERSION = 1.4.0」；真实写入 smoke 已覆盖（写 agent-workflow/VERSION、根 VERSION 不动）。
- `awf check` 软提示实测：默认根 VERSION 项目 →「默认根 VERSION…建议迁移」；version_file 已指 agent-workflow/VERSION 的项目 →「残留 VERSION…」；均不增加 FAIL。
- smoke 新增 2 断言；`bash test/smoke.sh` 全绿；`./agent-workflow/check_workflow.sh` 0 FAIL；compile（bash -n + py_compile）OK。
