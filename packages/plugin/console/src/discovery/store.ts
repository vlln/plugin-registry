/**
 * 发现层存储（0811 适配）：`$DSH_HOME/plugin-sources/` 域根读写——
 * sources.yml（索引源集合，唯一配置入口）＋lock.yml（TOFU：resolved
 * 引用）＋cache/<source-id>/（每源枚举快照，派生数据）。配置与派生分离。
 *
 * 命名 `plugin-sources/` 而非 `plugins/`：后者与旧 registry 的
 * `~/.dsh/plugins/` 安装目录同名易混。删目录即重置发现层，不影响安装态
 * （安装态在 profile 的 package.json bundles 与 cordis.patch.yml）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { EnumerateSnapshot, LockEntry, PluginSource } from './types.ts'

export const DISCOVERY_ROOT = 'plugin-sources'
export const SOURCES_FILE = 'sources.yml'
export const LOCK_FILE = 'lock.yml'
const CACHE_DIR = 'cache'
const ENTRIES_FILE = 'entries.json'
const TRUST_LEVELS = new Set(['official', 'community', 'untrusted'])

/** 发现层域根。 */
export function discoveryRoot(dshHome: string): string {
  return join(dshHome, DISCOVERY_ROOT)
}

export function sourcesPath(dshHome: string): string {
  return join(discoveryRoot(dshHome), SOURCES_FILE)
}

export function lockPath(dshHome: string): string {
  return join(discoveryRoot(dshHome), LOCK_FILE)
}

function cacheDir(dshHome: string, sourceId: string): string {
  return join(discoveryRoot(dshHome), CACHE_DIR, sourceId)
}

export function cacheEntriesPath(dshHome: string, sourceId: string): string {
  return join(cacheDir(dshHome, sourceId), ENTRIES_FILE)
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

function readText(file: string): string | null {
  if (!existsSync(file)) return null
  return readFileSync(file, 'utf8')
}

/** 源集合：读 sources.yml。文件不存在 → 空列表；非法结构 → 明确错误。 */
export function readSources(dshHome: string): PluginSource[] {
  const text = readText(sourcesPath(dshHome))
  if (text === null) return []
  let parsed: unknown
  try {
    parsed = parseYaml(text)
  } catch (error) {
    throw new Error(`plugin-sources: ${SOURCES_FILE} is not valid YAML: ${String(error)}`)
  }
  if (parsed === null || parsed === undefined) return []
  const root = (parsed as { sources?: unknown }).sources
  if (!Array.isArray(root)) {
    throw new Error(`plugin-sources: ${SOURCES_FILE} must be a YAML object with a "sources" list`)
  }
  return root.map((raw, i) => normalizeSource(raw, i))
}

/** 校验并规整一个源条目（0811 仅 index 一种）。 */
export function normalizeSource(raw: unknown, index: number): PluginSource {
  const r = (raw ?? {}) as Record<string, unknown>
  if (typeof r.id !== 'string' || r.id.trim() === '') {
    throw new Error(`plugin-sources: sources[${index}] missing string "id"`)
  }
  if (r.kind !== undefined && r.kind !== 'index') {
    throw new Error(`plugin-sources: sources[${index}] ("${r.id}") kind must be index (repository sources removed in 0811)`)
  }
  if (typeof r.locator !== 'string' || r.locator.trim() === '') {
    throw new Error(`plugin-sources: sources[${index}] ("${r.id}") missing string "locator"`)
  }
  if (r.trust !== undefined && (typeof r.trust !== 'string' || !TRUST_LEVELS.has(r.trust))) {
    throw new Error(`plugin-sources: sources[${index}] ("${r.id}") trust must be one of official|community|untrusted`)
  }
  return {
    id: r.id.trim(),
    kind: 'index',
    locator: r.locator.trim(),
    trust: (r.trust as PluginSource['trust']) ?? 'community',
  }
}

/** 写 sources.yml（原子：重建整个文件；失败抛错）。 */
export function writeSources(dshHome: string, sources: PluginSource[]): void {
  const root = { sources: sources.map(s => ({ id: s.id, kind: s.kind, locator: s.locator, ...(s.trust !== 'community' ? { trust: s.trust } : {}) })) }
  const text = stringifyYaml(root)
  ensureDir(discoveryRoot(dshHome))
  writeFileSync(sourcesPath(dshHome), text)
}

/** 源集合：按 id 取源；不存在返回 undefined。 */
export function findSource(sources: PluginSource[], id: string): PluginSource | undefined {
  return sources.find(s => s.id === id)
}

/** 源集合：追加或替换（按 id）。 */
export function upsertSource(sources: PluginSource[], source: PluginSource): PluginSource[] {
  const rest = sources.filter(s => s.id !== source.id)
  return [...rest, source]
}

/** TOFU 锁：读 lock.yml。文件不存在 → 空；非法结构 → 明确错误。 */
export function readLock(dshHome: string): LockEntry[] {
  const text = readText(lockPath(dshHome))
  if (text === null) return []
  let parsed: unknown
  try {
    parsed = parseYaml(text)
  } catch (error) {
    throw new Error(`plugin-sources: ${LOCK_FILE} is not valid YAML: ${String(error)}`)
  }
  if (parsed === null || parsed === undefined) return []
  const root = (parsed as { locks?: unknown }).locks
  if (!Array.isArray(root)) {
    throw new Error(`plugin-sources: ${LOCK_FILE} must be a YAML object with a "locks" list`)
  }
  return root.map((raw, i) => {
    const r = (raw ?? {}) as Record<string, unknown>
    if (typeof r.canonical !== 'string' || r.canonical.trim() === '') {
      throw new Error(`plugin-sources: locks[${i}] missing string "canonical"`)
    }
    if (r.kind !== 'bundle' && r.kind !== 'plugin') {
      throw new Error(`plugin-sources: locks[${i}] ("${r.canonical}") kind must be bundle|plugin`)
    }
    if (typeof r.ref !== 'string' || r.ref.trim() === '') {
      throw new Error(`plugin-sources: locks[${i}] ("${r.canonical}") missing string "ref"`)
    }
    return {
      canonical: r.canonical.trim(),
      kind: r.kind,
      ref: r.ref.trim(),
      hash: typeof r.hash === 'string' ? r.hash : undefined,
      recordedAt: typeof r.recordedAt === 'string' ? r.recordedAt : new Date().toISOString(),
    }
  })
}

/** 写 lock.yml。 */
export function writeLock(dshHome: string, locks: LockEntry[]): void {
  const root = { locks }
  ensureDir(discoveryRoot(dshHome))
  writeFileSync(lockPath(dshHome), stringifyYaml(root))
}

/** 按 canonical 取锁；不存在返回 undefined。 */
export function findLock(locks: LockEntry[], canonical: string): LockEntry | undefined {
  return locks.find(l => l.canonical === canonical)
}

/** 追加或替换（按 canonical）。 */
export function upsertLock(locks: LockEntry[], lock: LockEntry): LockEntry[] {
  const rest = locks.filter(l => l.canonical !== lock.canonical)
  return [...rest, lock]
}

/** 每源枚举快照：读 cache/<source-id>/entries.json；不存在 → null。 */
export function readSnapshot(dshHome: string, sourceId: string): EnumerateSnapshot | null {
  const text = readText(cacheEntriesPath(dshHome, sourceId))
  if (text === null) return null
  try {
    const parsed = JSON.parse(text) as EnumerateSnapshot
    if (!Array.isArray(parsed.entries)) throw new Error('entries must be a list')
    return parsed
  } catch (error) {
    throw new Error(`plugin-sources: cache/${sourceId}/entries.json is not valid: ${String(error)}`)
  }
}

/** 写枚举快照（按源分目录；派生数据，机器产物）。 */
export function writeSnapshot(dshHome: string, sourceId: string, snapshot: EnumerateSnapshot): void {
  ensureDir(cacheDir(dshHome, sourceId))
  writeFileSync(cacheEntriesPath(dshHome, sourceId), JSON.stringify(snapshot, null, 2))
}

/** 快照是否新鲜（未超过 TTL）。 */
export function snapshotFresh(snapshot: EnumerateSnapshot, ttlMs: number, now = Date.now()): boolean {
  const fetched = Date.parse(snapshot.fetchedAt)
  if (Number.isNaN(fetched)) return false
  return now - fetched < ttlMs
}
