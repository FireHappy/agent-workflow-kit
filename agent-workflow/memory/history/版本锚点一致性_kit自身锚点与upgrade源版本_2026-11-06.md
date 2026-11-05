# kit 自身锚点位置与 upgrade 源版本读取的一致性（DISPATCH-155 / DEV-174）

日期：2026-11-06 ｜ 结论来源：DISPATCH-154（8 项目锚点迁移至 agent-workflow/VERSION）→ 本任务 kit 补第 9 个 ｜ 后续发版/升级/同类 review 必读

## 结论（铁律）

1. **kit 自身安全锚点 = `agent-workflow/VERSION`**：`agent-workflow/project.yaml` 已设 `version_file: agent-workflow/VERSION`，根 `VERSION` 已 `git mv` 迁移（历史保留，根文件删除）。以后在 kit 里看/改发布版本号一律读写 `agent-workflow/VERSION`，不要再落回根 `VERSION`（kit 是纯脚本仓库虽无 C++ 撞名风险，但与全项目统一、避免再次漂移）。
2. **upgrade 源版本读取必须与 kit 自身 version_file 一致（防静默回归铁律）**：`bin/awf upgrade` 从 `project_version_file "$KIT_DIR"`（变量 `KVF`）读 kit 对外发布版，**不再硬编码 `$KIT_DIR/VERSION`**——否则 kit 锚点一迁移，`[ -f "$KIT_DIR/VERSION" ]` 恒假，升级时静默跳过写目标锚点（回归且无报错）。review 同类代码时 `grep -n 'KIT_DIR/VERSION' bin/awf agent-workflow/bin/awf` 必须零命中（注释里也别写该字面量，避免 grep 误报），允许 `$KVF` 等动态变量形式。
3. **测试断言同样不能写死 kit 根 VERSION**：`test/upgrade.sh` 场景 E 的断言曾读 `$(cat "$KIT/VERSION")`，锚点迁移后必挂；改为按 kit 的 version_file 动态取源（`KIT_VF="$KIT/agent-workflow/VERSION"`，不存在则兜底根 `VERSION`）。E/F 两场景分别覆盖「已配置 version_file 目标 → 写 agent-workflow/VERSION、根 VERSION 不动」「默认目标（未配置）→ 写根 VERSION」，向后兼容双覆盖。
4. **release-prep 无需另改**：已走 `project_version_file "$ROOT"` 动态解析，自动跟随 kit 锚点迁移。
5. **双副本铁律依旧**：`bin/awf` ↔ `agent-workflow/bin/awf` 改完必须 `cp` 同步（`check_workflow.sh` 漂移检查兜底）。
6. 模板 `templates/project.yaml.tmpl` 保持 `version_file: VERSION` 默认——纯脚本/文档项目无 clang 撞名问题，向后兼容；只有 Unity/C++ 或全项目统一迁移时才改目标侧。

## 验证（kit 仓库）

- compile：`bash -n bin/awf … && python3 -m py_compile bin/awf-dispatch` 通过
- `bash test/upgrade.sh`：全过（含新增 E/F 场景）
- `bash test/smoke.sh`：214/0
- 行为验证输出：dry-run 与执行均「将写版本锚点 …/agent-workflow/VERSION = 1.1.6」「已写版本锚点 … = 1.1.6」；默认目标根 VERSION = 1.1.6（行为不变）
- `grep -n 'KIT_DIR/VERSION' bin/awf agent-workflow/bin/awf` 零命中
- `./agent-workflow/check_workflow.sh` 0 FAIL