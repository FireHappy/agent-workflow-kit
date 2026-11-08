#!/usr/bin/env node
// dsh-awf-dashboard — 内嵌技能/CLI 副本同步脚本（单源双形态分发，DEV-216）。
//
// 单源双形态：源只维护一份（技能库实体 + kit 仓库 bin/awf），插件包内嵌第二形态副本。
//   - 形态一（源）：
//       · 技能库实体 ~/.dsh/skills/agent-workflow-scaffold（install.sh 将 kit 同步到全局，
//         含 SKILL.md / bin/awf / skills/* / templates/* / test/*）；
//       · kit 仓库 bin/awf（t1 落地的 CLI：awf log/validate 等子命令形态以它为准）。
//   - 形态二（内嵌副本）：<插件>/skill/agent-workflow-scaffold/（含被覆盖的 bin/awf）
//     + skill/manifest.json（产物清单：源路径/版本/bin/awf sha256/子命令/每文件 sha256，
//       供 --list/--check 验证）。
//   bin/awf 一律从 kit 仓库源覆盖进副本——bin/awf 更新（如 t1 新增 log/validate）后
//   重跑本脚本即刷新，解析规则永不双份漂移；「装插件即装工作流」。
//
// 用法：
//   node scripts/copy-workflow-assets.mjs            拷贝（默认动作，幂等）
//   node scripts/copy-workflow-assets.mjs --list     只列计划产物（dry-run，零写入）
//   node scripts/copy-workflow-assets.mjs --check    校验内嵌副本与源一致（逐文件内容哈希比对，
//                                                    任一文件内容漂移 → 退出码 1）
//   node scripts/copy-workflow-assets.mjs --skill-dir <dir>   覆盖技能源（回退链见下）
//   node scripts/copy-workflow-assets.mjs --awf <path>        覆盖 bin/awf 源（默认为 kit 仓库 bin/awf）
//   node scripts/copy-workflow-assets.mjs --no-cli            只拷技能库、不覆盖 bin/awf（排障用）
//
// 环境变量（脚本化测试 / CI 注入）：AWF_SKILL_SOURCE（技能源）、AWF_AWF_SOURCE（bin/awf 源）、
// AWF_DEST_ROOT（副本目标根，缺省为插件根）。
//
// 技能源解析回退链：--skill-dir > AWF_SKILL_SOURCE 环境变量 > 全局技能库实体
//   ~/.dsh/skills/agent-workflow-scaffold > kit 仓库 skills/agent-workflow-scaffold；
//   全部缺失 → 报错退出（提示先装技能或传 --skill-dir）。
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const KIT_ROOT = resolve(PLUGIN_ROOT, '..')
const DEFAULT_SKILL_ENTITY = join(homedir(), '.dsh', 'skills', 'agent-workflow-scaffold')
const DEFAULT_SKILL_IN_KIT = join(KIT_ROOT, 'skills', 'agent-workflow-scaffold')
const DEFAULT_AWF_IN_KIT = join(KIT_ROOT, 'bin', 'awf')
const EMBEDDED_DIR = 'skill/agent-workflow-scaffold'

/** 副本目标根：AWF_DEST_ROOT（脚本化测试注入）> 默认插件根。 */
const destRootOf = () => (process.env.AWF_DEST_ROOT ? resolve(process.env.AWF_DEST_ROOT) : PLUGIN_ROOT)
const manifestFile = (destRoot) => join(destRoot, 'skill', 'manifest.json')

// 拷贝排除项：版本目录 / 构建缓存 / 平台杂物（git 元数据不入包）
const EXCLUDE_NAMES = new Set(['.git', 'node_modules', '__pycache__', '.DS_Store'])
const SKIP = (name) => EXCLUDE_NAMES.has(name) || name.endsWith('.pyc')

const say = (...a) => console.log(...a)
const fail = (...a) => { console.error('FAIL  ' + a.join(' ')); process.exit(1) }

/** 递归收集目录下应打包的相对路径（应用 SKIP 排除规则）。 */
async function walkFiles(dir, base) {
  const out = []
  let entries = []
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (e) {
    fail('无法读取源目录：' + dir + '（' + e.message + '）')
  }
  for (const ent of entries) {
    if (SKIP(ent.name)) continue
    const full = join(dir, ent.name)
    const rel = relative(base, full)
    if (ent.isDirectory()) out.push(...(await walkFiles(full, base)))
    else out.push(rel)
  }
  return out.sort()
}

async function readVer(file) {
  try { return (String(await readFile(file, 'utf8')).trim()) || null } catch { return null }
}

/** 提取 bin/awf 的 dispatch 分支清单（`<cmd>) cmd_xxx` 形态；log/validate 落地后自动出现）。 */
function awfCommands(awfText) {
  const seen = new Set()
  for (const m of String(awfText).matchAll(/^\s*([a-z][a-z0-9-]*)\)\s+cmd_/gm)) {
    if (!seen.has(m[1])) seen.add(m[1])
  }
  return [...seen].sort()
}

function parseArgs(argv) {
  const o = { action: 'copy', skillDir: null, awf: null, cli: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--list') o.action = 'list'
    else if (a === '--check') o.action = 'check'
    else if (a === '--copy') o.action = 'copy'
    else if (a === '--skill-dir') o.skillDir = argv[++i]
    else if (a === '--awf') o.awf = argv[++i]
    else if (a === '--no-cli') o.cli = false
    else if (a === '--help' || a === '-h') { o.action = 'help' }
    else fail('未知参数：' + a + '（--list / --check / --skill-dir <dir> / --awf <path> / --no-cli）')
  }
  return o
}

async function resolveSources(o) {
  // 技能源：--skill-dir > AWF_SKILL_SOURCE 环境变量 > 全局实体 > kit 仓库目录
  let skillSource = null
  const candidates = [o.skillDir, process.env.AWF_SKILL_SOURCE, DEFAULT_SKILL_ENTITY, DEFAULT_SKILL_IN_KIT]
  for (const c of candidates) {
    if (!c) continue
    const abs = resolve(process.cwd(), c)
    try { if ((await stat(abs)).isDirectory()) { skillSource = abs; break } } catch { /* 继续回退 */ }
  }
  if (!skillSource) {
    fail('找不到技能源：请先安装技能（~/.dsh/skills/agent-workflow-scaffold）或传 --skill-dir <dir>')
  }
  // bin/awf 源：--awf > AWF_AWF_SOURCE 环境变量 > kit 仓库 bin/awf（t1 的 CLI 落地点）
  const awfOverride = o.awf || process.env.AWF_AWF_SOURCE
  const awfSource = awfOverride ? resolve(process.cwd(), awfOverride) : DEFAULT_AWF_IN_KIT
  try { if (!(await stat(awfSource)).isFile()) throw new Error('not a file') }
  catch { fail('找不到 bin/awf 源：' + awfSource + '（t1 的 awf log/validate 落地后此处即最新形态）') }
  return { skillSource, awfSource }
}

/** 计算「源 → 副本」完整产物清单（--list 预览 / --copy 写入 / --check 对照基准）。
 *  files 为每个文件记录 sha256（内容漂移检测：--check 逐文件比对哈希）。 */
async function computeManifest({ skillSource, awfSource, cli }) {
  const skillFiles = await walkFiles(skillSource, skillSource)
  const awfBuf = cli ? await readFile(awfSource) : null
  const files = []
  for (const rel of skillFiles) {
    const buf = await readFile(join(skillSource, rel))
    files.push({
      path: EMBEDDED_DIR + '/' + rel,
      bytes: buf.length,
      sha256: createHash('sha256').update(buf).digest('hex'),
    })
  }
  return {
    generatedAt: new Date().toISOString(),
    pluginRoot: PLUGIN_ROOT,
    skillSource,
    awfSource,
    skillVersion: await readVer(join(skillSource, 'VERSION')),
    frameworkVersion: await readVer(join(skillSource, 'FRAMEWORK_VERSION')),
    awf: cli && awfBuf
      ? {
          path: relative(PLUGIN_ROOT, awfSource),
          sha256: createHash('sha256').update(awfBuf).digest('hex'),
          bytes: awfBuf.length,
          commands: awfCommands(awfBuf.toString('utf8')),
        }
      : null,
    files,
  }
}

async function printManifest(m) {
  say('== 内嵌技能/CLI 副本产物清单（单源双形态）==')
  say('技能源     ：' + m.skillSource + (m.skillVersion ? '（VERSION ' + m.skillVersion + '）' : '') +
    (m.frameworkVersion ? '（FRAMEWORK_VERSION ' + m.frameworkVersion + '）' : ''))
  if (m.awf) {
    say('bin/awf 源 ：' + m.awfSource)
    say('  sha256    ：' + m.awf.sha256)
    say('  字节数    ：' + m.awf.bytes)
    say('  子命令    ：' + (m.awf.commands.join(' / ') || '（未识别到 cmd_ dispatch 分支）'))
  } else {
    say('bin/awf 源 ：（--no-cli，本次不覆盖 CLI 副本）')
  }
  say('共 ' + m.files.length + ' 个文件：')
  for (const f of m.files) say('  ' + f.path)
}

async function actionList(o, destRoot) {
  const src = await resolveSources(o)
  const m = await computeManifest({ ...src, cli: o.cli })
  await printManifest(m) // 零写入：只打印计划产物
}

async function actionCopy(o, destRoot) {
  const src = await resolveSources(o)
  const m = await computeManifest({ ...src, cli: o.cli })
  const destScaffold = join(destRoot, EMBEDDED_DIR)
  // 只清空副本区（skill/agent-workflow-scaffold + manifest），绝不触碰插件其他内容
  await rm(destScaffold, { recursive: true, force: true })
  await rm(manifestFile(destRoot), { force: true })
  await mkdir(dirname(destScaffold), { recursive: true })
  // 技能库整体复制（过滤 git/构建缓存等）
  await cp(src.skillSource, destScaffold, { recursive: true, filter: (s) => !SKIP(basename(s)) })
  if (o.cli) {
    // CLI 单源覆盖：bin/awf 一律以 kit 仓库源为准（含 t1 落地的 log/validate）
    await mkdir(join(destScaffold, 'bin'), { recursive: true })
    await cp(src.awfSource, join(destScaffold, 'bin', 'awf'))
  }
  await writeFile(manifestFile(destRoot), JSON.stringify(m, null, 2) + '\n', 'utf8')
  await printManifest(m)
  say('已写入内嵌副本：' + destScaffold + ' + ' + relative(destRoot, manifestFile(destRoot)))
  say('打包即随插件分发（package.json files 含 "skill"）；bin/awf 更新后重跑本脚本刷新。')
}

/** 校对当前源与内嵌副本（文件清单 + 逐文件内容哈希 + bin/awf sha + 版本文件）；漂移 → exit 1。 */
async function actionCheck(o, destRoot) {
  const mf = manifestFile(destRoot)
  let manifest
  try { manifest = JSON.parse(await readFile(mf, 'utf8')) }
  catch { fail('缺少产物清单 ' + relative(destRoot, mf) + '：先运行 node scripts/copy-workflow-assets.mjs（--copy）') }
  const src = await resolveSources(o)
  const current = await computeManifest({ ...src, cli: o.cli })
  const destScaffold = join(destRoot, EMBEDDED_DIR)
  const issues = []
  const rootPath = (p) => join(destRoot, p)
  const have = (p) => stat(rootPath(p)).then(() => true).catch(() => false)

  // 1) 文件清单：内嵌副本 vs 当前源（多/少/变更文件列出路径）
  const embeddedNow = (await walkFiles(destScaffold, destScaffold).catch(() => [])).map((r) => EMBEDDED_DIR + '/' + r).sort()
  const want = current.files.map((f) => f.path)
  for (const p of want) if (!embeddedNow.includes(p)) issues.push('缺失文件：' + p)
  for (const p of embeddedNow) if (!want.includes(p)) issues.push('多余文件（源已移除）：' + p)

  // 2) 逐文件内容哈希比对（manifest.files 记录的 sha256 vs 内嵌副本实际内容；
  //    内容漂移（任一非 CLI 文件被改）→ 检出并退出 1）
  const cliPath = EMBEDDED_DIR + '/bin/awf'
  for (const f of current.files) {
    if (o.cli && f.path === cliPath) continue // CLI 副本单独以 bin/awf 源（kit）比对
    let sha = null
    try { sha = createHash('sha256').update(await readFile(rootPath(f.path))).digest('hex') } catch { /* 缺失已由清单比对报告 */ }
    if (sha !== null && sha !== f.sha256) issues.push('内容不一致：' + f.path + '（副本与源内容不同，重跑 --copy 刷新）')
  }
  if (o.cli) {
    if (!(await have(cliPath))) issues.push('缺失 CLI 副本：' + cliPath)
    else {
      const buf = await readFile(rootPath(cliPath))
      const sha = createHash('sha256').update(buf).digest('hex')
      if (sha !== current.awf.sha256) {
        issues.push('CLI 副本与源不一致（bin/awf 已更新？重跑 --copy 刷新）')
      }
    }
  }
  // 3) 版本文件与清单一致
  if (current.skillVersion !== manifest.skillVersion) issues.push('技能版本漂移：清单 ' + manifest.skillVersion + ' vs 源 ' + current.skillVersion)
  if (current.frameworkVersion !== manifest.frameworkVersion) issues.push('骨架版本漂移：清单 ' + manifest.frameworkVersion + ' vs 源 ' + current.frameworkVersion)

  if (issues.length > 0) {
    for (const i of issues) console.error('DRIFT  ' + i)
    fail('发现 ' + issues.length + ' 处漂移，请运行 node scripts/copy-workflow-assets.mjs --copy 重新同步')
  }
  say('副本一致：' + current.files.length + ' 个文件（逐文件 sha256 一致）、bin/awf sha256 ' + current.awf.sha256 + '、技能 ' + current.skillVersion + '（骨架 ' + current.frameworkVersion + '）')
}

async function main() {
  const o = parseArgs(process.argv.slice(2))
  const destRoot = destRootOf()
  if (o.action === 'help') {
    console.log('用法见脚本头部注释；--list / --copy / --check 三动作，--skill-dir / --awf / --no-cli 三选项。')
    return
  }
  if (o.action === 'list') await actionList(o, destRoot)
  else if (o.action === 'copy') await actionCopy(o, destRoot)
  else if (o.action === 'check') await actionCheck(o, destRoot)
}

main().catch((e) => { console.error(e); process.exit(1) })