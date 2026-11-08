#!/usr/bin/env bash
# 并发注册回归测试：验证全局索引写入在并发 register / bootstrap 下无丢失更新。
#
# 背景：awf register / bootstrap 对全局索引（projects.tsv 与 AGENTS.md 受控区块）
# 执行「读整份 REGISTRY → 按 P_ID 合并本行 → 原子替换 + 重建索引」的读改写。
# 若未串行化，两个并发进程会互相覆盖对方新增的行（丢失更新）。
# 修复后读改写全程持有互斥锁（优先 flock，退化为 mkdir 原子自旋锁）。
#
# 本测试：用 awf init --no-register 在临时目录造 N 个项目，再并发 register
# （随后再并发 bootstrap 压一遍同一锁路径），断言：
#   - projects.tsv 行数与 AGENTS.md 表格行数均 == N
#   - 无重复 P_ID（按 P_ID 合并生效）
#   - 每行 P_ID / 别名 / 路径正确
#
# 隔离：DSH_AGENTS_HOME 重定向到临时目录，不触碰真实 ~/.agents，可重跑。
# 用法：bash test/registry-concurrency.sh [N]     （N 默认 8，要求 ≥4）
set -eu

KIT="$(cd "$(dirname "$0")/.." && pwd)"
AWF="$KIT/bin/awf"
N="${1:-8}"
if [ "$N" -lt 4 ]; then
  echo "FAIL  并发规模 N 至少为 4（当前 ${N}）" >&2
  exit 1
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/awf-reg.XXXXXX")"
# 归一化：TMPDIR 常带尾斜杠，mktemp 会保留为 //，而 register 子 shell 的
# cd 会把它折叠成单斜杠；统一用 pwd 归一化，保证全路径断言可匹配。
WORK="$(cd "$WORK" && pwd)"
export DSH_AGENTS_HOME="$WORK/.agents"
REG="$DSH_AGENTS_HOME/projects.tsv"
IDX="$DSH_AGENTS_HOME/AGENTS.md"
trap 'rm -rf "$WORK"' EXIT

fail() { echo "FAIL  $*" >&2; exit 1; }
ok()   { echo "ok    $*"; }

if command -v flock >/dev/null 2>&1; then
  LOCK_PATH=flock
else
  LOCK_PATH="mkdir 自旋（本机无 flock）"
fi
echo "# 并发注册测试（N=${N}，锁路径：${LOCK_PATH}）"

# 1. 造 N 个项目（init --no-register，不写全局索引）
for i in $(seq 1 "$N"); do
  "$AWF" init "$WORK/p$i" --id "p$i" --name "P$i" --purpose "并发测试项目" \
    --no-register >/dev/null 2>&1 || fail "init p$i 失败"
done
ok "init 创建 $N 个项目（--no-register）"

# 2. 并发 register：N 个后台进程同时写全局索引
pids=""
for i in $(seq 1 "$N"); do
  ( cd "$WORK/p$i" && "$AWF" register >"$WORK/reg-$i.log" 2>&1 ) &
  pids="$pids $!"
done
for p in $pids; do
  if ! wait "$p"; then
    echo "--- 失败日志 ---"
    cat "$WORK"/reg-*.log 2>/dev/null || true
    fail "并发 register 存在失败进程"
  fi
done
ok "并发 register 全部成功"

# 3. 断言：行数 == N、无重复、每行 P_ID/别名/路径正确
tsv_n="$(grep -c '^p[0-9][0-9]* |' "$REG" || true)"
if [ "$tsv_n" != "$N" ]; then
  echo "--- projects.tsv 实际内容 ---"
  cat "$REG"
  fail "projects.tsv 行数 $tsv_n ≠ ${N}（丢失更新）"
fi
md_n="$(awk '/^<!-- awf:projects:begin -->/{f=1; next}
             /^<!-- awf:projects:end -->/{f=0}
             f && /^\| p[0-9][0-9]* \|/{c++}
             END{print c+0}' "$IDX")"
[ "$md_n" = "$N" ] || fail "AGENTS.md 表格行数 $md_n ≠ $N"
dup="$(grep -o '^p[0-9][0-9]*' "$REG" | sort | uniq -d)"
[ -z "$dup" ] || fail "P_ID 重复：$dup"
for i in $(seq 1 "$N"); do
  grep -F "p$i | P$i | $WORK/p$i | AGENTS.md" "$REG" >/dev/null \
    || fail "projects.tsv 缺少 p$i 行或 P_ID/别名/路径错误"
done
ok "register 后：projects.tsv=$tsv_n 行 / AGENTS.md 表格=$md_n 行 / 无重复 / 行内容正确"

# 4. 并发 bootstrap：再压一遍同一锁路径（bootstrap 也会刷新全局索引）
pids=""
for i in $(seq 1 "$N"); do
  ( cd "$WORK/p$i" && "$AWF" bootstrap >"$WORK/bs-$i.log" 2>&1 ) &
  pids="$pids $!"
done
for p in $pids; do
  if ! wait "$p"; then
    echo "--- 失败日志 ---"
    cat "$WORK"/bs-*.log 2>/dev/null || true
    fail "并发 bootstrap 存在失败进程"
  fi
done

tsv_n2="$(grep -c '^p[0-9][0-9]* |' "$REG" || true)"
md_n2="$(awk '/^<!-- awf:projects:begin -->/{f=1; next}
              /^<!-- awf:projects:end -->/{f=0}
              f && /^\| p[0-9][0-9]* \|/{c++}
              END{print c+0}' "$IDX")"
if [ "$tsv_n2" != "$N" ]; then
  echo "--- projects.tsv 实际内容 ---"
  cat "$REG"
  fail "bootstrap 后 projects.tsv 行数 $tsv_n2 ≠ ${N}（丢失更新）"
fi
[ "$md_n2" = "$N" ] || fail "bootstrap 后 AGENTS.md 表格行数 $md_n2 ≠ $N"
for i in $(seq 1 "$N"); do
  grep -F "p$i | P$i | $WORK/p$i | AGENTS.md" "$REG" >/dev/null \
    || fail "bootstrap 后 projects.tsv 缺少 p$i 行"
done
ok "bootstrap 后：projects.tsv=$tsv_n2 行 / AGENTS.md 表格=$md_n2 行 / 行内容正确"

# 5. 锁残留检查：按实际锁模式断言（flock 平台锁文件常驻不删除，不能断言不存在）
if command -v flock >/dev/null 2>&1; then
  # flock 模式：锁文件预期常驻；断言其存在且可正常获取/释放（无残留占用）
  LOCKF="$DSH_AGENTS_HOME/.awf-registry.lock"
  [ -f "$LOCKF" ] || fail "flock 模式：锁文件 $LOCKF 不存在（预期常驻）"
  if ( exec 9>"$LOCKF" && flock -n 9 ); then
    ok "flock 模式：锁文件存在且可正常获取/释放"
  else
    fail "flock 模式：锁文件 $LOCKF 无法获取（疑似残留占用）"
  fi
else
  # mkdir 模式：释放时 rmdir 删除锁目录，断言无残留
  [ ! -e "$DSH_AGENTS_HOME/.awf-registry.lock" ] \
    || fail "锁残留：$DSH_AGENTS_HOME/.awf-registry.lock 未被释放"
  ok "mkdir 模式：锁已释放无残留"
fi

echo ""
echo "全部通过：并发 register/bootstrap 无丢失更新（N=${N}，${LOCK_PATH}）"
