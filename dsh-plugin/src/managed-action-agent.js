// Panel actions must use the host-managed child lifecycle, never a bare Agent.
export async function runManagedActionAgent(ctx, {
  prompt, cwd, parentSessionId, label = '工作流面板动作', timeoutMs = 120_000,
  onPhase, provider, model,
} = {}) {
  const phases = []
  const phase = (name, detail = {}) => {
    const entry = { name, ...detail }
    phases.push(entry)
    try { onPhase?.(name, entry) } catch {}
  }
  const fail = (code, error) => ({ ok: false, code, error, phases })
  const runtime = ctx.get('subagents')
  if (typeof runtime?.startActivation !== 'function') return fail('managed-subagents-unavailable', '宿主受管理子代理接口不可用；不创建不可见的裸会话')
  const parent = parentSessionId && ctx.get('agents')?.get(parentSessionId)
  if (!parent) return fail('parent-agent-unavailable', '当前父代理不在运行注册表中，无法注册可见子代理')
  if (runtime.getProvider && !runtime.getProvider('spawn')) return fail('spawn-unavailable', '宿主 spawn 子代理后端不可用')
  const selection = parent.ctx?.get('agentDefaultModel')?.currentSelection?.() || ctx.get('agentDefaultModel')?.currentSelection?.()
  const agentOptions = { provider: provider || selection?.provider, model: model || selection?.model }
  if (!agentOptions.provider) delete agentOptions.provider
  if (!agentOptions.model) delete agentOptions.model
  const controller = new AbortController()
  let activation
  let timedOut = false
  let timer
  try {
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true
        controller.abort(new Error('面板动作子代理超时'))
        reject(Object.assign(new Error(`受管理子代理未在 ${timeoutMs}ms 内完成`), { code: 'timeout' }))
      }, timeoutMs)
    })
    phase('registering')
    const starting = Promise.resolve().then(() => runtime.startActivation({
      provider: 'spawn', label, delivery: 'parent', signal: controller.signal,
      request: { parent, prompt: [{ type: 'text', text: prompt }], cwd, agentOptions, signal: controller.signal,
        maxDepth: runtime.resolveMaxDepth?.() },
    })).then((receipt) => {
      if (timedOut) Promise.resolve().then(() => receipt.dispose()).catch(() => {})
      return receipt
    })
    activation = await Promise.race([starting, deadline])
    phase('running', { agentId: activation.childId })
    const terminal = await Promise.race([activation.result, deadline])
    phase('settled', { agentId: activation.childId, stopReason: terminal.stopReason })
    const text = (terminal.output || []).filter((part) => part.type === 'text').map((part) => part.text).join('\n')
    const ok = terminal.stopReason === 'completed'
    return { ok, agentId: activation.childId, text, phases,
      ...(ok ? {} : { code: `agent-${terminal.stopReason || 'unknown'}`, error: terminal.diagnostic || text || '子代理未成功完成' }) }
  } catch (error) {
    phase('failed', { code: error.code || 'managed-agent-error' })
    if (activation) Promise.resolve().then(() => activation.dispose()).catch(() => {})
    return { ...fail(error.code || 'managed-agent-error', error.message || String(error)), agentId: activation?.childId }
  } finally {
    clearTimeout(timer)
    // Natural settlement belongs to the manager: it releases resources before result.
    // Keep its durable catalog/history; do not manually dispose a future cold-resumed child.
  }
}
