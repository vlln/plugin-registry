/**
 * 工具语义测试（0813 适配）：plugin_search / plugin_install /
 * plugin_uninstall / plugin_status——真实临时 DSH_HOME；hub 用内联
 * index 文件源（index.json plugins 格式，plugin-sources/index/v1）；
 * insert 行用内存 patch 模拟。
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPluginTools, type PluginToolDeps } from '../../src/discovery/tools.ts'
import { readSources, readLock, discoveryRoot } from '../../src/discovery/store.ts'

let home = ''
/** 模拟 profile cordis.patch.yml 的 insert 行（内存）。 */
let inserts: { id: string; name: string }[] = []
/** 模拟 profile package.json：bundleInstall 成功即写入依赖（pnpm add 语义）。 */
let manifest: { dependencies: Record<string, string>; dsh?: { profile?: { bundles?: string[] } } } = { dependencies: {} }
const homes: string[] = []
function freshHome(): string {
  const h = mkdtempSync(join(tmpdir(), 'dsh-tools-'))
  mkdirSync(join(h, 'plugin-sources'), { recursive: true })
  homes.push(h)
  return h
}
afterEach(() => { for (const h of homes.splice(0)) rmSync(h, { recursive: true, force: true }) })

function makeDeps(overrides: Partial<PluginToolDeps> = {}): PluginToolDeps {
  return {
    dshHome: () => home,
    isBundlePackage: (name) => name.startsWith('bundle-'),
    bundleInstall: (source) => {
      // 模拟：pnpm add 后依赖 key=值 写进 profile package.json；
      // bundle-* 是 bundle 插件（会 reconcile 进层栈）；其他是纯插件。
      manifest.dependencies[source] = source
      if (source.startsWith('bundle-')) return { names: [source], output: '' }
      return { names: [], output: '' }
    },
    bundleRemove: (name) => {
      if (name.startsWith('bundle-')) return { names: [], output: '' }
      return null
    },
    readInsertRows: () => [...inserts],
    writeInsertRow: (id, name) => {
      const rest = inserts.filter(r => r.id !== id)
      inserts = [...rest, { id, name }]
    },
    removeInsertRow: (id) => {
      const before = inserts.length
      inserts = inserts.filter(r => r.id !== id)
      return inserts.length !== before
    },
    readProfileManifest: () => manifest,
    ...overrides,
  }
}

const tools = () => Object.fromEntries(createPluginTools(makeDeps()).map(t => [(t as { name?: string }).name, t])) as Record<string, { execute(a: unknown): Promise<Record<string, unknown>> }>

beforeEach(() => {
  home = freshHome()
  inserts = []
  manifest = { dependencies: {} }
})

describe('plugin_search', () => {
  it('enumerates a new index source (index.json plugins format) and remembers it in sources.yml', async () => {
    const localIndex = join(home, 'index.json')
    writeFileSync(localIndex, JSON.stringify({ plugins: [
      { id: '@vlln/whale-girl', kind: 'bundle', source: '@vlln/whale-girl', description: '宠物', faces: ['ui', 'bundle'] },
    ] }))
    const res = await tools()['plugin_search']!.execute({ source: `file://${localIndex}` })
    const plugins = res.plugins as Array<{ id: string; sourceId: string; kind: string; source: string }>
    assert.equal(plugins.length, 1)
    assert.equal(plugins[0]!.id, '@vlln/whale-girl')
    assert.equal(plugins[0]!.kind, 'bundle')
    // source 直接是 npm 包名——可喂给 plugin_install（格式统一）。
    assert.equal(plugins[0]!.source, '@vlln/whale-girl')
    assert.equal(readSources(home).some(s => s.locator.includes('index.json')), true)
  })

  it('filters by query and carries trust for registered sources', async () => {
    const localIndex = join(home, 'index.json')
    writeFileSync(localIndex, JSON.stringify({ plugins: [
      { id: '@vlln/whale-girl', kind: 'bundle', source: '@vlln/whale-girl', description: '桌面宠物' },
      { id: '@vlln/chat-width', kind: 'bundle', source: '@vlln/chat-width', description: '消息宽度' },
    ] }))
    const t = tools()
    await t['plugin_search']!.execute({ source: `file://${localIndex}` })
    const res = await t['plugin_search']!.execute({ query: 'whale' })
    const plugins = res.plugins as Array<{ id: string; trust?: string }>
    assert.deepEqual(plugins.map(p => p.id), ['@vlln/whale-girl'])
    // 已注册源按 sources.yml trust（缺省 community）输出（修复 PLUGIN_ITEM 缺 trust）。
    assert.equal(plugins[0]!.trust, 'community')
  })
})

describe('plugin_install', () => {
  it('routes bundle sources through bundleInstall and records TOFU lock', async () => {
    let called = ''
    const t = Object.fromEntries(createPluginTools(makeDeps({ bundleInstall: (src) => { called = src; manifest.dependencies['bundle-whale'] = 'bundle-whale'; return { names: ['bundle-whale'], output: '' } } })).map(d => [(d as { name?: string }).name, d])) as Record<string, { execute(a: unknown): Promise<Record<string, unknown>> }>
    const res = await t['plugin_install']!.execute({ source: 'bundle-whale' })
    assert.equal(res.ok, true)
    assert.equal(called, 'bundle-whale')
    assert.equal(res.kind, 'bundle')
    assert.equal(res.needsRestart, true)
    assert.equal(readLock(home).some(l => l.canonical === 'bundle-whale' && l.kind === 'bundle'), true)
  })

  it('writes an insert row for non-bundle plugins (live mount, no restart)', async () => {
    const t = tools()
    const res = await t['plugin_install']!.execute({ source: 'dsh-loop' })
    assert.equal(res.ok, true)
    assert.equal(res.kind, 'plugin')
    assert.equal(res.needsRestart, false)
    assert.equal(inserts.some(r => r.name === 'dsh-loop'), true)
    assert.equal(readLock(home).some(l => l.canonical === 'dsh-loop' && l.kind === 'plugin'), true)
  })

  it('normalizes full GitHub URL sources and resolves the real installed name', async () => {
    const t = Object.fromEntries(createPluginTools(makeDeps({ bundleInstall: (src) => {
      // 入口已归一化 → pnpm 装完依赖值即 github:o/r，key 是包真实名。
      assert.equal(src, 'github:Nagi-ovo/dsh-visualize')
      manifest.dependencies['dsh-visualize'] = 'github:Nagi-ovo/dsh-visualize'
      return { names: ['dsh-visualize'], output: '' }
    } })).map(d => [(d as { name?: string }).name, d])) as Record<string, { execute(a: unknown): Promise<Record<string, unknown>> }>
    const res = await t['plugin_install']!.execute({ source: 'https://github.com/Nagi-ovo/dsh-visualize' })
    assert.equal(res.ok, true)
    assert.equal(res.canonical, 'dsh-visualize')
    assert.equal(res.kind, 'plugin')
    assert.equal(inserts.some(r => r.name === 'dsh-visualize'), true)
    assert.equal(readLock(home).some(l => l.canonical === 'dsh-visualize' && l.ref === 'github:Nagi-ovo/dsh-visualize'), true)
  })

  it('throws when pnpm add fails (bundleInstall null) — no fake success', async () => {
    const t = Object.fromEntries(createPluginTools(makeDeps({ bundleInstall: () => null })).map(d => [(d as { name?: string }).name, d])) as Record<string, { execute(a: unknown): Promise<Record<string, unknown>> }>
    await assert.rejects(t['plugin_install']!.execute({ source: 'dsh-loop' }), /pnpm add failed/)
    assert.equal(inserts.length, 0)
    assert.equal(readLock(home).length, 0)
  })

  it('throws when the installed package cannot be resolved from profile dependencies', async () => {
    const t = Object.fromEntries(createPluginTools(makeDeps({ bundleInstall: () => ({ names: [], output: '' }) })).map(d => [(d as { name?: string }).name, d])) as Record<string, { execute(a: unknown): Promise<Record<string, unknown>> }>
    await assert.rejects(t['plugin_install']!.execute({ source: 'dsh-loop' }), /not in the profile dependencies/)
    assert.equal(inserts.length, 0)
  })

  it('rejects empty sources', async () => {
    await assert.rejects(tools()['plugin_install']!.execute({ source: '  ' }), /non-empty/)
  })
})

describe('plugin_uninstall', () => {
  it('removes an insert row', async () => {
    const t = tools()
    await t['plugin_install']!.execute({ source: 'dsh-loop' })
    const res = await t['plugin_uninstall']!.execute({ id: 'dsh-loop' })
    assert.equal(res.ok, true)
    assert.equal(inserts.length, 0)
    await assert.rejects(t['plugin_uninstall']!.execute({ id: 'dsh-loop' }), /not an installed/)
  })

  it('removes a bundle via bundleRemove', async () => {
    const t = tools()
    const res = await t['plugin_uninstall']!.execute({ id: 'bundle-whale' })
    assert.equal(res.ok, true)
  })

  it('errors for unknown ids', async () => {
    await assert.rejects(tools()['plugin_uninstall']!.execute({ id: 'nope' }), /not an installed/)
  })
})

describe('plugin_status', () => {
  it('lists insert rows with resolved lock ref', async () => {
    const t = tools()
    await t['plugin_install']!.execute({ source: 'dsh-loop' })
    const res = await t['plugin_status']!.execute({})
    const rows = res.plugins as Array<{ canonical: string; kind: string }>
    assert.equal(rows.some(p => p.canonical === 'dsh-loop' && p.kind === 'plugin'), true)
  })

  it('queries a single plugin by id', async () => {
    const t = tools()
    await t['plugin_install']!.execute({ source: 'dsh-loop' })
    const res = await t['plugin_status']!.execute({ id: 'dsh-loop' })
    assert.equal((res.plugins as unknown[]).length, 1)
  })
})

describe('discovery root hygiene', () => {
  it('install leaves lock under plugin-sources/', async () => {
    await tools()['plugin_install']!.execute({ source: 'dsh-loop' })
    assert.equal(existsSync(join(discoveryRoot(home), 'lock.yml')), true)
    assert.equal(existsSync(join(discoveryRoot(home), 'cordis.patch.yml')), false)
  })
})
