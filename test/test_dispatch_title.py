#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""awf-dispatch 会话标题（DEV-134：[awf] [派发者] [任务名]）与复用判定单测。

运行：python3 -m unittest test.test_dispatch_title   （或直接 python3 test/test_dispatch_title.py）
"""
import os
import sys
import unittest
from pathlib import Path

KIT = Path(__file__).resolve().parent.parent

# 派发实现由技能自带；使用源码文本加载带连字符的脚本。
DISPATCH = KIT / "skills" / "cross-project-dispatch" / "scripts" / "awf-dispatch"
_dispatch_src = DISPATCH.read_text(encoding="utf-8")
awf_dispatch = type(sys)("awf_dispatch")
exec(compile(_dispatch_src, str(DISPATCH), "exec"), awf_dispatch.__dict__)


class TitleFormat(unittest.TestCase):
    def test_full_title(self):
        t = awf_dispatch.awf_session_title("lead", "UP-102 版本锚点 VERSION=1.0.0")
        self.assertEqual(t, "[awf] [lead] [UP-102 版本锚点 VERSION=1.0.0]")

    def test_sender_cleaned_of_brackets(self):
        t = awf_dispatch.awf_session_title("lead[dev]", "任务")
        self.assertTrue(t.startswith("[awf] ["))

    def test_default_task_placeholder(self):
        t = awf_dispatch.awf_session_title("lead")
        self.assertEqual(t, "[awf] [lead] [未命名任务]")

    def test_task_display_with_id_in_title(self):
        # 标题自带编号：原样保留（作者写什么就显示什么）
        msg = "# UP-102 版本锚点 VERSION=1.0.0\n\n说明……"
        d = awf_dispatch.task_display(Path("up-102.md"), msg)
        self.assertTrue(d.startswith("UP-102"))
        self.assertIn("版本锚点", d)

    def test_task_display_never_injects_file_id(self):
        # DEV-136：文件名里的编号（UP-xxx 等）绝不拼进任务名段——我们没有 UP 类型
        d = awf_dispatch.task_display(Path("up-103.md"), "# 工作流架构升级")
        self.assertEqual(d, "工作流架构升级")
        self.assertNotIn("UP-103", d)
        self.assertNotIn("up-103", d)

    def test_task_display_no_id(self):
        d = awf_dispatch.task_display(Path("misc.md"), "# 简单任务标题")
        self.assertEqual(d, "简单任务标题")

    def test_task_display_truncates(self):
        long = "# " + "很长的任务标题" * 12
        d = awf_dispatch.task_display(Path("long.md"), long, limit=20)
        self.assertLessEqual(len(d), 20)


class SenderResolve(unittest.TestCase):
    def test_flag_wins(self):
        self.assertEqual(awf_dispatch.resolve_sender("派发者：captain\n# t", "member"), "member")

    def test_ticket_line(self):
        self.assertEqual(awf_dispatch.resolve_sender("派发者：captain\n# t"), "captain")

    def test_default_dispatch_project(self):
        # DEV-136：无 --sender/票据行时，派发者段默认 = 调度方项目名（发起派发的会话所在项目）
        self.assertEqual(awf_dispatch.resolve_sender("# 任务"), "agent-workflow-kit")

    def test_ticket_sender_missing(self):
        self.assertEqual(awf_dispatch.ticket_sender("# 任务"), "")


class TitleSenderExtract(unittest.TestCase):
    def test_with_task(self):
        self.assertEqual(awf_dispatch.awf_title_sender("[awf] [lead] [UP-102 版本锚点]"), "lead")

    def test_without_task(self):
        self.assertEqual(awf_dispatch.awf_title_sender("[awf] [lead]"), "lead")

    def test_legacy_shape(self):
        self.assertEqual(awf_dispatch.awf_title_sender("[awf] 周报"), "")

    def test_non_awf(self):
        self.assertEqual(awf_dispatch.awf_title_sender("[leadership] 项目"), "")

    def test_sender_prefix_not_confused(self):
        # [lead] 不能误吞 [leadership]
        self.assertEqual(awf_dispatch.awf_title_sender("[awf] [leadership] x"), "leadership")


class ReuseSelection(unittest.TestCase):
    def rows(self, *titles, cwd="/proj/x"):
        out = []
        for i, title in enumerate(titles):
            out.append({
                "sessionId": f"session-{i}",
                "projections": {"values": {"title": title}},
                "cwd": cwd, "running": False, "updatedAt": i, "blank": False,
            })
        return out

    def test_reuse_same_sender_any_task(self):
        rows = self.rows("[awf] [lead] [UP-101 升级 1.0.0]", "[awf] [lead] [微信提现修复]")
        row = awf_dispatch.select_reuse_session(rows, Path("/proj/x"), sender="lead")
        self.assertIsNotNone(row)
        self.assertEqual(row["sessionId"], "session-1")  # updatedAt 最新优先

    def test_reuse_same_sender_latest(self):
        rows = self.rows("[awf] [lead] [旧任务]", "[awf] [lead] [新任务]")
        rows[0]["updatedAt"] = 100
        row = awf_dispatch.select_reuse_session(rows, Path("/proj/x"), sender="lead")
        self.assertEqual(row["sessionId"], "session-0")

    def test_no_reuse_different_sender(self):
        rows = self.rows("[awf] [member] [UP-101]")
        row = awf_dispatch.select_reuse_session(rows, Path("/proj/x"), sender="lead")
        self.assertIsNone(row)

    def test_no_reuse_other_cwd(self):
        rows = self.rows("[awf] [lead] [UP-101]", cwd="/proj/other")
        row = awf_dispatch.select_reuse_session(rows, Path("/proj/x"), sender="lead")
        self.assertIsNone(row)

    def test_legacy_awf_shape_upgraded_to_lead_pool(self):
        # DEV-134：旧格式 [awf] <项目>（无派发者段）归 lead 池——复用后升级改名
        rows = self.rows("[awf] 周报")
        row = awf_dispatch.select_reuse_session(rows, Path("/proj/x"), sender="lead")
        self.assertIsNotNone(row)
        self.assertEqual(row["sessionId"], "session-0")

    def test_user_shape_not_reused_without_probe(self):
        # 用户普通会话（<项目> · xxx，无 [awf] 段）不算 lead 池，默认不复用
        rows = self.rows("周报 · 用户的分析记录")
        row = awf_dispatch.select_reuse_session(rows, Path("/proj/x"), sender="lead")
        self.assertIsNone(row)

    # ---- DEV-134 并发上限：同派发者同项目最多 3 个会话 ----
    def busy_rows(self, n, sender="lead", cwd="/proj/x"):
        out = []
        for i in range(n):
            out.append({
                "sessionId": f"busy-{i}",
                "projections": {"values": {"title": f"[awf] [{sender}] [任务{i}]"}},
                "cwd": cwd, "running": True, "updatedAt": i, "blank": False,
            })
        return out

    def test_pool_full_all_busy_returns_wait_candidate(self):
        # 3 个都忙 → 返回忙碌候选（调用方等待，不新建第 4 个）
        rows = self.busy_rows(3)
        row = awf_dispatch.select_reuse_session(rows, Path("/proj/x"), sender="lead")
        self.assertIsNotNone(row)
        self.assertTrue(row["running"])

    def test_pool_under_cap_all_busy_returns_none(self):
        # 2 个都忙、池未满 → None（新建扩充并发到第 3 个）
        rows = self.busy_rows(2)
        row = awf_dispatch.select_reuse_session(rows, Path("/proj/x"), sender="lead")
        self.assertIsNone(row)

    def test_pool_full_but_idle_preferred(self):
        # 3 个里有空闲 → 复用空闲（哪怕同池有忙碌的）
        rows = self.busy_rows(2) + [{
            "sessionId": "idle-9",
            "projections": {"values": {"title": "[awf] [lead] [旧任务]"}},
            "cwd": "/proj/x", "running": False, "updatedAt": 99, "blank": False,
        }]
        row = awf_dispatch.select_reuse_session(rows, Path("/proj/x"), sender="lead")
        self.assertEqual(row["sessionId"], "idle-9")

    def test_pool_counted_per_sender(self):
        # 别的派发者（member）有 3 个忙会话，不影响 lead 新建
        rows = self.busy_rows(3, sender="member")
        row = awf_dispatch.select_reuse_session(rows, Path("/proj/x"), sender="lead")
        self.assertIsNone(row)


if __name__ == "__main__":
    unittest.main(verbosity=2)