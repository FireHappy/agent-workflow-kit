#!/usr/bin/env node
// dsh-awf-dashboard — 内嵌技能/CLI 副本同步脚本（单源双形态分发，DEV-216；DEV-217 源收敛 + 平铺布局）。
//
// 单源双形态：源只维护一份（kit 仓库），插件包内嵌第二形态副本。
//   - 形态一（源）：kit 仓库根（白名单：SKILL.md / skills/* / templates/* / test/*）+ bin/awf。
//   - 形态二（内嵌副本，平铺）：<插件>/skills/
//       · skills/agent-workflow-scaffold/  ← 框架技能：SKILL.md + bin/awf（以仓库 CLI 覆盖）+ templates/ + test/
//       · skills/<name>/                   ← 各流程技能（dev/debug/docs/review/release/upgrade/team-flow/cross-project-dispatch），
//                                            与框架技能同级平铺（DEV-217：不做 agent-workflow-scaffold/skills/ 嵌套）
//       · skills/manifest.json             ← 产物清单（版本契约 + 每文件 sha256）
//   发版即随插件分发（package.json files 含 "skills"）；装插件即装工作流。
//
// 版本契约（DEV-217，清理版号）：
//   · 插件/分发版本 = 插件 package.json version（唯一信号，manifest.source.version 记录它）；
//   · 骨架版本 = templates/FRAMEWORK_VERSION（模板内，模板变更才 bump，manifest.source.frameworkVersion 记录）；
//   · 不再读取/内嵌技能实体根 VERSION / 根 FRAMEWORK_VERSION。
//
// 用法：
//   node scripts/copy-workflow-assets.mjs            拷贝（默认动作，幂等）
//   node scripts/copy-workflow-assets.mjs --list     只列计划产物（dry-run，零写入）
//   node scripts/copy-workflow-assets.mjs --check    校验内嵌副本与源一致（逐文件内容哈希比对，漂移 → 退出码 1）
//   node scripts/copy-workflow-assets.mjs --skill-dir <dir>   覆盖技能源根（缺省 = kit 仓库根）
//   node scripts/copy-workflow-assets.mjs --awf <path>        覆盖 bin/awf 源（缺省 = kit 仓库 bin/awf）
//   node scripts/copy-workflow-assets.mjs --no-cli            只拷技能库、不覆盖 bin/awf（排障用）
//
// 环境变量（脚本化测试 / CI 注入）：AWF_SKILL_SOURCE（技能源根）、AWF_AWF_SOURCE（bin/awf 源）、
// AWF_DEST_ROOT（副本目标根，缺省为插件根）。
//
// 技能源解析：--skill-dir > AWF_SKILL_SOURCE 环境变量 > kit 仓库根（内含 SKILL.md 即认定）。
//   源目录按白名单收集：SKILL.md + skills/<name>/（平铺到 skills/<name>/）+ templates/ + test/；
//   bin/awf 一律以 --awf / AWF_AWF_SOURCE / kit 仓库 bin/awf 为准（不在拷贝后覆盖）。
//   仓库根 .agent-teams/、dispatch/ 等运行/文档目录天然不在白名单，不会被误内嵌。
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const KIT_ROOT = resolve(PLUGIN_ROOT, '..')
const DEFAULT_AWF_IN_KIT = join(KIT_ROOT, 'bin', 'awf')

// 副本区（平铺）：框架技能目录 + manifest 同放在 skills/ 下
const SKILL_AREA = 'skills'
const FRAMEWORK_DIR = SKILL_AREA + '/agent-workflow-scaffold'

// 拷贝排除项：版本目录 / 构建缓存 / 平台杂物（git 元数据不入包）
const EXCLUDE_NAMES = new Set(['.git', 'node_modules', '__pycache__', '.DS_Store'])
const SKIP = (name) => EXCLUDE_NAMES.has(name) || name.endsWith('.pyc')

const say = (...a) => console.log(...a)
const fail = (...a) => { console.error('FAIL  ' + a.join(' ')); process.exit(1) }

const destRootOf = () => (process.env.AWF_DEST_ROOT ? resolve(process.env.AWF_DEST_ROOT) : PLUGIN_ROOT)
const manifestFile = (destRoot) => join(destRoot, SKILL_AREA, 'manifest.json')

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

/** 插件 package.json 版本（分发版本唯一信号）。 */
async function readPluginVersion() {
  try {
    const pkg = JSON.parse(String(await readFile(join(PLUGIN_ROOT, 'package.json'), 'utf8')))
    return pkg.version || null
  } catch { return null }
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
    else fail('未知参数：' + a + '（--list / --check / --copy / --skill-dir <dir> / --awf <path> / --no-cli）')
  }
  return o
}

/** 技能源根：--skill-dir > AWF_SKILL_SOURCE > kit 仓库根；源目录需含 SKILL.md。 */
async function resolveSkillRoot(o) {
  const candidates = [o.skillDir, process.env.AWF_SKILL_SOURCE, KIT_ROOT]
  for (const c of candidates) {
    if (!c) continue
    const abs = resolve(process.cwd(), c)
    try {
      const st = await stat(abs)
      if (!st.isDirectory()) continue
      await stat(join(abs, 'SKILL.md'))
      return abs
    } catch { /* 继续回退 */ }
  }
  fail('找不到技能源：请传 --skill-dir（含 SKILL.md 的目录）或设置 AWF_SKILL_SOURCE')
}

/** bin/awf 源：--awf > AWF_AWF_SOURCE > kit 仓库 bin/awf。 */
async function resolveAwfSource(o) {
  const awfOverride = o.awf || process.env.AWF_AWF_SOURCE
  const awfSource = awfOverride ? resolve(process.cwd(), awfOverride) : DEFAULT_AWF_IN_KIT
  try { if (!(await stat(awfSource)).isFile()) throw new Error('not a file') }
  catch { fail('找不到 bin/awf 源：' + awfSource) }
  return awfSource
}

/**
 * 计算「源 → 副本」完整产物清单（--list 预览 / --copy 写入 / --check 对照基准）。
 * 产物路径相对副本区根（skills/）：框架技能固定 agent-workflow-scaffold/，
 * 流程技能来自源 skills/<name>/，平铺为 <name>/（DEV-217 不嵌套）。
 */
async function computePlan({ skillRoot, awfSource, cli }) {
  // 框架技能：SKILL.md + templates/ + test/（bin/ 由 CLI 源覆盖，这里不收集）
  const frameworkRel = []
  await stat(join(skillRoot, 'SKILL.md'))
  frameworkRel.push('SKILL.md')
  for (const sub of ['templates', 'test']) {
    try {
      if ((await stat(join(skillRoot, sub))).isDirectory()) {
        for (const rel of await walkFiles(join(skillRoot, sub), skillRoot)) frameworkRel.push(rel)
      }
    } catch { /* 允许缺失（最小源） */ }
  }
  // 流程技能：源 skills/<name>/ → 平铺 <name>/
  const skills = []
  let skillSourceNames = []
  try {
    const entries = await readdir(join(skillRoot, 'skills'), { withFileTypes: true })
    skillSourceNames = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
  } catch { /* 无 skills/（最小源） */ }

  const files = []
  for (const rel of frameworkRel.sort()) {
    const buf = await readFile(join(skillRoot, rel))
    files.push({ path: FRAMEWORK_DIR + '/' + rel, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') })
  }
  for (const name of skillSourceNames) {
    skills.push(name)
    for (const rel of await walkFiles(join(skillRoot, 'skills', name), join(skillRoot, 'skills', name))) {
      const buf = await readFile(join(skillRoot, 'skills', name, rel))
      files.push({ path: SKILL_AREA + '/' + name + '/' + rel, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') })
    }
  }

  const awfBuf = cli ? await readFile(awfSource) : null
  // CLI 副本路径固定进框架技能 bin/
  if (cli && awfBuf) {
    files.push({ path: FRAMEWORK_DIR + '/bin/awf', bytes: awfBuf.length, sha256: createHash('sha256').update(awfBuf).digest('hex') })
  }

  return {
    generatedAt: new Date().toISOString(),
    source: {
      kit: 'agent-workflow-kit',
      sourceDir: relative(PLUGIN_ROOT, skillRoot) || '..',
      version: await readPluginVersion(),                       // 插件/分发版本（package.json）
      frameworkVersion: await readVer(join(skillRoot, 'templates', 'FRAMEWORK_VERSION')), // 骨架版（模板内）
    },
    awf: cli && awfBuf
      ? {
          // 源码路径固定为仓库内路径（不写死本机绝对路径，DEV-217 分发可复现）
          path: 'bin/awf',
          sha256: createHash('sha256').update(awfBuf).digest('hex'),
          bytes: awfBuf.length,
          commands: awfCommands(awfBuf.toString('utf8')),
        }
      : null,
    skills,            // 平铺的流程技能目录名（不含框架技能）
    files: files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  }
}

async function printManifest(m) {
  say('== 内嵌技能/CLI 副本产物清单（单源双形态 · 平铺）==')
  say('技能源     ：kit 仓库（' + m.source.sourceDir + '）')
  say('插件版本　 ：' + (m.source.version || '(未知)') + '（package.json）')
  say('骨架版本　 ：' + (m.source.frameworkVersion || '(无)') + '（templates/FRAMEWORK_VERSION）')
  if (m.awf) {
    say('bin/awf 源 ：kit 仓库 bin/awf')
    say('  sha256    ：' + m.awf.sha256)
    say('  字节数    ：' + m.awf.bytes)
    say('  子命令    ：' + (m.awf.commands.join(' / ') || '（未识别到 cmd_ dispatch 分支）'))
  } else {
    say('bin/awf 源 ：（--no-cli，本次不覆盖 CLI 副本）')
  }
  say('布局       ：' + SKILL_AREA + '/agent-workflow-scaffold/（框架）+ ' + (m.skills.length ? m.skills.join(' / ') : '（无流程技能）') + '（平铺）')
  say('共 ' + m.files.length + ' 个文件：')
  for (const f of m.files) say('  ' + f.path)
}

async function actionList(o, destRoot) {
  const skillRoot = await resolveSkillRoot(o)
  const awfSource = await resolveAwfSource(o)
  await printManifest(await computePlan({ skillRoot, awfSource, cli: o.cli })) // 零写入
}

async function actionCopy(o, destRoot) {
  const skillRoot = await resolveSkillRoot(o)
  const awfSource = await resolveAwfSource(o)
  const m = await computePlan({ skillRoot, awfSource, cli: o.cli })
  const area = join(destRoot, SKILL_AREA)
  // 只清空副本区（skills/ 下的框架技能 + 平铺流程技能 + manifest），绝不触碰插件其他内容
  await rm(area, { recursive: true, force: true })
  await mkdir(join(destRoot, FRAMEWORK_DIR), { recursive: true })

  // 框架技能：SKILL.md / templates / test（复制白名单；过滤 git/构建缓存）
  await cp(join(skillRoot, 'SKILL.md'), join(destRoot, FRAMEWORK_DIR, 'SKILL.md'))
  for (const sub of ['templates', 'test']) {
    try {
      if ((await stat(join(skillRoot, sub))).isDirectory()) {
        await cp(join(skillRoot, sub), join(destRoot, FRAMEWORK_DIR, sub), { recursive: true, filter: (s) => !SKIP(basename(s)) })
      }
    } catch { /* 最小源允许缺失 */ }
  }
  // 流程技能：逐目录平铺到 skills/<name>/（与框架技能同级）
  for (const name of m.skills) {
    await cp(join(skillRoot, 'skills', name), join(destRoot, SKILL_AREA, name), { recursive: true, filter: (s) => !SKIP(basename(s)) })
  }
  // CLI 单源覆盖：bin/awf 一律以 kit 仓库源为准（含 log/validate）
  if (o.cli) {
    await mkdir(join(destRoot, FRAMEWORK_DIR, 'bin'), { recursive: true })
    await cp(awfSource, join(destRoot, FRAMEWORK_DIR, 'bin', 'awf'))
  }
  await writeFile(manifestFile(destRoot), JSON.stringify(m, null, 2) + '\n', 'utf8')
  await printManifest(m)
  say('已写入内嵌副本：' + relative(destRoot, area) + '/（平铺）+ manifest.json')
  say('打包即随插件分发（package.json files 含 "skills"）；改源后重跑本脚本刷新。')
}

/** 校对当前源与内嵌副本（清单 + 逐文件 sha256 + CLI sha + 版本契约）；漂移 → exit 1。 */
async function actionCheck(o, destRoot) {
  const mf = manifestFile(destRoot)
  let manifest
  try { manifest = JSON.parse(await readFile(mf, 'utf8')) }
  catch { fail('缺少产物清单 ' + relative(destRoot, mf) + '：先运行 node scripts/copy-workflow-assets.mjs（--copy）') }
  const skillRoot = await resolveSkillRoot(o)
  const awfSource = await resolveAwfSource(o)
  const current = await computePlan({ skillRoot, awfSource, cli: o.cli })

  const issues = []
  const absOf = (p) => join(destRoot, p)
  const have = async (p) => { try { await stat(absOf(p)); return true } catch { return false } }

  // 1) 文件清单：内嵌副本（walk skills/，排除 manifest.json）vs 当前源
  const embeddedNow = (await walkFiles(join(destRoot, SKILL_AREA), join(destRoot, SKILL_AREA)).catch(() => []))
    .map((r) => SKILL_AREA + '/' + r)
    .filter((p) => p !== SKILL_AREA + '/manifest.json')
    .sort()
  const want = current.files.map((f) => f.path).sort()
  for (const p of want) if (!embeddedNow.includes(p)) issues.push('缺失文件：' + p)
  for (const p of embeddedNow) if (!want.includes(p)) issues.push('多余文件（源已移除）：' + p)

  // 2) 逐文件内容哈希比对（manifest.files 记录的 sha256 vs 副本实际内容）
  for (const f of current.files) {
    let sha = null
    try { sha = createHash('sha256').update(await readFile(absOf(f.path))).digest('hex') } catch { /* 缺失已由清单比对报告 */ }
    if (sha !== null && sha !== f.sha256) issues.push('内容不一致：' + f.path + '（副本与源内容不同，重跑 --copy 刷新）')
  }

  // 3) 版本契约：manifest 记录的 version/frameworkVersion vs 当前（漂移提示重跑）
  if (current.source.version !== manifest.source?.version) {
    issues.push('插件版本漂移：清单 ' + (manifest.source?.version ?? '(无)') + ' vs 当前 package.json ' + current.source.version)
  }
  if (current.source.frameworkVersion !== manifest.source?.frameworkVersion) {
    issues.push('骨架版本漂移：清单 ' + (manifest.source?.frameworkVersion ?? '(无)') + ' vs 当前 templates/FRAMEWORK_VERSION ' + current.source.frameworkVersion)
  }

  if (issues.length > 0) {
    for (const i of issues) console.error('DRIFT  ' + i)
    fail('发现 ' + issues.length + ' 处漂移，请运行 node scripts/copy-workflow-assets.mjs --copy 重新同步')
  }
  say('副本一致：' + current.files.length + ' 个文件（逐文件 sha256 一致）、bin/awf sha256 ' + (current.awf ? current.awf.sha256 : '（--no-cli）') +
    '、插件版本 ' + (current.source.version ?? '(未知)') + '、骨架版本 ' + (current.source.frameworkVersion ?? '(无)'))
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