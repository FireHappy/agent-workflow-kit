# 全局状态摘要

<!-- awf:status:begin -->
> 本区块由 `agent-workflow/bin/awf status` 生成，请勿手改。
> 数据来源：`tasks/*/current.md`、`tasks/*/todo.md`、`tasks/*/done.md`。

## 当前进行中

（无）

## 待处理

（无）

## 最近完成

| 工作流 | 任务ID | 优先级 | 描述 | 完成日期 |
|--------|--------|--------|------|----------|
| dev | DEV-126 | P1 | release-prep 0.9.0：一键发版装配 | 2026-11-04 |
| dev | DEV-125 | P0 | 发版 v0.9.0（DEV-115~124 批次）：VERSION 0.8.0→0.9.0、CHANGELOG [0.9.0] 段、本地 tag v0.9.0、release-prep 装配；check 全过 + smoke 双 locale 全绿 | 2026-11-04 |
| dev | DEV-124 | P2 | worker 经验/工具积累闭环：开工读 history + 收尾沉淀 memory/tools + check 软提示（不 FAIL）；三 locale smoke 166/0 | 2026-11-04 |
| dev | DEV-123 | P1 | 修复 --check-role 过度匹配：泛词停用表（31 词）+ 中文 2/3/4-gram 混合，领域词单命中即匹配；kit↔周报回归不匹配；三 locale smoke 160/0 | 2026-11-04 |
| dev | DEV-122 | P2 | 派发规则同步 role：三件套读 role 匹配候选 + 裁决理由必备项 + --check-role 软校验（警告不硬拒）；三场景实测 rc=0；三 locale smoke 157/0 | 2026-11-04 |
| dev | DEV-121 | P2 | init --role 初始化即登记能力名牌：模板 {{ROLE}} 占位 + 缺省保留空键（方案 B 兜底）+ 填写提示；三 locale smoke 151/0 | 2026-11-04 |
| dev | DEV-120 | P1 | 全局升级至 DEV-119 + 同步 role 名牌：周报/FinderPathBar 升级提交，pluto 升级落地（gitignore）；4 项目按规则跳过但 role 全写入（2 提交，pluto/naboo 无 commit 材料）；find/projects 带出全部角色 | 2026-11-04 |
| dev | DEV-119 | P1 | 修复 role 名牌不生效：模板移除空 role 键（方案 A）+ yaml_get 跳过空值键行（方案 B）；旧模板项目实测后填 role 立即带出；三 locale smoke 144/0 | 2026-11-04 |

*最后更新：2026-11-04 10:48*
<!-- awf:status:end -->
