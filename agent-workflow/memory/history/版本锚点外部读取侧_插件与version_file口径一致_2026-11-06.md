# 插件等「kit 外部读取侧」的版本锚点必须与 version_file 口径一致（DEV-178）

日期：2026-11-06 ｜ 结论来源：DEV-178（看板插件 0.3.4，用户「插件也同步升级一下」）｜ 插件升级/锚点类 review 必读

## 结论（铁律）

1. **锚点迁移的波及面不止 bin/awf**：DEV-174 把 kit 自身锚点迁到 `agent-workflow/VERSION`（project.yaml `version_file:`）后，任何**硬编码读根 `VERSION`** 的代码都会静默失效——`bin/awf upgrade` 已按 memory「版本锚点一致性」修（KVF 动态读），但**看板插件 dsh-awf-dashboard 当时漏了**：`readProjectRelease`（读项目已装版）与 `kitVersions`（读 kit 最新版）都硬编码根 VERSION。后果：kit 面板只显示框架代次、登记时 `scaffold_version` 无法补齐。变更锚点后应全局 grep `join(.*VERSION` / `KIT_DIR/VERSION` 类硬编码（kit + 插件 + 测试三处都查）。
2. **外部读取侧统一走「project.yaml version_file → 默认根 VERSION」解析**：插件实现为 `projectVersionFile(projectPath, meta)` + `readProjectRelease(projectPath)`（内部读 projectMetaFile），与 `bin/awf project_version_file()`、upgrade 源版本读取（KVF）三方口径一致；未配置 version_file 的项目默认根 VERSION，向后兼容零行为变化。
3. **README 承诺的脚本要真实存在**：插件 README 一直写「改动用 ./scripts/sync-profile.sh 同步已安装副本」，但该脚本此前并不存在；本次补上（`cmp -s` 跳过同 inode 硬链接副本后 `cp -f`，BSD cp 对同一 inode 拒绝覆盖会导致 set -e 中断）。
4. **宿主副本 = node_modules 硬拷贝（非符号链接）**：profile 的 `pnpm add file:` 落的是硬拷贝，改 dsh-plugin 后必须手动/脚本同步 `~/.dsh/profiles/<profile>/node_modules/dsh-awf-dashboard/`（lib/ src/ package.json README cordis.patch.yml），并重启 DSH 才生效；版本号以 package.json 为准（本次 0.3.3 → 0.3.4）。

## 验证（kit 仓库）

- `cd dsh-plugin && node --test "test/*.test.js"`：37/37 全绿（新增 2 组：version_file 已配置读指向文件、未配置默认根 VERSION + 读不到 null）
- 真实 kit 解析：`readProjectRelease(kit)` = 1.1.7（读 agent-workflow/VERSION）；`projectVersionFile` 路径正确
- kit 门禁：compile（bash -n + py_compile）过、`bash test/smoke.sh` 223/0、`check_workflow.sh` 0 FAIL
- 宿主副本 diff 9 文件 SAME，installed version = 0.3.4