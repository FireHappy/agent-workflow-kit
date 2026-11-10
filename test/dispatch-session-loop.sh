#!/usr/bin/env bash
# 派发实战循环（真实 DSH 会话）：并发 / 忙碌 / 等待 / 上限 / 清理。
#
# 前提：DSH GUI 在线（DSH_WEB_URL 指向当前 GUI），目标测试项目已登记为工作区且有工作流。
#   默认项目：/tmp/dsh-awf-e2e（用 awf init 生成；--add-workspace 登记一次）
# 运行：
#   DSH_WEB_URL=http://127.0.0.1:<port> bash test/dispatch-session-loop.sh [项目目录]
#
# 场景：
#   S1 空池派发 → 新建第 1 个
#   S2 池 1 忙 → 新建第 2 个（池<3 可扩充，不等待）
#   S3 池 2 忙 → 新建第 3 个
#   S4 池满 3 全忙 → 排队等待，任一会话空闲后复用（不新建第 4 个）
#   S5 并发两个派发（池内 3 个都空闲）→ 各占一个空闲会话，不新建、不串台
#   S6 --new 池满 3 → 拒绝（上限），不新建
#   cleanup 测试会话：--retire-session 归档 + dsh-session-gc quarantine（可恢复；--trash 永久删除）
set -euo pipefail
KIT="$(cd "$(dirname "$0")/.." && pwd)"
DISPATCH="$KIT/dsh-awf-dashboard/skills/cross-project-dispatch/scripts/awf-dispatch"
GCDIR="$KIT/dsh-awf-dashboard/skills/cross-project-dispatch/scripts"
PROJ="${1:-/tmp/dsh-awf-e2e}"
: "${DSH_WEB_URL:?需要 DSH_WEB_URL（当前 GUI URL）}"

python3 - "$DISPATCH" "$PROJ" "$DSH_WEB_URL" "$GCDIR" <<'PY'
import importlib.machinery
import importlib.util
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path

DISPATCH, PROJ, URL, GCDIR = sys.argv[1:5]
DISPATCH = Path(DISPATCH).resolve()
target = Path(PROJ).resolve()

loader = importlib.machinery.SourceFileLoader("awfd_e2e", str(DISPATCH))
spec = importlib.util.spec_from_loader(loader.name, loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)

api = m.DshApi(URL)
env = dict(os.environ)
env["DSH_WEB_URL"] = URL
results = []

# 测试项目需已登记为 DSH 工作区；缺了就登记，测试结束后删除（仅删除本次创建的）
_ws = m.find_workspace(target)
_created_ws_id = None
if _ws is None:
    _ws = api.workspace_create(target)
    _created_ws_id = _ws.get("workspaceId")
    print("已登记测试工作区:", _created_ws_id)


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (("  " + str(detail)) if detail and not cond else ""))


def pool():
    return m.project_awf_pool(api.sessions(), target)


def wait_for(pred, timeout=120, interval=1.0):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if pred():
                return True
        except Exception:
            pass
        time.sleep(interval)
    return False


def task_file(tid, text):
    p = target / f"task-{tid}.md"
    p.write_text(
        f"# {tid} awf 派发实战循环\n\n"
        f"- 来源：用户\n- 目标项目：{target}\n- 任务编号：{tid}\n- 类型：dev\n- 模块：测试\n"
        f"- 路由裁决（e2e → dsh-awf-e2e）：目标=dsh-awf-e2e / 通道=awf-dispatch / 理由=派发实战循环测试\n\n"
        f"## 用户意图\n任务：{tid} {text}\n\n"
        f"## 硬约束\n- 目标项目与任务 ID：{target} / {tid}\n\n"
        f"## 验收标准\n- [ ] 完成\n",
        encoding="utf-8",
    )
    return p


def cli_args(tid, extra=()):
    return [sys.executable, str(DISPATCH), str(target), str(task_file(tid, "")), *extra]


def dispatch(tid, text, extra=(), timeout=150):
    task = task_file(tid, text)
    cmd = [sys.executable, str(DISPATCH), str(target), str(task), *extra]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env)


def start_dispatch(tid, text, extra=()):
    task = task_file(tid, text)
    cmd = [sys.executable, str(DISPATCH), str(target), str(task), *extra]
    return subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)


def titles():
    return [m.session_title(r) or "" for r in pool()]


def cleanup():
    """测试会话清理：等回合结束后归档 + 移入回收区（可恢复）。"""
    wait_for(lambda: all(r.get("running") is False for r in pool()), timeout=120)
    sids = [r["sessionId"] for r in pool()]
    for sid in sids:
        subprocess.run([sys.executable, str(DISPATCH), "--retire-session", sid, "--apply"],
                       capture_output=True, text=True, env=env)
    gc = Path(GCDIR) / "dsh-session-gc"
    if gc.is_file() and sids:
        r = subprocess.run([str(gc), "quarantine", "--ids", ",".join(sids), "--apply"],
                           capture_output=True, text=True)
        print("cleanup(gc):", (r.stdout or r.stderr).strip()[-300:])
    print("cleanup: 归档测试会话", sids, "→ 池剩余", len(pool()))
    if _created_ws_id:
        try:
            api.rpc("workspace/delete", {"request": {"workspaceId": _created_ws_id}})
            print("cleanup: 已删除本次创建的测试工作区", _created_ws_id)
        except Exception as exc:
            print("cleanup: 删除测试工作区失败（留待人工）：", exc)
    return sids


try:
    # 起始：清掉上轮残留测试会话（确保空池）
    stale = [r["sessionId"] for r in pool()]
    for sid in stale:
        subprocess.run([sys.executable, str(DISPATCH), "--retire-session", sid, "--apply"],
                       capture_output=True, text=True, env=env)
    check("起始清理：目标项目 [awf] 池为空", len(pool()) == 0, [r["sessionId"] for r in pool()])

    BUSY = ("这是自动化测试任务：只执行 bash 命令 sleep 15，然后回复 OK 结束本回合；"
            "不要创建任务/账本、不要 commit、不要调用其他工具。")

    # S1 空池 → 新建
    r1 = dispatch("TEST-E2E-1", BUSY)
    check("S1 空池 → 新建第 1 个 [awf] 会话", r1.returncode == 0 and len(pool()) == 1,
          (r1.stdout + r1.stderr)[-300:])
    check("S1 派发输出含「任务已发送」", "任务已发送" in r1.stdout, r1.stdout[-200:])

    # S2 池 1 忙 → 新建第 2 个（<3 可扩充）
    r2 = dispatch("TEST-E2E-2", BUSY)
    check("S2 池 1 忙 → 新建第 2 个（池<3 可扩充，不等待）",
          r2.returncode == 0 and len(pool()) == 2, (r2.stdout + r2.stderr)[-300:])

    # S3 池 2 忙 → 新建第 3 个
    r3 = dispatch("TEST-E2E-3", BUSY)
    check("S3 池 2 忙 → 新建第 3 个（到上限）",
          r3.returncode == 0 and len(pool()) == 3, (r3.stdout + r3.stderr)[-300:])

    # S4 池满 3 全忙 → 排队等空闲（不新建第 4 个）
    p4 = start_dispatch("TEST-E2E-4", "只回复 OK，立即结束本回合，不要调用任何工具。",
                        extra=("--queue-timeout", "300"))
    time.sleep(5)
    check("S4 池满 3 全忙 → 排队等待，不新建第 4 个", len(pool()) == 3, len(pool()))
    try:
        out4, err4 = p4.communicate(timeout=150)
    except subprocess.TimeoutExpired:
        p4.kill()
        out4, err4 = p4.communicate()
        err4 = "S4 等待超时（330s）：池内会话回合过长，未观测到复用"
    check("S4 任一会话空闲后复用并发送成功（不新建）",
          p4.returncode == 0 and len(pool()) == 3, (out4 + err4)[-300:])

    # S5 池内都空闲时并发两个派发 → 各占一个空闲会话，不新建
    wait_for(lambda: len(pool()) == 3 and all(r.get("running") is False for r in pool()), timeout=120)
    NOOP5 = "只回复 {ok}，立即结束本回合；不要创建任务/账本、不要 commit、不要调用其他工具。"
    pa = start_dispatch("TEST-E2E-5A", NOOP5.format(ok="OK-A"))
    pb = start_dispatch("TEST-E2E-5B", NOOP5.format(ok="OK-B"))
    oa, ea = pa.communicate(timeout=150)
    ob, eb = pb.communicate(timeout=150)
    wait_for(lambda: len(pool()) == 3 and all(r.get("running") is False for r in pool()), timeout=120)
    ts = titles()
    check("S5 并发两派发：均成功且不新建第 4 个",
          pa.returncode == 0 and pb.returncode == 0 and len(pool()) == 3, (oa + ea + ob + eb)[-300:])
    check("S5 两个任务分别落到不同会话（不串台）",
          sum("TEST-E2E-5A" in t for t in ts) == 1 and sum("TEST-E2E-5B" in t for t in ts) == 1, ts)

    # S6 --new 池满 3 → 拒绝（上限）
    r6 = dispatch("TEST-E2E-6", "只回复 OK。", extra=("--new",))
    check("S6 --new 池满 3 → 拒绝（上限，不新建第 4 个）",
          r6.returncode != 0 and "上限" in (r6.stdout + r6.stderr) and len(pool()) == 3,
          (r6.stdout + r6.stderr)[-300:])

    # S7 坏会话隔离（真实）：把一个真实池内会话写入隔离台账 → 派发必须跳过它
    wait_for(lambda: len(pool()) == 3 and all(r.get("running") is False for r in pool()), timeout=120)
    bad = pool()[0]["sessionId"]
    m.quarantine_session(bad, "e2e 模拟坏会话（隔离过滤）", ttl=120)
    r7 = dispatch("TEST-E2E-7", "只回复 OK-7。")
    check("S7 真实坏会话（隔离台账）→ 派发不复用它",
          r7.returncode == 0 and bad not in r7.stdout, (r7.stdout + r7.stderr)[-300:])
    check("S7 被隔离会话标题未被本次任务改写",
          "TEST-E2E-7" not in "".join(t for sid, t in
                                     {r["sessionId"]: m.session_title(r) or "" for r in pool()}.items()
                                     if sid == bad),
          bad)
    try:
        qpath = m.quarantine_ledger_path()
        if qpath.is_file():
            qdata = json.loads(qpath.read_text(encoding="utf-8"))
            qdata.get("sessions", {}).pop(bad, None)
            if qdata.get("sessions"):
                qpath.write_text(json.dumps(qdata, ensure_ascii=False, indent=2), encoding="utf-8")
            else:
                qpath.unlink()
    except Exception as exc:
        print("S7 清理隔离台账异常：", exc)

    # S8 启动确认兜底（真实模拟）：archive→unarchive 制造"历史会话"，派发时若未启动 → 自动隔离重发
    a_sid = None
    try:
        created = api.create_session(_ws.get("workspaceId"))
        a_sid = created["sessionId"]
        api.rename(a_sid, "[awf] [lead] [TEST-E2E-8 坏会话模拟]")
        api.archive_session(a_sid)
        try:
            api.rpc("workspace/unarchiveSession", {"request": {"sessionId": a_sid}})
        except Exception:
            pass
        try:
            api.prompt(a_sid, "ping（自动化测试，勿执行）", str(uuid.uuid4()))
        except Exception:
            pass
        started = False
        for _ in range(8):
            time.sleep(1)
            ra = {r["sessionId"]: r for r in api.sessions()}.get(a_sid)
            if ra and ra.get("running") is True:
                started = True
                break
        if started:
            print("SKIP S8：宿主未复现『历史会话入队不启动』（该会话正常启动）；"
                  "兜底分支由 DEV-230 单元用例覆盖")
        else:
            r8 = dispatch("TEST-E2E-8", "只回复 OK-8。", extra=("--launch-timeout", "5"))
            check("S8 真实坏会话（未启动）→ 自动隔离并新建重发",
                  r8.returncode == 0 and ("未启动" in r8.stdout or "自动切换" in r8.stdout),
                  (r8.stdout + r8.stderr)[-400:])
            check("S8 坏会话已归档/隔离",
                  a_sid not in {r["sessionId"] for r in pool()}
                  or a_sid in m.load_quarantined_session_ids(), a_sid)
    except Exception as exc:
        print("SKIP S8：无法制造坏会话（", exc, "）")
    finally:
        if a_sid:
            try:
                api.archive_session(a_sid)
            except Exception:
                pass
finally:
    try:
        cleanup()
    except Exception as exc:  # 清理异常不掩盖测试结果
        print("cleanup 异常：", exc)

failed = [name for name, ok in results if not ok]
print(f"\n== 实战循环结果：PASS {len(results)-len(failed)} / FAIL {len(failed)} ==")
for name in failed:
    print("  FAIL:", name)
sys.exit(0 if not failed else 1)
PY
