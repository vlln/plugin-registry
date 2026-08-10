/**
 * 枚举层测试：源解析、faces 派生、index（mock fetch + 本地文件 + 304）、
 * single 探测（缓存防限流）、manifest。
 */
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseRepositorySource, parseGithubUrl, canonicalOfRepository, facesOfDsh,
  enumerateIndex, enumerateSingle, enumerateManifest, hubEntryToPlugin,
} from '../../src/discovery/enumerate.ts'
import { readSnapshot } from '../../src/discovery/store.ts'

const homes: string[] = []
function freshHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-enum-'))
  mkdirSync(join(home, 'plugin-sources'), { recursive: true })
  homes.push(home)
  return home
}
afterEach(() => { for (const h of homes.splice(0)) rmSync(h, { recursive: true, force: true }) })

function okJson(body: unknown, etag: string | null = null) {
  return { ok: true, status: 200, etag, text: async () => JSON.stringify(body), json: async () => body }
}
function notFound() {
  return { ok: false, status: 404, etag: null, text: async () => '', json: async () => ({}) }
}

describe('source parsing', () => {
  it('parses github repository source', () => {
    const p = parseRepositorySource('github:dsh-external/whale-girl#abc123&path:/.dsh-plugin')
    assert.deepEqual(p, { owner: 'dsh-external', repo: 'whale-girl', ref: 'abc123', path: '/.dsh-plugin' })
  })

  it('parses bare source (no ref)', () => {
    assert.equal(parseRepositorySource('github:a/b')?.ref, null)
    assert.equal(parseRepositorySource('not-a-source'), null)
  })

  it('parses github url to owner/repo', () => {
    assert.deepEqual(parseGithubUrl('https://github.com/dsh-external/whale-girl.git'), { owner: 'dsh-external', repo: 'whale-girl' })
    assert.deepEqual(parseGithubUrl('https://github.com/a/b'), { owner: 'a', repo: 'b' })
    assert.equal(parseGithubUrl('https://example.com/x'), null)
  })

  it('canonical is case-insensitive', () => {
    assert.equal(canonicalOfRepository('Dsh-External', 'Whale-Girl'), 'dsh-external/whale-girl')
  })

  it('derives faces from dsh fields', () => {
    assert.ok(facesOfDsh({ entry: './x' }).includes('tool'))
    assert.ok(facesOfDsh({ skills: [] }).includes('skill'))
    assert.ok(facesOfDsh({ mcpServers: {} }).includes('mcp'))
    assert.ok(facesOfDsh({ client: {} }).includes('ui'))
    assert.ok(facesOfDsh({ bundle: {} }).includes('bundle'))
    assert.deepEqual(facesOfDsh(undefined), [])
  })
})

describe('enumerateIndex', () => {
  const indexSource = { id: 'hub', kind: 'index' as const, locator: 'https://raw/hub/plugins.json', trust: 'official' as const }

  it('converts hub entries to official source format', async () => {
    const home = freshHome()
    const fetchMock = async () => okJson({ plugins: [
      { id: 'whale-girl', source: 'https://github.com/dsh-external/whale-girl.git', description: '宠物' },
      { id: 'skip', source: 'https://example.com/x', description: '非插件' },
    ] })
    const snap = await enumerateIndex(home, indexSource, { fetch: fetchMock as never })
    assert.equal(snap.entries.length, 1)
    assert.deepEqual({ id: snap.entries[0]!.id, source: snap.entries[0]!.source, refHint: snap.entries[0]!.refHint, sourceId: snap.entries[0]!.sourceId }, { id: 'whale-girl', source: 'github:dsh-external/whale-girl', refHint: null, sourceId: 'hub' })
    assert.equal(snap.entries[0]!.description, '宠物')
  })

  it('serves a fresh cached snapshot without fetching', async () => {
    const home = freshHome()
    let calls = 0
    const fetchMock = async () => { calls += 1; return okJson({ plugins: [] }) }
    await enumerateIndex(home, indexSource, { fetch: fetchMock as never })
    await enumerateIndex(home, indexSource, { fetch: fetchMock as never })
    assert.equal(calls, 1) // 第二次命中缓存
  })

  it('revalidates with ETag (304 keeps entries)', async () => {
    const home = freshHome()
    const initial = await enumerateIndex(home, indexSource, { fetch: (async () => okJson({ plugins: [{ id: 'p', source: 'https://github.com/a/b.git' }] }, 'etag-1')) as never })
    assert.equal(initial.entries.length, 1)
    const refreshed = await enumerateIndex(home, indexSource, { fetch: (async (_, init) => (init?.headers?.['If-None-Match'] === 'etag-1' ? { ok: false, status: 304, etag: 'etag-1', text: async () => '', json: async () => ({}) } : okJson({ plugins: [] }))) as never })
    assert.equal(refreshed.entries.length, 1) // 304 保留 entries
  })

  it('reads local index files (file:// — private hub path)', async () => {
    const home = freshHome()
    const local = join(home, 'plugins.json')
    writeFileSync(local, JSON.stringify({ plugins: [{ id: 'local-p', source: 'https://github.com/dsh-external/local-p.git' }] }))
    const snap = await enumerateIndex(home, { id: 'local', kind: 'index', locator: `file://${local}` })
    assert.equal(snap.entries.length, 1)
    assert.equal(snap.entries[0]!.id, 'local-p')
  })
})

describe('enumerateSingle', () => {
  it('probes .dsh-plugin/package.json into a descriptor', async () => {
    const home = freshHome()
    const probe = async (url: string) => url.includes('.dsh-plugin/package.json')
      ? okJson({ name: 'whale-girl', description: '宠物', dsh: { entry: './index.mjs' } })
      : notFound()
    const snap = await enumerateSingle(home, { id: 'wg', kind: 'single', locator: 'github:dsh-external/whale-girl#abc&path:/.dsh-plugin' }, { fetch: probe as never })
    assert.equal(snap.entries.length, 1)
    assert.deepEqual({ id: snap.entries[0]!.id, kind: snap.entries[0]!.kind, faces: snap.entries[0]!.faces, refHint: snap.entries[0]!.refHint }, { id: 'whale-girl', kind: 'repository', faces: ['tool'], refHint: 'abc' })
    assert.ok(snap.entries[0]!.source.includes('&path:/.dsh-plugin'))
  })

  it('falls back to root package.json and detects bundle', async () => {
    const home = freshHome()
    const probe = async (url: string) => url.endsWith('/package.json')
      ? okJson({ name: 'bundle-p', dsh: { bundle: {} } })
      : notFound()
    const snap = await enumerateSingle(home, { id: 'bp', kind: 'single', locator: 'github:a/b#def' }, { fetch: probe as never })
    assert.equal(snap.entries[0]!.kind, 'bundle')
    assert.ok(snap.entries[0]!.faces.includes('bundle'))
  })

  it('caches within TTL (rate-limit defense)', async () => {
    const home = freshHome()
    let calls = 0
    const probe = async () => { calls += 1; return okJson({ name: 'x', dsh: { entry: './i' } }) }
    await enumerateSingle(home, { id: 's', kind: 'single', locator: 'github:a/b#r' }, { fetch: probe as never })
    await enumerateSingle(home, { id: 's', kind: 'single', locator: 'github:a/b#r' }, { fetch: probe as never })
    assert.equal(calls, 1)
  })

  it('rejects non-plugin sources', async () => {
    const home = freshHome()
    await assert.rejects(enumerateSingle(home, { id: 'bad', kind: 'single', locator: 'github:a/b#r' }, { fetch: (async () => notFound()) as never }), /not a plugin/)
  })
})

describe('enumerateManifest', () => {
  it('reads user-written manifest lines', async () => {
    const home = freshHome()
    const file = join(home, 'my.yml')
    writeFileSync(file, '# 我的源\ngithub:a/b#sha1&path:/.dsh-plugin\nnpm-bundle-pkg\n')
    const snap = await enumerateManifest(home, { id: 'my', kind: 'manifest', locator: file })
    assert.equal(snap.entries.length, 2)
    assert.deepEqual({ kind: snap.entries[0]!.kind, refHint: snap.entries[0]!.refHint, source: snap.entries[0]!.source }, { kind: 'repository', refHint: 'sha1', source: 'github:a/b#sha1&path:/.dsh-plugin' })
    assert.deepEqual({ id: snap.entries[1]!.id, kind: snap.entries[1]!.kind }, { id: 'npm-bundle-pkg', kind: 'bundle' })
  })

  it('errors on unreadable file', async () => {
    await assert.rejects(enumerateManifest(freshHome(), { id: 'my', kind: 'manifest', locator: '/nope/missing.yml' }), /unreadable/)
  })
})

describe('hubEntryToPlugin', () => {
  it('skips non-github entries', () => {
    assert.equal(hubEntryToPlugin({ id: 'x', source: 'https://example.com/x' }, 'hub'), null)
    assert.notEqual(hubEntryToPlugin({ id: 'x', source: 'https://github.com/a/b.git' }, 'hub'), null)
  })
})
