/**
 * 存储层测试：sources.yml / lock.yml / cache 快照读写、TTL、重置。
 * 隔离 DSH_HOME（mkdtemp），纯本地无网络。
 */
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  readSources, writeSources, readLock, writeLock, readSnapshot, writeSnapshot, snapshotFresh,
  upsertSource, findLock, upsertLock, sourcesPath, lockPath, discoveryRoot,
} from '../../src/discovery/store.ts'

const homes: string[] = []
function freshHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-store-'))
  mkdirSync(join(home, 'plugin-sources'), { recursive: true })
  homes.push(home)
  return home
}
afterEach(() => { for (const h of homes.splice(0)) rmSync(h, { recursive: true, force: true }) })

describe('sources.yml', () => {
  it('missing file reads as empty list', () => {
    assert.deepEqual(readSources(freshHome()), [])
  })

  it('round-trips sources with trust', () => {
    const home = freshHome()
    writeSources(home, [
      { id: 'hub', kind: 'index', locator: 'https://x/plugins.json', trust: 'official' },
      { id: 'my', kind: 'manifest', locator: 'file:///tmp/my.yml' },
    ])
    const sources = readSources(home)
    assert.equal(sources.length, 2)
    assert.equal(sources[0]!.trust, 'official')
    assert.equal(sources[0]!.kind, 'index')
    // community 是缺省：write 时不显式写出，read 时补全
    assert.equal(sources[1]!.trust, 'community')
  })

  it('throws on invalid YAML', () => {
    const home = freshHome()
    writeFileSync(sourcesPath(home), 'sources: [')
    assert.throws(() => readSources(home), /not valid YAML/)
  })

  it('throws when missing sources key', () => {
    const home = freshHome()
    writeFileSync(sourcesPath(home), 'foo: bar\n')
    assert.throws(() => readSources(home), /sources/)
  })

  it('throws on invalid kind/trust', () => {
    const home = freshHome()
    writeFileSync(sourcesPath(home), 'sources:\n  - id: x\n    kind: nope\n    locator: y\n')
    assert.throws(() => readSources(home), /kind/)
    writeFileSync(sourcesPath(home), 'sources:\n  - id: x\n    kind: index\n    locator: y\n    trust: rogue\n')
    assert.throws(() => readSources(home), /trust/)
  })

  it('upsert replaces by id', () => {
    const base = [{ id: 'a', kind: 'index' as const, locator: 'x' }]
    const next = upsertSource(base, { id: 'a', kind: 'index', locator: 'y' })
    assert.equal(next.length, 1)
    assert.equal(next[0]!.locator, 'y')
  })

  it('removing the domain root resets discovery', () => {
    const home = freshHome()
    writeSources(home, [{ id: 'a', kind: 'index', locator: 'x' }])
    assert.equal(readSources(home).length, 1)
    rmSync(discoveryRoot(home), { recursive: true, force: true })
    assert.deepEqual(readSources(home), [])
  })
})

describe('lock.yml (TOFU)', () => {
  it('round-trips and finds by canonical', () => {
    const home = freshHome()
    writeLock(home, [{ canonical: 'dsh-external/whale-girl', kind: 'repository', ref: 'abc', recordedAt: 't' }])
    const locks = readLock(home)
    assert.equal(locks.length, 1)
    assert.equal(findLock(locks, 'dsh-external/whale-girl')?.ref, 'abc')
    assert.equal(findLock(locks, 'other'), undefined)
  })

  it('upsert replaces by canonical', () => {
    const locks = [{ canonical: 'a/b', kind: 'repository' as const, ref: '1', recordedAt: '' }]
    const next = upsertLock(locks, { canonical: 'a/b', kind: 'repository', ref: '2', recordedAt: '' })
    assert.equal(next.length, 1)
    assert.equal(next[0]!.ref, '2')
  })

  it('throws on malformed entries', () => {
    const home = freshHome()
    writeFileSync(lockPath(home), 'locks:\n  - canonical: 5\n    kind: repository\n    ref: x\n')
    assert.throws(() => readLock(home), /canonical/)
  })
})

describe('cache snapshots', () => {
  it('write/read round-trip', () => {
    const home = freshHome()
    writeSnapshot(home, 'hub', { fetchedAt: new Date().toISOString(), entries: [{ id: 'x', kind: 'repository', source: 'github:a/b', refHint: null, faces: [], sourceId: 'hub' }] })
    const snap = readSnapshot(home, 'hub')
    assert.notEqual(snap, null)
    assert.equal(snap!.entries.length, 1)
    assert.equal(readSnapshot(home, 'missing'), null)
  })

  it('freshness respects TTL', () => {
    const now = Date.now()
    const recent = { fetchedAt: new Date(now - 60_000).toISOString(), entries: [] }
    assert.equal(snapshotFresh(recent, 3600_000, now), true)
    const old = { fetchedAt: new Date(now - 7200_000).toISOString(), entries: [] }
    assert.equal(snapshotFresh(old, 3600_000, now), false)
    const garbage = { fetchedAt: 'not-a-date', entries: [] }
    assert.equal(snapshotFresh(garbage, 3600_000, now), false)
  })
})
