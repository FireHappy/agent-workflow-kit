# gitignore 忽略本机私有工作流（init --gitignore / awf gitignore）

- 背景：团队项目共享仓库不想把本机私有 agent 工作流提交入库（[DEV-175]）。优化 init 流程，新增 `--gitignore`，并给存量项目补 `awf gitignore` 子命令。
- 结论：
  - 忽略范围 = `/agent-workflow/`、`/AGENTS.md`、`/CLAUDE.md` 三条**根锚定**路径（绝对路径前缀 `/`，只匹配仓库根，不误伤子目录同名文件）。
  - 幂等实现：忽略块带**固定标记行**（`# agent-workflow（本机私有工作流，不入库）`），写前 `grep -qF` 判定已存在则跳过——重复 `init --force` / 重复 `awf gitignore` 都不重复追加。
  - `.gitignore` 末尾无换行：先补一行再追加（`[ -s f ] && [ -n "$(tail -c 1 f)" ]` 判定，bash 3.2 兼容），避免忽略块粘连在上一行末尾。
  - 已跟踪文件不受 .gitignore 影响：若 AGENTS.md 已被团队提交过，忽略行只影响后续未跟踪文件，不会把已入库文件"变没"——这正是团队项目想要的语义。
- 验证：`bash test/smoke.sh`（新增 gitignore 场景 9 条）+ `./agent-workflow/check_workflow.sh` + `bash -n bin/awf` 全过；手工验证 init/幂等/存量补写/无换行/非 awf 项目拒绝 5 场景。
- 关联任务：DEV-175（done）；改 `bin/awf`（source）后必须 `cp bin/awf agent-workflow/bin/awf` 同步双副本，否则 check 漂移门禁 FAIL。