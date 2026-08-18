/**
 * 发现层枚举（0813 适配）：单一 index 源——组织级 hub 的官方可装插件索引
 * （默认源 locator 指向 hub index.json，schema plugin-sources/index/v1，
 * Agent Loop 每 2h 刷新）。条目转换 + 快照缓存（TTL 6h + ETag 条件刷新）。
 *
 * 0811 起 repository 插件机制移除，外部插件只有 profile bundle 一条官方
 * 安装路径；index.json 的 `plugins` 条目 `source` 直接就是 npm 包名
 * （bundle 插件），可原样喂给 plugin_install。index 是派生数据（hub 聚合
 * 各仓库 package.json 的 dsh.bundle 声明），无需逐仓库探测。
 */
import { existsSync } from 'node:fs'
import type { EnumerateSnapshot, PluginEntry, PluginFace, PluginSource } from './types.ts'
import { readSnapshot, writeSnapshot, snapshotFresh } from './store.ts'

export const INDEX_TTL_MS = 6 * 60 * 60 * 1000 // 6h

const FACES: ReadonlySet<string> = new Set(['tool', 'skill', 'mcp', 'ui', 'bundle'])

/**
 * index.json（plugin-sources/index/v1）插件条目 → 统一插件条目。
 * 只收官方可装形态 `bundle`（source = npm 包名）；`repository` 已随 0811
 * 移除，跳过。id 取 source（安装规范）而非仓库名——与 plugin_install /
 * plugin_status 的 canonical 一致。
 */
export function indexEntryToPlugin(raw: Record<string, unknown>, sourceId: string): PluginEntry | null {
  const source = typeof raw.source === 'string' ? raw.source : null
  if (raw.kind !== 'bundle' || source === null || source.trim() === '') return null
  const faces: PluginFace[] = Array.isArray(raw.faces)
    ? raw.faces.filter((f): f is PluginFace => typeof f === 'string' && FACES.has(f))
    : []
  const description = typeof raw.description === 'string' ? raw.description : undefined
  return { id: source, kind: 'bundle', source, faces, description, sourceId }
}

interface FetchResult {
  ok: boolean
  status: number
  etag: string | null
  text(): Promise<string>
  json(): Promise<unknown>
}

/** fetch 抽象（测试注入 mock；运行时全局 fetch，代理由 NO_PROXY 控制）。 */
export interface FetchLike {
  (url: string, init?: { headers?: Record<string, string> }): Promise<FetchResult>
}

const defaultFetch: FetchLike = async (url, init) => {
  const res = await fetch(url, init)
  return {
    ok: res.ok,
    status: res.status,
    etag: res.headers.get('etag'),
    text: () => res.text(),
    json: () => res.json(),
  }
}

/** 把 index.json 的 plugins 数组转成统一条目列表。 */
function pluginsToEntries(body: unknown, sourceId: string): PluginEntry[] {
  const rawPlugins = Array.isArray((body as { plugins?: unknown[] }).plugins)
    ? (body as { plugins: unknown[] }).plugins
    : []
  return rawPlugins
    .map((p) => indexEntryToPlugin((p ?? {}) as Record<string, unknown>, sourceId))
    .filter((e): e is PluginEntry => e !== null)
}

/**
 * index 源枚举：读 hub index.json（locator = URL 或本地文件路径），
 * 条目转换，写快照。有新鲜快照 → 直接返回（不网络）；过期 → 拉取（带
 * ETag 条件刷新，304 时保留 entries 仅更新 fetchedAt）。
 *
 * locator 支持 file:///path 或裸本地路径（读文件，零网络——本机经 hub
 * clone 的 index.json 走此通道）。
 */
export async function enumerateIndex(
  dshHome: string,
  source: PluginSource,
  opts: { refresh?: boolean; now?: number; fetch?: FetchLike } = {},
): Promise<EnumerateSnapshot> {
  const now = opts.now ?? Date.now()
  const cached = readSnapshot(dshHome, source.id)
  if (cached !== null && !opts.refresh && snapshotFresh(cached, INDEX_TTL_MS, now)) {
    return cached
  }
  // 本地文件通道（file:// 或存在的裸路径）。
  const filePath = source.locator.replace(/^file:\/\//, '')
  if (source.locator.startsWith('file:') || (!/^https?:/i.test(source.locator) && existsSync(filePath))) {
    const { readFileSync } = await import('node:fs')
    let body: unknown
    try {
      body = JSON.parse(readFileSync(filePath, 'utf8'))
    } catch (error) {
      throw new Error(`plugin-sources: index "${source.id}" local file unreadable (${filePath}): ${String(error)}`)
    }
    const entries = pluginsToEntries(body, source.id)
    const snapshot: EnumerateSnapshot = { fetchedAt: new Date(now).toISOString(), entries }
    writeSnapshot(dshHome, source.id, snapshot)
    return snapshot
  }
  const fetchImpl = opts.fetch ?? defaultFetch
  const headers: Record<string, string> = {}
  if (cached?.etag !== undefined && !opts.refresh) headers['If-None-Match'] = cached.etag
  const res = await fetchImpl(source.locator, { headers })
  if (res.status === 304 && cached !== null) {
    // 内容未变：保留 entries，仅刷新时间与 etag。
    const refreshed: EnumerateSnapshot = { fetchedAt: new Date(now).toISOString(), etag: cached.etag, entries: cached.entries }
    writeSnapshot(dshHome, source.id, refreshed)
    return refreshed
  }
  if (!res.ok) {
    throw new Error(`plugin-sources: index "${source.id}" fetch failed (${res.status}): ${source.locator}`)
  }
  const body = (await res.json()) as { plugins?: unknown[] }
  const entries = pluginsToEntries(body, source.id)
  const snapshot: EnumerateSnapshot = { fetchedAt: new Date(now).toISOString(), etag: res.etag ?? undefined, entries }
  writeSnapshot(dshHome, source.id, snapshot)
  return snapshot
}

/** 按源类型分发枚举（0811 起仅 index）。 */
export async function enumerateSource(
  dshHome: string,
  source: PluginSource,
  opts: { refresh?: boolean; now?: number; fetch?: FetchLike } = {},
): Promise<EnumerateSnapshot> {
  return enumerateIndex(dshHome, source, opts)
}
