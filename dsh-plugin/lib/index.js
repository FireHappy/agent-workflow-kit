// dsh-awf-dashboard — 服务端（cordis 插件）
//
// 只读 JSON API：
//   GET /awf/projects  → 全局项目索引 [{id, aliases, path}]
//   GET /awf/ledger?path=<项目根> → 账本看板 JSON
// 不写任何文件、不执行任何命令（可视化只用账本，改动用 awf 自身命令完成）。
import { join, isAbsolute } from 'node:path'
import { homedir } from 'node:os'
import { readFile } from 'node:fs/promises'
import { ledgerOf, readIndex } from '../src/ledger.js'

export const inject = ['webServer', 'connection']

const AGENTS_HOME = process.env.DSH_AGENTS_HOME || join(homedir(), '.agents')

function writeJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(body)
}

function writeError(res, status, code, message) {
  writeJson(res, status, { ok: false, error: { code, message } })
}

function queryOf(req) {
  const url = new URL(req.url || '/', 'http://dsh.internal')
  const q = {}
  for (const [k, v] of url.searchParams) q[k] = v
  return q
}

/** 只允许读取 agent-workflow 项目根目录（须含 agent-workflow/project.yaml）。 */
async function isProjectRoot(p) {
  if (!p || !isAbsolute(p)) return false
  try {
    await readFile(join(p, 'agent-workflow', 'project.yaml'))
    return true
  } catch {
    return false
  }
}

export function apply(ctx) {
  // 与平台一致的认证围栏（宿主 Connection 服务，同 /api 网关准入）
  const fence = (req) => ctx.connection.requestRejection(req) === undefined
  const forbidden = (res) => writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/projects',
    handler: async (req, res) => {
      try {
        if (!fence(req)) {
          forbidden(res)
          return
        }
        if (req.method !== 'GET') {
          writeError(res, 405, 'method-error', 'method not allowed')
          return
        }
        const projects = await readIndex(AGENTS_HOME)
        writeJson(res, 200, { ok: true, projects })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/projects route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/awf/ledger',
    handler: async (req, res) => {
      try {
        if (!fence(req)) {
          forbidden(res)
          return
        }
        if (req.method !== 'GET') {
          writeError(res, 405, 'method-error', 'method not allowed')
          return
        }
        const path = queryOf(req).path
        if (!(await isProjectRoot(path))) {
          writeError(res, 400, 'bad-request', 'path 必须是含 agent-workflow/project.yaml 的绝对项目根目录')
          return
        }
        const ledger = await ledgerOf(path)
        writeJson(res, 200, { ok: true, ledger })
      } catch (error) {
        writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }), 'dsh-awf-dashboard: /awf/ledger route')
}
