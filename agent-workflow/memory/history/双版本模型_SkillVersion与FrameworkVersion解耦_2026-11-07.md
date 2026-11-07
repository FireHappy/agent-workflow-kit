# 双版本模型：Skill-Version（技能版本）+ Framework-Version（骨架版本）解耦（DEV-205）

日期：2026-11-07 ｜ 结论来源：DEV-205（用户双版本计划：VERSION=技能版本，新增骨架版本控制项目升级，插件显示技能版本）→ 后续发版/升级/插件改动必读

## 结论

1. **版本锚点从此有两个，职责严格分离**：
   - 技能版本 Skill-Version = `agent-workflow/VERSION`（semver，如 1.4.1）：任何发版（含纯技能更新）bump；插件显示、技能实体（~/.dsh/skills/*/VERSION，install.sh 同步）安装消费。
   - 骨架版本 Framework-Version = `agent-workflow/FRAMEWORK_VERSION`（semver，本任务起 = 1.0.0）：仅骨架契约（bin/awf、AGENTS.md.tmpl、project.yaml.tmpl、账本结构、check 门禁、pre-commit、README.md 骨架文件）变化时 bump；`awf upgrade` 判定与插件 outdated 消费。
   - 落点：kit 与每个框架项目各持一份，**固定路径 `agent-workflow/FRAMEWORK_VERSION`，不加 project.yaml 键、不走 version_file 机制**（业务项目的 version_file 是它们自己的产品版本，不可复用）。
2. **upgrade 判定 = 骨架版差量**：目标骨架版 == kit 骨架版（非 --force）→ dry-run/执行均「骨架已最新 vX（技能更新只在技能实体 install.sh，无需项目升级；--force 可强制刷新框架文件）」并 return 0（不复制、不写锚点、不跑 bootstrap/check）；不同/缺失 → 复制骨架 + 写目标 FRAMEWORK_VERSION（缺失场景=迁移补写）；--force 照旧全量 + 写骨架版。
3. **upgrade 不再把 kit VERSION 覆写到项目版本锚点**（删除 DEV-133 的 KVF→VF 逻辑）：业务项目自己的产品版本号归还项目；纯框架项目的版本信号 = 骨架版。全仓 `grep KVF` 须零命中（**含注释**，沿用 KIT_DIR/VERSION 同铁律精神，避免 grep 误报）；upgrade 源版本改读 FRAMEWORK_VERSION（KFF 模式：技能实体优先，回退 kit）。
4. **插件 versionStatus 判定链**：双方骨架版可读且 semver 可比 → 骨架差量判定（落后→outdated，upgradeTo「vX（骨架升级）」）；存量/未迁移（无 FRAMEWORK_VERSION）→ 回退旧链（AWF 代次 → 发布版 semver → scaffold_version），outdated 时 upgradeTo 带「骨架版本迁移，awf upgrade 补写」提示；**技能版本 = kit VERSION（skillVersion 字段）独立展示，技能差量不触发 outdated**——技能更新后项目不再被判"需要全量升级"。
5. **AWF_VERSION 常量保留**（bin/awf:11，值 1）：角色收敛为 AGENTS.md 入口代次标记与 digest 机制输入，升级判定角色移交 FRAMEWORK_VERSION；不得删除（AGENTS.md `<!-- awf:begin v1 -->` 依赖它）。
6. **存量迁移**：无 FRAMEWORK_VERSION 的项目首次 upgrade 自动补写（迁移）；10 个登记项目的迁移并入 v1.4.x 派发批次（DEV-194 合并，不在 kit 侧发版范围）。
7. init 生成项目 FRAMEWORK_VERSION = 源 kit 当前骨架版；check 对缺骨架版项目给软提示（不阻塞、不增加 FAIL）。

## 行为验证输出（DEV-205 团队实测摘要）

- `bash test/smoke.sh`=216/0；`bash test/upgrade.sh` 全绿（E/F/G/H 新场景：E version_file 目标写骨架版且锚点不被改写、F 默认目标、G 骨架相同已最新不触碰、H 存量迁移补写）；`cd dsh-plugin && node --test`=48/0。
- 最小复现：骨架相同 dry-run/执行「骨架已最新」、旧模板保留、不生成 VERSION；--force 强刷成功；预置 version_file=agent-workflow/VERSION(2.0.0) 与根 VERSION(9.9.9) 经 upgrade 后均保持原值；沙箱 DSH_HOME 重跑 install.sh → 实体 FRAMEWORK_VERSION=1.0.0。

## 坑

- 插件测试基线曾 40 pass 1 fail：DEV-179 陈旧断言仍在断言 DEV-182 已移除的阶段徽章（awf-stage-chip/seg）——历史遗留，同类"测试断言已退役 UI 元素"问题排查时先 grep 断言对应 class 是否还在生产代码。
## 补充（DEV-206）：插件版本信号读技能实体优先

- 插件 `kitVersions()` 的 skillVersion/latestFramework/latestAWF 一律**技能实体优先**（`$DSH_HOME/skills/agent-workflow-scaffold/{VERSION,FRAMEWORK_VERSION,bin/awf}`，install.sh 同步，= 安装后唯一事实源，与 upgrade 的 KFF/KVF 同构），未安装/不可读回退 kit 仓库——插件显示的技能版本 = 本机实际生效技能版本，实体存在时 kit 未登记也不影响显示/判定。
- **实体结构注意**：install.sh 把 `agent-workflow/VERSION` → 实体根 `VERSION`、`agent-workflow/FRAMEWORK_VERSION` → 实体根 `FRAMEWORK_VERSION`、`bin/awf` → 实体根 `bin/awf`（实体没有 agent-workflow/ 子目录）——插件读实体时不能用 `readProjectFrameworkVersion(entity)`（它拼 `agent-workflow/FRAMEWORK_VERSION` 路径），按实体根直读。
- 测试：受控 DSH_AGENTS_HOME + DSH_HOME 双环境变量夹具（模块级 AGENTS_HOME 须 import 前设置；DSH_HOME 在调用时读，import 后设置即可）；用例覆盖「实体 > kit 优先」与「空实体回退 kit」。
