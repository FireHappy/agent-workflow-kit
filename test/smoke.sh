#!/usr/bin/env bash
# awf-kit 冒烟测试：在临时目录验证 init / check / status / bootstrap / --force
set -eu

KIT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export DSH_AGENTS_HOME="$TMP/agents"

PROJ="$TMP/proj"
mkdir -p "$PROJ"

pass=0
fail=0

ok() { pass=$((pass + 1)); printf 'ok    %s\n' "$*"; }
bad() { fail=$((fail + 1)); printf 'FAIL  %s\n' "$*"; }

assert_file() { [ -f "$1" ] && ok "存在 $2" || bad "缺少 $2"; }
assert_grep() { grep -q "$1" "$2" && ok "$3" || bad "$3"; }

# 1. init
"$KIT_DIR/bin/awf" init "$PROJ" --name "冒烟项目" --purpose "验证脚手架" >/dev/null
assert_file "$PROJ/AGENTS.md" "AGENTS.md"
assert_file "$PROJ/agent-workflow/project.yaml" "project.yaml"
assert_file "$PROJ/agent-workflow/bin/awf" "bin/awf"
assert_file "$PROJ/agent-workflow/tasks/status.md" "status.md"
assert_grep 'awf:begin v1 digest:' "$PROJ/AGENTS.md" "入口含 digest"
assert_grep '（未配置' "$PROJ/AGENTS.md" "空校验命令有回退提示"
assert_file "$PROJ/agent-workflow/workflows/cross-project.md" "cross-project 工作流"
assert_file "$PROJ/agent-workflow/workflows/release.md" "release 工作流"
assert_file "$PROJ/agent-workflow/bin/awf-dispatch" "awf-dispatch"
assert_grep '跨项目' "$PROJ/AGENTS.md" "入口含跨项目路由"

# 1.1 派发器：help / --team 任务包注入 / handoff / 无工作流前置检查
"$PROJ/agent-workflow/bin/awf-dispatch" --help >/dev/null && ok "awf-dispatch --help" || bad "awf-dispatch --help 失败"
if "$PROJ/agent-workflow/bin/awf-dispatch" --help 2>&1 | grep -q -- '--team'; then
  ok "--help 列出 --team"
else
  bad "--help 未列出 --team"
fi
if "$PROJ/agent-workflow/bin/awf-dispatch" --help 2>&1 | grep -q 'AgentTeams'; then
  ok "--help 说明 AgentTeams 语义"
else
  bad "--help 未说明 AgentTeams 语义"
fi

# 1.2 默认异步：--help 含 --wait / --no-wait 兼容别名，并写清默认不等待
help_text="$("$PROJ/agent-workflow/bin/awf-dispatch" --help 2>&1)"
if printf '%s\n' "$help_text" | grep -Eq -- '(^|[[:space:]])--wait([[:space:]]|$)'; then
  ok "--help 列出 --wait"
else
  bad "--help 未列出 --wait"
fi
if printf '%s\n' "$help_text" | grep -q -- '--no-wait'; then
  ok "--help 保留 --no-wait 兼容别名"
else
  bad "--help 未保留 --no-wait"
fi
if printf '%s\n' "$help_text" | grep -q '默认不等待'; then
  ok "--help 写清默认不等待"
else
  bad "--help 未写清默认不等待"
fi

# 1.3 --prune：help 同步归档参数与目录语义
if printf '%s\n' "$help_text" | grep -q -- '--prune'; then
  ok "--help 列出 --prune"
else
  bad "--help 未列出 --prune"
fi
if printf '%s\n' "$help_text" | grep -q -- '--apply'; then
  ok "--help 列出 --apply"
else
  bad "--help 未列出 --apply"
fi
if printf '%s\n' "$help_text" | grep -q 'dispatch/archive'; then
  ok "--help 说明归档目录"
else
  bad "--help 未说明归档目录"
fi

# 1.3b 会话复用：help 参数与选择函数（项目+模块复用键、不看压力、running 等待、--session 互斥）
for flag in --reuse --new --session --idle-wait --module; do
  if printf '%s\n' "$help_text" | grep -Eq -- "(^|[[:space:]])${flag}([[:space:]]|=|$)"; then
    ok "--help 列出 ${flag}"
  else
    bad "--help 未列出 ${flag}"
  fi
done
if printf '%s\n' "$help_text" | grep -q '复用'; then
  ok "--help 说明会话复用"
else
  bad "--help 未说明会话复用"
fi
if printf '%s\n' "$help_text" | grep -q '\[awf\]'; then
  ok "--help 说明 [awf] 标题约定"
else
  bad "--help 未说明 [awf] 标题约定"
fi
if printf '%s\n' "$help_text" | grep -q '疑似僵尸'; then
  ok "--help 说明僵尸会话与退出码 4"
else
  bad "--help 未说明僵尸会话判定"
fi
if printf '%s\n' "$help_text" | grep -q '未落地'; then
  ok "--help 说明回合结束后的落地检查"
else
  bad "--help 未说明落地检查"
fi
# 1.4 release-prep：help / 参数校验 / dry-run / 临时目录装配（不碰真实仓库）
rp_help="$("$PROJ/agent-workflow/bin/awf" release-prep --help 2>&1)"
if printf '%s\n' "$rp_help" | grep -q 'release-prep <X.Y.Z>'; then
  ok "release-prep --help 打印用法"
else
  bad "release-prep --help 未打印用法"
fi
if printf '%s\n' "$rp_help" | grep -q -- '--dry-run'; then
  ok "release-prep --help 列出 --dry-run"
else
  bad "release-prep --help 未列出 --dry-run"
fi
if printf '%s\n' "$rp_help" | grep -q '不自动 commit'; then
  ok "release-prep --help 声明不自动 commit/tag/push"
else
  bad "release-prep --help 未声明不自动 commit"
fi

bad_ver_out=""
if bad_ver_out="$("$PROJ/agent-workflow/bin/awf" release-prep 1.2 2>&1)"; then
  bad "release-prep 接受了非法版本号 1.2"
else
  ok "release-prep 拒绝非法版本号"
fi
if printf '%s\n' "$bad_ver_out" | grep -q 'X.Y.Z'; then
  ok "release-prep 非法版本号打印用法"
else
  bad "release-prep 非法版本号未打印用法"
fi
if "$PROJ/agent-workflow/bin/awf" release-prep >/dev/null 2>&1; then
  bad "release-prep 缺少版本号仍成功"
else
  ok "release-prep 缺少版本号退出非 0"
fi

make_release_fixture() {
  local dir="$1"
  mkdir -p "$dir/agent-workflow/tasks/dev" "$dir/bin" "$dir/agent-workflow/bin" "$dir/test"
  printf 'id: release-test\n' > "$dir/agent-workflow/project.yaml"
  printf '0.0.1\n' > "$dir/VERSION"
  {
    printf '# Changelog\n\n'
    printf '## [Unreleased]\n\n### Added\n- 待发版条目\n\n'
    printf '## [0.0.1] - 2026-01-01\n'
  } > "$dir/CHANGELOG.md"
  printf '# 正在开发\n' > "$dir/agent-workflow/tasks/dev/current.md"
  {
    printf '# 已完成\n\n'
    printf '| 任务ID | 优先级 | 描述 | 完成日期 |\n'
    printf '|--------|--------|------|----------|\n'
    printf '| DEV-007 | P1 | 旧任务 | 2026-10-01 |\n'
  } > "$dir/agent-workflow/tasks/dev/done.md"
  printf '#!/bin/sh\nexit 0\n' > "$dir/bin/awf"
  printf '#!/bin/sh\nexit 0\n' > "$dir/agent-workflow/bin/awf"
  printf '#!/bin/sh\nexit 0\n' > "$dir/agent-workflow/check_workflow.sh"
  printf '#!/bin/sh\nexit 0\n' > "$dir/test/smoke.sh"
  chmod +x "$dir/bin/awf" "$dir/agent-workflow/bin/awf" \
    "$dir/agent-workflow/check_workflow.sh" "$dir/test/smoke.sh"
}

REL_DRY="$TMP/release-dry"
make_release_fixture "$REL_DRY"
dry_out="$("$PROJ/agent-workflow/bin/awf" release-prep --root "$REL_DRY" 0.4.2 --dry-run 2>&1)"
if printf '%s\n' "$dry_out" | grep -q 'init . --force --no-register'; then
  ok "release-prep --dry-run 打印 init 动作"
else
  bad "release-prep --dry-run 未打印 init 动作"
fi
if printf '%s\n' "$dry_out" | grep -q 'bootstrap'; then
  ok "release-prep --dry-run 打印 bootstrap 动作"
else
  bad "release-prep --dry-run 未打印 bootstrap 动作"
fi
if [ "$(cat "$REL_DRY/VERSION")" = "0.0.1" ] \
  && [ "$(grep -c 'Unreleased' "$REL_DRY/CHANGELOG.md")" = "1" ] \
  && ! grep -q 'release-prep 0.4.2' "$REL_DRY/agent-workflow/tasks/dev/current.md"; then
  ok "release-prep --dry-run 不修改文件"
else
  bad "release-prep --dry-run 修改了文件"
fi

REL="$TMP/release-real"
make_release_fixture "$REL"
if rel_out="$("$PROJ/agent-workflow/bin/awf" release-prep --root "$REL" 0.4.2 2>&1)"; then
  ok "release-prep 临时目录装配成功"
else
  bad "release-prep 临时目录装配失败：$rel_out"
fi
if [ "$(cat "$REL/VERSION")" = "0.4.2" ]; then
  ok "release-prep 写入 VERSION"
else
  bad "release-prep 未写入 VERSION"
fi
if grep -q '^## \[0.4.2\] - ' "$REL/CHANGELOG.md" && ! grep -q '^## \[Unreleased\]' "$REL/CHANGELOG.md"; then
  ok "release-prep 把 Unreleased 替换为版本标题"
else
  bad "release-prep 未正确替换 Unreleased"
fi
if grep -q 'DEV-008' "$REL/agent-workflow/tasks/dev/done.md" \
  && grep -q 'release-prep 0.4.2' "$REL/agent-workflow/tasks/dev/done.md"; then
  ok "release-prep 自动取下一个 ID 并归档"
else
  bad "release-prep 未归档账本或 ID 不正确"
fi
if ! grep -q 'release-prep 0.4.2' "$REL/agent-workflow/tasks/dev/current.md"; then
  ok "release-prep 归档后清理 current.md"
else
  bad "release-prep 归档后仍残留 current.md 块"
fi
if printf '%s\n' "$rel_out" | grep -q 'git tag -a v0.4.2' \
  && printf '%s\n' "$rel_out" | grep -q 'git push origin main v0.4.2' \
  && printf '%s\n' "$rel_out" | grep -q 'release: v0.4.2（DEV-008）'; then
  ok "release-prep 打印 commit/tag/push 下一步与建议消息"
else
  bad "release-prep 下一步提示不完整"
fi
idem_out="$("$PROJ/agent-workflow/bin/awf" release-prep --root "$REL" 0.4.2 2>&1)"
if [ "$(grep -c 'release-prep 0.4.2' "$REL/agent-workflow/tasks/dev/done.md")" = "1" ] \
  && printf '%s\n' "$idem_out" | grep -q '幂等'; then
  ok "release-prep 重复执行幂等"
else
  bad "release-prep 重复执行产生了重复账本"
fi

# 没有 Unreleased 且没有目标版本：提示手动，不报错
printf '# Changelog\n' > "$REL/CHANGELOG.md"
manual_out="$("$PROJ/agent-workflow/bin/awf" release-prep --root "$REL" 0.4.3 2>&1)"
if printf '%s\n' "$manual_out" | grep -q '手动'; then
  ok "release-prep 无 Unreleased 时提示手动"
else
  bad "release-prep 无 Unreleased 时未提示手动"
fi

if python3 - "$KIT_DIR/bin/awf-dispatch" <<'PY'
import contextlib
import importlib.machinery
import importlib.util
import inspect
import io
import json
import pathlib
import subprocess
import sys
import tempfile
import time

source = pathlib.Path(sys.argv[1])
loader = importlib.machinery.SourceFileLoader("awf_dispatch_reuse_under_test", str(source))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)

target = pathlib.Path("/tmp/awf-reuse-project")


def row(session_id, cwd=str(target), running=False, blank=False, title="",
        tokens=None, window=None, updated=0):
    values = {"title": title}
    if tokens is not None or window is not None:
        values["contextPressure"] = {"pressureTokens": tokens, "contextWindow": window}
    return {
        "sessionId": session_id,
        "cwd": cwd,
        "running": running,
        "blank": blank,
        "updatedAt": updated,
        "projections": {"values": values, "asOfSeq": 1},
    }


assert module.DEFAULT_REUSE is True, "默认必须复用"
assert module.ZOMBIE_TURN_SECONDS == 5.0, "僵尸判定阈值必须是 5s"
assert module.LANDING_POLL_SECONDS == 10.0, "落地轮询间隔必须是 10s"
assert (module.EXIT_OK, module.EXIT_FAIL, module.EXIT_TIMEOUT, module.EXIT_ZOMBIE,
        module.EXIT_HEADLESS_FAIL) == (0, 2, 3, 4, 5), \
    "退出码契约：5 是 headless 子进程非零退出（独立于 3 的超时/未落地）"
assert module.PRESSURE_HINT_LIMIT == 0.9, "压力只作 0.9 提示，不再作为轮换阈值"
assert module.DEFAULT_IDLE_WAIT == 300, "running 等待默认 300s"
assert module.MODULE_DEFAULT == "通用", "默认模块必须是「通用」"

project = target.name
title = module.awf_session_title(project, "工作流")
assert title == f"[awf] {project} · 工作流", title
assert module.awf_session_title(project, "") == f"[awf] {project} · 通用"

# 模块来源：--module > 票据「模块：」行 > 默认「通用」
ticket = "任务：TEST-001\n\n- 目标项目：proj（/tmp/proj）\n- 模块：工作流\n"
assert module.ticket_module(ticket) == "工作流"
assert module.ticket_module("任务：TEST-001\n") == ""
assert module.resolve_module(ticket) == "工作流"
assert module.resolve_module(ticket, "文档") == "文档", "--module 必须覆盖票据"
assert module.resolve_module("任务：TEST-001\n") == "通用"

# 模块相同 → 复用；模块不同 → 不复用（不借其它模块上下文）
same = row("s-same", title=title, updated=1)
other_module = row("s-other-module", title=module.awf_session_title(project, "文档"), updated=9)
assert module.select_reuse_session([same], target, "工作流")["sessionId"] == "s-same"
assert module.select_reuse_session([other_module], target, "工作流") is None, "不得复用其它模块会话"
assert module.select_reuse_session([same, other_module], target, "工作流")["sessionId"] == "s-same"

# 运行中的同模块会话也选中（由调用方等待空闲，不静默新建）
running_same = row("s-running", title=title, running=True, updated=99)
assert module.select_reuse_session([running_same], target, "工作流")["sessionId"] == "s-running"

# 同模块多个：先选空闲，再取 updatedAt 最新
older = row("s-old", title=title, updated=10)
newer = row("s-new", title=title, updated=20)
assert module.select_reuse_session([older, newer], target, "工作流")["sessionId"] == "s-new"
assert module.select_reuse_session([older, running_same], target, "工作流")["sessionId"] == "s-old"

# 旧格式标题（无 [awf]）：默认不再自动迁移（RT-1，防误吞用户自建会话）；
# 只有 legacy_probe 确认（显式放行 / 消息含派发任务包标记）才复用；多条不猜；运行中不迁移
legacy = row("s-legacy", title=f"{project} · 旧任务")
assert module.is_legacy_session_title(f"{project} · 旧任务", project)
assert not module.is_legacy_session_title(title, project)
assert module.select_reuse_session([legacy], target, "工作流") is None, \
    "默认不得复用以 <项目> · 开头的用户普通会话（RT-1）"
assert module.reuse_rename_needed(legacy, title), "旧格式标题复用后必须改名"
assert not module.reuse_rename_needed(same, title)
assert module.select_reuse_session([legacy], target, "工作流",
                                   legacy_probe=lambda r: True)["sessionId"] == "s-legacy", \
    "probe 确认（--allow-legacy-reuse / 含派发标记）才迁移单一旧格式会话"
assert module.select_reuse_session([legacy], target, "工作流",
                                   legacy_probe=lambda r: False) is None, \
    "probe 拒绝（无派发标记）不得迁移"
legacy2 = row("s-legacy2", title=f"{project} · 另一个旧任务")
assert module.select_reuse_session([legacy, legacy2], target, "工作流",
                                   legacy_probe=lambda r: True) is None, "多条旧格式不得猜"
assert module.select_reuse_session([row("s-legacy-run", title=f"{project} · 旧", running=True)],
                                   target, "工作流", legacy_probe=lambda r: True) is None
# 项目已有规范会话时，旧格式也不迁移（避免串模块）
assert module.select_reuse_session([other_module, legacy], target, "工作流",
                                   legacy_probe=lambda r: True) is None

# 不兜底复用普通用户会话；不同 cwd / blank 跳过；无候选返回 None
assert module.select_reuse_session([row("s-user", title="用户的会话")], target, "工作流") is None
assert module.select_reuse_session([row("s-other", cwd="/tmp/other", title=title)],
                                   target, "工作流") is None
assert module.select_reuse_session([row("s-blank", blank=True, title=title)],
                                   target, "工作流") is None
assert module.select_reuse_session([], target, "工作流") is None

# 压力不参与筛选（上下文是开发资产）：高压力会话仍被选中，只给提示
high = row("s-high", title=title, tokens=950, window=1000)
assert module.select_reuse_session([high], target, "工作流")["sessionId"] == "s-high", "高压力会话不得被跳过"
hint = module.pressure_hint(high)
assert hint and "--new" in hint and "可考虑" in hint, hint
assert module.pressure_hint(row("s-low", tokens=500, window=1000)) == "", "低压力不得提示"

# 标题约定：[awf] <项目名> · <模块名>（模块截断 40 字）
assert module.awf_session_title("proj", "x" * 50) == "[awf] proj · " + "x" * 40


class FakeApi:
    """只实现 sessions()，模拟 session/list 轮询（不触碰真实会话）。"""

    def __init__(self, sequence):
        self.sequence = list(sequence)
        self.calls = 0

    def sessions(self):
        self.calls += 1
        return self.sequence[min(self.calls - 1, len(self.sequence) - 1)]


def turn(running):
    return {"sessionId": "s-awf", "running": running, "blank": False}


# running=true：轮询到空闲后返回
polling = FakeApi([[turn(True)], [turn(True)], [turn(False)]])
row_idle = module.wait_for_idle(polling, "s-awf", timeout=5, interval=0.01)
assert row_idle is not None and row_idle["running"] is False and polling.calls == 3

# 持续运行：超时返回 None（调用方据此报「等待超时」并建议 --new / 加大 --idle-wait）
stuck = FakeApi([[turn(True)]])
assert module.wait_for_idle(stuck, "s-awf", timeout=0.05, interval=0.01) is None

# 轮询中会话消失/被归档：返回 SESSION_GONE（与超时区分，调用方提示重新派发）
missing = FakeApi([[{"sessionId": "other", "running": False}]])
assert module.wait_for_idle(missing, "s-awf", timeout=0.05, interval=0.01) is module.SESSION_GONE

# 派发主流程（mock API，不接触真实会话）：同模块复用 / 异模块新建 / 旧标题改名 / running 等待
import argparse

module.time.sleep = lambda _seconds: None  # wait_for_idle 在测试里不真等


class FakeDispatchApi:
    def __init__(self, rows, idle_after=None, page=None, mark_updated=False):
        self.rows = rows
        self.idle_after = idle_after
        self.page = page if page is not None else {"records": []}
        self.mark_updated = mark_updated
        self.calls = 0
        self.created = []
        self.renamed = []
        self.prompts = []

    def sessions(self):
        self.calls += 1
        if self.idle_after is not None:
            running = self.calls < self.idle_after
            for item in self.rows:
                item["running"] = running
        if self.mark_updated:
            now_ms = int(time.time() * 1000)
            for item in self.rows:
                item["updatedAt"] = now_ms
        return self.rows

    def rpc(self, method, params, timeout=30):
        if method != "session/page":
            raise module.DispatchError(f"未知 RPC：{method}")
        return self.page

    def create_session(self, workspace_id):
        created = row(f"s-created-{len(self.created) + 1}", title="")
        self.rows.append(created)
        self.created.append(created["sessionId"])
        return {"sessionId": created["sessionId"]}

    def rename(self, session_id, new_title):
        # 只记录，不原地改 rows（row 是快照）；改名后的输出必须由 dispatch_session 用新标题。
        self.renamed.append((session_id, new_title))

    def prompt(self, session_id, text, request_id):
        self.prompts.append((session_id, text))


class NoListApi(FakeDispatchApi):
    """--new 不应调用 session/list：一旦调用就失败。"""

    def sessions(self):
        raise module.DispatchError("session/list 不可用（--new 不应调用）")


class VanishApi(FakeDispatchApi):
    """轮询中会话消失：sessions() 在指定次数后返回空列表。"""

    def __init__(self, rows, disappear_after):
        super().__init__(rows)
        self.disappear_after = disappear_after

    def sessions(self):
        self.calls += 1
        if self.calls >= self.disappear_after:
            return []
        return self.rows


def preflight_stub(api, sessions=True):
    def stub(target, args, need_channel):
        rows = api.sessions() if sessions else []
        return {
            "api": api,
            "workspace": {"title": "w", "workspaceId": "id"},
            "sessions": rows,
        }
    return stub


def _args(**overrides):
    values = dict(
        session="", reuse=True, module="", title="", wait=False, timeout=600,
        idle_wait=300, force=False, team=False, json=False, headless=False,
        handoff=False, dry_run=False, add_workspace=False, allow_dirty=False,
        allow_active=False, apply=False, prune=False, web_url="",
        allow_legacy_reuse=False,
    )
    values.update(overrides)
    return argparse.Namespace(**values)


def run_dispatch(api, task_module, idle_wait=300, force=False, reuse=True,
                 json_mode=False, expect_error=False, sessions_in_preflight=True,
                 allow_legacy=False):
    logs = []
    output = io.StringIO()
    original = (module.preflight, module.append_log, module.emit)
    module.preflight = preflight_stub(api, sessions_in_preflight)
    module.append_log = lambda entry: logs.append(entry) or pathlib.Path("/tmp/awf-dispatch-log.md")
    module.emit = lambda message, json_mode=False: None
    text = (
        f"任务：TEST-001 冒烟\n\n- 目标项目：{project}（{target}）\n"
        f"- 模块：{task_module}\n"
    )
    args = _args(reuse=reuse, idle_wait=idle_wait, force=force, json=json_mode,
                 allow_legacy_reuse=allow_legacy)
    try:
        with contextlib.redirect_stdout(output):
            try:
                code = module.dispatch_session(
                    target, pathlib.Path("/tmp/TEST-001-task.md"), text,
                    f"{project} · TEST-001", "dev", args,
                )
            except module.DispatchError as error:
                if not expect_error:
                    raise
                return str(error)
    finally:
        module.preflight, module.append_log, module.emit = original
    if expect_error:
        raise AssertionError("预期派发失败但成功了")
    assert code == 0, code
    return logs, output.getvalue()


def run_wait_dispatch(api, task_module, timeout=30.0, landing="commit", landing_calls=None,
                      repo=None, expect_error=False):
    logs = []
    output = io.StringIO()
    dispatch_target = repo or target
    original = (module.preflight, module.append_log, module.emit, module.wait_for_landing)
    module.preflight = preflight_stub(api)
    module.append_log = lambda entry: logs.append(entry) or pathlib.Path("/tmp/awf-dispatch-log.md")
    module.emit = lambda message, json_mode=False: None

    def fake_landing(target_arg, task_id, initial_head, remaining):
        if landing_calls is not None:
            landing_calls.append(
                {"task_id": task_id, "initial_head": initial_head, "timeout": remaining}
            )
        return landing

    module.wait_for_landing = fake_landing
    text = (
        f"任务：TEST-001 冒烟\n\n- 目标项目：{project}（{target}）\n"
        f"- 模块：{task_module}\n"
    )
    args = _args(wait=True, timeout=timeout, json=True)
    try:
        with contextlib.redirect_stdout(output):
            try:
                code = module.dispatch_session(
                    dispatch_target, pathlib.Path("/tmp/TEST-001-task.md"), text,
                    f"{project} · TEST-001", "dev", args,
                )
            except module.DispatchError as error:
                if not expect_error:
                    raise
                return str(error), logs, output.getvalue()
    finally:
        (module.preflight, module.append_log, module.emit,
         module.wait_for_landing) = original
    if expect_error:
        raise AssertionError("预期派发失败但成功了")
    return code, logs, output.getvalue()


# --- 0.4.2 可靠性：回合耗时 / 活动证据 / 落地判定（纯函数 + mock） ---
prompt_ms = int(time.time() * 1000)
fast = FakeApi([[row("s-awf", updated=prompt_ms + 1)]])
fast_row, fast_seconds = module.wait_for_turn(fast, "s-awf", prompt_ms, timeout=0.2, json_mode=True)
assert fast_row is not None and fast_seconds is not None and fast_seconds < 5, fast_seconds

observed = FakeApi([[row("s-awf", running=True)], [row("s-awf", updated=prompt_ms + 1)]])
observed_row, observed_seconds = module.wait_for_turn(
    observed, "s-awf", prompt_ms, timeout=0.2, json_mode=True)
assert observed_row is not None and observed_seconds is not None and observed_seconds >= 0


class PageApi:
    def __init__(self, page):
        self.page = page

    def rpc(self, method, params, timeout=30):
        return self.page


class BrokenPageApi:
    def rpc(self, method, params, timeout=30):
        raise module.DispatchError("page 不可用")


def activity_row():
    value = row("s-act")
    value["projections"]["asOfSeq"] = 1
    return value


def event(kind, data, seq=1, stamp=None):
    return {"event": {"type": kind, "seq": seq, "time": stamp or prompt_ms, "data": data}}


empty_activity = module.turn_activity(PageApi({"records": []}), activity_row())
assert empty_activity["available"] and not empty_activity["has_output"] and not empty_activity["has_tool"]
assert empty_activity["turn_ended"] is False

text_activity = module.turn_activity(PageApi({"records": [
    event("turn/end", {"turn": 1}, seq=3, stamp=prompt_ms + 2),
    event("assistant/message",
          {"turn": 1, "message": {"content": [{"type": "text", "text": "完成"}]}},
          seq=2, stamp=prompt_ms + 1),
]}), activity_row())
assert text_activity["has_output"] and text_activity["text"] == "完成"
assert text_activity["turn_ended"] is True

tool_activity = module.turn_activity(PageApi({"records": [
    event("turn/end", {"turn": 1}, seq=3, stamp=prompt_ms + 2),
    event("tool/call", {"turn": 1, "name": "bash"}, seq=2, stamp=prompt_ms + 1),
]}), activity_row())
assert tool_activity["has_tool"] and not tool_activity["has_output"]
assert tool_activity["turn_ended"] is True

# 历史回合的文本/工具调用不能算到本回合（否则僵尸会被历史掩盖）
history_activity = module.turn_activity(PageApi({"records": [
    event("assistant/message",
          {"turn": 1, "message": {"content": [{"type": "text", "text": "上一回合"}]}},
          seq=2, stamp=prompt_ms - 3000),
    event("tool/call", {"turn": 1, "name": "bash"}, seq=3, stamp=prompt_ms - 2000),
    event("turn/end", {"turn": 2}, seq=5, stamp=prompt_ms + 1),
]}), activity_row())
assert not history_activity["has_output"] and not history_activity["has_tool"], history_activity
unreadable = module.turn_activity(BrokenPageApi(), activity_row())
assert unreadable["available"] is False, "读不到记录时不能判僵尸"

orig_sha, orig_ledger, orig_cmrange = module.git_head_sha, module.ledger_has_id, module.commit_range_has_id
try:
    module.commit_range_has_id = lambda target, task_id, since_sha: task_id == "TEST-001"
    heads = iter(["aaa", "aaa", "bbb"])
    module.git_head_sha = lambda target: next(heads)
    module.ledger_has_id = lambda target, task_id: False
    assert module.wait_for_landing(
        target, "TEST-001", "aaa", timeout=0.5, interval=0.01) == "commit"

    # RT-3：区间内无本任务 commit（全部无关 commit）→ 不判落地
    module.git_head_sha = lambda target: "bbb"
    module.commit_range_has_id = lambda target, task_id, since_sha: False
    assert module.wait_for_landing(
        target, "TEST-001", "aaa", timeout=0.05, interval=0.01) is None, \
        "无关 commit 不得判落地（RT-3）"
    # RT-3 区间归因：任务 commit 落地后被无关 commit 压顶，区间内仍含任务 ID → 判落地
    module.commit_range_has_id = lambda target, task_id, since_sha: task_id == "TEST-001"
    assert module.wait_for_landing(
        target, "TEST-001", "aaa", timeout=0.5, interval=0.01) == "commit", \
        "任务 commit 被压顶仍应判落地（RT-3 区间归因）"

    module.git_head_sha = lambda target: "aaa"
    module.ledger_has_id = lambda target, task_id: task_id == "TEST-001"
    assert module.wait_for_landing(
        target, "TEST-001", "aaa", timeout=0.5, interval=0.01) == "done"

    module.ledger_has_id = lambda target, task_id: False
    assert module.wait_for_landing(
        target, "TEST-001", "aaa", timeout=0.05, interval=0.01) is None

    # 轮询中途读取失败（None）不能当作 HEAD 变化
    module.git_head_sha = lambda target: None
    assert module.wait_for_landing(
        target, "TEST-001", "aaa", timeout=0.05, interval=0.01) is None
    failed_heads = iter([None, None, "bbb"])
    module.git_head_sha = lambda target: next(failed_heads)
    assert module.wait_for_landing(
        target, "TEST-001", "aaa", timeout=0.5, interval=0.01) == "commit"

    # 空仓库：初始 ""，首次 commit（消息含 ID）后应正常判 landed
    empty_heads = iter(["", "", "abc"])
    module.git_head_sha = lambda target: next(empty_heads)
    assert module.wait_for_landing(
        target, "TEST-001", "", timeout=0.5, interval=0.01) == "commit"

    # 初始 HEAD 不可用（None）：只能等归档，不能靠后续成功推断 commit
    module.git_head_sha = lambda target: "abc"
    assert module.wait_for_landing(
        target, "TEST-001", None, timeout=0.05, interval=0.01) is None
finally:
    module.git_head_sha, module.ledger_has_id, module.commit_range_has_id = (
        orig_sha, orig_ledger, orig_cmrange)


TEXT_PAGE = {"records": [
    {"event": {"type": "assistant/message", "seq": 2, "time": 4102444800000,
               "data": {"turn": 1,
                        "message": {"content": [{"type": "text", "text": "已完成并提交"}]}}}},
    {"event": {"type": "turn/end", "seq": 3, "time": 4102444800001,
               "data": {"turn": 1}}},
]}

# git_head_sha 三态：空仓库 ""、正常 sha、读取失败 None
with tempfile.TemporaryDirectory() as tmp:
    repo = pathlib.Path(tmp)
    assert module.git_head_sha(repo) is None, "非 git 目录必须返回 None"
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    assert module.git_head_sha(repo) == "", "空仓库（无 commit）必须返回空串"
    (repo / "a.txt").write_text("a", encoding="utf-8")
    subprocess.run(["git", "-C", str(repo), "add", "a.txt"], check=True)
    subprocess.run(
        ["git", "-C", str(repo), "-c", "user.email=smoke@test",
         "-c", "user.name=smoke", "commit", "-qm", "fix: TEST-001 落地"],
        check=True,
    )
    sha = module.git_head_sha(repo)
    assert isinstance(sha, str) and len(sha) == 40, sha
    assert module.commit_range_has_id(repo, "TEST-001", "") is True, "提交消息含任务 ID"
    assert module.commit_range_has_id(repo, "TEST-999", "") is False, "无关 ID 不得命中"
    assert module.wait_for_landing(
        repo, "TEST-001", "", timeout=0.1, interval=0.01) == "commit"
    assert module.git_head_sha(repo / "missing") is None

    # RT-3：无关 commit（提交消息不含任务 ID，如用户/其它会话的提交）不算本任务落地
    unrelated = pathlib.Path(tmp) / "unrelated"
    unrelated.mkdir()
    subprocess.run(["git", "init", "-q", str(unrelated)], check=True)
    (unrelated / "b.txt").write_text("b", encoding="utf-8")
    subprocess.run(["git", "-C", str(unrelated), "add", "b.txt"], check=True)
    subprocess.run(
        ["git", "-C", str(unrelated), "-c", "user.email=smoke@test",
         "-c", "user.name=smoke", "commit", "-qm", "chore: 用户无关提交"],
        check=True,
    )
    assert module.commit_range_has_id(unrelated, "TEST-001", "") is False
    assert module.wait_for_landing(
        unrelated, "TEST-001", "", timeout=0.1, interval=0.01) is None, \
        "无关 commit 不得判落地（RT-3）"


# 初始 HEAD 读取失败：git 仓库必须明确报错，且不发送任务
with tempfile.TemporaryDirectory() as tmp:
    broken_repo = pathlib.Path(tmp)
    (broken_repo / ".git").mkdir()
    broken_api = FakeDispatchApi(
        [row("s-broken", title=title)], mark_updated=True, page=TEXT_PAGE)
    real_sha = module.git_head_sha
    module.git_head_sha = lambda target: None
    try:
        broken_msg, _, _ = run_wait_dispatch(
            broken_api, "工作流", repo=broken_repo, expect_error=True)
    finally:
        module.git_head_sha = real_sha
    assert "初始 HEAD" in broken_msg and "落地判定不可靠" in broken_msg, broken_msg
    assert broken_api.prompts == [], "初始 HEAD 失败时不得发送任务"


# 目标不是 git 仓库：退回仅以 done.md 判定，不因无法读 HEAD 而中断
with tempfile.TemporaryDirectory() as tmp:
    plain_dir = pathlib.Path(tmp)
    plain_api = FakeDispatchApi(
        [row("s-plain", title=title)], mark_updated=True, page=TEXT_PAGE)
    plain_calls = []
    real_sha = module.git_head_sha
    module.git_head_sha = lambda target: None
    try:
        plain_code, _, _ = run_wait_dispatch(
            plain_api, "工作流", landing="done", landing_calls=plain_calls, repo=plain_dir)
    finally:
        module.git_head_sha = real_sha
    assert plain_code == 0, plain_code
    assert plain_calls and plain_calls[0]["initial_head"] is None, plain_calls


# 模块相同 → 复用，不新建
same_api = FakeDispatchApi([row("s-same", title=title)])
logs, _ = run_dispatch(same_api, "工作流")
assert same_api.created == [], "同模块应复用，不新建会话"
assert same_api.prompts and same_api.prompts[0][0] == "s-same", same_api.prompts
assert "会话来源：复用" in logs[0]
assert same_api.calls == 1, f"G4 探针与复用查找应合并为一次 session/list，实际 {same_api.calls} 次"

# 模块不同 → 不复用，新建本模块会话并改名
other_api = FakeDispatchApi([row("s-doc", title=module.awf_session_title(project, "文档"))])
logs, _ = run_dispatch(other_api, "工作流")
assert other_api.prompts and other_api.prompts[0][0] == "s-created-1", other_api.prompts
assert other_api.prompts[0][0] != "s-doc", "不得复用其它模块会话"
assert ("s-created-1", title) in other_api.renamed, other_api.renamed
assert "会话来源：新建" in logs[0]

# RT-1：用户自建旧格式会话（无派发任务包标记）不得被复用/改名/注入 → 新建
user_legacy_api = FakeDispatchApi([row("s-user-legacy", title=f"{project} · 用户的分析记录")])
logs, _ = run_dispatch(user_legacy_api, "工作流")
assert user_legacy_api.created == ["s-created-1"], "用户普通会话不得迁移复用，应新建"
assert all(sid != "s-user-legacy" for sid, _ in user_legacy_api.renamed), user_legacy_api.renamed
assert all(sid != "s-user-legacy" for sid, _ in user_legacy_api.prompts), user_legacy_api.prompts
assert "会话来源：新建" in logs[0]

# RT-1：会话消息含派发任务包标记 → 旧格式迁移复用并改名（旧版派发器留存的会话）
MARKER_PAGE = {"records": [{"event": {"type": "user/message", "seq": 1,
    "data": {"message": {"content": [{"type": "text",
        "text": "请执行下面的跨项目任务。\n----- 任务包开始 -----\n任务：TEST-001"}]}}}}]}
marker_api = FakeDispatchApi([row("s-legacy-marker", title=f"{project} · 旧任务")], page=MARKER_PAGE)
logs, _ = run_dispatch(marker_api, "工作流")
assert marker_api.created == [], "含派发任务包标记的旧格式会话应迁移复用"
assert ("s-legacy-marker", title) in marker_api.renamed, marker_api.renamed
assert marker_api.prompts and marker_api.prompts[0][0] == "s-legacy-marker", marker_api.prompts
assert f"（{title}）" in logs[0], logs[0]
assert f"（{project} · 旧任务）" not in logs[0], logs[0]
assert "会话来源：复用" in logs[0]

# RT-1：显式 --allow-legacy-reuse 无标记也迁移
forc_api = FakeDispatchApi([row("s-legacy-forc", title=f"{project} · 旧任务")])
logs, _ = run_dispatch(forc_api, "工作流", allow_legacy=True)
assert forc_api.created == [], "显式放行应迁移复用"
assert ("s-legacy-forc", title) in forc_api.renamed, forc_api.renamed
assert forc_api.prompts and forc_api.prompts[0][0] == "s-legacy-forc", forc_api.prompts

legacy_json_api = FakeDispatchApi([row("s-legacy-json", title=f"{project} · 旧任务")], page=MARKER_PAGE)
_, legacy_json = run_dispatch(legacy_json_api, "工作流", json_mode=True)
payload = json.loads(legacy_json)
assert payload["reused"] is True and payload["sessionId"] == "s-legacy-json", payload
assert payload["sessionTitle"] == title, payload

# running=true → 等空闲后再发送（不静默新建）
running_api = FakeDispatchApi([row("s-same", title=title, running=True)], idle_after=3)
logs, _ = run_dispatch(running_api, "工作流")
assert running_api.created == [], running_api.created
assert running_api.prompts and running_api.prompts[0][0] == "s-same", running_api.prompts

# --new 不碰 session/list：mock sessions() 抛错也应成功（不应报 G4 / 复用检查失败）
new_api = NoListApi([row("s-same", title=title)])
logs, _ = run_dispatch(new_api, "工作流", reuse=False, sessions_in_preflight=False)
assert new_api.created == ["s-created-1"], new_api.created
assert new_api.prompts and new_api.prompts[0][0] == "s-created-1", new_api.prompts
assert new_api.calls == 0, "显式 --new 不应调用 session/list"
assert "会话来源：新建" in logs[0]

# 自动路径的同名保护仍按原逻辑 gated：自动新建遇同名会话要 --force；--new 跳过
dup_rows = [
    row("s-dup", title=f"{project} · TEST-001"),
    row("s-dup-2", title=f"{project} · 另一个旧任务"),
]
dup_msg = run_dispatch(FakeDispatchApi(dup_rows), "工作流", expect_error=True)
assert "同名会话" in dup_msg and "--force" in dup_msg, dup_msg
forced_api = FakeDispatchApi(dup_rows)
forced_logs, _ = run_dispatch(forced_api, "工作流", force=True)
assert forced_api.created == ["s-created-1"], forced_api.created
assert "会话来源：新建" in forced_logs[0]

# 等待超时 vs 会话消失：两类错误分开（文案与恢复建议不同）
timeout_msg = run_dispatch(
    FakeDispatchApi([row("s-same", title=title, running=True)]),
    "工作流", idle_wait=0, expect_error=True,
)
assert "超时" in timeout_msg and "仍在运行" in timeout_msg, timeout_msg
assert "消失" not in timeout_msg, timeout_msg

gone_msg = run_dispatch(
    VanishApi([row("s-same", title=title, running=True)], disappear_after=3),
    "工作流", expect_error=True,
)
assert "消失" in gone_msg and "重新派发" in gone_msg, gone_msg
assert "超时" not in gone_msg, gone_msg



# --- 0.4.2 可靠性：--wait 僵尸 / 落地 / 未落地（dispatch_session 全流程 mock） ---

ZOMBIE_PAGE = {"records": [{"event": {
    "type": "turn/end", "seq": 2, "time": 4102444800000, "data": {"turn": 1},
}}]}
zombie_calls = []
zombie_api = FakeDispatchApi(
    [row("s-zombie", title=title)], mark_updated=True, page=ZOMBIE_PAGE)
zombie_code, zombie_logs, zombie_out = run_wait_dispatch(
    zombie_api, "工作流", landing="commit", landing_calls=zombie_calls)
zombie_payload = json.loads(zombie_out)
assert zombie_code == module.EXIT_ZOMBIE == 4, zombie_code
assert zombie_payload["zombie"] is True and zombie_payload["sessionId"] == "s-zombie"
assert "僵尸" in zombie_payload["message"] and "--new" in zombie_payload["message"]
assert "僵尸" in zombie_logs[0]
assert zombie_calls == [], "僵尸判定优先于落地轮询"

landing_calls = []
ok_api = FakeDispatchApi([row("s-ok", title=title)], mark_updated=True, page=TEXT_PAGE)
ok_code, ok_logs, ok_out = run_wait_dispatch(
    ok_api, "工作流", landing="commit", landing_calls=landing_calls)
ok_payload = json.loads(ok_out)
assert ok_code == module.EXIT_OK == 0, ok_code
assert ok_payload["status"] == "completed" and ok_payload["landed"] == "commit"
assert ok_payload["final"] == "已完成并提交"
assert "完成（已落地：commit）" in ok_logs[0]
assert landing_calls and landing_calls[0]["task_id"] == "TEST-001"

miss_api = FakeDispatchApi([row("s-miss", title=title)], mark_updated=True, page=TEXT_PAGE)
miss_code, miss_logs, miss_out = run_wait_dispatch(miss_api, "工作流", landing=None)
miss_payload = json.loads(miss_out)
assert miss_code == module.EXIT_TIMEOUT == 3, miss_code
assert miss_payload["status"] == "not_landed" and miss_payload["landed"] is False
assert "未落地" in miss_payload["message"] and "--force" in miss_payload["message"]
assert "未落地" in miss_logs[0]

# 日志记录复用/新建、模块；--session 来源单独标注；headless 不写
base = dict(
    alias="proj", target=target, title="任务", session_id="s-awf",
    session_title_value=title, workspace={"title": "w", "workspaceId": "id"},
    status="已发送，未等待回合", final_text="", task=pathlib.Path("/tmp/task.md"),
)
assert "- 会话来源：复用\n" in module.log_entry(**base, reused=True)
assert "- 会话来源：新建\n" in module.log_entry(**base, reused=False)
assert "- 会话来源：复用（--session 指定）\n" in module.log_entry(**base, reused="复用（--session 指定）")
assert "会话来源" not in module.log_entry(**base), "headless 路径不写会话来源"
assert "- 会话提示：" in module.log_entry(**base, reused=True, session_note="接近上限")
assert "- 模块：工作流\n" in module.log_entry(**base, reused=True, module="工作流")
assert "模块：" not in module.log_entry(**base), "未传模块时不写模块行"

# 实现点：dispatch_session 走 args.module / args.reuse / --session / 等待 / 旧标题改名
session_src = inspect.getsource(module.dispatch_session)
for needle in ("args.module", "resolve_module(", "args.reuse", "args.session",
               "select_reuse_session(", "wait_for_idle(", "args.idle_wait",
               "reuse_rename_needed(", "api.rename(session_id, session_name)",
               "--new", "pressure_hint(", "SESSION_GONE", "renamed = True",
               "if args.reuse:", "turn_activity(", "wait_for_landing(", "git_head_sha(", "EXIT_ZOMBIE"):
    assert needle in session_src, f"dispatch_session 缺少 {needle}"

main_src = inspect.getsource(module.main)
for needle in ("--reuse", "--new", "--session", "--idle-wait", "--module",
               "default=DEFAULT_REUSE", "default=DEFAULT_IDLE_WAIT",
               "--session 与 --new 互斥"):
    assert needle in main_src, f"main 缺少 {needle}"

# --session 参数解析：与 --new / --headless 互斥（argparse 阶段退出 2）
for argv in (["demo", "task.md", "--session", "session-x", "--new"],
             ["demo", "task.md", "--session", "session-x", "--headless"]):
    with contextlib.redirect_stderr(io.StringIO()):
        try:
            module.main(argv)
        except SystemExit as code:
            assert code.code == 2, (argv, code.code)
        else:
            raise AssertionError(f"{argv} 应被拒绝")
PY
then
  ok "会话复用：选择不看压力 / [awf] 优先 / running 等待 / --session 互斥"
else
  bad "会话复用选择或参数断言失败"
fi

# 1.4 --prune 判定：票据解析 + commit 无 ID 但 done.md 含 ID 也算 completed
if python3 - "$KIT_DIR/bin/awf-dispatch" <<'PY'
import importlib.machinery
import importlib.util
import pathlib
import subprocess
import sys
import tempfile

source = pathlib.Path(sys.argv[1])
loader = importlib.machinery.SourceFileLoader("awf_dispatch_prune_under_test", str(source))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)

ticket = "# demo01 · DOCS-042 冒烟\n\n- 目标项目：demo01（/tmp/awf-demo01）\n- 类型：docs\n"
alias, target = module.parse_ticket_target(ticket)
assert alias == "demo01", alias
assert str(target) == "/tmp/awf-demo01", target
assert module.parse_ticket_target("- 类型：docs\n") == (None, None)
assert module.parse_ticket_target("- 目标项目：demo01（relative/path）\n") == (None, None)

assert module.ticket_task_id("demo01-DOCS-042-smoke.md") == "DOCS-042"
assert module.ticket_task_id("no-id-ticket.md") is None
assert module.ticket_task_id("demo02-DEV-0071-x.md") == "DEV-0071"
assert not module.id_regex("DEV-007").search("DEV-0071"), "ID 边界失效"
assert module.id_regex("DEV-007").search("归档 DEV-007 完成")

with tempfile.TemporaryDirectory() as tmp:
    tmp = pathlib.Path(tmp)
    repo = tmp / "repo"
    (repo / "agent-workflow/tasks/dev").mkdir(parents=True)
    (repo / "agent-workflow/tasks/dev/done.md").write_text("## [DEV-007] 已完成\n", encoding="utf-8")

    def git(*args):
        subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True)

    git("init", "-q")
    git("config", "user.email", "smoke@example.com")
    git("config", "user.name", "smoke")
    git("add", "-A")
    git("commit", "-qm", "chore: 升级工作流框架到 0.3.0")  # 提交消息不含任务 ID

    tasks = tmp / "dispatch/tasks"
    tasks.mkdir(parents=True)
    (tasks / "demo02-DEV-007-ledger.md").write_text(f"- 目标项目：demo02（{repo}）\n", encoding="utf-8")
    (tasks / "demo02-DEV-099-pending.md").write_text(f"- 目标项目：demo02（{repo}）\n", encoding="utf-8")
    (tasks / "demo02-DEV-100-broken.md").write_text("# 无目标项目行\n", encoding="utf-8")
    (tasks / "demo02-DEV-101-missing.md").write_text("- 目标项目：demo02（/no/such/path）\n", encoding="utf-8")

    items = {item["taskId"]: item for item in module.scan_tickets(tmp)}
    assert items["DEV-007"]["status"] == "completed", items["DEV-007"]
    assert "done.md" in items["DEV-007"]["reason"], items["DEV-007"]["reason"]
    month = module.datetime.date.today().strftime("%Y-%m")
    expected = f"dispatch/archive/demo02/{month}/demo02-DEV-007-ledger.md"
    assert items["DEV-007"]["archive"] == expected, items["DEV-007"]["archive"]
    assert items["DEV-099"]["status"] == "pending", items["DEV-099"]
    assert items["DEV-100"]["status"] == "unknown", items["DEV-100"]
    assert items["DEV-101"]["status"] == "unknown", items["DEV-101"]
    assert (tasks / "demo02-DEV-007-ledger.md").is_file(), "判定阶段不得移动票据"
PY
then
  ok "票据解析与完成判定（commit 无 ID、done.md 含 ID）正确"
else
  bad "票据解析 / 完成判定断言失败"
fi

# 直接用 importlib 加载源脚本，断言 build_prompt 的 --team 注入、默认异步实现点与缺省行为
if python3 - "$KIT_DIR/bin/awf-dispatch" <<'PY'
import importlib.machinery
import importlib.util
import inspect
import pathlib
import sys

source = pathlib.Path(sys.argv[1])
loader = importlib.machinery.SourceFileLoader("awf_dispatch_under_test", str(source))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)

target = pathlib.Path("/tmp/awf-demo")
task = "任务：TEST-001 冒烟派发\n\n1. 只读验证。\n"
base = module.build_prompt(target, "demo · 冒烟", "dev", task)
off = module.build_prompt(target, "demo · 冒烟", "dev", task, team=False)
team = module.build_prompt(target, "demo · 冒烟", "dev", task, team=True)

assert inspect.signature(module.build_prompt).parameters["team"].default is False, "build_prompt 的 team 默认值必须为 False"
assert base == off, "team 缺省与 team=False 输出必须一致"
assert "AgentTeams" not in base, "未开启 --team 时不得出现 AgentTeams 段"
assert "可选：用 AgentTeams 执行" in team, "team=True 时缺少 AgentTeams 段标题"
for word in ("子任务", "依赖", "队长", "插件"):
    assert word in team, f"team=True 段落缺少关键词：{word}"
assert team.startswith(base), "--team 段落只能追加在任务包末尾"
assert "team=args.team" in inspect.getsource(module.dispatch_session), "dispatch_session 必须把 args.team 传给 build_prompt"

# 默认异步：DEFAULT_WAIT 常量、argparse 默认值、session/headless 两条路径
assert module.DEFAULT_WAIT is False, "DEFAULT_WAIT 必须为 False（默认不等待）"
assert module.DEFAULT_TIMEOUT > 0, "DEFAULT_TIMEOUT 必须为正数"
main_src = inspect.getsource(module.main)
assert "default=DEFAULT_WAIT" in main_src, "--wait 必须以 DEFAULT_WAIT 作默认值"
assert "--no-wait" in main_src, "--no-wait 兼容别名缺失"
assert "仅 --wait 生效" in main_src, "--timeout 必须注明仅对 --wait 生效"

session_src = inspect.getsource(module.dispatch_session)
assert "if not args.wait" in session_src, "dispatch_session 默认必须不等待"
assert "args.no_wait" not in session_src, "dispatch_session 不得再依赖 args.no_wait"
assert "已发送，未等待回合" in session_src, "session 异步日志状态缺失"
assert "next_step=" in session_src, "session 异步日志必须注明如何回到 GUI 会话"
assert "回到会话" in inspect.getsource(module.log_entry), "日志缺少回到会话字段"

headless_src = inspect.getsource(module.dispatch_headless)
assert "if not args.wait" in headless_src, "headless 默认也必须不等待"
assert "已发送，未等待回合" in headless_src, "headless 异步日志状态缺失"
assert "Popen" in headless_src, "headless 默认应以后台进程启动"
PY
then
  ok "build_prompt --team 注入且缺省不变；默认异步实现点有断言"
else
  bad "build_prompt / 默认异步断言失败"
fi

printf '任务：TEST-001 冒烟派发\n\n1. 只读验证。\n' > "$TMP/task.md"
( cd "$TMP" && "$PROJ/agent-workflow/bin/awf-dispatch" "$PROJ" task.md --handoff >/dev/null ) \
  && ok "handoff 生成交接单" || bad "handoff 失败"
[ -f "$TMP"/dispatch/handoff/*.md ] && ok "交接单文件存在" || bad "交接单文件缺失"
mkdir -p "$TMP/noworkflow"
if "$PROJ/agent-workflow/bin/awf-dispatch" "$TMP/noworkflow" "$TMP/task.md" --dry-run >"$TMP/out" 2>&1; then
  bad "无工作流时派发应失败"
else
  grep -q 'G1 工作流失败' "$TMP/out" && ok "无工作流时前置检查失败" || bad "无工作流时错误信息不明确"
fi

# 1.5 --prune 端到端：dry-run 不改文件 / --apply 移动（git mv 与 os.rename）/ 冲突不覆盖 / 用法错误
DISPATCH="$PROJ/agent-workflow/bin/awf-dispatch"
PRUNE="$TMP/prune"
PRUNE_TARGET="$TMP/prune-target"
mkdir -p "$PRUNE/dispatch/tasks" "$PRUNE_TARGET/agent-workflow/tasks/dev"
printf '## [DEV-101] 已完成\n' > "$PRUNE_TARGET/agent-workflow/tasks/dev/done.md"
git -C "$PRUNE_TARGET" init -q
git -C "$PRUNE_TARGET" config user.email smoke@example.com
git -C "$PRUNE_TARGET" config user.name smoke
git -C "$PRUNE_TARGET" add -A
git -C "$PRUNE_TARGET" commit -qm "chore: 无任务 ID 的提交"

git -C "$PRUNE" init -q
git -C "$PRUNE" config user.email smoke@example.com
git -C "$PRUNE" config user.name smoke

cat > "$PRUNE/dispatch/tasks/demo01-DEV-101-tracked.md" <<EOF
# demo01 · DEV-101

- 目标项目：demo01（$PRUNE_TARGET）
EOF
cat > "$PRUNE/dispatch/tasks/demo01-DEV-101-untracked.md" <<EOF
# demo01 · DEV-101 副本

- 目标项目：demo01（$PRUNE_TARGET）
EOF
git -C "$PRUNE" add dispatch/tasks/demo01-DEV-101-tracked.md
git -C "$PRUNE" commit -qm "chore: 种子票据（只把 tracked 加入索引）"
cat > "$PRUNE/dispatch/tasks/demo01-DEV-101-conflict.md" <<EOF
# demo01 · DEV-101 冲突

- 目标项目：demo01（$PRUNE_TARGET）
EOF

if ( cd "$PRUNE" && "$DISPATCH" --prune --json > plan.json ); then
  ok "--prune dry-run 退出 0"
else
  bad "--prune dry-run 失败"
fi
if [ -f "$PRUNE/dispatch/tasks/demo01-DEV-101-tracked.md" ] && [ ! -e "$PRUNE/dispatch/archive" ]; then
  ok "dry-run 不移动文件、不建 archive"
else
  bad "dry-run 改动了票据文件"
fi
if python3 - "$PRUNE/plan.json" <<'PY'
import json
import sys

data = json.load(open(sys.argv[1], encoding="utf-8"))
assert data["mode"] == "prune", data
assert data["dryRun"] is True, data
assert data["summary"]["completed"] == 3, data["summary"]
assert data["summary"]["total"] == 3, data["summary"]
for item in data["items"]:
    assert item["status"] == "completed", item
    assert item["taskId"] == "DEV-101", item
    assert item["archive"].startswith("dispatch/archive/demo01/"), item
    assert item["archive"].endswith(item["file"].split("/")[-1]), item
PY
then
  ok "--prune --json 计划字段完整（completed / 任务 ID / 归档路径）"
else
  bad "--prune --json 计划字段不完整"
fi

# 冲突：预先占用一张票据的归档路径，apply 时必须跳过且不覆盖
conflict_dest="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print([i["archive"] for i in d["items"] if i["file"].endswith("conflict.md")][0])' "$PRUNE/plan.json")"
mkdir -p "$(dirname "$PRUNE/$conflict_dest")"
printf '老内容\n' > "$PRUNE/$conflict_dest"

if ( cd "$PRUNE" && "$DISPATCH" --prune --apply --json > apply.json ); then
  ok "--prune --apply 退出 0"
else
  bad "--prune --apply 失败"
fi
[ ! -f "$PRUNE/dispatch/tasks/demo01-DEV-101-tracked.md" ] && ok "apply 移走已跟踪票据" || bad "已跟踪票据未移动"
[ ! -f "$PRUNE/dispatch/tasks/demo01-DEV-101-untracked.md" ] && ok "apply 移走未跟踪票据" || bad "未跟踪票据未移动"
[ -f "$PRUNE/dispatch/tasks/demo01-DEV-101-conflict.md" ] && ok "冲突时源票据保留" || bad "冲突时源票据被删除"
[ "$(cat "$PRUNE/$conflict_dest")" = "老内容" ] && ok "冲突不覆盖目标文件" || bad "冲突覆盖了目标文件"
if git -C "$PRUNE" status --porcelain | grep -q '^R  dispatch/tasks/.* -> dispatch/archive/'; then
  ok "已跟踪票据用 git mv（索引记录为 rename）"
else
  bad "已跟踪票据未使用 git mv"
fi
if ls "$PRUNE"/dispatch/archive/demo01/*/demo01-DEV-101-tracked.md >/dev/null 2>&1; then
  ok "归档路径含别名与 YYYY-MM"
else
  bad "归档路径不符合 <别名>/<YYYY-MM>/<文件名>"
fi
if python3 - "$PRUNE/apply.json" <<'PY'
import json
import sys

data = json.load(open(sys.argv[1], encoding="utf-8"))
assert data["dryRun"] is False, data
assert data["summary"]["moved"] == 2, data["summary"]
assert data["summary"]["conflicts"] == 1, data["summary"]
assert data["summary"]["errors"] == 0, data["summary"]
PY
then
  ok "apply 汇总：移动 2、冲突 1、失败 0"
else
  bad "apply 汇总不符"
fi

( cd "$PRUNE" && "$DISPATCH" --prune >/dev/null ) && ok "全部 pending/冲突时 dry-run 退出 0" || bad "剩余票据 dry-run 退出非 0"
set +e
( cd "$PRUNE" && "$DISPATCH" --prune demo01 x.md >/dev/null 2>&1 )
prune_positional=$?
( cd "$PRUNE" && "$DISPATCH" --apply >/dev/null 2>&1 )
apply_only=$?
set -e
[ "$prune_positional" = "2" ] && ok "--prune 与位置参数同用退出 2" || bad "--prune 位置参数退出码为 $prune_positional（期望 2）"
[ "$apply_only" = "2" ] && ok "--apply 不配 --prune 时退出 2" || bad "--apply 单独使用退出码为 $apply_only（期望 2）"

# 2. check 通过
( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null ) && ok "check 通过" || bad "check 未通过"

# 3. status 生成
( cd "$PROJ" && ./agent-workflow/bin/awf status >/dev/null )
assert_grep '## 当前进行中' "$PROJ/agent-workflow/tasks/status.md" "status 含当前进行中"

# 4. 进行中任务缺字段 → check 失败
cat > "$PROJ/agent-workflow/tasks/dev/current.md" <<'EOF'
# 正在开发

## [DEV-001] 缺字段

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | active |
EOF
if ( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null 2>&1 ); then
  bad "缺字段时 check 应失败"
else
  ok "缺字段时 check 失败"
fi

# 5. 补齐字段并通过
cat > "$PROJ/agent-workflow/tasks/dev/current.md" <<'EOF'
# 正在开发

## [DEV-001] 补齐字段

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | active |
| Owner | agent |

### 下一步
继续。
EOF
( cd "$PROJ" && ./agent-workflow/bin/awf status >/dev/null )
( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null ) && ok "补齐后 check 通过" || bad "补齐后 check 未通过"

# 6. 事实文件变更 → 入口过期 → bootstrap 修复
sed -i '' 's|^purpose:.*|purpose: 变更后的定位|' "$PROJ/agent-workflow/project.yaml" 2>/dev/null \
  || sed -i 's|^purpose:.*|purpose: 变更后的定位|' "$PROJ/agent-workflow/project.yaml"
if ( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null 2>&1 ); then
  bad "project.yaml 变更后 check 应失败"
else
  ok "project.yaml 变更后 check 失败"
fi
( cd "$PROJ" && ./agent-workflow/bin/awf bootstrap >/dev/null )
( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null ) && ok "bootstrap 后 check 通过" || bad "bootstrap 后 check 未通过"
assert_grep '变更后的定位' "$PROJ/AGENTS.md" "入口已刷新"

# 7. --force 保留事实文件与任务账本
"$KIT_DIR/bin/awf" init "$PROJ" --name "改名" --force >/dev/null
assert_grep 'purpose: 变更后的定位' "$PROJ/agent-workflow/project.yaml" "--force 保留 project.yaml"
assert_grep 'DEV-001' "$PROJ/agent-workflow/tasks/dev/current.md" "--force 保留任务块"
assert_grep '变更后的定位' "$PROJ/AGENTS.md" "--force 后入口仍同步"

# 8. 入口外内容不被覆盖
printf '\n## 团队约定\n- 保留我\n' >> "$PROJ/AGENTS.md"
( cd "$PROJ" && ./agent-workflow/bin/awf bootstrap >/dev/null )
assert_grep '保留我' "$PROJ/AGENTS.md" "区块外内容保留"
assert_grep 'awf:begin' "$PROJ/AGENTS.md" "受控区块仍存在"

# 9. 全局索引：init 自动登记，bootstrap 自愈刷新，--no-register 可跳过
assert_file "$DSH_AGENTS_HOME/projects.tsv" "projects.tsv"
assert_grep '冒烟项目' "$DSH_AGENTS_HOME/projects.tsv" "init 自动登记别名"
assert_grep '冒烟项目' "$DSH_AGENTS_HOME/AGENTS.md" "全局索引含别名"
( cd "$PROJ" && ./agent-workflow/bin/awf projects | grep -q "冒烟项目" ) && ok "projects 列出项目" || bad "projects 未列出项目"
( cd "$PROJ" && ./agent-workflow/bin/awf find 冒烟 | grep -q "$PROJ" ) && ok "find 返回路径" || bad "find 未返回路径"
( cd "$PROJ" && ./agent-workflow/bin/awf register >/dev/null )
[ "$(wc -l < "$DSH_AGENTS_HOME/projects.tsv" | tr -d ' ')" = "1" ] && ok "重复登记不产生重复行" || bad "登记出现重复行"

# bootstrap 自愈：把路径改错后刷新
sed -i '' "s|$PROJ|/wrong/path|" "$DSH_AGENTS_HOME/projects.tsv" 2>/dev/null \
  || sed -i "s|$PROJ|/wrong/path|" "$DSH_AGENTS_HOME/projects.tsv"
( cd "$PROJ" && ./agent-workflow/bin/awf bootstrap >/dev/null )
assert_grep "$PROJ" "$DSH_AGENTS_HOME/projects.tsv" "bootstrap 刷新索引路径"

# --no-register 跳过
"$KIT_DIR/bin/awf" init "$TMP/proj2" --name "不登记" --no-register >/dev/null
if grep -q "不登记" "$DSH_AGENTS_HOME/projects.tsv"; then
  bad "--no-register 仍写入索引"
else
  ok "--no-register 不写入索引"
fi

# 10. 受控区块缺 awf:end：bootstrap 必须失败且不改写文件
cp "$PROJ/AGENTS.md" "$PROJ/AGENTS.full"
grep -v 'awf:end' "$PROJ/AGENTS.full" > "$PROJ/AGENTS.md" || true
before_size="$(wc -c < "$PROJ/AGENTS.md" | tr -d ' ')"
if ( cd "$PROJ" && ./agent-workflow/bin/awf bootstrap >/dev/null 2>&1 ); then
  bad "缺少 awf:end 时 bootstrap 未失败"
else
  ok "缺少 awf:end 时 bootstrap 失败"
fi
after_size="$(wc -c < "$PROJ/AGENTS.md" | tr -d ' ')"
[ "$before_size" = "$after_size" ] && ok "bootstrap 失败时不改写文件" || bad "bootstrap 失败时仍改写了文件"
mv "$PROJ/AGENTS.full" "$PROJ/AGENTS.md"

# 11. 非法任务 ID 必须被 check 发现
cat > "$PROJ/agent-workflow/tasks/dev/current.md" <<'AWFBAD'
# 正在开发

## [DEV_001] 非法 ID

| 字段 | 内容 |
|------|------|
| 状态 | active |
| Owner | agent |

### 下一步
改成 DEV-001。
AWFBAD
if ( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null 2>&1 ); then
  bad "非法任务 ID 未被 check 发现"
else
  ok "非法任务 ID 被 check 发现"
fi
cat > "$PROJ/agent-workflow/tasks/dev/current.md" <<'AWFCLEAN'
# 正在开发

（暂无进行中任务）
AWFCLEAN

# 12. 派发器：无效目标应返回退出码 2（门失败）
set +e
"$KIT_DIR/bin/awf-dispatch" no-such-project /dev/null >/dev/null 2>&1
dispatch_code=$?
set -e
[ "$dispatch_code" = "2" ] && ok "awf-dispatch 门失败退出码为 2" || bad "awf-dispatch 退出码为 $dispatch_code（期望 2）"

# 13. F1：check 校验状态枚举（非法值失败）
cat > "$PROJ/agent-workflow/tasks/docs/current.md" <<'F1B'
# 正在撰写

## [DOCS-100] 非法状态

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | dream |
| Owner | t3 |

### 下一步
改正。
F1B
if out="$(cd "$PROJ" && ./agent-workflow/check_workflow.sh 2>&1)"; then
  bad "F1 非法状态值未被 check 发现"
else
  printf '%s\n' "$out" | grep -q '状态非法' && ok "F1 非法状态值被 check 拒绝" || bad "F1 非法状态值未被点名：$out"
fi
cat > "$PROJ/agent-workflow/tasks/docs/current.md" <<'F1G'
# 正在撰写

（暂无进行中任务）
F1G
( cd "$PROJ" && ./agent-workflow/bin/awf status >/dev/null )
( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null ) && ok "F1 恢复合法状态后 check 通过" || bad "F1 恢复后 check 未通过"

# 14. F2：status.md 新鲜度（账本改动后未刷新 → 过期失败）
cat > "$PROJ/agent-workflow/tasks/debug/current.md" <<'F2B'
# 正在调试

## [DEBUG-101] 新鲜度

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | active |
| Owner | t3 |
| 现象 | x |
| 假设 | y |
| 证伪方法 | z |

### 下一步
跑 status 后复检。
F2B
if out="$(cd "$PROJ" && ./agent-workflow/check_workflow.sh 2>&1)"; then
  bad "F2 账本改动后未刷新 status.md，check 应失败"
else
  printf '%s\n' "$out" | grep -q 'status.md 已过期' && ok "F2 status 过期被 check 发现" || bad "F2 过期信息缺失：$out"
fi
( cd "$PROJ" && ./agent-workflow/bin/awf status >/dev/null )
( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null ) && ok "F2 刷新 status 后 check 通过" || bad "F2 刷新后 check 未通过"

# 15. F3：done.md 归档块校验（缺文件 / 非法归档行）
printf '| BAD-ID | P1 | 少日期行 |\n' >> "$PROJ/agent-workflow/tasks/dev/done.md"
if out="$(cd "$PROJ" && ./agent-workflow/check_workflow.sh 2>&1)"; then
  bad "F3 done.md 非法归档行未被 check 发现"
else
  printf '%s\n' "$out" | grep -q 'BAD-ID' && ok "F3 done.md 非法归档行被 check 拒绝" || bad "F3 未点名非法归档行：$out"
fi
grep -v 'BAD-ID' "$PROJ/agent-workflow/tasks/dev/done.md" > "$PROJ/agent-workflow/tasks/dev/done.md.tmp" \
  && mv "$PROJ/agent-workflow/tasks/dev/done.md.tmp" "$PROJ/agent-workflow/tasks/dev/done.md"
( cd "$PROJ" && ./agent-workflow/bin/awf status >/dev/null )
( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null ) && ok "F3 修复归档行后 check 通过" || bad "F3 修复后 check 未通过"
mv "$PROJ/agent-workflow/tasks/debug/done.md" "$PROJ/agent-workflow/tasks/debug/done.md.hid"
if ( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null 2>&1 ); then
  bad "F3 缺 done.md（无归档块）未被 check 发现"
else
  ok "F3 缺 done.md（无归档块）check 失败"
fi
mv "$PROJ/agent-workflow/tasks/debug/done.md.hid" "$PROJ/agent-workflow/tasks/debug/done.md"

# 15.1 F3+：归档块旧英文表头（| Status |）→ check FAIL 且输出可直接执行的修复指引
cat >> "$PROJ/agent-workflow/tasks/dev/done.md" <<'EOF'

## [DEV-102] 旧英文表头归档

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| Status | 完成 |
| Owner | t3 |
EOF
if out="$(cd "$PROJ" && ./agent-workflow/check_workflow.sh 2>&1)"; then
  bad "F3+ 旧英文表头未被 check 发现"
else
  printf '%s\n' "$out" | grep -q 'DEV-102' && ok "F3+ 点名旧归档块" || bad "F3+ 未点名旧归档块：$out"
  printf '%s\n' "$out" | grep -q 'Status' && ok "F3+ 指明旧表头 Status" || bad "F3+ 未指明 Status：$out"
  printf '%s\n' "$out" | grep -q '| 状态 |' && ok "F3+ 给出 | Status | → | 状态 | 指引" || bad "F3+ 缺修复指引：$out"
fi
sed -i '' 's/| Status |/| 状态 |/' "$PROJ/agent-workflow/tasks/dev/done.md" 2>/dev/null \
  || sed -i 's/| Status |/| 状态 |/' "$PROJ/agent-workflow/tasks/dev/done.md"
( cd "$PROJ" && ./agent-workflow/bin/awf status >/dev/null )
( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null ) && ok "F3+ 按指引修复后 check 通过" || bad "F3+ 修复后 check 未通过"

# 15.2 F3+：任务块正文引用迁移字样（`| Status |` / `| 状态 |`）不污染状态列与字段检测
cat >> "$PROJ/agent-workflow/tasks/dev/current.md" <<'EOF'

## [DEV-103] 正文含迁移字样

| 字段 | 内容 |
|------|------|
| 优先级 | P1 |
| 状态 | review |
| Owner | t3 |

### 目标
迁移指引正文：把 `| Status |` 改为 `| 状态 |`；归档块缺「状态」字段时补一行 `| 状态 | 完成 |`。

### 下一步
x
EOF
( cd "$PROJ" && ./agent-workflow/bin/awf status >/dev/null )
grep -q '| dev | DEV-103 | P1 | review | t3 | 正文含迁移字样 |' "$PROJ/agent-workflow/tasks/status.md" \
  && ok "F3+ 正文引用迁移字样不污染状态列" \
  || bad "F3+ 状态列被正文污染：$(grep 'DEV-103' "$PROJ/agent-workflow/tasks/status.md")"
( cd "$PROJ" && ./agent-workflow/check_workflow.sh >/dev/null ) && ok "F3+ 正文引用迁移字样时 check 通过" || bad "F3+ 正文引用迁移字样时 check 失败"
cat > "$PROJ/agent-workflow/tasks/dev/current.md" <<'EOF'
# 正在开发

（暂无进行中任务）
EOF
( cd "$PROJ" && ./agent-workflow/bin/awf status >/dev/null )

# 16. F4：team-flow 文档 approval 语义统一为 automatic（无 staged 审批残留）
if grep -nE '不自己批准|用户点确认|确认后创建成员|不确认就不启动' docs/team-flow.md >/dev/null; then
  bad "F4 team-flow 仍有 staged 审批残留：$(grep -nE '不自己批准|用户点确认|确认后创建成员|不确认就不启动' docs/team-flow.md | tr '\n' ';')"
else
  ok "F4 team-flow 无 staged 审批残留"
fi
grep -q 'approval=automatic' docs/team-flow.md && ok "F4 team-flow 保留 automatic 语义" || bad "F4 team-flow 无 automatic 语义"

# 17. F5：cross-project 模板 harness 中立（无 DSH 专有词，细节下沉文档/技能层）
F5_PAT='dsh|headless|workspace\.json|session 错误码|Ungrouped|DEFAULT_WEB_URL|gui|sessionId'
for f in "$KIT_DIR/templates/workflows/cross-project.md" "$KIT_DIR/agent-workflow/workflows/cross-project.md"; do
  if grep -qiE "$F5_PAT" "$f"; then
    bad "F5 $f 仍含 DSH 专有词：$(grep -inE "$F5_PAT" "$f" | tr '\n' ';')"
  else
    ok "F5 $f 无 DSH 专有词"
  fi
done
if grep -q '派发技能' "$KIT_DIR/templates/workflows/cross-project.md" \
  && grep -q 'docs/dispatch.md' "$KIT_DIR/templates/workflows/cross-project.md"; then
  ok "F5 模板把细节下沉指向文档与技能层"
else
  bad "F5 模板缺少文档/技能层指引"
fi

# 18. F6：kit 形态副本漂移被 check 拒绝（根 → agent-workflow/ 双向）
F6R="$TMP/f6kit"
"$KIT_DIR/bin/awf" init "$F6R" --name f6 --no-register >/dev/null
mkdir -p "$F6R/bin"
cp "$KIT_DIR/bin/awf" "$F6R/bin/awf"
cp -R "$KIT_DIR/templates/." "$F6R/templates/"
chmod +x "$F6R/bin/awf"
if ( cd "$F6R" && ./agent-workflow/check_workflow.sh >/dev/null 2>&1 ); then
  ok "F6 副本一致时 check 通过"
else
  bad "F6 副本一致时 check 未通过"
fi
printf '\n> 本地补充内容\n' >> "$F6R/agent-workflow/workflows/dev.md"
if out="$(cd "$F6R" && ./agent-workflow/check_workflow.sh 2>&1)"; then
  bad "F6 agent 侧工作流漂移未被发现"
else
  printf '%s\n' "$out" | grep -q '副本漂移' && ok "F6 agent 侧副本漂移被 check 拒绝" || bad "F6 漂移信息缺失：$out"
fi
cp "$F6R/templates/workflows/dev.md" "$F6R/agent-workflow/workflows/dev.md"
printf '\n> 模板新内容\n' >> "$F6R/templates/AGENTS.md.tmpl"
if out="$(cd "$F6R" && ./agent-workflow/check_workflow.sh 2>&1)"; then
  bad "F6 根侧模板漂移未被发现"
else
  printf '%s\n' "$out" | grep -q '副本漂移' && ok "F6 根侧模板漂移被 check 拒绝" || bad "F6 根侧漂移信息缺失"
fi
cp "$KIT_DIR/templates/AGENTS.md.tmpl" "$F6R/templates/AGENTS.md.tmpl"
( cd "$F6R" && ./agent-workflow/check_workflow.sh >/dev/null ) && ok "F6 恢复同步后 check 通过" || bad "F6 恢复同步后 check 未通过"

# 19. F6：release-prep 先检测漂移再覆盖（有漂移拒绝，禁止静默回滚）
RPD="$TMP/rpdrift"
"$KIT_DIR/bin/awf" init "$RPD" --name rpdrift --no-register >/dev/null
mkdir -p "$RPD/bin" "$RPD/test"
cp "$KIT_DIR/bin/awf" "$RPD/bin/awf"
cp -R "$KIT_DIR/templates/." "$RPD/templates/"
chmod +x "$RPD/bin/awf"
printf '0.0.1\n' > "$RPD/VERSION"
printf '# Changelog\n\n## [Unreleased]\n\n### Added\n- x\n' > "$RPD/CHANGELOG.md"
printf '#!/bin/sh\nexit 0\n' > "$RPD/agent-workflow/check_workflow.sh"
printf '#!/bin/sh\nexit 0\n' > "$RPD/test/smoke.sh"
chmod +x "$RPD/agent-workflow/check_workflow.sh" "$RPD/test/smoke.sh"
printf '\n> 本地发版工作流改动\n' >> "$RPD/agent-workflow/workflows/release.md"
set +e
rp_out="$("$RPD/agent-workflow/bin/awf" release-prep --root "$RPD" 0.5.0 2>&1)"
rp_code=$?
set -e
if [ "$rp_code" != "0" ] && printf '%s\n' "$rp_out" | grep -q '漂移'; then
  ok "F6 release-prep 检测漂移并拒绝覆盖"
else
  bad "F6 release-prep 未拒绝漂移（rc=$rp_code）：$rp_out"
fi
[ "$(cat "$RPD/VERSION")" = "0.0.1" ] && ok "F6 拒绝后 VERSION 未被改写" || bad "F6 拒绝后 VERSION 被改写"
cp "$RPD/templates/workflows/release.md" "$RPD/agent-workflow/workflows/release.md"
if ( cd "$RPD" && ./agent-workflow/bin/awf release-prep --root "$RPD" 0.5.0 >/dev/null 2>&1 ); then
  ok "F6 消除漂移后 release-prep 成功"
else
  bad "F6 消除漂移后 release-prep 失败"
fi

# 20. RT-1：旧格式迁移默认关闭，--allow-legacy-reuse 显式放行（帮助与文档同步）
if "$KIT_DIR/bin/awf-dispatch" --help 2>&1 | grep -q -- '--allow-legacy-reuse'; then
  ok "RT-1 --help 列出 --allow-legacy-reuse"
else
  bad "RT-1 --help 未列出 --allow-legacy-reuse"
fi
if grep -q -- '--allow-legacy-reuse' docs/dispatch.md; then
  ok "RT-1 docs/dispatch.md 同步 --allow-legacy-reuse"
else
  bad "RT-1 docs/dispatch.md 缺 --allow-legacy-reuse"
fi

# 20.1 RT-1/2/3 单元回归（mock API / 真实 git 仓库；不接触真实会话）
if python3 - "$KIT_DIR/bin/awf-dispatch" <<'PY'
import argparse
import contextlib
import importlib.machinery
import importlib.util
import io
import json
import os
import pathlib
import subprocess
import sys
import tempfile

source = pathlib.Path(sys.argv[1])
loader = importlib.machinery.SourceFileLoader("awf_dispatch_rt_under_test", str(source))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)


def mkrow(session_id, cwd, title="", running=False, blank=False):
    return {"sessionId": session_id, "cwd": cwd, "running": running, "blank": blank,
            "updatedAt": 1,
            "projections": {"values": {"title": title}, "asOfSeq": 1}}


class FakeApi:
    def __init__(self, rows, page=None):
        self.rows = rows
        self.page = page if page is not None else {"records": []}
        self.created = []
        self.renamed = []
        self.prompts = []

    def sessions(self):
        return self.rows

    def rpc(self, method, params, timeout=30):
        if method != "session/page":
            raise module.DispatchError(f"未知 RPC：{method}")
        return self.page

    def create_session(self, workspace_id):
        sid = f"s-created-{len(self.created) + 1}"
        self.created.append(sid)
        return {"sessionId": sid}

    def rename(self, session_id, title):
        self.renamed.append((session_id, title))

    def prompt(self, session_id, text, request_id):
        self.prompts.append((session_id, text))


class BrokenPageApi(FakeApi):
    def rpc(self, method, params, timeout=30):
        raise module.DispatchError("page 不可用")


with tempfile.TemporaryDirectory() as tmp:
    proj = pathlib.Path(tmp) / "proj"
    proj.mkdir()
    module_awf = "工作流"
    canonical = module.awf_session_title(proj.name, module_awf)
    legacy = mkrow("s-legacy", str(proj), title=f"{proj.name} · 旧任务")
    user = mkrow("s-user", str(proj), title=f"{proj.name} · 用户的分析记录")

    # RT-1：用户普通会话默认不迁移；probe 确认才迁移
    assert module.select_reuse_session([user], proj, module_awf) is None, \
        "RT-1 默认不得复用用户自建 <项目> · xxx 会话"
    assert module.select_reuse_session([legacy], proj, module_awf) is None, \
        "RT-1 旧格式默认不自动迁移"
    assert module.select_reuse_session([legacy], proj, module_awf,
                                       legacy_probe=lambda r: True)["sessionId"] == "s-legacy"
    assert module.select_reuse_session([legacy], proj, module_awf,
                                       legacy_probe=lambda r: False) is None

    # RT-1：标记探子——消息含派发任务包标记 → True；无标记/读不到 → False
    marker = {"records": [{"event": {"type": "user/message", "seq": 1, "data": {
        "message": {"content": [{"type": "text", "text": "----- 任务包开始 -----\n任务：TEST-1"}]}}}}]}
    assert module.session_has_dispatch_marker(FakeApi([], page=marker), legacy) is True
    assert module.session_has_dispatch_marker(FakeApi([], page={"records": []}), legacy) is False
    assert module.session_has_dispatch_marker(BrokenPageApi([]), legacy) is False, \
        "读不到记录不得赌迁移"

    # RT-1：派发主流程——无标记的用户会话不迁移（新建、不注入）；
    # 有标记 / --allow-legacy-reuse 才迁移复用并改名
    def run_dispatch_rows(api, allow_legacy=False):
        logs = []
        original = (module.preflight, module.append_log, module.emit)
        module.preflight = lambda target, args, need_channel: {
            "api": api, "workspace": {"title": "w", "workspaceId": "id"}, "sessions": api.rows}
        module.append_log = lambda entry: logs.append(entry) or pathlib.Path("/tmp/awf-dispatch-log.md")
        module.emit = lambda message, json_mode=False: None
        args = argparse.Namespace(
            session="", reuse=True, module="", title="", wait=False, timeout=600,
            idle_wait=300, force=False, team=False, json=True, headless=False,
            handoff=False, dry_run=False, add_workspace=False, allow_dirty=False,
            allow_active=False, apply=False, prune=False, web_url="",
            allow_legacy_reuse=allow_legacy)
        text = f"任务：TEST-001 冒烟\n\n- 目标项目：{proj.name}（{proj}）\n- 模块：{module_awf}\n"
        with contextlib.redirect_stdout(io.StringIO()):
            code = module.dispatch_session(
                proj, pathlib.Path("/tmp/TEST-001-task.md"), text,
                f"{proj.name} · TEST-001", "dev", args)
        module.preflight, module.append_log, module.emit = original
        return code, logs

    api = FakeApi([user])
    code, _ = run_dispatch_rows(api)
    assert code == 0 and api.created == ["s-created-1"], "用户会话不得迁移，必须新建"
    assert all(sid != "s-user" for sid, _ in api.renamed), "用户会话不得被改名（RT-1）"
    assert all(sid != "s-user" for sid, _ in api.prompts), "用户会话不得被注入任务（RT-1）"
    assert api.prompts and api.prompts[0][0] == "s-created-1", api.prompts

    api2 = FakeApi([mkrow("s-legacy-m", str(proj), title=f"{proj.name} · 旧任务")],
                   page=marker)
    code, _ = run_dispatch_rows(api2)
    assert code == 0 and api2.created == [] and api2.prompts[0][0] == "s-legacy-m", \
        "含派发标记的旧会话应迁移复用（RT-1）"
    assert ("s-legacy-m", canonical) in api2.renamed

    api3 = FakeApi([mkrow("s-legacy-f", str(proj), title=f"{proj.name} · 旧任务")])
    code, _ = run_dispatch_rows(api3, allow_legacy=True)
    assert code == 0 and api3.created == [] and api3.prompts[0][0] == "s-legacy-f", \
        "--allow-legacy-reuse 应迁移复用（RT-1）"

    # RT-2：headless --wait 非零退出 → 独立退出码 5；退出 0 仍走落地校验
    class FakeProc:
        def __init__(self, outcome):
            self.pid = 4242
            self._outcome = outcome

        def wait(self, timeout=None):
            if isinstance(self._outcome, BaseException):
                raise self._outcome
            return self._outcome

    head_orig = (module.preflight, module.append_log, module.emit,
                 module.git_head_sha, module.git_head, module.wait_for_landing,
                 module.subprocess.Popen, os.environ.get("DSH_BIN"))
    module.preflight = lambda target, args, need_channel: {"api": None, "workspace": {}, "sessions": []}
    module.append_log = lambda entry: pathlib.Path("/tmp/awf-dispatch-log.md")
    module.emit = lambda message, json_mode=False: None
    module.git_head_sha = lambda target: "aaaa"
    module.git_head = lambda target: "aaaa (HEAD -> main)"
    module.subprocess.Popen = lambda *a, **k: FakeProc(7)
    os.environ["DSH_BIN"] = "/bin/sh"
    landing_calls = []
    module.wait_for_landing = lambda target, task_id, initial_head, remaining: (
        landing_calls.append({"task_id": task_id, "initial_head": initial_head}) or "commit")

    def dispatch_headless_case(task_name, proc_outcome, wait_landing, timeout=5,
                               body="任务：任务\n"):
        landing_calls.clear()
        module.subprocess.Popen = lambda *a, **k: FakeProc(proc_outcome)
        module.wait_for_landing = wait_landing
        args = argparse.Namespace(
            session="", reuse=True, module="", title="", wait=True, timeout=timeout,
            idle_wait=300, force=False, team=False, json=True, headless=True,
            handoff=False, dry_run=False, add_workspace=False, allow_dirty=False,
            allow_active=False, apply=False, prune=False, web_url="",
            allow_legacy_reuse=False)
        with tempfile.TemporaryDirectory() as work, \
             contextlib.redirect_stdout(io.StringIO()):
            old_cwd = os.getcwd()
            os.chdir(work)
            try:
                task = pathlib.Path(work) / task_name
                task.write_text(body, encoding="utf-8")
                code = module.dispatch_headless(
                    pathlib.Path(work) / "tgt", task, body,
                    "headless 任务", args)
            finally:
                os.chdir(old_cwd)
        return code

    # 非零退出：独立码 5，不进落地校验
    code = dispatch_headless_case("TEST-101-task.md", 7, lambda *a, **k: "commit")
    assert code == module.EXIT_HEADLESS_FAIL == 5, f"非零退出应变 5，实际 {code}"
    assert landing_calls == [], "非零退出不得走落地校验（RT-2）"

    # 退出 0：仍走 wait_for_landing，初始 HEAD 在启动前采集（RT-3 同契约）
    module.subprocess.Popen = lambda *a, **k: FakeProc(0)
    code = dispatch_headless_case("TEST-102-task.md", 0,
                                  lambda target, task_id, initial_head, remaining: (
                                      landing_calls.append({"task_id": task_id,
                                                            "initial_head": initial_head}) or "commit"))
    assert code == module.EXIT_OK == 0, code
    assert landing_calls and landing_calls[0]["task_id"] == "TEST-102", landing_calls
    assert landing_calls[0]["initial_head"] == "aaaa", \
        "初始 HEAD 必须在进程启动前采集（RT-2/RT-3）"

    # 退出 0 但未落地：按超时语义返回 3（不假装成功）
    seen = []
    code = dispatch_headless_case(
        "TEST-103-task.md", 0,
        lambda target, task_id, initial_head, remaining: (seen.append(task_id) or None))
    assert code == module.EXIT_TIMEOUT == 3, code
    assert seen == ["TEST-103"], "退出 0 后必须校验落地（RT-2）"

    # 进程等待超时仍为 3
    code = dispatch_headless_case(
        "TEST-104-task.md", subprocess.TimeoutExpired("dsh", 5),
        lambda *a, **k: "commit")
    assert code == module.EXIT_TIMEOUT == 3, "headless 进程超时仍为 3"

    # task_id 正文回退：文件名无 ID 时取票据正文（与会话模式对齐）
    body_calls = []
    code = dispatch_headless_case(
        "plain-task.md", 0,
        lambda target, task_id, initial_head, remaining: (
            body_calls.append(task_id) or "commit"),
        body="任务：TEST-305 冒烟\n\n- 目标项目：demo（/tmp/demo）\n- 模块：工作流\n")
    assert code == module.EXIT_OK == 0, code
    assert body_calls == ["TEST-305"], f"文件名无 ID 应回退正文取 ID，实际 {body_calls}"

    (module.preflight, module.append_log, module.emit,
     module.git_head_sha, module.git_head, module.wait_for_landing,
     module.subprocess.Popen) = head_orig[:7]
    if head_orig[7] is None:
        os.environ.pop("DSH_BIN", None)
    else:
        os.environ["DSH_BIN"] = head_orig[7]

    # RT-3：wait_for_landing 落地归因（真实 git 仓库）
    with tempfile.TemporaryDirectory() as repo_tmp:
        repo = pathlib.Path(repo_tmp) / "repo"
        repo.mkdir()
        subprocess.run(["git", "init", "-q", str(repo)], check=True)
        subprocess.run(["git", "-C", str(repo), "config", "user.email", "smoke@test"], check=True)
        subprocess.run(["git", "-C", str(repo), "config", "user.name", "smoke"], check=True)
        (repo / "a.txt").write_text("a", encoding="utf-8")
        subprocess.run(["git", "-C", str(repo), "add", "a.txt"], check=True)
        subprocess.run(["git", "-C", str(repo), "commit", "-qm", "fix: TEST-201 落地"], check=True)
        base = module.git_head_sha(repo)
        assert base and len(base) == 40
        assert module.wait_for_landing(repo, "TEST-201", "", timeout=0.1, interval=0.01) == "commit"

        (repo / "b.txt").write_text("b", encoding="utf-8")
        subprocess.run(["git", "-C", str(repo), "add", "b.txt"], check=True)
        subprocess.run(["git", "-C", str(repo), "commit", "-qm", "chore: 用户无关提交"], check=True)
        assert module.commit_range_has_id(repo, "TEST-201", base) is False
        assert module.commit_range_has_id(repo, "TEST-999", base) is False
        assert module.wait_for_landing(repo, "TEST-201", base, timeout=0.1, interval=0.01) is None, \
            "无关 commit 不得判落地（RT-3）"

        (repo / "c.txt").write_text("c", encoding="utf-8")
        subprocess.run(["git", "-C", str(repo), "add", "c.txt"], check=True)
        subprocess.run(["git", "-C", str(repo), "commit", "-qm", "fix: TEST-202 完成"], check=True)
        assert module.wait_for_landing(repo, "TEST-202", base, timeout=0.1, interval=0.01) == "commit", \
            "含任务 ID 的 commit 才判落地（RT-3）"

        # RT-3 区间归因（P2）：任务 commit 落地后被无关 commit 压顶（<10s 轮询窗口）
        # → initial..HEAD 区间归因仍判落地，不误判 not landed
        buried = pathlib.Path(repo_tmp) / "buried"
        buried.mkdir()
        subprocess.run(["git", "init", "-q", str(buried)], check=True)
        subprocess.run(["git", "-C", str(buried), "config", "user.email", "smoke@test"], check=True)
        subprocess.run(["git", "-C", str(buried), "config", "user.name", "smoke"], check=True)
        (buried / "seed.txt").write_text("s", encoding="utf-8")
        subprocess.run(["git", "-C", str(buried), "add", "seed.txt"], check=True)
        subprocess.run(["git", "-C", str(buried), "commit", "-qm", "chore: 基线"], check=True)
        base_buried = module.git_head_sha(buried)
        (buried / "t.txt").write_text("t", encoding="utf-8")
        subprocess.run(["git", "-C", str(buried), "add", "t.txt"], check=True)
        subprocess.run(["git", "-C", str(buried), "commit", "-qm", "fix: TEST-301 落地"], check=True)
        for i in (1, 2):  # 任务 commit 落地后 10s 内被两个无关 commit 压顶
            (buried / f"n{i}.txt").write_text(f"n{i}", encoding="utf-8")
            subprocess.run(["git", "-C", str(buried), "add", f"n{i}.txt"], check=True)
            subprocess.run(["git", "-C", str(buried), "commit", "-qm", "chore: 无关压顶"], check=True)
        assert module.commit_range_has_id(buried, "TEST-301", base_buried) is True, \
            "区间内含任务 commit 即命中（区间归因）"
        assert module.wait_for_landing(buried, "TEST-301", base_buried, timeout=0.1, interval=0.01) == "commit", \
            "任务 commit 被压顶仍判落地（RT-3 区间归因）"

        # 对照：区间内只有无关 commit 仍不判落地
        buried2 = pathlib.Path(repo_tmp) / "buried2"
        buried2.mkdir()
        subprocess.run(["git", "init", "-q", str(buried2)], check=True)
        subprocess.run(["git", "-C", str(buried2), "config", "user.email", "smoke@test"], check=True)
        subprocess.run(["git", "-C", str(buried2), "config", "user.name", "smoke"], check=True)
        (buried2 / "seed.txt").write_text("s", encoding="utf-8")
        subprocess.run(["git", "-C", str(buried2), "add", "seed.txt"], check=True)
        subprocess.run(["git", "-C", str(buried2), "commit", "-qm", "chore: 基线"], check=True)
        base_b2 = module.git_head_sha(buried2)
        for i in (1, 2):
            (buried2 / f"n{i}.txt").write_text(f"n{i}", encoding="utf-8")
            subprocess.run(["git", "-C", str(buried2), "add", f"n{i}.txt"], check=True)
            subprocess.run(["git", "-C", str(buried2), "commit", "-qm", "chore: 纯无关"], check=True)
        assert module.commit_range_has_id(buried2, "TEST-301", base_b2) is False
        assert module.wait_for_landing(buried2, "TEST-301", base_b2, timeout=0.1, interval=0.01) is None, \
            "区间内无任务 commit 不得判落地"
PY
then
  ok "RT-1/2/3 单元回归全绿（用户会话不迁移 / headless 独立退出码 / 无关 commit 不落地）"
else
  bad "RT-1/2/3 单元回归失败（见上方 Traceback）"
fi

# 20.2 RT-2：docs/dispatch.md 退出码表同步 headless 独立码（5）
if grep -q '^| 5 |' docs/dispatch.md && grep -q '非零退出' docs/dispatch.md; then
  ok "RT-2 docs/dispatch.md 退出码表含 5（headless 非零退出）"
else
  bad "RT-2 docs/dispatch.md 退出码表未同步 headless 独立码"
fi
if grep -q '最新 commit 含本任务 ID' docs/dispatch.md; then
  ok "RT-3 docs/dispatch.md 落地判定含 commit 归因"
else
  bad "RT-3 docs/dispatch.md 未写明 commit 归因"
fi

printf '\n通过 %d 项，失败 %d 项\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
