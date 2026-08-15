/**
 * 枚举层测试（0811 适配）：hub catalog（repos 格式）index 枚举——
 * mock fetch + 本地文件 + 304 + TTL 快照。
 */
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseGithubUrl, facesOfDsh, enumerateIndex, enumerateSource, hubRepoToPlugin,
} from '../../src/discovery/enumerate.ts'
import { readSnapshot, writeSources, sourcesPath } from '../../src/discovery/store.ts'
import type { PluginSource } from '../../src/discovery/types.ts'

const homes: string[] = []
function freshHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-enum-'))
  mkdirSync(join(home, 'plugin-sources'), { recursive: true })
  homes.push(home)
  return home
}
afterEach(() => { for (const h of homes.splice(0)) rmSync(h, { recursive: true, force: true }) })

/** 构造一个 index 源（locator 本地文件）。 */
function indexSource(home: string, file: string): PluginSource {
  writeSources(home, [{ id: 'hub', kind: 'index', locator: `file://${file}` }])
  return { id: 'hub', kind: 'index', locator: `file://${file}`, trust: 'community' }
}

describe('parseGithubUrl', () => {
  it('parses bare and .git URLs', () => {
    assert.deepEqual(parseGithubUrl('https://github.com/vlln/whale-girl'), { owner: 'vlln', repo: 'whale-girl' })
    assert.deepEqual(parseGithubUrl('https://github.com/vlln/whale-girl.git'), { owner: 'vlln', repo: 'whale-girl' })
  })
  it('rejects non-github URLs', () => {
    assert.equal(parseGithubUrl('https://example.com/x'), null)
  })
})

describe('facesOfDsh', () => {
  it('derives faces from dsh fields', () => {
    assert.deepEqual(facesOfDsh({ bundle: {} }), ['bundle'])
    assert.deepEqual(facesOfDsh({ client: {} }), ['ui'])
    assert.deepEqual(facesOfDsh(undefined), [])
  })
})

describe('hubRepoToPlugin', () => {
  it('maps bundle repos to bundle kind and plugin repos to plugin kind', () => {
    const bundle = hubRepoToPlugin(
      { name: 'whale-girl', url: 'https://github.com/vlln/whale-girl', bundle: true, skill: false },
      'hub',
    )
    assert.ok(bundle !== null)
    assert.equal(bundle.kind, 'bundle')
    const plugin = hubRepoToPlugin(
      { name: 'dsh-loop', url: 'https://github.com/vlln/dsh-loop', bundle: false },
      'hub',
    )
    assert.ok(plugin !== null)
    assert.equal(plugin.kind, 'plugin')
  })
  it('returns null for entries without name or github url', () => {
    assert.equal(hubRepoToPlugin({ name: 'x', url: 'https://example.com/x' }, 'hub'), null)
    assert.equal(hubRepoToPlugin({ url: 'https://github.com/a/b' }, 'hub'), null)
  })
})

describe('enumerateIndex', () => {
  it('reads a local catalog.json (repos format)', async () => {
    const home = freshHome()
    const catalog = join(home, 'catalog.json')
    writeFileSync(catalog, JSON.stringify({ repos: [
      { name: 'whale-girl', url: 'https://github.com/vlln/whale-girl', description: '宠物', bundle: true },
      { name: 'dsh-loop', url: 'https://github.com/vlln/dsh-loop', bundle: false },
    ] }))
    const snap = await enumerateIndex(home, indexSource(home, catalog))
    assert.equal(snap.entries.length, 2)
    assert.equal(snap.entries[0]!.id, 'whale-girl')
    assert.equal(snap.entries[0]!.kind, 'bundle')
    assert.equal(snap.entries[1]!.kind, 'plugin')
    // 快照已缓存
    assert.ok(readSnapshot(home, 'hub') !== null)
  })

  it('uses a fresh snapshot without re-reading the file', async () => {
    const home = freshHome()
    const catalog = join(home, 'catalog.json')
    writeFileSync(catalog, JSON.stringify({ repos: [{ name: 'a', url: 'https://github.com/x/a' }] }))
    await enumerateIndex(home, indexSource(home, catalog), { now: 1_000_000 })
    // 新鲜快照期内改文件——应返回旧 entries（不重读）
    writeFileSync(catalog, JSON.stringify({ repos: [{ name: 'b', url: 'https://github.com/x/b' }] }))
    const snap = await enumerateIndex(home, indexSource(home, catalog), { now: 1_000_100 })
    assert.equal(snap.entries[0]!.id, 'a')
  })

  it('fetches remote with ETag conditional refresh (304 keeps entries)', async () => {
    const home = freshHome()
    const source: PluginSource = { id: 'hub', kind: 'index', locator: 'https://example.com/catalog.json', trust: 'community' }
    let calls = 0
    const fetchImpl = async (url: string, init?: { headers?: Record<string, string> }): Promise<{
      ok: boolean; status: number; etag: string | null; text(): Promise<string>; json(): Promise<unknown>
    }> => {
      calls += 1
      assert.equal(url, source.locator)
      if (calls === 1) {
        return {
          ok: true, status: 200, etag: 'v1',
          text: async () => JSON.stringify({ repos: [{ name: 'a', url: 'https://github.com/x/a' }] }),
          json: async () => ({ repos: [{ name: 'a', url: 'https://github.com/x/a' }] }),
        }
      }
      assert.equal(init?.headers?.['If-None-Match'], 'v1')
      return { ok: false, status: 304, etag: 'v1', text: async () => '', json: async () => ({}) }
    }
    const now = 1_000_000
    const first = await enumerateIndex(home, source, { fetch: fetchImpl, now })
    assert.equal(first.entries.length, 1)
    // 快照过期（now 超过 TTL）→ 重新拉取（带 If-None-Match）；304 保留 entries。
    const second = await enumerateIndex(home, source, { fetch: fetchImpl, now: now + 7 * 60 * 60 * 1000 })
    assert.equal(second.entries.length, 1)
    assert.equal(second.entries[0]!.id, 'a')
    assert.equal(calls, 2)
  })

  it('fails loud on unreadable local file', async () => {
    const home = freshHome()
    const source: PluginSource = { id: 'hub', kind: 'index', locator: 'file:///nonexistent/catalog.json', trust: 'community' }
    await assert.rejects(enumerateIndex(home, source), /unreadable/)
  })
})

describe('enumerateSource dispatch', () => {
  it('routes to index enumeration (only kind in 0811)', async () => {
    const home = freshHome()
    const catalog = join(home, 'catalog.json')
    writeFileSync(catalog, JSON.stringify({ repos: [{ name: 'a', url: 'https://github.com/x/a' }] }))
    const snap = await enumerateSource(home, indexSource(home, catalog))
    assert.equal(snap.entries.length, 1)
  })
})

describe('sources.yml round-trip', () => {
  it('keeps index kind', () => {
    const home = freshHome()
    const file = join(home, 'catalog.json')
    writeFileSync(file, '{}')
    writeSources(home, [{ id: 'hub', kind: 'index', locator: `file://${file}` }])
    const text = readFileSync(sourcesPath(home), 'utf8')
    assert.ok(text.includes('kind: index'))
  })
})
