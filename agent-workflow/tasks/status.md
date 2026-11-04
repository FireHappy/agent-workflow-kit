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
| dev | DEV-123 | P1 | 修复 --check-role 过度匹配：泛词停用表（31 词）+ 中文 2/3/4-gram 混合，领域词单命中即匹配；kit↔周报回归不匹配；三 locale smoke 160/0 | 2026-11-04 |
| dev | DEV-122 | P2 | 派发规则同步 role：三件套读 role 匹配候选 + 裁决理由必备项 + --check-role 软校验（警告不硬拒）；三场景实测 rc=0；三 locale smoke 157/0 | 2026-11-04 |
| dev | DEV-121 | P2 | init --role 初始化即登记能力名牌：模板 {{ROLE}} 占位 + 缺省保留空键（方案 B 兜底）+ 填写提示；三 locale smoke 151/0 | 2026-11-04 |
| dev | DEV-120 | P1 | 全局升级至 DEV-119 + 同步 role 名牌：周报/FinderPathBar 升级提交，pluto 升级落地（gitignore）；4 项目按规则跳过但 role 全写入（2 提交，pluto/naboo 无 commit 材料）；find/projects 带出全部角色 | 2026-11-04 |
| dev | DEV-119 | P1 | 修复 role 名牌不生效：模板移除空 role 键（方案 A）+ yaml_get 跳过空值键行（方案 B）；旧模板项目实测后填 role 立即带出；三 locale smoke 144/0 | 2026-11-04 |
| dev | DEV-118 | P2 | worker 名牌：project.yaml 可选 role 字段，find/projects/register 寻址带出（缺省回退 name，yaml 单一事实源）；三 locale smoke 140/0 | 2026-11-04 |
| dev | DEV-117 | P1 | locale 中文解析修复（awfk LC_ALL=C 包装）+ smoke 并入日常门禁（--with-smoke + pre-commit 钩子）；三 locale 下 smoke 135/0，钩子拒脏提交验证通过 | 2026-11-04 |
| dev | DEV-116 | P1 | 全局框架升级至 DEV-115 激活式 Router：周报/pluto/FinderPathBar 升级（2 提交，pluto 框架被 gitignore）；uxrsample/openxr-uxr/dsh-settings/naboo 按规则跳过（改动或在途任务） | 2026-11-04 |

*最后更新：2026-11-04 09:48*
<!-- awf:status:end -->
