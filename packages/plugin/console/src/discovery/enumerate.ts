/**
 * 发现层枚举：三源类型（index / manifest / single）归一为统一条目 schema。
 * - index：读现成索引文件（hub plugins.json 等），条目转换 + 快照缓存
 *   （TTL 6h + ETag 条件刷新）
 * - manifest：读用户手写清单（本地文件，零网络）
 * - single：单仓库懒加载探测（github raw 读 package.json → 描述符），
 *   1h 缓存 + 按仓库去重（GitHub 匿名 API 限流 60 次/h/IP 硬约束）
 *
 * 探测失败 = "不是插件/格式不符"（天然校验）；hub 的裸 git URL 转官方源
 * 串（refHint 缺省 null，install 时解析）。
 */
import { existsSync } from 'node:fs'
import type { EnumerateSnapshot, PluginEntry, PluginFace, PluginSource } from './types.ts'
import { readSnapshot, writeSnapshot, snapshotFresh } from './store.ts'

export const INDEX_TTL_MS = 6 * 60 * 60 * 1000 // 6h
export const SINGLE_TTL_MS = 60 * 60 * 1000 // 1h（防限流）

/** 解析 github 仓库 URL（https://github.com/o/r.git 或裸 https://github.com/o/r）。 */
export function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url.trim())
  if (m === null) return null
  return { owner: m[1]!, repo: m[2]!.replace(/\.git$/, '') }
}

/** 解析官方 repository 源串（github:owner/repo#ref&path:...）→ 各部分。 */
export function parseRepositorySource(source: string): { owner: string; repo: string; ref: string | null; path: string | null } | null {
  const m = /^github:([^/]+)\/([^#&]+?)(?:#([^&]+))?(?:&path:(\/.*))?$/.exec(source.trim())
  if (m === null) return null
  return { owner: m[1]!, repo: m[2]!, ref: m[3] ?? null, path: m[4] ?? null }
}

/** canonical 身份（owner/repo 小写，跨源去重键）。 */
export function canonicalOfRepository(owner: string, repo: string): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`
}

/** 从 package.json 的 dsh 字段派生能力面。 */
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

/** index 源条目转换：hub 形态 → 统一条目。 */
export function hubEntryToPlugin(raw: Record<string, unknown>, sourceId: string): PluginEntry | null {
  const id = typeof raw.id === 'string' ? raw.id : null
  const url = typeof raw.source === 'string' ? raw.source : null
  if (id === null || url === null) return null
  const gh = parseGithubUrl(url)
  if (gh === null) return null
  const description = typeof raw.description === 'string' ? raw.description : undefined
  return {
    id,
    kind: 'repository',
    source: `github:${gh.owner}/${gh.repo}`,
    refHint: null,
    faces: [],
    description,
    sourceId,
  }
}

/**
 * index 源枚举：读索引 JSON（locator = URL 或本地文件路径），条目转换，
 * 写快照。有新鲜快照 → 直接返回（不网络）；过期 → 拉取（带 ETag 条件
 * 刷新，304 时保留 entries 仅更新 fetchedAt）。
 *
 * locator 支持 file:///path 或裸本地路径（读文件，零网络——hub 私有仓库
 * 匿名 raw 404，本机经 hub clone 的 plugins.json 走此通道）。
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
  if (existsSync(filePath) && (source.locator.startsWith('file:') || !/^https?:/i.test(source.locator))) {
    const { readFileSync } = await import('node:fs')
    let body: unknown
    try {
      body = JSON.parse(readFileSync(filePath, 'utf8'))
    } catch (error) {
      throw new Error(`plugin-sources: index "${source.id}" local file unreadable (${filePath}): ${String(error)}`)
    }
    const rawPlugins = Array.isArray((body as { plugins?: unknown[] }).plugins) ? (body as { plugins: unknown[] }).plugins : []
    const entries = rawPlugins
      .map((p) => hubEntryToPlugin((p ?? {}) as Record<string, unknown>, source.id))
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
  const body = (await res.json()) as { plugins?: unknown[] }
  const rawPlugins = Array.isArray(body.plugins) ? body.plugins : []
  const entries = rawPlugins
    .map((p) => hubEntryToPlugin((p ?? {}) as Record<string, unknown>, source.id))
    .filter((e): e is PluginEntry => e !== null)
  const snapshot: EnumerateSnapshot = { fetchedAt: new Date(now).toISOString(), etag: res.etag ?? undefined, entries }
  writeSnapshot(dshHome, source.id, snapshot)
  return snapshot
}

/**
 * single 源探测：读仓库 package.json（先试 .dsh-plugin/，再试根），
 * 派生 faces/description，写该源快照。按仓库去重 + 1h TTL：同仓库在
 * 其它 single 源出现时复用本源缓存。
 */
export async function enumerateSingle(
  dshHome: string,
  source: PluginSource,
  opts: { refresh?: boolean; now?: number; fetch?: FetchLike } = {},
): Promise<EnumerateSnapshot> {
  const now = opts.now ?? Date.now()
  const cached = readSnapshot(dshHome, source.id)
  if (cached !== null && !opts.refresh && snapshotFresh(cached, SINGLE_TTL_MS, now)) {
    return cached
  }
  const parsed = parseRepositorySource(source.locator)
  if (parsed === null) {
    throw new Error(`plugin-sources: single "${source.id}" locator must be github:owner/repo#ref[&path:/...]`)
  }
  const fetchImpl = opts.fetch ?? defaultFetch
  const { owner, repo } = parsed
  const probePaths = parsed.path !== null
    ? [`${parsed.path.replace(/^\/+/, '')}/package.json`]
    : ['.dsh-plugin/package.json', 'package.json']
  const ref = parsed.ref ?? 'HEAD'
  let pkg: Record<string, unknown> | null = null
  let usedPath: string | null = null
  for (const p of probePaths) {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${p}`
    const res = await fetchImpl(url)
    if (res.ok) {
      pkg = (await res.json()) as Record<string, unknown>
      usedPath = p
      break
    }
    if (res.status !== 404) break // 非 404（限流/网络）不继续探测
  }
  if (pkg === null) {
    throw new Error(`plugin-sources: single "${source.id}" is not a plugin — no package.json at ${probePaths.join(' or ')} (${owner}/${repo}@${ref})`)
  }
  const id = typeof pkg.name === 'string' ? pkg.name : `${owner}/${repo}`
  const description = typeof pkg.description === 'string' ? pkg.description : undefined
  const dsh = pkg.dsh
  const faces = facesOfDsh(dsh)
  const isBundle = (dsh as Record<string, unknown> | undefined)?.bundle !== undefined
  const pathTail = usedPath === '.dsh-plugin/package.json' ? '&path:/.dsh-plugin' : (parsed.path ?? '')
  const entry: PluginEntry = {
    id,
    kind: isBundle ? 'bundle' : 'repository',
    source: `github:${owner}/${repo}${parsed.ref !== null ? `#${parsed.ref}` : ''}${pathTail}`,
    refHint: parsed.ref,
    faces,
    description,
    sourceId: source.id,
  }
  const snapshot: EnumerateSnapshot = { fetchedAt: new Date(now).toISOString(), entries: [entry] }
  writeSnapshot(dshHome, source.id, snapshot)
  return snapshot
}

/** manifest 源枚举：读用户手写清单文件（每行一个官方源串，或 YAML 列表）。 */
export async function enumerateManifest(
  dshHome: string,
  source: PluginSource,
  opts: { fetch?: FetchLike } = {},
): Promise<EnumerateSnapshot> {
  // 保持签名异步一致；manifest 是本地文件，纯同步读。
  const { readFileSync } = await import('node:fs')
  let text: string
  try {
    text = readFileSync(source.locator.replace(/^file:\/\//, ''), 'utf8')
  } catch (error) {
    throw new Error(`plugin-sources: manifest "${source.id}" unreadable (${source.locator}): ${String(error)}`)
  }
  const entries: PluginEntry[] = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((sourceStr) => {
      const parsed = parseRepositorySource(sourceStr)
      if (parsed !== null) {
        return {
          id: `${parsed.owner}/${parsed.repo}`,
          kind: 'repository' as const,
          source: sourceStr,
          refHint: parsed.ref,
          faces: [] as PluginFace[],
          sourceId: source.id,
        }
      }
      // 非 github 官方格式：当作 bundle 包名。
      return { id: sourceStr, kind: 'bundle' as const, source: sourceStr, refHint: null, faces: [] as PluginFace[], sourceId: source.id }
    })
  return { fetchedAt: new Date().toISOString(), entries }
}

/** 按源类型分发枚举。 */
export async function enumerateSource(
  dshHome: string,
  source: PluginSource,
  opts: { refresh?: boolean; now?: number; fetch?: FetchLike } = {},
): Promise<EnumerateSnapshot> {
  switch (source.kind) {
    case 'index': return enumerateIndex(dshHome, source, opts)
    case 'single': return enumerateSingle(dshHome, source, opts)
    case 'manifest': return enumerateManifest(dshHome, source, opts)
  }
}
