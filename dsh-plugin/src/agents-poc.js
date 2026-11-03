// dsh-awf-dashboard — DEV-039 POC：宿主 ctx.agents.create() 最小拉起骨架
//
// 结论来源（宿主编译产物，app.asar 内同名路径，等价于宿主源码）：
//   dsh/node_modules/@deepseek-ai/dsh-agent/lib/index.js            → AgentRegistry（服务 ctx.agents）
//   dsh/node_modules/@deepseek-ai/dsh-agent/lib/types/index.js      → create/resume/AgentHandle 声明与文档
//   dsh/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js       → createAgent/resume 工厂实现（dispose 语义）
//   dsh/node_modules/@deepseek-ai/dsh-session/lib/index.js          → 会话事件模型（user/message、assistant/message、turn/end）
//   dsh/node_modules/@deepseek-ai/dsh-headless/lib/index.js         → 最小拉起权威示例（create → followup → whenIdle 等待 → summarize）
//   dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js → createAgent 组合 cwd/preset 的示例
//   dsh/node_modules/@deepseek-ai/dsh-subagent/lib/index.js         → 子代理包装（followup 投递 prompt 的标准路径）
//
// 已确认的宿主契约（见 dsh-plugin/agents-create-poc.md 全文）：
//   ctx.agents.create(options: CreateAgentOptions): Promise<AgentHandle>
//   CreateAgentOptions = {
//     sessionId: string                    // 会话命名：唯一 id（如 `session-<uuid>`）；plain string 即可，宿主内部 brand
//     parentAgent?: {id: string}           // 可选：运行时父代理
//     meta?: { cwd?: string(绝对路径), parentSession?: string, isSeeded?: boolean,
//              origin?: 'subagent', delegationDepth?: number, agentPreset?: string }
//     inheritedEventCount?: number         // 仅 fork 场景需要
//     seed?: SessionEvent[]                // 可选：初始会话事件（fork/续播用；首条 prompt 用 followup 更简单）
//     agentOptions?: { provider?: string, model?: string, reasoningEffort?: string, maxTokens?: number }
//     signal?: AbortSignal                 // 仅创建/setup 阶段取消
//     setup?: (agentCtx, agent) => void|Promise|{commit()}   // 发布前钩子（预设/工作目录等）
//   }
//   AgentHandle = { agent: Agent; dispose(): Promise<void> }   // dispose 为完整拆除（cancel → whenIdle → scope.dispose → 存储关闭 → 注销）
//   Agent = { id, session, ctx, status('idle'|'running'), followup(msg), whenIdle(), cancel(cause), ... }
//
// 本模块不 import 任何宿主包（插件运行时无法解析 app.asar 内私有依赖，保持零宿主依赖，
// 与 lib/index.js 现状一致）；prompt 消息对象按宿主 createUserMessage 的结构等价物内联构造。
// 导出纯函数供单测（mock 宿主契约），runSubagent 为可复用最小拉起骨架。

import { randomUUID } from 'node:crypto'

// ---------------------------------------------------------------------------
// 消息构造（等价 @deepseek-ai/dsh-llm createUserMessage 的结构化字段；
// 宿主 assertMessageEventShape 只校验 id/role/source.kind/content，品牌符号非必需）
// ---------------------------------------------------------------------------

/** 构造一条 user-role prompt 消息（宿主 createUserMessage 的 plain 等价物）。 */
export function makeUserMessage(text) {
  if (typeof text !== 'string' || text.length === 0) throw new TypeError('prompt text must be a non-empty string')
  return Object.freeze({
    id: randomUUID(),
    role: 'user',
    source: { kind: 'user' },
    content: [{ type: 'text', text }],
  })
}

// ---------------------------------------------------------------------------
// 运行时探测（宿主缺参数形态文档时的兜底；也用于上线前确认服务在位）
// ---------------------------------------------------------------------------

/**
 * 探测宿主 ctx.agents 服务的存在与契约形态（只读，不创建任何代理）。
 * @param {object} ctx Cordis 插件上下文
 * @returns {{available: boolean, reason?: string, createType?: string, createArity?: number,
 *            hasResume?: boolean, hasGet?: boolean, hasList?: boolean,
 *            factoryReady?: boolean, liveAgentCount?: number, handleContract?: string[]}}
 */
export function probeAgentsService(ctx) {
  const agents = ctx && typeof ctx.get === 'function' ? ctx.get('agents') : undefined
  if (!agents) return { available: false, reason: 'ctx.get("agents") 返回空：宿主未加载 dsh-agent（dsh-base 缺省应已含）' }
  const report = {
    available: true,
    createType: typeof agents.create,
    createArity: typeof agents.create === 'function' ? agents.create.length : undefined,
    hasResume: typeof agents.resume === 'function',
    hasGet: typeof agents.get === 'function',
    hasList: typeof agents.list === 'function',
    factoryReady: true,
    liveAgentCount: undefined,
    handleContract: undefined,
  }
  if (report.createType !== 'function') return { ...report, available: false, reason: 'agents.create 不是函数' }
  // 工厂未注册时 requireFactory 抛 'no agent factory registered'（dsh-agent-loop 未加载）
  try {
    agents.requireFactory()
  } catch (error) {
    report.factoryReady = false
    report.reason = `agents 服务在位但工厂未注册：${error instanceof Error ? error.message : String(error)}`
  }
  try {
    report.liveAgentCount = typeof agents.list === 'function' ? agents.list().length : undefined
  } catch { /* 只读探测失败不影响结论 */ }
  return report
}

// ---------------------------------------------------------------------------
// 纯组装：CreateAgentOptions
// ---------------------------------------------------------------------------

/**
 * 组装 ctx.agents.create 的 options（DEV-039 只用到最小字段集）。
 * @param {object} input
 * @param {string} [input.sessionId]              会话命名；缺省 `session-<uuid>`
 * @param {string} input.cwd                      工作区绝对路径（meta.cwd）
 * @param {string} [input.provider]               模型 provider
 * @param {string} [input.model]                  模型 model
 * @param {string} [input.parentSessionId]        可选：父会话 id（meta.parentSession）
 * @param {string} [input.agentPreset]            可选：agent 预设 id（meta.agentPreset）
 * @param {object} [input.extraAgentOptions]      可选：更多 agentOptions（reasoningEffort/maxTokens）
 * @returns {{sessionId: string, meta: object, agentOptions: object}}
 */
export function buildCreateOptions({ sessionId, cwd, provider, model, parentSessionId, agentPreset, extraAgentOptions } = {}) {
  if (typeof cwd !== 'string' || !cwd.startsWith('/')) throw new TypeError('cwd 必须是绝对路径字符串（会话 header 校验绝对路径）')
  const meta = {}
  if (typeof cwd === 'string') meta.cwd = cwd
  if (parentSessionId) meta.parentSession = parentSessionId
  if (agentPreset) meta.agentPreset = agentPreset
  const agentOptions = { ...extraAgentOptions }
  if (provider) agentOptions.provider = provider
  if (model) agentOptions.model = model
  return {
    sessionId: sessionId && String(sessionId).trim() ? String(sessionId).trim() : `session-${randomUUID()}`,
    ...(Object.keys(meta).length ? { meta } : {}),
    ...(Object.keys(agentOptions).length ? { agentOptions } : {}),
  }
}

// ---------------------------------------------------------------------------
// 等待子代理完成（沿 dsh-headless run() 的权威模式）
// ---------------------------------------------------------------------------

/**
 * 等待 agent 回到 idle 且事件序稳定（一轮完整 turn 结束）。
 * 可选对接 ctx.get('subagents')?.waitForChildren 判定派生子代理是否仍在跑。
 * @param {object} agent AgentHandle.agent
 * @param {object} [options]
 * @param {number} [options.timeoutMs] 超时（ms），超时抛 {code:'timeout'}
 * @param {AbortSignal} [options.signal] 外部取消
 * @returns {Promise<void>}
 */
export async function waitAgentIdle(agent, { timeoutMs = 120_000, signal } = {}) {
  let timer
  let finished = false
  const onAbort = () => {
    clearTimeout(timer)
    rejectTimeout(Object.assign(new Error('agent wait aborted'), { code: 'aborted' }))
  }
  let rejectTimeout
  const timeout = new Promise((_, reject) => {
    rejectTimeout = reject
    timer = setTimeout(() => {
      reject(Object.assign(new Error(`agent "${agent.id}" 未在 ${timeoutMs}ms 内回到 idle`), { code: 'timeout' }))
    }, timeoutMs)
    if (signal) signal.addEventListener('abort', onAbort, { once: true })
  })
  const settled = (async () => {
    let subagents
    try { subagents = agent.ctx?.get('subagents') } catch { /* 无可选服务 */ }
    for (;;) {
      if (finished) return // race 已分出胜负（超时/返回），停止空转
      await agent.whenIdle()
      const idleSeq = agent.session.seq
      // 宿主返回值表示“本轮是否 join 过子任务”，不是“子任务是否完成”。
      // false = 没有待 join 工作，正常可退出；true = 刚 join 过工作，需重新检查父代理。
      const observedChildren = await subagents?.waitForChildren?.(agent)
      if (!observedChildren && agent.status === 'idle' && agent.session.seq === idleSeq) return
      if (finished) return
      // 未退出（新活动启动/状态未稳）：让出一次宏任务，避免微任务自旋饿死事件循环
      // （否则 whenIdle 恒为已 resolve 时，超时计时器永远无法触发）。
      await new Promise((resolve) => setImmediate(resolve))
    }
  })()
  try {
    return await Promise.race([settled, timeout])
  } finally {
    finished = true
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onAbort)
  }
}

/**
 * 汇总一段运行：最后一条 assistant/message 文本 + 最终 turn/end reason。
 * 与 dsh-headless summarize() 同构（只读 session.eventAt）。
 * @param {object} session Agent.session
 * @param {number} firstSeq 运行起始 seq（create 完成后捕获）
 * @returns {{text: string, reason: ({kind: 'completed'}|{kind: 'error', error: object}|{kind: 'aborted', reason: object})|undefined}}
 */
export function summarizeRun(session, firstSeq) {
  let started = false
  let text = ''
  let reason
  const length = session.seq
  for (let seq = firstSeq; seq < length; seq++) {
    const event = session.eventAt(seq)
    if (event === undefined) continue
    if (event.type === 'turn/start') { started = true; continue }
    if (!started) continue
    if (event.type === 'assistant/message') {
      const joined = (event.data.message?.content || [])
        .filter((block) => block && block.type === 'text')
        .map((block) => block.text).join('')
      if (joined !== '') text = joined
    }
    if (event.type === 'turn/end') reason = event.data.reason
  }
  return { text, reason }
}

// ---------------------------------------------------------------------------
// 最小拉起：创建 → 投递 prompt → 等待完成 → 取回结果 → dispose
// ---------------------------------------------------------------------------

/**
 * 在宿主直接创建一个子代理并同步等待完成（全程不经主会话）。
 * 这是 DEV-039「面板动作由阶段子代理执行」的原子单元。
 * @param {object} ctx Cordis 插件上下文（需 ctx.get('agents') 可用）
 * @param {object} options
 * @param {string} options.prompt 子代理任务指令
 * @param {string} options.cwd 工作区绝对路径
 * @param {string} [options.provider] 缺省取 ctx.get('agentDefaultModel')?.currentSelection()
 * @param {string} [options.model]   同上
 * @param {string} [options.sessionId] 缺省自动生成
 * @param {string} [options.parentSessionId] 可选父会话
 * @param {string} [options.agentPreset] 可选预设
 * @param {number} [options.timeoutMs=120000]
 * @param {(phase: string, detail?: object) => void} [options.onPhase] 进度回调（创建/投递/等待/完成）
 * @returns {Promise<{ok: boolean, error?: string, code?: string, agentId?: string,
 *                     text?: string, reason?: object, seq?: number, probe?: object}>}
 */
export async function runSubagent(ctx, { prompt, cwd, provider, model, sessionId, parentSessionId, agentPreset, timeoutMs = 120_000, initialTimeoutMs = 10_000, disposeTimeoutMs = 5_000, onPhase } = {}) {
  const startedAt = Date.now()
  const phases = []
  const phase = (name, detail) => {
    const entry = Object.freeze({ name, elapsedMs: Date.now() - startedAt, ...(detail || {}) })
    phases.push(entry)
    try { onPhase?.(name, entry) } catch { /* 回调失败不影响主流程 */ }
  }
  const probe = probeAgentsService(ctx)
  if (!probe.available) return { ok: false, code: 'no-agents-service', error: probe.reason || 'agents 服务不可用', probe }
  const agents = ctx.get('agents')

  // 模型：显式参数 > agentDefaultModel 当前选择
  let providerResolved = provider
  let modelResolved = model
  if (!providerResolved || !modelResolved) {
    try {
      const selection = ctx.get('agentDefaultModel')?.currentSelection?.()
      if (selection) {
        providerResolved ||= selection.provider
        modelResolved ||= selection.model
      }
    } catch { /* 缺省模型服务不可用时留空，交给宿主 resolve */ }
  }

  const createOptions = buildCreateOptions({
    sessionId, cwd, provider: providerResolved, model: modelResolved,
    parentSessionId, agentPreset,
  })

  let handle
  let agent
  let firstSeq = 0
  const outcome = { ok: false }
  try {
    phase('create')
    // 创建本身也可能卡在宿主 setup/provider 初始化；不能只给 create 返回后的 idle 等待设超时。
    let createTimer
    let createSettled = false
    const createPromise = Promise.resolve().then(() => agents.create(createOptions)).then((lateHandle) => {
      createSettled = true
      if (outcome.code === 'create-timeout' && lateHandle?.dispose) {
        Promise.resolve().then(() => lateHandle.dispose()).catch(() => {})
      }
      return lateHandle
    })
    try {
      handle = await Promise.race([
        createPromise,
        new Promise((_, reject) => {
          createTimer = setTimeout(() => reject(Object.assign(new Error(`agents.create 未在 ${initialTimeoutMs}ms 内返回`), { code: 'create-timeout' })), initialTimeoutMs)
        }),
      ])
    } finally {
      clearTimeout(createTimer)
      // 防止超时后的 create rejection 变成未处理 rejection。
      if (!createSettled) createPromise.catch(() => {})
    }
    agent = handle.agent
    outcome.agentId = agent.id
    phase('initial-wait', { agentId: agent.id })
    await waitAgentIdle(agent, { timeoutMs: initialTimeoutMs }) // setup/publish 维护期采用较短硬截止，避免空壳代理拖住动作
    firstSeq = agent.session.seq                         // 记录运行起点（followup 后事件才追加）
    phase('deliver', { agentId: agent.id })
    agent.followup(makeUserMessage(prompt))              // 投递 prompt（宿主标准路径，同 headless/subagent）
    phase('followup-wait', { agentId: agent.id })
    await waitAgentIdle(agent, { timeoutMs })            // 等待一轮 turn 完成
    const summary = summarizeRun(agent.session, firstSeq)
    phase('settle', { agentId: agent.id })
    outcome.ok = summary.reason?.kind === 'completed'
    outcome.reason = summary.reason
    outcome.text = summary.text
    outcome.seq = agent.session.seq
    if (!outcome.ok) {
      outcome.code = summary.reason?.kind === 'error' ? 'agent-error' : `agent-${summary.reason?.kind || 'unknown'}`
      outcome.error = summary.reason?.kind === 'error'
        ? (summary.reason.error?.message || JSON.stringify(summary.reason.error))
        : `turn 未以 completed 结束（${summary.reason?.kind || '无 turn/end'}）`
    }
  } catch (error) {
    outcome.ok = false
    outcome.code = error?.code || 'create-or-run-failed'
    outcome.error = error instanceof Error ? error.message : String(error)
    phase('failed', { agentId: agent?.id, code: outcome.code })
  } finally {
    // dispose 生命周期：完整拆除（cancel → whenIdle → scope.dispose → 存储关闭 → 注销）。
    // 失败不掩盖主结果，仅记录。
    if (handle) {
      phase('dispose', { agentId: agent?.id })
      let disposeTimer
      try {
        await Promise.race([
          Promise.resolve().then(() => handle.dispose()),
          new Promise((_, reject) => {
            disposeTimer = setTimeout(() => reject(Object.assign(new Error(`agent "${agent?.id || 'unknown'}" dispose 超时`), { code: 'dispose-timeout' })), disposeTimeoutMs)
          }),
        ])
      } catch (disposeError) {
        outcome.disposeError = disposeError instanceof Error ? disposeError.message : String(disposeError)
        if (disposeError?.code === 'dispose-timeout') outcome.disposeTimedOut = true
      } finally {
        clearTimeout(disposeTimer)
      }
    }
    // 可选：持久化 flush（宿主持久化后端在位时落盘；失败不影响结论）
    try {
      if (agent && ctx.get('sessions')?.flush) await ctx.get('sessions').flush(agent.session)
    } catch { /* flush 失败忽略 */ }
  }
  outcome.probe = probe
  outcome.phases = phases
  phase('done', { ok: outcome.ok, code: outcome.code, agentId: outcome.agentId })
  outcome.phases = phases
  return outcome
}