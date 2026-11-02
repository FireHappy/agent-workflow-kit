// DEV-026 路由级测试：POST /awf/team/start
// 用桩 ctx 捕获 webServer.register 的 handler，验证：
//   1) prompt 注入时传 NEVER_ABORTED_SIGNAL（宿主必传 AbortSignal 第二参，P1 修复）
//   2) outcome.accepted=true → team.prompted=true（真实生效分支）
//   3) sessionController 缺失/无 sessionId → 降级 team.prompted=false 且登记成功
// 只读验证，不触碰真实文件系统（临时目录 + 桩 ctx）。
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apply, ledgerWatchers } from '../lib/index.js'

// DEV-033 块 B：测试结束后关闭所有 fs.watch（否则句柄让测试进程不退出）
after(() => {
  for (const [path, watcher] of ledgerWatchers) {
    try { watcher.close() } catch { /* 已关闭 */ }
    ledgerWatchers.delete(path)
  }
})

/** 收集 webServer.register 的 handler 并返回按 path 索引的 map。 */
function captureCtx({ sessionController, requestRejection } = {}) {
  const handlers = {}
  const ctx = {
    effect(fn) { fn() },
    get(name) {
      if (name === 'sessionController') return sessionController
      return undefined
    },
    connection: {
      requestRejection(req) { return requestRejection ? requestRejection(req) : undefined },
    },
    webServer: {
      register(desc) {
        handlers[desc.path] = { kind: desc.kind, handler: desc.handler }
        return () => {}
      },
    },
  }
  apply(ctx)
  return { ctx, handlers }
}

/** 构造可被 handler 消费的 req/res 桩。 */
function fakeReqRes({ body, method = 'POST' }) {
  const listeners = {}
  const req = {
    method, url: '/awf/team/start', headers: {},
    on(ev, cb) { (listeners[ev] = listeners[ev] || []).push(cb) },
    emit(ev, chunk) { (listeners[ev] || []).forEach((cb) => cb(chunk)) },
    destroy() {},
  }
  const raw = Buffer.from(JSON.stringify(body))
  setImmediate(() => {
    req.emit('data', raw)
    req.emit('end')
  })
  const resListeners = {}
  const res = {
    statusCode: 0, headers: {}, body: '',
    setHeader(k, v) { this.headers[k] = v },
    getHeader(k) { return this.headers[k] },
    write(chunk) { this.body += String(chunk || ''); return true },
    end(body) { if (body != null) this.body += String(body) },
    on(ev, cb) { (resListeners[ev] = resListeners[ev] || []).push(cb) },
    emit(ev) { (resListeners[ev] || []).forEach((cb) => cb()) },
  }
  return { req, res }
}

test('team/start: prompt 注入必传 signal 且 accepted → prompted:true', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'awf-ts-'))
  const awf = join(dir, 'agent-workflow', 'tasks', 'dev')
  await mkdir(awf, { recursive: true })
  await writeFile(join(awf, 'todo.md'), [
    '# 待开发', '',
    '| 任务ID | 优先级 | 描述 | 登记日期 |',
    '|--------|--------|------|----------|',
    '| DEV-800 | P1 | 建队验证 | 2026-11-02 |',
  ].join('\n') + '\n')
  await writeFile(join(awf, 'current.md'), '# 正在开发\n\n（暂无进行中任务）\n')

  let captured = null
  const sessionController = {
    async prompt(request, signal) {
      captured = { request, signal }
      return { accepted: true }
    },
  }
  const { handlers } = captureCtx({ sessionController })
  const { req, res } = fakeReqRes({
    body: { path: dir, type: 'dev', id: 'DEV-800', sessionId: 'sess-test-1', workspaceRoot: dir },
  })
  await handlers['/awf/team/start'].handler(req, res)

  const data = JSON.parse(res.body)
  assert.equal(res.statusCode, 200, 'HTTP 200')
  assert.equal(data.ok, true, 'ok:true')
  assert.equal(data.team.prompted, true, 'accepted → prompted:true（核心生效分支）')
  assert.equal(captured.request.sessionId, 'sess-test-1')
  assert.equal(captured.request.mode, 'queue')
  assert.equal(captured.request.content[0].type, 'text')
  assert.ok(String(captured.request.content[0].text).includes('DEV-800'), '指令含任务 ID')
  assert.ok(captured.request.requestId.startsWith('awf-team-'), 'requestId 前缀正确')
  assert.ok(captured.signal instanceof AbortSignal, 'P1：prompt 必传 AbortSignal 第二参')
  assert.equal(captured.signal.aborted, false, 'signal 不应被中止')

  // 登记仍成功（current.md 有块，todo 行移除）
  const cur = await readFile(join(awf, 'current.md'), 'utf8')
  assert.ok(cur.includes('## [DEV-800]'), 'current.md 应含任务块')
  const todo = await readFile(join(awf, 'todo.md'), 'utf8')
  assert.ok(!todo.includes('DEV-800'), 'todo.md 应移除该行')
})

test('team/start: 无 sessionId 降级 prompted:false 但登记成功', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'awf-ts2-'))
  const awf = join(dir, 'agent-workflow', 'tasks', 'dev')
  await mkdir(awf, { recursive: true })
  await writeFile(join(awf, 'todo.md'), [
    '# 待开发', '',
    '| 任务ID | 优先级 | 描述 | 登记日期 |',
    '|--------|--------|------|----------|',
    '| DEV-801 | P2 | 降级验证 | 2026-11-02 |',
  ].join('\n') + '\n')
  await writeFile(join(awf, 'current.md'), '# 正在开发\n\n（暂无进行中任务）\n')

  const { handlers } = captureCtx({})
  const { req, res } = fakeReqRes({ body: { path: dir, type: 'dev', id: 'DEV-801', workspaceRoot: dir } })
  await handlers['/awf/team/start'].handler(req, res)

  const data = JSON.parse(res.body)
  assert.equal(res.statusCode, 200)
  assert.equal(data.ok, true)
  assert.equal(data.team.prompted, false, '无 sessionId → 降级 prompted:false')
  const cur = await readFile(join(awf, 'current.md'), 'utf8')
  assert.ok(cur.includes('## [DEV-801]'), '登记仍成功（降级不阻断）')
})

test('team/start: prompt 抛错不阻断登记且 prompted:false', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'awf-ts3-'))
  const awf = join(dir, 'agent-workflow', 'tasks', 'dev')
  await mkdir(awf, { recursive: true })
  await writeFile(join(awf, 'todo.md'), [
    '# 待开发', '',
    '| 任务ID | 优先级 | 描述 | 登记日期 |',
    '|--------|--------|------|----------|',
    '| DEV-802 | P1 | 抛错验证 | 2026-11-02 |',
  ].join('\n') + '\n')
  await writeFile(join(awf, 'current.md'), '# 正在开发\n\n（暂无进行中任务）\n')

  const sessionController = {
    async prompt() { throw new Error('boom') },
  }
  const { handlers } = captureCtx({ sessionController })
  const { req, res } = fakeReqRes({
    body: { path: dir, type: 'dev', id: 'DEV-802', sessionId: 'sess-x', workspaceRoot: dir },
  })
  await handlers['/awf/team/start'].handler(req, res)

  const data = JSON.parse(res.body)
  assert.equal(res.statusCode, 200)
  assert.equal(data.ok, true)
  assert.equal(data.team.prompted, false)
  assert.ok(data.team.error.includes('boom'), '错误信息应透传')
  const cur = await readFile(join(awf, 'current.md'), 'utf8')
  assert.ok(cur.includes('## [DEV-802]'), 'prompt 抛错不阻断登记')
})

// ---- DEV-033：/awf/agent/act（判断型操作 agent 注入，程序不改账本） ----

test('agent/act: return-todo 注入指令且程序不写账本', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'awf-act1-'))
  const awf = join(dir, 'agent-workflow', 'tasks', 'dev')
  await mkdir(awf, { recursive: true })
  await writeFile(join(awf, 'todo.md'), '# 待开发\n\n| 任务ID | 优先级 | 描述 | 登记日期 |\n|--------|--------|------|----------|\n')
  await writeFile(join(awf, 'current.md'), [
    '# 正在开发', '',
    '## [DEV-810] 返回待办测试', '',
    '| 字段 | 内容 |',
    '|------|------|',
    '| 优先级 | P1 |',
    '| 状态 | active |',
    '| 最近更新 | 2026-11-02 |',
    '',
  ].join('\n'))

  let captured = null
  const sessionController = {
    async prompt(request, signal) {
      captured = { request, signal }
      return { accepted: true }
    },
  }
  const { handlers } = captureCtx({ sessionController })
  const { req, res } = fakeReqRes({
    body: { path: dir, type: 'dev', id: 'DEV-810', action: 'return-todo', sessionId: 'sess-act', workspaceRoot: dir },
  })
  await handlers['/awf/agent/act'].handler(req, res)

  const data = JSON.parse(res.body)
  assert.equal(res.statusCode, 200)
  assert.equal(data.ok, true)
  assert.equal(data.team.prompted, true, 'accepted → prompted:true')
  assert.equal(captured.request.sessionId, 'sess-act')
  assert.ok(String(captured.request.content[0].text).includes('返回待办'), '指令含返回待办动作')
  assert.ok(String(captured.request.content[0].text).includes('DEV-810'), '指令含任务 ID')
  assert.ok(captured.signal instanceof AbortSignal, 'P1：必传 signal')
  // 程序不写账本：current.md 仍含任务块
  const cur = await readFile(join(awf, 'current.md'), 'utf8')
  assert.ok(cur.includes('## [DEV-810]'), '程序不应移除任务块（agent 负责写）')
})

test('agent/act: delete 注入指令；非法 action 拒绝', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'awf-act2-'))
  const awf = join(dir, 'agent-workflow', 'tasks', 'dev')
  await mkdir(awf, { recursive: true })
  await writeFile(join(awf, 'todo.md'), '# 待开发\n\n| 任务ID | 优先级 | 描述 | 登记日期 |\n|--------|--------|------|----------|\n')
  await writeFile(join(awf, 'current.md'), [
    '# 正在开发', '',
    '## [DEV-811] 删除测试', '',
    '| 字段 | 内容 |',
    '|------|------|',
    '| 优先级 | P1 |',
    '| 状态 | active |',
    '| 修改范围 | dsh-plugin/lib/ |',
    '',
  ].join('\n'))

  let captured = null
  const sessionController = {
    async prompt(request, signal) { captured = { request, signal }; return { accepted: true } },
  }
  const { handlers } = captureCtx({ sessionController })
  const { req, res } = fakeReqRes({
    body: { path: dir, type: 'dev', id: 'DEV-811', action: 'delete', sessionId: 'sess-del', workspaceRoot: dir },
  })
  await handlers['/awf/agent/act'].handler(req, res)
  const data = JSON.parse(res.body)
  assert.equal(data.ok, true)
  assert.equal(data.team.prompted, true)
  assert.ok(String(captured.request.content[0].text).includes('删除'), '指令含删除动作')
  assert.ok(String(captured.request.content[0].text).includes('未提交改动'), '指令提示分析 git 改动')
  const cur = await readFile(join(awf, 'current.md'), 'utf8')
  assert.ok(cur.includes('## [DEV-811]'), '程序不删除任务块')

  // 非法 action
  const bad = fakeReqRes({
    body: { path: dir, type: 'dev', id: 'DEV-811', action: 'hack', sessionId: 'x', workspaceRoot: dir },
  })
  await handlers['/awf/agent/act'].handler(bad.req, bad.res)
  const badData = JSON.parse(bad.res.body)
  assert.equal(bad.res.statusCode, 400)
  assert.equal(badData.error.code, 'bad-request')
})


// ---- DEV-033 块 B（修正版）：直接验证监听/广播纯逻辑，不依赖真实项目索引 ----

test('block B: watchProjectLedger 监听目录，文件变化广播 ledger-changed（跨写者）', async () => {
  // 重建块 B 模块状态（测试共享模块级 Set/Map，用首个导入的模块引用）
  const { watchProjectLedger, sseClients } = await import('../lib/index.js')
  const dir = await mkdtemp(join(tmpdir(), 'awf-watch3-'))
  const taskDir = join(dir, 'agent-workflow', 'tasks', 'dev')
  await mkdir(taskDir, { recursive: true })
  await writeFile(join(taskDir, 'current.md'), '# x\n')

  // 挂起一个 SSE 客户端（模拟 res.write 捕获）
  const buf = []
  const fakeRes = {
    setHeader() {}, getHeader() { return 'text/event-stream' },
    write(c) { buf.push(String(c)); return true }, end() {},
    on() {}, emit() {},
  }
  sseClients.add(fakeRes)
  let watcher = null
  try {
    watcher = watchProjectLedger(dir)
    await new Promise((r) => setTimeout(r, 120))
    await writeFile(join(taskDir, 'current.md'), '# y\n## [DEV-999] 新任务\n') // 任何写者
    await new Promise((r) => setTimeout(r, 300))
    const all = buf.join('')
    assert.ok(all.includes('ledger-changed'), '账本变化广播 ledger-changed 事件')
    assert.ok(all.includes(dir), '事件含项目路径')
  } finally {
    sseClients.delete(fakeRes)
  }
})

test('block B: /awf/events 路由非 GET 拒绝、GET 挂起（SSE）', async () => {
  const { handlers } = captureCtx({})
  const bad = fakeReqRes({ method: 'POST', body: null })
  await handlers['/awf/events'].handler(bad.req, bad.res)
  assert.equal(bad.res.statusCode, 405, 'POST /awf/events → 405')
  const sse = fakeReqRes({ method: 'GET', body: null })
  await handlers['/awf/events'].handler(sse.req, sse.res)
  assert.ok(String(sse.res.getHeader('Content-Type') || '').includes('text/event-stream'), 'GET → SSE 头')
  assert.ok(sse.res.body.includes('retry: 15000'), 'SSE 握手含重连退避')
})

test('block B: broadcastLedgerChange 只向挂起连接写事件，不动已关闭连接', async () => {
  const { broadcastLedgerChange, sseClients } = await import('../lib/index.js')
  const got1 = []
  const got2 = []
  const alive = { setHeader() {}, write(c) { got1.push(String(c)); return true }, end() {}, on() {}, emit() {} }
  const closed = { setHeader() {}, write() { throw new Error('closed res 不应写入') }, end() {}, on() {}, emit() {} }
  sseClients.add(alive)
  sseClients.add(closed)
  try {
    broadcastLedgerChange('/tmp/fake-proj')
    assert.ok(got1.join('').includes('ledger-changed'), '存活连接收到广播')
  } finally {
    sseClients.delete(alive)
    sseClients.delete(closed)
  }
})

// ---- DEV-033 复核 medium：废弃程序写端点（唯一写路径 = agent 注入） ----

test('废弃端点: delete/dry-run 与 delete/execute 返回 410 Gone 提示走 agent 注入', async () => {
  const { handlers } = captureCtx({})
  for (const p of ['/awf/task/delete/dry-run', '/awf/task/delete/execute']) {
    const r = fakeReqRes({ body: { path: '/tmp/x', type: 'dev', id: 'DEV-1', mode: 'rollback', workspaceRoot: '/tmp/x' } })
    await handlers[p].handler(r.req, r.res)
    const data = JSON.parse(r.res.body)
    assert.equal(r.res.statusCode, 410, `${p} → 410 Gone`)
    assert.equal(data.error.code, 'deprecated')
    assert.ok(data.error.message.includes('/awf/agent/act'), '提示改走 agent 注入')
  }
})

test('废弃: /awf/task action=delete|return-todo 拒绝（只留 update/pause/resume）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'awf-dep-'))
  const awf = join(dir, 'agent-workflow', 'tasks', 'dev')
  await mkdir(awf, { recursive: true })
  await writeFile(join(awf, 'current.md'), '# x\n')
  const { handlers } = captureCtx({})
  for (const action of ['delete', 'return-todo']) {
    const r = fakeReqRes({ body: { path: dir, type: 'dev', id: 'DEV-1', action, workspaceRoot: dir } })
    await handlers['/awf/task'].handler(r.req, r.res)
    const data = JSON.parse(r.res.body)
    assert.equal(r.res.statusCode, 400, `${action} 拒绝`)
    assert.ok(data.error.message.includes('/awf/agent/act'), '提示走 agent 注入')
  }
})
