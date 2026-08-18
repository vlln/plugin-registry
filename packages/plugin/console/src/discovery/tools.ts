/**
 * 插件管理工具（plugin_* ×4）：agent 的插件发现与安装面（0811 适配）。
 * 0811 移除 repository-plugins 机制后，外部插件只有 profile bundle 一条
 * 官方路径，安装态 = profile 的 `dsh.profile.bundles`（bundle 插件，
 * pnpm add + reconcile）＋ profile `cordis.patch.yml` 的 insert 行
 * （非 bundle 插件，配置 HMR 实时挂载，无需重启）。
 *
 * - plugin_search：搜源集合（默认 hub catalog 索引；给定新源 → 懒加载
 *   探测并入 sources.yml）
 * - plugin_install：bundle 源 → pnpm add + reconcile bundles 层；
 *   非 bundle（npm 包）→ pnpm add + 写 profile patch insert 行（配置
 *   HMR 实时挂载）；TOFU 固化 resolved ref 到 lock.yml
 * - plugin_uninstall：删安装态行（bundle 移除依赖 + 层栈；insert 行移除）
 * - plugin_status：无参 list 安装态；有参单查（含 lock 固化 ref）
 *
 * first-index：安装源即身份，不跨源合并候选池。依赖注入（deps），
 * 避免与 index.ts 循环依赖。
 */
import { existsSync } from 'node:fs'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { EnumerateSnapshot, PluginEntry, PluginSource } from './types.ts'
import { enumerateSource } from './enumerate.ts'
import { findLock, findSource, readLock, readSources, upsertLock, upsertSource, writeLock, writeSources } from './store.ts'
import { normalizeSource, resolveInstalledName } from '../source.ts'

/** tools 依赖（由 console apply 注入：安装态读写 + bundle 安装）。 */
export interface PluginToolDeps {
  dshHome(): string
  /** 安装后的包是否声明 dsh.bundle（bundle 插件判别）。 */
  isBundlePackage?(name: string): boolean
  /** bundle 安装（pnpm add + reconcile）；无实现时返回 null。 */
  bundleInstall?(source: string): { names: string[]; output: string } | null
  /** bundle 卸载（pnpm remove + reconcile）；无实现时返回 null。 */
  bundleRemove?(name: string): { names: string[]; output: string } | null
  /** 读 profile patch 的全部 insert 行（非 bundle 插件安装态）。 */
  readInsertRows(): { id: string; name: string }[]
  /** 读 profile 清单（package.json）：dependencies（解析真实包名）+ dsh.profile.bundles 层栈（bundle 插件安装态）。 */
  readProfileManifest(): { dependencies?: Record<string, string>; dsh?: { profile?: { bundles?: string[] } } }
  /** 写一个 insert 行（新增或按 id 更新 name）；触发配置 HMR 实时挂载。 */
  writeInsertRow(id: string, name: string): void
  /** 按 id 移除 insert 行；不存在返回 false。 */
  removeInsertRow(id: string): boolean
}

/** 统一插件条目输出（JSON Schema）。 */
const PLUGIN_ITEM = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    kind: { type: 'string', required: true, enum: ['bundle', 'plugin'] },
    source: { type: 'string', required: true },
    faces: { type: 'array', items: { type: 'string' }, required: true },
    description: { type: 'string' },
    sourceId: { type: 'string', required: true },
    trust: { type: 'string', enum: ['official', 'community', 'untrusted'] },
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

/** id 匹配：支持完整 canonical 或短仓库名。 */
function matchesId(canonical: string, id: string): boolean {
  const key = id.trim().toLowerCase()
  return canonical === key || canonical.endsWith(`/${key}`) || canonical.split('/').pop() === key
}

/** 从 search 的 source 参数推断源类型（新源懒加载）。 */
function inferSource(arg: string): PluginSource {
  const id = `custom-${Date.now()}`
  if (/^file:\/\//.test(arg) || /^https?:\/\//i.test(arg) || existsSync(arg)) {
    return { id, kind: 'index', locator: arg, trust: 'community' }
  }
  // npm bundle 包名 / github 仓库名：无发现元数据，直接安装；枚举返回空。
  return { id, kind: 'index', locator: '', trust: 'community' }
}

export function createPluginTools(deps: PluginToolDeps): ToolDefinition[] {
  return [
    defineTool({
      name: 'plugin_search',
      description: 'Search installable DSH plugins. Without `source`, searches every registered source '
        + '(sources at $DSH_HOME/plugin-sources/sources.yml, enumeration cached; the default source is the '
        + 'configured hub index). With `source`, probes that source — an index JSON file/URL '
        + '(plugin index format: {"plugins": [...]}, schema plugin-sources/index/v1) is probed lazily and '
        + 'remembered for later searches. Each result\'s `source` is an install spec (npm package name) '
        + 'you can pass straight to plugin_install. Results carry the owning source and trust level.',
      parameters: {
        query: { type: 'string', description: 'Substring to match against plugin id or description. Empty returns all.' },
        source: { type: 'string', description: 'A registered source id, or a new source (an index JSON file/URL) to probe and remember.' },
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
        if (args.source !== undefined && args.source !== '') {
          const matched = findSource(sources, args.source)
          const target = matched ?? inferSource(args.source)
          if (target.locator === '') {
            // 裸包名/仓库名：无枚举协议，仅记住源（直接 install 即可）。
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
      description: 'Install a DSH plugin. 0811 removed repository plugins; the only official path is the '
        + 'web profile. A bundle plugin (npm package whose manifest declares dsh.bundle) is added via pnpm '
        + 'to the profile and joins dsh.profile.bundles (takes effect on web restart). A non-bundle plugin '
        + '(plain npm package with a cordis apply) is added via pnpm AND written as an insert row into the '
        + 'profile cordis.patch.yml, which the config HMR applies live — no restart needed. The resolved '
        + 'ref is recorded (TOFU) in $DSH_HOME/plugin-sources/lock.yml.',
      parameters: {
        source: { type: 'string', required: true, description: 'Install source: an npm package name (bundle or plain plugin), or a GitHub project — https://github.com/o/r, github.com/o/r or github:o/r (optional #ref or /tree/<branch>); URLs are normalized to github:o/r.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', required: true },
            canonical: { type: 'string', required: true },
            kind: { type: 'string', required: true, enum: ['bundle', 'plugin'] },
            needsRestart: { type: 'boolean', required: true },
            message: { type: 'string', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: value.message }],
      },
      async execute(args) {
        const home = deps.dshHome()
        // 入口统一规范化：完整 GitHub URL（https://github.com/o/r）→ github:o/r，
        // 与 pnpm 装完的依赖值同形态，后续匹配/登记用同一形态（#19）。
        const source = normalizeSource(args.source)
        if (source === '') throw new Error('plugin_install: source must be a non-empty package name')
        if (deps.bundleInstall === undefined) {
          throw new Error(`plugin_install: bundle install support unavailable (web profile required)`)
        }
        // pnpm add 装包（无论形态）。失败必须显式抛错——不能继续写安装态（#4 假成功）。
        const result = deps.bundleInstall(source)
        if (result === null) {
          throw new Error(`plugin_install: pnpm add failed for "${source}" — nothing was installed, no install state written`)
        }
        // pnpm add 后从 profile 依赖解析真实包名（git/路径源装完包名 ≠ 源串）；
        // 依赖里找不到对应包视为安装未落盘，显式报错而非继续（#19 语义）。
        const installedName = resolveInstalledName(deps.readProfileManifest(), source)
        if (installedName === null) {
          throw new Error(`plugin_install: pnpm add succeeded but ${source} is not in the profile dependencies`)
        }
        // 按真实包名的 dsh.bundle 声明判别安装态落点。
        const isBundle = deps.isBundlePackage?.(installedName) === true
        if (isBundle) {
          writeLock(home, upsertLock(readLock(home), {
            canonical: installedName,
            kind: 'bundle',
            ref: source,
            recordedAt: new Date().toISOString(),
          }))
          return {
            ok: true,
            canonical: installedName,
            kind: 'bundle',
            needsRestart: true,
            message: `plugin_install: bundle ${installedName} added to the profile layer stack — restart the web app to load it.`,
          }
        }
        // 非 bundle：pnpm add 已装包；写 insert 行 → 配置 HMR 实时挂载。
        const rowId = installedName.replace(/^@/, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase()
        deps.writeInsertRow(rowId, installedName)
        writeLock(home, upsertLock(readLock(home), {
          canonical: installedName,
          kind: 'plugin',
          ref: source,
          recordedAt: new Date().toISOString(),
        }))
        return {
          ok: true,
          canonical: installedName,
          kind: 'plugin',
          needsRestart: false,
          message: `plugin_install: plugin ${installedName} installed and mounted live (insert row ${rowId}) — config HMR applied it without a restart.`,
        }
      },
    }),

    defineTool({
      name: 'plugin_uninstall',
      description: 'Remove an installed DSH plugin. A bundle plugin is removed from the profile dependencies '
        + '(pnpm remove + layer-stack reconcile; takes effect on web restart). A non-bundle plugin is removed '
        + 'by deleting its insert row from the profile cordis.patch.yml (config HMR applies live). The source '
        + 'stays in plugin-sources (it can be reinstalled).',
      parameters: {
        id: { type: 'string', required: true, description: 'Plugin id (npm package name or insert-row id) to remove.' },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true }, message: { type: 'string', required: true } } },
        render: (_args, value) => [{ type: 'text', text: value.message }],
      },
      async execute(args) {
        const id = args.id.trim()
        // 先试 insert 行（非 bundle 形态）。
        if (deps.removeInsertRow(id)) {
          return { ok: true, message: `plugin_uninstall: removed plugin insert row "${id}" (live via config HMR)` }
        }
        // 再试 bundle 形态。
        if (deps.bundleRemove !== undefined) {
          const result = deps.bundleRemove(id)
          if (result !== null) {
            return { ok: true, message: `plugin_uninstall: removed bundle "${id}" (${result.names.join(', ') || 'dependencies removed'}) — restart the web app to fully unload it.` }
          }
        }
        throw new Error(`plugin_uninstall: "${id}" is not an installed plugin (no insert row, no bundle dependency)`)
      },
    }),

    defineTool({
      name: 'plugin_status',
      description: 'Show installed DSH plugins. Lists every installed plugin: insert rows (from the profile '
        + 'cordis.patch.yml, live-mounted non-bundle plugins) plus profile bundle layers (from the web '
        + 'profile manifest dsh.profile.bundles), each with its TOFU-resolved ref from lock.yml.',
      parameters: {
        id: { type: 'string', description: 'Plugin id or package name to inspect.' },
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
                  kind: { type: 'string', required: true, enum: ['bundle', 'plugin'] },
                  ref: { type: 'string' },
                  resolved: { type: 'string' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const lines = value.plugins.map((p) => {
            const ref = p.ref !== undefined ? `#${p.ref}` : ''
            const resolved = p.resolved !== undefined ? ` (resolved ${p.resolved})` : ''
            return `- ${p.canonical} (${p.kind})${ref}${resolved}`
          })
          return [{ type: 'text', text: lines.length > 0 ? lines.join('\n') : '(no installed plugins)' }]
        },
      },
      async execute(args) {
        const home = deps.dshHome()
        const locks = readLock(home)
        const rows: Array<{ canonical: string; kind: 'bundle' | 'plugin'; ref?: string; resolved?: string }> = []
        for (const row of deps.readInsertRows()) {
          const lock = findLock(locks, row.name)
          rows.push({
            canonical: row.name,
            kind: 'plugin',
            ...(lock !== undefined ? { resolved: lock.ref } : {}),
          })
        }
        const manifest = deps.readProfileManifest()
        const bundles = manifest.dsh?.profile?.bundles ?? []
        for (const name of bundles) {
          const lock = findLock(locks, name)
          rows.push({
            canonical: name,
            kind: 'bundle',
            ...(lock !== undefined ? { resolved: lock.ref } : {}),
          })
        }
        if (args.id !== undefined && args.id !== '') {
          const hit = rows.filter((p) => matchesId(p.canonical, args.id))
          if (hit.length === 0) throw new Error(`plugin_status: "${args.id}" is not installed`)
          return { plugins: hit }
        }
        return { plugins: rows }
      },
    }),
  ]
}
