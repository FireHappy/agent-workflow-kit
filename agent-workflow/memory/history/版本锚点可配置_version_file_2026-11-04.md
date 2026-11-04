# 版本锚点可配置：release-prep / upgrade 改读 project.yaml 的 version_file（DEV-145 / DISPATCH-143）

日期：2026-11-04 ｜ 结论来源：uxrsample 实测 → 派发到 kit → DEV-145 实现 ｜ 后续升级/发版必读

## 背景与根因

macOS 文件系统大小写不敏感：目标仓库根若有文本文件 `VERSION`（内容如 `1.1.1`），Unity IL2CPP 全量编译（Bee clang `-I"."`）会把 `#include <version>` 解析到该文本文件，报 `./version(1,1): error: expected unqualified-id`（token `1.1.1`）并级联大量误报。Linux/CI 大小写敏感不触发，**macOS 触发**。uxrsample 2026-11-04 实测：根 VERSION → VERSION.bak 即构建成功（207s，0 错误），还原即复发。

## 方案（DEV-076 方案 B 落地）

版本锚点路径不再写死为仓库根 `VERSION`，统一读目标 `agent-workflow/project.yaml` 的 `version_file`：

- 辅助函数 `project_version_file() { 读 yaml_get version_file；有值 → $1/<vf>，无值 → $1/VERSION }`——未配置的项目行为完全不变（向后兼容）。
- `release-prep`：dry-run 与真实写入共用同一 `VF` 计算；`printf '%s\n' "$version" > "$VF"`（先 `mkdir -p $(dirname)`）。
- `upgrade`（原 DEV-133 锚点同步）：`cp "$KIT_DIR/VERSION" "$VF"`；dry-run 提示同步改。
- 项目侧只需在 project.yaml 写 `version_file: agent-workflow/VERSION`（模板自带该键，注释说明默认值）。

## 坑与铁律

- **锚点文件不得放进 clang 头文件搜索路径**（`-I"."`、Unity IL2CPP Bee）：Unity/C++ 项目把 version_file 指向 `agent-workflow/VERSION` 等安全路径。
- **bash 坑（set -u + UTF-8 locale）**：`$var` 后紧跟全角字符（如 `$version（路径`）会被当作变量名延续，报 `unbound variable`（实测 `bash: version�: unbound variable`）。全角标点前必须用 `${var}` 花括号。同类代码 review 时留意。
- **双副本同步**：kit 仓库 `bin/awf` ↔ `agent-workflow/bin/awf`、`templates/workflows/*.md` ↔ `agent-workflow/workflows/*.md` 必须一致，`check_workflow.sh` 的副本漂移检查兜底；改代码先改 canonical（bin/awf / templates），再 cp 同步。
- 锚点默认仍是根 VERSION：纯脚本/文档项目无 clang 搜索路径问题，保持默认即可；勿为所有项目一刀切改路径。

## 验证（kit 仓库）

- compile：`bash -n bin/awf && bash -n install.sh && bash -n test/smoke.sh && bash -n test/upgrade.sh && python3 -m py_compile bin/awf-dispatch`
- `bash test/smoke.sh`：200/0（新增 release-prep version_file 定向 2 断言）
- `bash test/upgrade.sh`：全过（新增场景 E：upgrade 锚点写 version_file 路径、根 VERSION 不动）
- `./agent-workflow/check_workflow.sh` 全 ok、副本无漂移