# 校验门禁与 locale 兼容（enforcement）

> DEV-117：修复 macOS awk 的 locale 相关中文解析 bug，并把冒烟测试并入日常门禁。

## 背景与根因（2026-11-04 实测）

`bash test/smoke.sh` 在默认 locale 下出现 7 项失败，集中在 F2（status 新鲜度）与 F3/F3+（迁移修复指引）段；`LC_ALL=C` 下全绿（124/0）。

根因是 macOS 自带 awk（version 20200816）在 **en_US.UTF-8** 等 UTF-8 locale 下，多字节中文的 `==` 字符串比较**恒真**：

```
$ awk 'BEGIN{ a="状态"; b="字段"; printf "%d\n", (a==b) }'   # en_US.UTF-8 → 1（错）
$ LC_ALL=C awk 'BEGIN{ a="状态"; b="字段"; printf "%d\n", (a==b) }'  # → 0（对）
```

`awf check` 的 `check_current_file()` 用 `trim($2) == "状态"` / `"优先级"` / `"Owner"` 判字段，中文字段名全部误命中 → 把最后一行字段值（如 `| 证伪方法 | z |` 的 z）误当「状态」→ FAIL `状态非法：z`；ASCII 字段（Owner/Status）不受影响；`index()` 不受影响。`status_build_block()` 里的 `trim($2) == "优先级"` / `"状态"` 同样受影响。

影响面：所有含中文任务块的账本解析在默认环境（非 C locale）不可靠，跨项目 check 结果取决于运行 shell 的 locale —— 环境相关性潜伏 bug。

## 修复方案（选 A，无副作用）

`agent-workflow/bin/awf` 内**所有 awk 调用统一经 `awfk()` 包装**：

```sh
awfk() { LC_ALL=C awk "$@"; }
```

- `LC_ALL=C` 使字符串比较退回字节语义，中文不再互相误等；输出字节原样透传，UTF-8 内容不受影响。
- 本文件 awk 均为 ASCII 锚点（`## [`、`|`、`[A-Z]+-[0-9]+`）与字面替换（`render()` 用 `index()`/`substr()` 拼接），无字符级截断中文的依赖，C locale 下行为一致——无副作用，无需退回方案 B。
- 同类中文比较（`check_current_file` / `status_build_block` / bootstrap 区块注入等）一并覆盖，不遗留。

## 日常门禁

- **`awf check`**：默认在校验末尾提示「请运行 bash test/smoke.sh」；`awf check --with-smoke` 在 check 全过后自动执行 `bash test/smoke.sh`（无 `test/smoke.sh` 时跳过并说明），失败即返回非零。smoke 不是 check 的硬依赖（项目内副本无 test/smoke.sh 时仍可 check）。
- **`templates/pre-commit`**：git commit 前自动运行 `./agent-workflow/check_workflow.sh`，非零即拒绝提交并输出中文提示（只检查、不改写文件、不 push）。
- **`awf install-hooks [--check | --uninstall]`**：安装/检查/卸载 `.git/hooks/pre-commit`；模板来自 `templates/pre-commit`（kit）或 `agent-workflow/templates/pre-commit`（项目内，由 init/upgrade 复制）。需在 git 仓库内的 agent-workflow 项目根执行。
- **`awf upgrade`**：把 `templates/pre-commit` 一并复制进目标项目 `agent-workflow/templates/`，成功后提示可用 `install-hooks` 安装。
- **`awf init`**：同样复制 `pre-commit` 模板到新项目。

## 防回归断言（test/smoke.sh 第 22 节）

- 在**默认 locale（不强制 LC_ALL=C）**下构造含 `| 现象 | x |`、`| 假设 | y |`、`| 证伪方法 | z |` 中文任务块的 debug 账本，`check_workflow.sh` 必须通过且不报「状态非法：z」。
- 若系统有 `en_US.UTF-8` locale，再以 `LC_ALL=en_US.UTF-8` 复跑同一断言（复现 bug 的 locale，修复后必须同样正确）——保证 smoke 在 C.UTF-8 环境运行时断言仍然咬得住。
- 附带断言：`check --help` 列出 `--with-smoke`、kit 形态 `check` 末尾提示跑 smoke、`templates/pre-commit` 与 init 副本存在、`install-hooks --check/install/uninstall` 行为、脏账本被钩子拒绝且含中文提示。

## 验证命令（必须实际执行）

```sh
LC_ALL=C bash test/smoke.sh                       # C locale 全绿（≥124 项 + 新增断言）
bash test/smoke.sh                                # 默认 locale 同样全绿
LC_ALL=en_US.UTF-8 bash test/smoke.sh             # 复现 bug 的 locale 同样全绿
bash -n agent-workflow/bin/awf && bash -n bin/awf
python3 -m py_compile agent-workflow/bin/awf-dispatch
./agent-workflow/check_workflow.sh                # 通过
( cd <项目> && ./agent-workflow/bin/awf install-hooks --check )   # 钩子状态
```
