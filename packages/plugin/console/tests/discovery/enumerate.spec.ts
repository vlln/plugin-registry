/**
 * 枚举层测试（0813 适配）：hub index.json（plugin-sources/index/v1，
 * plugins 格式，source = npm 包名）index 枚举——mock fetch + 本地文件 +
 * 304 + TTL 快照。
 */
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  indexEntryToPlugin, enumerateIndex, enumerateSource,
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

describe('indexEntryToPlugin', () => {
  it('maps a bundle entry — id 取 source（npm 包名）', () => {
    const e = indexEntryToPlugin(
      { id: '@vlln/whale-girl', kind: 'bundle', source: '@vlln/whale-girl', faces: ['ui', 'bundle'], description: '宠物' },
      'hub',
    )
    assert.ok(e !== null)
    assert.equal(e.id, '@vlln/whale-girl')
    assert.equal(e.kind, 'bundle')
    assert.equal(e.source, '@vlln/whale-girl')
    assert.deepEqual(e.faces, ['ui', 'bundle'])
    assert.equal(e.description, '宠物')
    assert.equal(e.sourceId, 'hub')
  })

  it('skips repository kind（0811 已移除）与缺失 source 的条目', () => {
    assert.equal(indexEntryToPlugin({ id: 'x', kind: 'repository', source: 'github:a/b&path:/.dsh-plugin' }, 'hub'), null)
    assert.equal(indexEntryToPlugin({ id: 'x', kind: 'bundle' }, 'hub'), null)
    assert.equal(indexEntryToPlugin({ id: 'x', kind: 'bundle', source: '  ' }, 'hub'), null)
    // id 缺省时从 source 派生（index 的 id 与 source 对 bundle 恒等）。
    assert.equal(indexEntryToPlugin({ kind: 'bundle', source: '@a/b' }, 'hub')!.id, '@a/b')
  })

  it('filters unknown faces', () => {
    const e = indexEntryToPlugin({ id: 'x', kind: 'bundle', source: 'x', faces: ['bundle', 'nonsense', 3] }, 'hub')
    assert.deepEqual(e!.faces, ['bundle'])
  })
})

describe('enumerateIndex', () => {
  it('reads a local index.json (plugins format)', async () => {
    const home = freshHome()
    const index = join(home, 'index.json')
    writeFileSync(index, JSON.stringify({ plugins: [
      { id: '@vlln/whale-girl', kind: 'bundle', source: '@vlln/whale-girl', description: '宠物', faces: ['ui', 'bundle'] },
      { id: '@vlln/dsh-loop', kind: 'bundle', source: '@vlln/dsh-loop', faces: [] },
      { id: 'stale', kind: 'repository', source: 'github:a/b&path:/.dsh-plugin' },
    ] }))
    const snap = await enumerateIndex(home, indexSource(home, index))
    assert.equal(snap.entries.length, 2)
    assert.equal(snap.entries[0]!.id, '@vlln/whale-girl')
    assert.equal(snap.entries[0]!.kind, 'bundle')
    assert.equal(snap.entries[0]!.source, '@vlln/whale-girl')
    // 快照已缓存
    assert.ok(readSnapshot(home, 'hub') !== null)
  })

  it('uses a fresh snapshot without re-reading the file', async () => {
    const home = freshHome()
    const index = join(home, 'index.json')
    writeFileSync(index, JSON.stringify({ plugins: [{ id: 'a', kind: 'bundle', source: 'a' }] }))
    await enumerateIndex(home, indexSource(home, index), { now: 1_000_000 })
    // 新鲜快照期内改文件——应返回旧 entries（不重读）
    writeFileSync(index, JSON.stringify({ plugins: [{ id: 'b', kind: 'bundle', source: 'b' }] }))
    const snap = await enumerateIndex(home, indexSource(home, index), { now: 1_000_100 })
    assert.equal(snap.entries[0]!.id, 'a')
  })

  it('fetches remote with ETag conditional refresh (304 keeps entries)', async () => {
    const home = freshHome()
    const source: PluginSource = { id: 'hub', kind: 'index', locator: 'https://example.com/index.json', trust: 'community' }
    let calls = 0
    const fetchImpl = async (url: string, init?: { headers?: Record<string, string> }): Promise<{
      ok: boolean; status: number; etag: string | null; text(): Promise<string>; json(): Promise<unknown>
    }> => {
      calls += 1
      assert.equal(url, source.locator)
      if (calls === 1) {
        return {
          ok: true, status: 200, etag: 'v1',
          text: async () => JSON.stringify({ plugins: [{ id: 'a', kind: 'bundle', source: 'a' }] }),
          json: async () => ({ plugins: [{ id: 'a', kind: 'bundle', source: 'a' }] }),
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
    const source: PluginSource = { id: 'hub', kind: 'index', locator: 'file:///nonexistent/index.json', trust: 'community' }
    await assert.rejects(enumerateIndex(home, source), /unreadable/)
  })
})

describe('enumerateSource dispatch', () => {
  it('routes to index enumeration (only kind in 0811)', async () => {
    const home = freshHome()
    const index = join(home, 'index.json')
    writeFileSync(index, JSON.stringify({ plugins: [{ id: 'a', kind: 'bundle', source: 'a' }] }))
    const snap = await enumerateSource(home, indexSource(home, index))
    assert.equal(snap.entries.length, 1)
  })
})

describe('sources.yml round-trip', () => {
  it('keeps index kind', () => {
    const home = freshHome()
    const file = join(home, 'index.json')
    writeFileSync(file, '{}')
    writeSources(home, [{ id: 'hub', kind: 'index', locator: `file://${file}` }])
    const text = readFileSync(sourcesPath(home), 'utf8')
    assert.ok(text.includes('kind: index'))
  })
})
