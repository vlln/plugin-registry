/**
 * 插件管理工具（plugin_* ×4）：agent 的插件发现与安装面。
 * - plugin_search：搜源集合（给定新源 → 懒加载探测并入 sources.yml）
 * - plugin_install：官方格式源直装（已装则更新 ref）；repository 走
 *   cordis.patch.yml repositories 行，bundle 走 pnpm add；TOFU 固化
 *   resolved ref 到 lock.yml
 * - plugin_uninstall：删安装态行（清单保留，可再装）
 * - plugin_status：无参 list 安装态；有参单查（含 lock 固化 ref）
 *
 * first-index：安装源即身份，不跨源合并候选池。依赖注入（deps），
 * 避免与 index.ts 循环依赖。
 */
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { EnumerateSnapshot, LockEntry, PluginEntry, PluginSource } from './types.ts'
import { enumerateSource, parseRepositorySource, canonicalOfRepository } from './enumerate.ts'
import { findLock, findSource, readLock, readSources, upsertLock, upsertSource, writeLock, writeSources } from './store.ts'

/** tools 依赖（由 console apply 注入：安装态读写 + bundle 安装）。 */
export interface PluginToolDeps {
  dshHome(): string
  readRepositories(): { repositories: string[]; present: boolean }
  writeRepositories(repositories: string[]): void
  /** bundle 安装（pnpm add + reconcile）；无实现时返回 null。 */
  bundleInstall?(source: string): { names: string[]; output: string } | null
}

/** 统一插件条目输出（JSON Schema）。 */
const PLUGIN_ITEM = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    kind: { type: 'string', required: true, enum: ['repository', 'bundle'] },
    source: { type: 'string', required: true },
    faces: { type: 'array', items: { type: 'string' }, required: true },
    description: { type: 'string' },
    sourceId: { type: 'string', required: true },
  },
} as const

function pluginItemView(entry: PluginEntry, trust?: string): Record<string, unknown> {
  return {
    id: entry.id,
    kind: entry.kind,
    source: entry.source,
    faces: entry.faces,
    ...(entry.description !== undefined ? { description: entry.description } : {}),
    sourceId: entry.sourceId,
    ...(trust !== undefined ? { trust } : {}),
  }
}

function renderPlugins(_args: Record<string, unknown>, value: { plugins: Array<Record<string, unknown>> }): import('@deepseek-ai/dsh-llm').ContentBlock[] {
  const lines = value.plugins.map((p) => {
    const trust = p.trust !== undefined ? ` [${p.trust}]` : ''
    const faces = (p.faces as string[]).length > 0 ? ` · ${(p.faces as string[]).join('/')}` : ''
    const desc = p.description !== undefined ? ` — ${p.description}` : ''
    return `- ${p.id}${trust} (${p.kind}${faces}) ${p.source}${desc}`
  })
  return [{ type: 'text', text: lines.length > 0 ? lines.join('\n') : '(no plugins found)' }]
}

/** 解析一个 repository 安装行 → 结构化。 */
function parseInstalled(source: string): { canonical: string; ref: string | null; kind: 'repository' } | null {
  const parsed = parseRepositorySource(source)
  if (parsed === null) return null
  return { canonical: canonicalOfRepository(parsed.owner, parsed.repo), ref: parsed.ref, kind: 'repository' }
}

/** id 匹配：支持完整 canonical（owner/repo）或短仓库名。 */
function matchesId(canonical: string, id: string): boolean {
  const key = id.trim().toLowerCase()
  return canonical === key || canonical.endsWith(`/${key}`) || canonical.split('/').pop() === key
}

/** 规范化 ref 检查：repository 源必须有精确 ref（禁裸分支）。 */
function requireExactRef(source: string, parsed: { ref: string | null }): void {
  if (parsed.ref === null || parsed.ref.trim() === '') {
    throw new Error(`plugin_install: repository source needs an exact ref (commit sha or tag), got bare "${source}" — pin github:owner/repo#<sha|tag>`)
  }
}

/** 从 search 的 source 参数推断源类型（新源懒加载）。 */
function inferSource(arg: string): PluginSource {
  const id = `custom-${Date.now()}`
  if (/^file:\/\//.test(arg) || /^https?:\/\//i.test(arg)) {
    return { id, kind: 'index', locator: arg, trust: 'community' }
  }
  if (arg.startsWith('github:')) {
    return { id, kind: 'single', locator: arg, trust: 'community' }
  }
  // npm bundle 包名：无发现元数据，直接安装；枚举返回空。
  return { id, kind: 'manifest', locator: `bundle:${arg}`, trust: 'community' }
}

export function createPluginTools(deps: PluginToolDeps): ToolDefinition[] {
  return [
    defineTool({
      name: 'plugin_search',
      description: 'Search installable DSH plugins. Without `source`, searches every registered source '
        + '(sources at $DSH_HOME/plugin-sources/sources.yml, enumeration cached). With `source`, probes '
        + 'that source — a new official-format source (github:owner/repo#ref, an index file/URL, or an npm '
        + 'bundle) is probed lazily and remembered for later searches. Results carry the owning source and trust level.',
      parameters: {
        query: { type: 'string', description: 'Substring to match against plugin id or description. Empty returns all.' },
        source: { type: 'string', description: 'A registered source id, or a new source (github:owner/repo#ref, an index JSON file/URL, or an npm bundle) to probe and remember.' },
        refresh: { type: 'boolean', description: 'Force re-enumeration, ignoring cached snapshots.' },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { plugins: { type: 'array', items: PLUGIN_ITEM, required: true } } },
        render: renderPlugins,
      },
      async execute(args) {
        const home = deps.dshHome()
        const sources = readSources(home)
        let snapshots: EnumerateSnapshot[] = []
        let matched: PluginSource | undefined
        if (args.source !== undefined && args.source !== '') {
          matched = findSource(sources, args.source)
          const target = matched ?? inferSource(args.source)
          if (target.kind === 'manifest' && target.locator.startsWith('bundle:')) {
            // bundle 包名：无枚举协议，仅记住源（直接 install 即可）。
            if (matched === undefined) writeSources(home, upsertSource(sources, { ...target, locator: args.source }))
            return { plugins: [] }
          }
          const snap = await enumerateSource(home, target, { refresh: args.refresh === true })
          snapshots = [snap]
          if (matched === undefined) {
            writeSources(home, upsertSource(sources, target))
          }
        } else {
          for (const src of sources) {
            snapshots.push(await enumerateSource(home, src, { refresh: args.refresh === true }))
          }
        }
        const query = (args.query ?? '').trim().toLowerCase()
        const plugins = snapshots
          .flatMap((snap) => snap.entries)
          .map((entry) => {
            const src = findSource(sources, entry.sourceId)
            return pluginItemView(entry, src?.trust)
          })
          .filter((p) => {
            if (query === '') return true
            return (p.id as string).toLowerCase().includes(query)
              || ((p.description as string | undefined) ?? '').toLowerCase().includes(query)
          })
        return { plugins }
      },
    }),

    defineTool({
      name: 'plugin_install',
      description: 'Install a DSH plugin from an official-format source. Repository plugins '
        + '(github:owner/repo#<sha|tag>[&path:/...]) are written to $DSH_HOME/cordis.patch.yml '
        + 'repository-plugins.repositories (official HMR applies them); bundle plugins (npm package '
        + 'with dsh.bundle) are added via pnpm to the web profile. Installing an already-installed '
        + 'plugin updates its ref. The resolved ref is recorded (TOFU) in $DSH_HOME/plugin-sources/lock.yml.',
      parameters: {
        source: { type: 'string', required: true, description: 'Official-format source: github:owner/repo#<sha|tag>[&path:/...] or an npm bundle name.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', required: true },
            canonical: { type: 'string', required: true },
            ref: { type: 'string' },
            message: { type: 'string', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: value.message }],
      },
      async execute(args) {
        const home = deps.dshHome()
        const repoParsed = parseRepositorySource(args.source)
        if (repoParsed !== null) {
          requireExactRef(args.source, repoParsed)
          const canonical = canonicalOfRepository(repoParsed.owner, repoParsed.repo)
          const current = deps.readRepositories()
          const next = [...current.repositories]
          const idx = next.findIndex((row) => parseInstalled(row)?.canonical === canonical)
          if (idx !== -1) {
            next[idx] = args.source
          } else {
            next.push(args.source)
          }
          deps.writeRepositories(next)
          const locks = readLock(home)
          writeLock(home, upsertLock(locks, {
            canonical,
            kind: 'repository',
            ref: repoParsed.ref!,
            recordedAt: new Date().toISOString(),
          }))
          return {
            ok: true,
            canonical,
            ref: repoParsed.ref!,
            message: `plugin_install: ${canonical}@${repoParsed.ref} ${idx !== -1 ? 'updated' : 'added'} — HMR will apply it; restart the web app if no live HMR.`,
          }
        }
        // bundle 形态
        if (deps.bundleInstall === undefined) {
          throw new Error(`plugin_install: bundle source "${args.source}" needs bundleInstall support (web profile)`)
        }
        const result = deps.bundleInstall(args.source)
        const locks = readLock(home)
        writeLock(home, upsertLock(locks, {
          canonical: args.source,
          kind: 'bundle',
          ref: args.source,
          recordedAt: new Date().toISOString(),
        }))
        return {
          ok: true,
          canonical: args.source,
          message: `plugin_install: bundle ${args.source} added${result !== null ? ` (${result.names.join(', ')})` : ''} — restart the web app to load it.`,
        }
      },
    }),

    defineTool({
      name: 'plugin_uninstall',
      description: 'Remove an installed repository plugin from $DSH_HOME/cordis.patch.yml '
        + 'repository-plugins.repositories. The source stays in plugin-sources (it can be reinstalled); '
        + 'bundle plugins are not removed by this tool yet.',
      parameters: {
        id: { type: 'string', required: true, description: 'Plugin id or owner/repo to remove.' },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true }, message: { type: 'string', required: true } } },
        render: (_args, value) => [{ type: 'text', text: value.message }],
      },
      async execute(args) {
        const current = deps.readRepositories()
        const remaining = current.repositories.filter((row) => {
          const parsed = parseInstalled(row)
          return parsed === null ? row !== args.id.trim() : !matchesId(parsed.canonical, args.id)
        })
        if (remaining.length === current.repositories.length) {
          throw new Error(`plugin_uninstall: "${args.id}" is not an installed repository plugin`)
        }
        deps.writeRepositories(remaining)
        return { ok: true, message: `plugin_uninstall: removed "${args.id}" (repositories now ${remaining.length})` }
      },
    }),

    defineTool({
      name: 'plugin_status',
      description: 'Show installed DSH plugins. Without `id`, lists every installed repository plugin '
        + '(from $DSH_HOME/cordis.patch.yml repository-plugins.repositories). With `id`, shows that '
        + 'plugin plus its TOFU-resolved ref from lock.yml.',
      parameters: {
        id: { type: 'string', description: 'Plugin id or owner/repo to inspect.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            plugins: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  canonical: { type: 'string', required: true },
                  ref: { type: 'string' },
                  resolved: { type: 'string' },
                  path: { type: 'string' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const lines = value.plugins.map((p) => {
            const ref = p.ref !== undefined ? `#${p.ref}` : ''
            const resolved = p.resolved !== undefined ? ` (resolved ${p.resolved})` : ''
            return `- ${p.canonical}${ref}${resolved}`
          })
          return [{ type: 'text', text: lines.length > 0 ? lines.join('\n') : '(no installed repository plugins)' }]
        },
      },
      async execute(args) {
        const home = deps.dshHome()
        const locks = readLock(home)
        const rows = deps.readRepositories().repositories
        const view = rows
          .map((row) => parseInstalled(row))
          .filter((p): p is NonNullable<typeof p> => p !== null)
          .map((p) => {
            const lock = findLock(locks, p.canonical)
            return {
              canonical: p.canonical,
              ...(p.ref !== null ? { ref: p.ref } : {}),
              ...(lock !== undefined ? { resolved: lock.ref } : {}),
            }
          })
        if (args.id !== undefined && args.id !== '') {
          const hit = view.filter((p) => matchesId(p.canonical, args.id))
          if (hit.length === 0) throw new Error(`plugin_status: "${args.id}" is not installed`)
          return { plugins: hit }
        }
        return { plugins: view }
      },
    }),
  ]
}
