/**
 * 发现层枚举（0811 适配）：单一 index 源——组织级 hub catalog
 * （`dsh-external/hub` 的 catalog.json，Agent Loop 每 2h 刷新）。条目
 * 转换 + 快照缓存（TTL 6h + ETag 条件刷新）。
 *
 * 0811 起 repository 插件机制移除，外部插件只有 profile bundle 一条安装
 * 路径；hub catalog 的 `bundle` 标记（仓库内 package.json 声明 dsh.bundle）
 * 决定可安装形态：bundle = 走 profile bundles 层，plugin = 走 insert 行。
 * catalog 是派生数据（聚合每个仓库的 manifest 字段），无需再逐仓库探测。
 */
import { existsSync } from 'node:fs'
import type { EnumerateSnapshot, PluginEntry, PluginFace, PluginSource } from './types.ts'
import { readSnapshot, writeSnapshot, snapshotFresh } from './store.ts'

export const INDEX_TTL_MS = 6 * 60 * 60 * 1000 // 6h

/** 解析 github 仓库 URL（https://github.com/o/r.git 或裸 https://github.com/o/r）。 */
export function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url.trim())
  if (m === null) return null
  return { owner: m[1]!, repo: m[2]!.replace(/\.git$/, '') }
}

/** 从 catalog 的 dsh 字段派生能力面。 */
export function facesOfDsh(dsh: unknown): PluginFace[] {
  const faces: PluginFace[] = []
  const d = (dsh ?? {}) as Record<string, unknown>
  if (d.entry !== undefined) faces.push('tool')
  if (d.skills !== undefined) faces.push('skill')
  if (d.mcpServers !== undefined) faces.push('mcp')
  if (d.client !== undefined) faces.push('ui')
  if (d.bundle !== undefined) faces.push('bundle')
  return faces
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

/** hub catalog 仓库条目 → 统一插件条目。 */
export function hubRepoToPlugin(raw: Record<string, unknown>, sourceId: string): PluginEntry | null {
  const name = typeof raw.name === 'string' ? raw.name : null
  const url = typeof raw.url === 'string' ? raw.url : null
  if (name === null || url === null) return null
  const gh = parseGithubUrl(url)
  if (gh === null) return null
  const description = typeof raw.description === 'string' ? raw.description : undefined
  // catalog 的 manifest 聚合字段：bundle 标记仓库声明 dsh.bundle。
  const isBundle = raw.bundle === true
  const faces: PluginFace[] = []
  if (raw.skill === true) faces.push('skill')
  if (isBundle) faces.push('bundle')
  return {
    id: name,
    kind: isBundle ? 'bundle' : 'plugin',
    source: `github:${gh.owner}/${gh.repo}`,
    faces,
    description,
    sourceId,
  }
}

/**
 * index 源枚举：读 hub catalog JSON（locator = URL 或本地文件路径），
 * 条目转换，写快照。有新鲜快照 → 直接返回（不网络）；过期 → 拉取（带
 * ETag 条件刷新，304 时保留 entries 仅更新 fetchedAt）。
 *
 * locator 支持 file:///path 或裸本地路径（读文件，零网络——本机经 hub
 * clone 的 catalog.json 走此通道）。
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
    const rawRepos = Array.isArray((body as { repos?: unknown[] }).repos) ? (body as { repos: unknown[] }).repos : []
    const entries = rawRepos
      .map((p) => hubRepoToPlugin((p ?? {}) as Record<string, unknown>, source.id))
      .filter((e): e is PluginEntry => e !== null)
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
  const body = (await res.json()) as { repos?: unknown[] }
  const rawRepos = Array.isArray(body.repos) ? body.repos : []
  const entries = rawRepos
    .map((p) => hubRepoToPlugin((p ?? {}) as Record<string, unknown>, source.id))
    .filter((e): e is PluginEntry => e !== null)
  const snapshot: EnumerateSnapshot = { fetchedAt: new Date(now).toISOString(), etag: res.etag ?? undefined, entries }
  writeSnapshot(dshHome, source.id, snapshot)
  return snapshot
}

/** 按源类型分发枚举（0811 仅 index）。 */
export async function enumerateSource(
  dshHome: string,
  source: PluginSource,
  opts: { refresh?: boolean; now?: number; fetch?: FetchLike } = {},
): Promise<EnumerateSnapshot> {
  return enumerateIndex(dshHome, source, opts)
}
