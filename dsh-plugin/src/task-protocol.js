// dsh-awf-dashboard — 任务流转协议（纯函数）
// Markdown 是可读账本投影；协议核心不假定所有任务共享同一流程。

const common = {
  states: ['active', 'blocked', 'handoff', '归档'],
  transitions: {
    active: ['blocked', 'handoff'], blocked: ['active', 'handoff'], handoff: ['active', 'blocked'], '归档': [],
  },
  terminal: '归档',
}

export const WORKFLOW_PROFILES = Object.freeze({
  dev: Object.freeze({
    ...common,
    states: ['active', 'verify', 'review', 'blocked', 'handoff', '归档'],
    transitions: {
      active: ['verify', 'blocked', 'handoff'], verify: ['review', 'active', 'blocked'],
      review: ['归档', 'active', 'blocked'], blocked: ['active', 'handoff'], handoff: ['active', 'blocked'], '归档': [],
    },
  }),
  debug: Object.freeze({
    ...common,
    states: ['active', 'verify', 'review', 'blocked', 'handoff', '归档'],
    transitions: {
      active: ['verify', 'blocked', 'handoff'], verify: ['review', 'active', 'blocked'],
      review: ['归档', 'active', 'blocked'], blocked: ['active', 'handoff'], handoff: ['active', 'blocked'], '归档': [],
    },
  }),
  docs: Object.freeze({
    ...common,
    states: ['active', 'review', 'blocked', 'handoff', '归档'],
    transitions: {
      active: ['review', 'blocked', 'handoff'], review: ['归档', 'active', 'blocked'],
      blocked: ['active', 'handoff'], handoff: ['active', 'blocked'], '归档': [],
    },
  }),
})

export function workflowProfile(type, profiles = WORKFLOW_PROFILES) {
  const profile = profiles[String(type || '')]
  if (!profile) {
    const error = new Error(`未知任务流程类型：${type}`)
    error.code = 'unknown-workflow'
    throw error
  }
  return profile
}

export function isTaskState(value, type = 'dev') {
  try { return workflowProfile(type).states.includes(String(value || '')) } catch { return false }
}

/** 按任务类型选择迁移矩阵；同态迁移只允许带相同 actionId 的幂等重放。 */
export function canTransition(from, to, { type = 'dev', idempotent = false } = {}) {
  const profile = workflowProfile(type)
  if (!profile.states.includes(String(from || '')) || !profile.states.includes(String(to || ''))) return false
  if (from === to) return idempotent
  return profile.transitions[from]?.includes(to) === true
}

export function transitionTask(task, to, {
  type = task?.type || 'dev', expectedRevision, evidence = [], actionId,
  now = new Date().toISOString().slice(0, 10),
} = {}) {
  if (!task || typeof task !== 'object') throw new TypeError('task 必须是对象')
  if (!Number.isInteger(task.revision) || task.revision < 0) throw new Error('task revision 无效')
  if (expectedRevision !== undefined && expectedRevision !== task.revision) {
    const error = new Error(`task revision 冲突：expected=${expectedRevision}, actual=${task.revision}`)
    error.code = 'revision-conflict'; throw error
  }
  if (!canTransition(task.status, to, { type, idempotent: actionId && task.lastActionId === actionId })) {
    const error = new Error(`非法 ${type} 任务状态迁移：${task.status} → ${to}`)
    error.code = 'invalid-transition'; throw error
  }
  const checkedEvidence = normalizeEvidence(evidence)
  return Object.freeze({ ...task, type, status: to,
    revision: task.revision + (task.status === to ? 0 : 1), updated: now,
    evidence: checkedEvidence, ...(actionId ? { lastActionId: String(actionId) } : {}) })
}

export function normalizeEvidence(items) {
  if (!Array.isArray(items)) throw new TypeError('evidence 必须是数组')
  return Object.freeze(items.map((item, index) => {
    if (!item || typeof item !== 'object') throw new TypeError(`evidence[${index}] 必须是对象`)
    const key = String(item.key || item.id || '').trim()
    const passed = item.passed === true
    const evidence = String(item.evidence || item.detail || '').trim()
    if (!key || !evidence) throw new Error(`evidence[${index}] 缺少 key 或 evidence`)
    return Object.freeze({ key, passed, evidence })
  }))
}

export function validateEvidenceContract(contract, result) {
  const acceptance = Array.isArray(contract?.acceptance) ? contract.acceptance : []
  const commands = Array.isArray(contract?.commands) ? contract.commands : []
  const acceptanceResults = Array.isArray(result?.acceptanceResults) ? result.acceptanceResults : []
  const commandsRun = Array.isArray(result?.commandsRun) ? result.commandsRun : []
  const acceptanceCovered = acceptance.length === acceptanceResults.length && acceptance.every((item) => {
    const hit = acceptanceResults.find((r) => String(r.key) === String(item.key))
    return hit && typeof hit.passed === 'boolean' && String(hit.evidence || '').trim()
  })
  const commandsCovered = commands.length === commandsRun.length && commands.every((item) => {
    const hit = commandsRun.find((r) => String(r.key) === String(item.key))
    return hit && typeof hit.passed === 'boolean' && Number.isInteger(hit.exitCode) && String(hit.evidence || '').trim()
  })
  return Object.freeze({ acceptanceCovered, commandsCovered, ok: acceptanceCovered && commandsCovered })
}

export function acceptAction(actionLog, actionId) {
  const id = String(actionId || '').trim()
  if (!id) throw new Error('actionId 必须非空')
  const log = Array.isArray(actionLog) ? actionLog : []
  if (log.some((entry) => String(entry?.actionId) === id)) return Object.freeze({ accepted: false, duplicate: true, actionId: id, log: Object.freeze(log.slice()) })
  return Object.freeze({ accepted: true, duplicate: false, actionId: id, log: Object.freeze([...log, { actionId: id }]) })
}
