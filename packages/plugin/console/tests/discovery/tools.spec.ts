/**
 * 工具语义测试：plugin_search / plugin_install / plugin_uninstall /
 * plugin_status（真实临时 DSH_HOME；hub 用内联 index 文件源）。
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPluginTools, type PluginToolDeps } from '../../src/discovery/tools.ts'
import { readSources, readLock, discoveryRoot } from '../../src/discovery/store.ts'

let home = ''
let patchFile = ''
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
    readRepositories: () => {
      try {
        const text = readFileSync(patchFile, 'utf8')
        const repos: string[] = []
        let inRepo = false
        for (const line of text.split('\n')) {
          if (line.includes('id: repository-plugins')) { inRepo = true; continue }
          if (inRepo) {
            if (line.trim().startsWith('- ')) repos.push(line.trim().slice(2).trim())
            else if (line.trim().startsWith('- id:')) break
          }
        }
        return { repositories: repos, present: inRepo }
      } catch { return { repositories: [], present: false } }
    },
    writeRepositories: (repositories) => {
      const block = [
        '# Home-level patch layer (HMR-watched).',
        '- id: repository-plugins',
        '  config:',
        '    repositories:',
        ...repositories.map(r => `      - ${r}`),
        '',
      ].join('\n')
      writeFileSync(patchFile, block)
    },
    ...overrides,
  }
}

const tools = () => Object.fromEntries(createPluginTools(makeDeps()).map(t => [(t as { name?: string }).name, t])) as Record<string, { execute(a: unknown): Promise<Record<string, unknown>> }>
const WHALE = 'github:dsh-external/whale-girl#6f6d3f2ec283daa6082118527822e5f110d994bf&path:/.dsh-plugin'

beforeEach(() => {
  home = freshHome()
  patchFile = join(home, 'cordis.patch.yml')
})

describe('plugin_search', () => {
  it('enumerates a new index source and remembers it in sources.yml', async () => {
    const localIndex = join(home, 'plugins.json')
    writeFileSync(localIndex, JSON.stringify({ plugins: [{ id: 'whale-girl', source: 'https://github.com/dsh-external/whale-girl.git', description: '宠物' }] }))
    const res = await tools()['plugin_search']!.execute({ source: `file://${localIndex}` })
    const plugins = res.plugins as Array<{ id: string; sourceId: string }>
    assert.equal(plugins.length, 1)
    assert.equal(plugins[0]!.id, 'whale-girl')
    assert.equal(readSources(home).some(s => s.locator.includes('plugins.json')), true)
  })

  it('filters by query across enumerated sources', async () => {
    const localIndex = join(home, 'plugins.json')
    writeFileSync(localIndex, JSON.stringify({ plugins: [
      { id: 'whale-girl', source: 'https://github.com/dsh-external/whale-girl.git', description: '桌面宠物' },
      { id: 'chat-width', source: 'https://github.com/dsh-external/chat-width.git', description: '消息宽度' },
    ] }))
    const t = tools()
    await t['plugin_search']!.execute({ source: `file://${localIndex}` })
    const res = await t['plugin_search']!.execute({ query: 'whale' })
    const plugins = res.plugins as Array<{ id: string }>
    assert.deepEqual(plugins.map(p => p.id), ['whale-girl'])
  })
})

describe('plugin_install', () => {
  it('adds a repository row and records TOFU lock', async () => {
    const res = await tools()['plugin_install']!.execute({ source: WHALE })
    assert.equal(res.ok, true)
    assert.equal(res.canonical, 'dsh-external/whale-girl')
    const patch = readFileSync(patchFile, 'utf8')
    assert.ok(patch.includes('whale-girl'))
    assert.ok(patch.includes('6f6d3f2ec283daa6082118527822e5f110d994bf'))
    assert.equal(readLock(home).some(l => l.canonical === 'dsh-external/whale-girl'), true)
  })

  it('updates ref when already installed', async () => {
    const t = tools()
    await t['plugin_install']!.execute({ source: WHALE })
    const next = 'github:dsh-external/whale-girl#0000000000000000000000000000000000000000&path:/.dsh-plugin'
    await t['plugin_install']!.execute({ source: next })
    const patch = readFileSync(patchFile, 'utf8')
    assert.ok(patch.includes('0000000000000000000000000000000000000000'))
    assert.ok(!patch.includes('6f6d3f2ec283daa6082118527822e5f110d994bf'))
    assert.equal(readLock(home).find(l => l.canonical === 'dsh-external/whale-girl')?.ref, '0000000000000000000000000000000000000000')
  })

  it('rejects bare refs (no branch pinning)', async () => {
    await assert.rejects(tools()['plugin_install']!.execute({ source: 'github:dsh-external/whale-girl' }), /exact ref/)
  })

  it('routes bundle sources through bundleInstall', async () => {
    let called = ''
    const t = Object.fromEntries(createPluginTools(makeDeps({ bundleInstall: (src) => { called = src; return { names: ['pkg'], output: '' } } })).map(d => [(d as { name?: string }).name, d])) as Record<string, { execute(a: unknown): Promise<Record<string, unknown>> }>
    const res = await t['plugin_install']!.execute({ source: 'some-npm-bundle' })
    assert.equal(res.ok, true)
    assert.equal(called, 'some-npm-bundle')
    assert.equal(readLock(home).some(l => l.canonical === 'some-npm-bundle' && l.kind === 'bundle'), true)
  })
})

describe('plugin_uninstall', () => {
  it('removes the row and is idempotent-error', async () => {
    const t = tools()
    await t['plugin_install']!.execute({ source: WHALE })
    const res = await t['plugin_uninstall']!.execute({ id: 'whale-girl' })
    assert.equal(res.ok, true)
    assert.ok(!readFileSync(patchFile, 'utf8').includes('whale-girl'))
    await assert.rejects(t['plugin_uninstall']!.execute({ id: 'whale-girl' }), /not an installed/)
  })

  it('matches full owner/repo too', async () => {
    const t = tools()
    await t['plugin_install']!.execute({ source: WHALE })
    await t['plugin_uninstall']!.execute({ id: 'dsh-external/whale-girl' })
    assert.ok(!readFileSync(patchFile, 'utf8').includes('whale-girl'))
  })
})

describe('plugin_status', () => {
  it('lists installed with resolved lock ref', async () => {
    const t = tools()
    await t['plugin_install']!.execute({ source: WHALE })
    const res = await t['plugin_status']!.execute({})
    const rows = res.plugins as Array<{ canonical: string; resolved?: string }>
    assert.equal(rows.some(p => p.canonical === 'dsh-external/whale-girl' && p.resolved === '6f6d3f2ec283daa6082118527822e5f110d994bf'), true)
  })

  it('queries a single plugin by short id', async () => {
    const t = tools()
    await t['plugin_install']!.execute({ source: WHALE })
    const res = await t['plugin_status']!.execute({ id: 'whale-girl' })
    assert.equal((res.plugins as unknown[]).length, 1)
  })
})

describe('discovery root hygiene', () => {
  it('install leaves sources and lock under plugin-sources/', async () => {
    await tools()['plugin_install']!.execute({ source: WHALE })
    assert.equal(existsSync(join(discoveryRoot(home), 'lock.yml')), true)
    // cordis.patch.yml 在域根之外（官方位置）
    assert.equal(existsSync(patchFile), true)
    assert.equal(existsSync(join(discoveryRoot(home), 'cordis.patch.yml')), false)
  })
})
