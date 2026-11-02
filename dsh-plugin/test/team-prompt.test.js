// DEV-026/DEV-033：动作指令生成纯函数单测。
// buildActPrompt 从 lib/index.js 命名导出（无副作用 import，可直接加载）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildActPrompt } from '../lib/index.js'

test('buildActPrompt: start 含任务标识 / 类型 / 路径，且结构完整', () => {
  const text = buildActPrompt({ action: 'start', id: 'DEV-099', type: 'dev', projectPath: '/tmp/awf-proj' })
  assert.ok(text.includes('DEV-099'), '包含任务 ID')
  assert.ok(text.includes('dev'), '包含任务类型')
  assert.ok(text.includes('/tmp/awf-proj'), '包含项目路径')
  assert.ok(text.includes('agent-workflow/tasks/dev/current.md'), '指向已登记账本位置')
  assert.ok(text.includes('AgentTeams'), '指示建队')
  assert.ok(text.includes('approval=automatic'), '本仓库建队 automatic 授权')
  assert.ok(text.split('\n').length >= 3, '至少 3 行（标题 + 动作 + 约束 + 回报）')
})

test('buildActPrompt: return-todo 与 delete 动作约束各自正确', () => {
  const rt = buildActPrompt({ action: 'return-todo', id: 'DEV-098', type: 'dev', projectPath: '/a/b' })
  assert.ok(rt.includes('返回待办'), '含返回待办动作')
  assert.ok(rt.includes('DEV-098'), '含任务 ID')
  assert.ok(rt.includes('恢复 todo.md 行'), '约束含放回账本动作')

  const del = buildActPrompt({ action: 'delete', id: 'DEV-097', type: 'dev', projectPath: '/a/b' })
  assert.ok(del.includes('删除'), '含删除动作')
  assert.ok(del.includes('DEV-097'), '含任务 ID')
  assert.ok(del.includes('done.md'), '约束含归档约定')
  assert.ok(del.includes('未提交改动'), '约束提示分析 git 改动')
})

test('buildActPrompt: debug/docs 类型同样适用', () => {
  const debugText = buildActPrompt({ action: 'start', id: 'DBG-002', type: 'debug', projectPath: '/a/b' })
  assert.ok(debugText.includes('DBG-002'))
  assert.ok(debugText.includes('tasks/debug/current.md'))
  const docsText = buildActPrompt({ action: 'start', id: 'DOC-003', type: 'docs', projectPath: '/a/b' })
  assert.ok(docsText.includes('DOC-003'))
  assert.ok(docsText.includes('tasks/docs/current.md'))
})