# AgentTeams 安装与验证记录（2026-10-31）

## 结论：已安装并验证可用

- 插件：`@nanmicoder/dsh-agent-teams@0.1.28`，宿主 0.2.1-rc.5
- profile：`headless` 与 `desktop` 均写入 `bundles`（备份 `package.json.bak` / `cordis.patch.yml.bak`）
- 验证证据：
  - `/plugins/dsh-agent-teams/state` 带认证返回 `{"teams":[]}`，未知插件路由为 404
  - GUI 首页注入 `@nanmicoder/dsh-agent-teams/client.js`
  - 实际跑完一场 3 成员只读审阅团队（hello-demo，t3/t4/t5），结束后已归档

## 已知偏差（已写进流程）

- 桌面端 profile 由 app 独占管理，CLI 不能 boot；插件用 `dsh plugin --profile desktop add` 安装后重启 app 生效
- `headless` profile 装了插件但模型请求被 `ACCOUNT_SIGN_IN_REQUIRED` 阻止，仅 GUI 可用
- `.agent-teams/` 属运行时状态，已加入 kit `.gitignore`

## 回退

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile headless remove @nanmicoder/dsh-agent-teams
cp ~/.dsh/profiles/desktop/package.json.bak ~/.dsh/profiles/desktop/package.json
cp ~/.dsh/profiles/desktop/cordis.patch.yml.bak ~/.dsh/profiles/desktop/cordis.patch.yml
```

> 本文件为当日 cache；一周内无补充可转入 `memory/history/` 或删除。
