// dsh-awf-dashboard — copy-workflow-assets.mjs 内容漂移检测测试（DEV-216 修复轮 t7）
//
// 通过环境变量（AWF_SKILL_SOURCE / AWF_AWF_SOURCE / AWF_DEST_ROOT）把真实 CLI 指向
// 临时源与临时副本目标，验证：
//   1) --copy 生成的 manifest.files 为每个文件记录 sha256（64 位 hex）；
//   2) 初始 --check 退出码 0（副本一致）；
//   3) 改任一非 CLI 文件（SKILL.md）→ --check 退出码 1 且输出 DRIFT + 文件路径；
//   4) 重跑 --copy 后 --check 恢复退出码 0。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const script = join(pluginRoot, 'scripts', 'copy-workflow-assets.mjs')

/** 构造一个最小技能源（VERSION/FRAMEWORK_VERSION/SKILL.md/bin/awf 桩）与 kit CLI 源。 */
async function makeSources(tmp) {
  const skill = join(tmp, 'skill-src')
  await mkdir(join(skill, 'bin'), { recursive: true })
  await writeFile(join(skill, 'VERSION'), '1.0.0\n')
  await writeFile(join(skill, 'FRAMEWORK_VERSION'), '1.0.0\n')
  await writeFile(join(skill, 'SKILL.md'), '# 技能说明\n\n原始内容\n')
  await writeFile(join(skill, 'bin', 'awf'), '#!/usr/bin/env bash\n# 技能自带 CLI（拷贝时被 kit 源覆盖）\n')
  const awf = join(tmp, 'awf-src')
  await mkdir(awf, { recursive: true })
  await writeFile(join(awf, 'awf'),
    '#!/usr/bin/env bash\nAWF_VERSION=1\n\n  status) cmd_status "$@" ;;\n  log) cmd_log "$@" ;;\n')
  return { skill, awf }
}

function runCli(args, env) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: pluginRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  })
}

test('DEV-216 copy-workflow-assets：manifest 每文件 sha256 + 非 CLI 文件内容漂移 → --check 退出 1', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'awf-copy-'))
  try {
    const { skill, awf } = await makeSources(tmp)
    const dest = join(tmp, 'dest')
    const env = {
      AWF_SKILL_SOURCE: skill,
      AWF_AWF_SOURCE: join(awf, 'awf'),
      AWF_DEST_ROOT: dest,
    }

    // 1) --copy 生成内嵌副本（默认动作与显式 --copy 等价）
    const c = runCli(['--copy'], env)
    assert.equal(c.status, 0, '--copy 应成功：' + c.stdout + c.stderr)

    // manifest.files 每个文件记录 sha256（64 位 hex）与字节数；最小源 = SKILL.md + CLI 副本（DEV-217 平铺布局）
    const manifest = JSON.parse(await readFile(join(dest, 'skill', 'manifest.json'), 'utf8'))
    assert.ok(Array.isArray(manifest.files) && manifest.files.length >= 2, 'files 至少含 SKILL.md 与 bin/awf')
    const paths = manifest.files.map((f) => f.path)
    assert.ok(paths.includes('skill/agent-workflow-scaffold/SKILL.md'), '应内嵌框架技能 SKILL.md：' + paths)
    assert.ok(paths.includes('skill/agent-workflow-scaffold/bin/awf'), '应内嵌 CLI 副本 bin/awf：' + paths)
    // 版本契约（DEV-217）：分发版本 = 插件 package.json；骨架版 = 模板内（最小源无模板 → null）
    assert.ok(manifest.source && typeof manifest.source.version === 'string', 'manifest.source.version 应记录插件版本')
    const pluginPkg = JSON.parse(await readFile(join(pluginRoot, 'package.json'), 'utf8'))
    assert.equal(manifest.source.version, pluginPkg.version, 'manifest.source.version 应等于插件 package.json version')
    for (const f of manifest.files) {
      assert.ok(typeof f.sha256 === 'string' && /^[0-9a-f]{64}$/.test(f.sha256),
        f.path + ' 应记录 sha256（实际：' + f.sha256 + '）')
      assert.ok(Number.isFinite(f.bytes) && f.bytes > 0, f.path + ' 应记录字节数')
    }

    // 2) 初始 --check 退出码 0
    const k0 = runCli(['--check'], env)
    assert.equal(k0.status, 0, '初始 --check 应通过：' + k0.stdout + k0.stderr)

    // 3) 改任一非 CLI 文件（SKILL.md）→ --check 退出码 1 并报 DRIFT + 文件路径
    await writeFile(join(dest, 'skill', 'agent-workflow-scaffold', 'SKILL.md'), '# 被改的内容\n')
    const k1 = runCli(['--check'], env)
    assert.equal(k1.status, 1, '内容漂移时 --check 应退出 1（实际 ' + k1.status + '）')
    assert.match(k1.stderr, /DRIFT/, '漂移输出应含 DRIFT 标记')
    assert.match(k1.stderr, /SKILL\.md/, '漂移点应指出 SKILL.md')
    assert.match(k1.stderr, /内容不一致/, '应按「内容不一致」报告逐文件哈希比对结果')

    // 4) 重跑 --copy 恢复一致 → --check 退出码 0
    const c2 = runCli(['--copy'], env)
    assert.equal(c2.status, 0, '重跑 --copy 应成功')
    const k2 = runCli(['--check'], env)
    assert.equal(k2.status, 0, '重跑 --copy 后 --check 应恢复通过（实际退出 ' + k2.status + '）')
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
})