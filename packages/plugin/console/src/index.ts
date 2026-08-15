/**
 * 薄控制台 Node half（0811 适配）：读写 web profile 的安装态——
 * ① `dsh.profile.bundles`（bundle 插件，pnpm add/reconcile）；
 * ② profile `cordis.patch.yml` 的 insert 行（非 bundle 插件，配置 HMR
 * 实时挂载，无需重启）；③ 同文件的 disabled 标记（启停持久化）。
 * 经 webServer 提供 `/api/plugin-console` 路由供浏览器面板调用。
 *
 * 0 patch：完全官方机制——glue 插件经 bundle 挂载，安装态是官方
 * HMR-watched 的 profile 用户 patch 层 + 官方 bundle 层栈。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFile, spawnSync } from 'node:child_process'
import { join } from 'node:path'
import type { Context } from 'cordis'
import { createPluginTools } from './discovery/tools.ts'
import { npmViewLatest } from './versions.ts'

/** 解析 resolveDshHome（官方 dsh-paths）。 */
function resolveDshHome(): string {
  return process.env.DSH_HOME?.trim() !== '' && process.env.DSH_HOME !== undefined
    ? process.env.DSH_HOME
    : join(process.env.HOME ?? '/tmp', '.dsh')
}

/** 当前 profile（web 默认）目录。 */
function profileWebDir(): string {
  return join(resolveDshHome(), 'profiles', 'web')
}

/** 当前 profile 的 cordis.patch.yml（用户 patch 层，配置 HMR watched）。 */
function profilePatchPath(): string {
  return join(profileWebDir(), 'cordis.patch.yml')
}

/* ---------------- insert 行管理（非 bundle 插件安装态） ---------------- */

/** 一个 patch insert 行（bundle 之外的插件安装形态）。 */
interface InsertRow {
  id: string
  name: string
}

/**
 * 读 profile patch 的全部 insert 行：解析顶层 `- insert:` 块下的
 * `- id: <id>` / `name: <pkg>` 对（简化行级解析，与 0810 同策略）。
 */
function readInsertRows(): InsertRow[] {
  const file = profilePatchPath()
  let content: string
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const rows: InsertRow[] = []
  const lines = content.split('\n')
  let inInsert = false
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    const trimmed = line.trim()
    if (trimmed === 'insert:' || trimmed.startsWith('- insert:')) {
      inInsert = true
      continue
    }
    if (!inInsert) continue
    // 缩进回到顶层列表（`- id:` 开头的非 insert 行）即离开 insert 块。
    if (/^- id:/.test(trimmed) && !line.startsWith('    ')) {
      inInsert = false
      continue
    }
    const idMatch = /^(\s*)- id:\s*([^\s]+)/.exec(line)
    if (idMatch === null) continue
    let name: string | undefined
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j]!
      if (/^(\s*)- id:/.test(next) && !next.startsWith('    ')) break
      const nameMatch = /name:\s*(.+)/.exec(next.trim())
      if (nameMatch !== null) {
        name = nameMatch[1]!.trim().replace(/^['"]|['"]$/g, '')
        break
      }
    }
    rows.push({ id: idMatch[2]!, name: name ?? idMatch[2]! })
  }
  return rows
}

/**
 * 写一个 insert 行（新增或按 id 更新 name）。保留文件其余内容；
 * 文件为 `[]` 模板时重建为带 insert 块的列表。写后配置 HMR 实时挂载。
 */
function writeInsertRow(id: string, name: string): void {
  const file = profilePatchPath()
  let content: string
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    content = '[]\n'
  }
  const lines = content.split('\n')
  // 丢弃空数组文档行（`[]`）——追加 insert 块后不能残留（双文档 YAML 启动失败）。
  const significant = lines.filter(l => l.trim() !== '[]' && l.trim() !== '')
  const existing = readInsertRows()
  if (existing.some(r => r.id === id)) {
    // 更新已有行：定位并替换 name 值。
    let inInsert = false
    const out: string[] = []
    for (let i = 0; i < significant.length; i += 1) {
      const line = significant[i]!
      const trimmed = line.trim()
      if (trimmed === 'insert:' || trimmed.startsWith('- insert:')) { inInsert = true; out.push(line); continue }
      if (inInsert && /^- id:/.test(trimmed) && !line.startsWith('    ')) inInsert = false
      const idMatch = inInsert ? /^(\s*)- id:\s*([^\s]+)/.exec(line) : null
      if (idMatch !== null && idMatch[2] === id) {
        out.push(line)
        const indent = idMatch[1]!
        // 找该行子树内的 name 行，替换；没有则插入。
        let replaced = false
        for (let j = i + 1; j < significant.length; j += 1) {
          const next = significant[j]!
          if (/^(\s*)- id:/.test(next.trim()) && !next.startsWith('    ')) break
          if (/name:/.test(next.trim())) {
            out.push(`${indent}  name: '${name}'`)
            replaced = true
            // 跳过原 name 行（j 继续走，但 out 已按新内容推进——需要跳过）
            significant[j] = '' // mark consumed
            break
          }
        }
        if (!replaced) out.push(`${indent}  name: '${name}'`)
        continue
      }
      out.push(line)
    }
    writeFileSync(file, `${out.filter(l => l !== '').join('\n')}\n`)
    return
  }
  // 新增：append 一个 insert 块。name 必须加引号——YAML 中 `@` 开头是
  // 保留指示符，裸写会解析失败（HMR 不生效，已实证）。
  significant.push('', '- insert:')
  significant.push(`    - id: ${id}`)
  significant.push(`      name: '${name}'`)
  writeFileSync(file, `${significant.join('\n')}\n`)
  console.log(`[plugin-console] wrote insert row ${id} (${name}) to ${file}`)
}

/** 按 id 移除 insert 行；不存在返回 false。空掉的 insert 块一并删除。 */
function removeInsertRow(id: string): boolean {
  const file = profilePatchPath()
  let content: string
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    return false
  }
  const existing = readInsertRows()
  if (!existing.some(r => r.id === id)) return false
  const lines = content.split('\n')
  const out: string[] = []
  let removed = false
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    const trimmed = line.trim()
    // insert 块起始行：收集整块，移除目标行后若块内还有行则保留，否则整块丢弃。
    if (trimmed === 'insert:' || trimmed.startsWith('- insert:')) {
      const blockStart = i
      const block: string[] = []
      block.push(line)
      i += 1
      let blockHadTarget = false
      for (; i < lines.length; i += 1) {
        const next = lines[i]!
        if (/^(\s*)- id:/.test(next.trim()) && !next.startsWith('    ')) {
          // 顶层列表新行（非 insert 块子行）：块结束，回退让外层处理该行。
          i -= 1
          break
        }
        const idMatch = /^(\s*)- id:\s*([^\s]+)/.exec(next)
        if (idMatch !== null && idMatch[2] === id) {
          blockHadTarget = true
          removed = true
          // 跳过目标行及其子行（直到下一个 - id: 或块尾）。
          for (let j = i + 1; j < lines.length; j += 1) {
            const after = lines[j]!
            if (/^(\s*)- id:/.test(after.trim()) && !after.startsWith('    ')) break
            i = j
          }
          continue
        }
        block.push(next)
      }
      // 块内还有其余 `- id:` 行 → 保留；否则整块丢弃（空 insert 是脏 patch）。
      const hasRemainingRow = block.some(l => /^(\s*)- id:\s*/.test(l))
      if (hasRemainingRow) {
        out.push(...block)
      } else {
        void blockStart
      }
      continue
    }
    out.push(line)
  }
  // 移除后若无任何顶层 `- id:` / `- insert:` 行：恢复 `[]` 模板——纯注释
  // 文件解析为 null，HMR reload 失败（已实证 dispose 不触发）。
  const hasAnyRow = out.some(l => /^- id:/.test(l.trim()) || /^- insert:/.test(l.trim()) || /^insert:/.test(l.trim()))
  const text = hasAnyRow
    ? `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
    : '# Your patch layer for this dsh profile, applied after every bundle layer:\n# a top-level YAML array of loader patch entries (id-targeted config\n# overrides, disables, and insert lists; `!!js` expressions allowed).\n[]\n'
  writeFileSync(file, text)
  console.log(`[plugin-console] removed insert row ${id} from ${file}`)
  return removed
}

/* ---------------- disabled 标记管理（启停持久化） ---------------- */

/** 一个 Loader 树插件的启停状态（bundle/内置插件，官方 disabled 标记管理）。 */
interface UiPluginRow {
  /** 插件 id（bundle 挂载行的 id）。 */
  id: string
  /** 是否被禁用（disabled: true）。未声明 = 启用。 */
  disabled: boolean
}

/**
 * 读 Loader 树插件的 disabled 状态：解析 profile cordis.patch.yml 的所有
 * `- id: <name>` 顶层行及其 `disabled: true/false` 标记。
 */
function readUiPlugins(): UiPluginRow[] {
  const file = profilePatchPath()
  let content: string
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const rows: UiPluginRow[] = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    const match = /^- id:\s*([^\s]+)/.exec(line.trim())
    if (match === null) continue
    // 该行的后续缩进行：找 disabled 标记（在本条 id 行的子树内）
    let disabled = false
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j]!
      if (next.trimStart().startsWith('- id:')) break
      const dis = /disabled:\s*(true|false)/.exec(next.trim())
      if (dis !== null) disabled = dis[1] === 'true'
    }
    rows.push({ id: match[1]!, disabled })
  }
  return rows
}

/**
 * 设置一个 Loader 树插件的 disabled 状态。保留其他行，只改目标行的
 * disabled 字段（新增或移除 `  disabled: true/false`）。
 */
function writeUiPluginDisabled(id: string, disabled: boolean): void {
  const file = profilePatchPath()
  let content: string
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    content = ''
  }
  const lines = content.split('\n')
  // 丢弃空数组文档行（`[]`）与纯注释/空行，保证输出是单一 patch 列表文档。
  const significant = lines.filter(l => l.trim() !== '[]')
  let targetLine = -1
  let targetIndent = ''
  for (let i = 0; i < significant.length; i += 1) {
    const match = /^- id:\s*([^\s]+)/.exec(significant[i]!.trim())
    if (match !== null && match[1] === id) {
      targetLine = i
      targetIndent = /^(\s*)-/.exec(significant[i]!)?.[1] ?? ''
      break
    }
  }
  if (targetLine === -1) {
    // 目标行不存在：追加一个新的挂载行 + disabled 标记
    significant.push(`${targetIndent}- id: ${id}`)
    significant.push(`${targetIndent}  disabled: ${String(disabled)}`)
  } else {
    // 找到该行子树内的 disabled 行
    let disabledLine = -1
    for (let j = targetLine + 1; j < significant.length; j += 1) {
      const next = significant[j]!
      if (next.trimStart().startsWith('- id:')) break
      if (/disabled:\s*(true|false)/.test(next.trim())) {
        disabledLine = j
        break
      }
    }
    if (disabledLine === -1) {
      significant.splice(targetLine + 1, 0, `${targetIndent}  disabled: ${String(disabled)}`)
    } else {
      significant[disabledLine] = `${targetIndent}  disabled: ${String(disabled)}`
    }
  }
  writeFileSync(file, `${significant.join('\n').trimEnd()}\n`)
  console.log(`[plugin-console] set ${id} disabled=${String(disabled)} in ${file}`)
}

/* ---------------- bundle 管理（profile 层栈） ---------------- */

/** 读 profile 清单（package.json）。 */
function readProfileManifest(): { dependencies?: Record<string, string>; dsh?: { profile?: { bundles?: string[] } } } {
  try {
    return JSON.parse(readFileSync(join(profileWebDir(), 'package.json'), 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** 写回 profile 清单。 */
function writeProfileManifest(manifest: unknown): void {
  writeFileSync(join(profileWebDir(), 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`)
}

/**
 * 解析 pnpm add 后 profile 依赖里的真实包名：源串可能是指向路径/git 的
 * 安装源（`/path/to/pkg`、`github:o/r#ref`），而依赖 key 才是包名
 * （pnpm 按包的真实 name 写入 package.json）。先精确匹配，再回退到
 * 依赖值包含源串的 key。找不到返回 null。
 */
function resolveInstalledName(source: string): string | null {
  const manifest = readProfileManifest() as { dependencies?: Record<string, string> }
  const deps = manifest.dependencies ?? {}
  if (typeof deps[source] === 'string') return source
  const hit = Object.keys(deps).find(key => deps[key] === source || deps[key]?.includes(source))
  return hit ?? null
}

/** 已安装包是否声明 dsh.bundle（profile 层候选）。 */
function exportsBundlePatch(packageName: string): boolean {
  try {
    const manifest = JSON.parse(readFileSync(join(profileWebDir(), 'node_modules', packageName, 'package.json'), 'utf8')) as {
      dsh?: { bundle?: { patch?: unknown } }
    }
    return manifest.dsh?.bundle?.patch !== undefined
  } catch {
    return false
  }
}

/**
 * 复刻官方 dsh plugin 的 reconcile：按已安装状态把声明 dsh.bundle 的依赖
 * 加入 `dsh.profile.bundles` 层栈；已从依赖移除或失去声明的包离开层栈。
 * @returns 新增的层（调用方用于回显）。
 */
function reconcileBundles(added: string[], beforeManifest?: ReturnType<typeof readProfileManifest>): string[] {
  // beforeManifest = pnpm 命令执行前的清单（调用方在 pnpm 前捕获）：移除语义依赖
  // 「曾是依赖」判定——remove 后读取会因依赖已消失而漏删 bundles 层（已实证）。
  const before = beforeManifest ?? readProfileManifest() as {
    dependencies?: Record<string, string>
    dsh?: { profile?: { bundles?: string[] } }
  }
  const beforeDeps = new Set(Object.keys(before.dependencies ?? {}))
  const manifest = readProfileManifest() as {
    dependencies?: Record<string, string>
    dsh?: { profile?: { bundles?: string[] } }
  }
  const dependencies = Object.keys(manifest.dependencies ?? {})
  const dependencySet = new Set(dependencies)
  const bundles = manifest.dsh?.profile?.bundles ?? []
  const joined: string[] = []
  for (const packageName of dependencies) {
    if (exportsBundlePatch(packageName) && !bundles.includes(packageName)) {
      bundles.push(packageName)
      if (!added.includes(packageName)) added.push(packageName)
      joined.push(packageName)
    }
  }
  // 移除路径（对齐官方）：只有「曾是依赖或现在是依赖」的层才可能被移除；
  // 模板 bundle（dsh-base 等，非依赖）永不触碰——曾因漏掉该保护误删
  // 模板层导致 web 组合缺 webserver 行（已实证）。
  const removed: string[] = []
  for (const packageName of [...bundles]) {
    const wasDependency = beforeDeps.has(packageName) || dependencySet.has(packageName)
    const stillBundle = dependencySet.has(packageName) && exportsBundlePatch(packageName)
    if (wasDependency && !stillBundle) {
      bundles.splice(bundles.indexOf(packageName), 1)
      removed.push(packageName)
    }
  }
  if (joined.length === 0 && removed.length === 0) return []
  manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles } }
  writeProfileManifest(manifest)
  console.log(`[plugin-console] reconciled bundles: +${joined.join(', ') || 'none'} -${removed.join(', ') || 'none'}`)
  return joined
}

/**
 * bundle 安装/更新/移除：在 profile 目录跑 pnpm 子命令，然后 reconcile 层栈。
 * 与官方 `dsh plugin <sub>`（pnpm forwarder + reconcile）同机制。
 * @param args - pnpm 子命令参数（add <source> / update <name> / remove <name>）。
 * @returns {ok, names, output} 新增层名与 pnpm 输出（失败时 output 为错误信息）。
 */
function runPnpm(args: string[]): { ok: boolean; names: string[]; output: string } {
  const dir = profileWebDir()
  // pnpm 执行前捕获清单：reconcile 的「曾是依赖」判定需要移除前的状态。
  const before = readProfileManifest()
  const result = spawnSync('pnpm', args, { cwd: dir, encoding: 'utf8', timeout: 120_000 })
  const output = (result.stdout ?? '') + (result.stderr ?? '')
  if (result.status !== 0) {
    return { ok: false, names: [], output: output.slice(-1000) }
  }
  const names = reconcileBundles([], before)
  return { ok: true, names, output: output.slice(-500) }
}

/** 已安装包是否声明 dsh.bundle（tools 判别用；未装返回 false）。 */
function isBundlePackage(packageName: string): boolean {
  return exportsBundlePatch(packageName)
}

/* ---------------- loader 树投影 ---------------- */

interface LoadedEntryRow {
  /** 条目短 id（EntryOptions.id）——profile patch 的 `- id:` 匹配这个。 */
  id: string
  /** 包名（@dsh-external/* 等；@deepseek-ai/* = 官方内置）。 */
  name: string
  /** 当前是否被禁用（含父条目禁用继承）。 */
  disabled: boolean
  /** 已安装版本（读 profile node_modules 的 package.json）；未装/读不到为 undefined。 */
  version?: string
  /** 来源：loader 树条目（bundle/内置）。 */
  kind?: 'loader'
  /**
   * host 树停用但由 agent preset 挂载（0811 起模型面工具搬进 preset 通道）。
   * 面板据此显示「预设挂载」而非误导性的「已停用」。
   */
  presetMounted?: boolean
  /** 是否由 profile patch 的 insert 行挂载（非 bundle 插件安装态）。 */
  insertRow?: boolean
}

/** 读已安装包版本（profile node_modules/<name>/package.json）；未装返回 undefined。 */
function readInstalledVersion(name: string): string | undefined {
  try {
    const manifest = JSON.parse(readFileSync(join(profileWebDir(), 'node_modules', name, 'package.json'), 'utf8')) as {
      version?: string
    }
    return typeof manifest.version === 'string' ? manifest.version : undefined
  } catch {
    return undefined
  }
}

/** 解析一个 preset 组合文件的全部行 id（agent.cordis.yml 顶层行 + insert 子行）。 */
function presetRowIdsFromFile(file: string): Set<string> {
  const ids = new Set<string>()
  let content: string
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    return ids
  }
  for (const line of content.split('\n')) {
    const m = /- id:\s*([^\s]+)/.exec(line.trim())
    if (m !== null) ids.add(m[1]!)
  }
  return ids
}

/**
 * 全部 agent preset 组合的行 id 并集（0811 起模型面工具由 preset 挂载）。
 * 经 `ctx.agentPresets.list()`（官方服务）拿 preset 目录，再读组合文件。
 * 服务不可用/读取失败 → 空集（面板退化为无「预设挂载」标注）。
 */
async function collectPresetRowIds(ctx: ConsoleCtx): Promise<Set<string>> {
  const presets = (ctx as unknown as { agentPresets?: { list?(): Promise<Array<{ path?: string }>> } }).agentPresets
  const ids = new Set<string>()
  if (presets?.list === undefined) return ids
  try {
    const list = await presets.list()
    for (const preset of list) {
      if (typeof preset.path !== 'string') continue
      for (const id of presetRowIdsFromFile(preset.path)) ids.add(id)
    }
  } catch {
    // 预设读取失败不阻塞面板。
  }
  return ids
}

/** 遍历 loader 树收集全部条目（含嵌套子树），id 取短 id（options.id）。 */
async function collectLoaderEntries(ctx: ConsoleCtx): Promise<LoadedEntryRow[]> {
  const loader = (ctx as unknown as { loader?: { entries?(): Generator<unknown> } }).loader
  if (loader?.entries === undefined) return []
  // 0810 的 loader 树存在同 id 双条目（一条禁用一条启用）——按 id 去重，
  // 优先保留启用条目，避免 React key 冲突。
  const byId = new Map<string, LoadedEntryRow>()
  const insertRows = new Set(readInsertRows().map(r => r.id))
  const presetIds = await collectPresetRowIds(ctx)
  for (const raw of loader.entries()) {
    const entry = raw as { id?: string; options?: { id?: string; name?: string }; disabled?: boolean }
    const id = entry.options?.id ?? entry.id
    if (typeof id !== 'string' || id.length === 0) continue
    const name = entry.options?.name ?? id
    const row: LoadedEntryRow = {
      id,
      name,
      disabled: entry.disabled === true,
      version: readInstalledVersion(name),
      kind: 'loader',
      insertRow: insertRows.has(id),
    }
    const prev = byId.get(id)
    if (prev === undefined || (prev.disabled === true && row.disabled === false)) {
      byId.set(id, row)
    }
  }
  // 停用的行：标注是否由 preset 挂载（区分「预设挂载」与真「已停用」）。
  for (const row of byId.values()) {
    if (row.disabled && presetIds.has(row.id)) row.presetMounted = true
  }
  return [...byId.values()]
}

/* ---------------- 版本检查 ---------------- */

/** 版本检查缓存：name -> { latest, error, checkedAt }（进程内存）。 */
const versionCache = new Map<string, { latest: string | null; error: string | null; checkedAt: number }>()
const VERSION_REFRESH_MIN_MS = 30 * 1000
let lastVersionRefreshAt = 0

/** 批量强制刷新版本缓存（可选 force）：registry 查询走原生 fetch，
 *  不 spawn 子进程（受限宿主环境管道捕获会被拦）；404 = 非 registry 包。 */
async function refreshVersions(ctx: ConsoleCtx, force: boolean): Promise<boolean> {
  const now = Date.now()
  if (!force && now - lastVersionRefreshAt < VERSION_REFRESH_MIN_MS) return false
  lastVersionRefreshAt = now
  const names = await userPluginNames(ctx)
  await Promise.all(names.map(async (name) => {
    const result = await npmViewLatest(name)
    if (result.error !== null) {
      ctx.logger.warn(`[plugin-console] version check failed for ${name}: ${result.error}`)
    }
    versionCache.set(name, { latest: result.latest, error: result.error, checkedAt: Date.now() })
  }))
  return true
}

/** 版本行（缓存内容；error 区分「本地包」与「检查失败」）。 */
function versionRows(names: string[]): Array<{ name: string; latest: string | null; checked: boolean; error: string | null }> {
  return names.map(name => {
    const cached = versionCache.get(name)
    return { name, latest: cached?.latest ?? null, checked: cached !== undefined, error: cached?.error ?? null }
  })
}

/** 用户插件名列表（排除官方命名空间）。 */
async function userPluginNames(ctx: ConsoleCtx): Promise<string[]> {
  const entries = await collectLoaderEntries(ctx)
  return [...new Set(entries.map(row => row.name)
    .filter(name => !name.startsWith('@deepseek-ai/') && !name.startsWith('@cordisjs/') && !name.startsWith('cordis:')))]
}

/* ---------------- 路由与装配 ---------------- */

interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: unknown, res: { statusCode: number; setHeader(k: string, v: string): void; end(body: string): void }) => void | Promise<void>
  }): () => void
}

/** Cordis 插件名。 */
export const name = 'plugin-console'

/** 需要宿主 web server（web 组合）+ loader（读/改 loader 树条目）+ tools（注册 plugin_* 管理工具）+ agentPresets（预设挂载标注）。 */
export const inject = ['webServer', 'loader', 'tools', 'agentPresets']

interface ConsoleCtx extends Context {
  webServer?: WebServerLike
  /** 官方工具注册服务（工具面；web 组合提供）。 */
  tools?: { register(definition: unknown): () => void }
}

/** 注册控制台路由：GET 读列表，POST 写列表。 */
export function apply(ctx: ConsoleCtx): void {
  ctx.effect(() => {
    // AI-native 插件管理工具（plugin_*）：agent 面 = 面板写同一安装态。
    const pluginTools = createPluginTools({
      dshHome: () => resolveDshHome(),
      isBundlePackage,
      readInsertRows,
      writeInsertRow,
      removeInsertRow,
      bundleInstall: (source) => {
        const result = runPnpm(['add', source])
        return result.ok ? { names: result.names, output: result.output } : null
      },
      bundleRemove: (name) => {
        const result = runPnpm(['remove', name])
        return result.ok ? { names: result.names, output: result.output } : null
      },
    })
    const disposeTools = (ctx.tools?.register !== undefined)
      ? pluginTools.map((tool) => ctx.tools!.register(tool))
      : []
    if (disposeTools.length > 0) {
      console.log(`[plugin-console] registered plugin tools: ${pluginTools.map((t) => (t as { name?: string }).name).join(', ')}`)
    }
    const webServer = ctx.webServer
    if (webServer === undefined) {
      return () => { for (const dispose of disposeTools) dispose() }
    }
    // 启动延迟预扫描：web 起来 30 秒后批量查一次 registry 版本，填充缓存
    // （此后面板 GET /versions 零网络，直到用户手动刷新）。
    const prescanTimer = setTimeout(() => {
      void refreshVersions(ctx, false).catch(error => {
        console.log(`[plugin-console] version prescan failed: ${error instanceof Error ? error.message : String(error)}`)
      })
    }, 30_000)
    const disposeRoutes = webServer.register({
      kind: 'prefix',
      path: '/api/plugin-console',
      handler: async (req, res) => {
        const json = (status: number, body: unknown): void => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        const url = (req as { url?: string })?.url ?? '/'
        const method = (req as { method?: string })?.method ?? 'GET'
        const path = url.split('?')[0] ?? '/'
        try {
          // insert 行（非 bundle 插件安装态）列表
          if (method === 'GET' && (path === '/api/plugin-console/inserts' || path === '/api/plugin-console/inserts/')) {
            json(200, { ok: true, inserts: readInsertRows() })
            return
          }
          // insert 行：写（新增/更新）与删（POST /inserts/<id>，body {name?} 或 {remove: true}）
          const insertMatch = /^\/api\/plugin-console\/inserts\/([^/]+)$/.exec(path)
          if (method === 'POST' && insertMatch !== null) {
            const id = decodeURIComponent(insertMatch[1]!)
            let body = ''
            ;(req as { on?: (e: string, cb: (c: Buffer) => void) => void })?.on?.('data', (c: Buffer) => { body += c.toString('utf8') })
            ;(req as { on?: (e: string, cb: () => void) => void })?.on?.('end', () => {
              void (async () => {
                try {
                  const parsed = JSON.parse(body) as { name?: string; remove?: boolean }
                  if (parsed.remove === true) {
                    const removed = removeInsertRow(id)
                    json(removed ? 200 : 404, { ok: removed })
                    return
                  }
                  const name = (parsed.name ?? '').trim()
                  if (name.length === 0) {
                    json(400, { ok: false, message: 'insert row needs a name' })
                    return
                  }
                  writeInsertRow(id, name)
                  json(200, { ok: true, id, name, live: true })
                } catch (error) {
                  json(500, { ok: false, message: error instanceof Error ? error.message : String(error) })
                }
              })()
            })
            return
          }
          // 已加载插件：读 loader 树（实时，含运行时启停后的状态 +
          // preset 挂载标注，区分「预设挂载」与真「已停用」）
          if (method === 'GET' && (path === '/api/plugin-console/installed' || path === '/api/plugin-console/installed/')) {
            json(200, { ok: true, plugins: await collectLoaderEntries(ctx) })
            return
          }
          // bundle 版本：只读缓存（零网络——registry 查询由启动延迟预扫描 +
          // 手动刷新触发，避免面板每次打开打 registry）
          if (method === 'GET' && (path === '/api/plugin-console/versions' || path === '/api/plugin-console/versions/')) {
            json(200, { ok: true, versions: versionRows(await userPluginNames(ctx)) })
            return
          }
          // 手动检查最新版本（POST /versions/refresh，30s 最小间隔防抖）
          if (method === 'POST' && (path === '/api/plugin-console/versions/refresh' || path === '/api/plugin-console/versions/refresh/')) {
            const did = await refreshVersions(ctx, false)
            json(200, { ok: true, refreshed: did, versions: versionRows(await userPluginNames(ctx)) })
            return
          }
          // 统一安装入口（POST /install，body {source}）：pnpm add →
          // 判 dsh.bundle → bundle 进层栈（重启生效）/ 非 bundle 写 insert 行（实时挂载）
          if (method === 'POST' && (path === '/api/plugin-console/install' || path === '/api/plugin-console/install/')) {
            let body = ''
            ;(req as { on?: (e: string, cb: (c: Buffer) => void) => void })?.on?.('data', (c: Buffer) => { body += c.toString('utf8') })
            ;(req as { on?: (e: string, cb: () => void) => void })?.on?.('end', () => {
              void (async () => {
                try {
                  const parsed = JSON.parse(body) as { source?: string }
                  const source = (parsed.source ?? '').trim()
                  if (source.length === 0) {
                    json(400, { ok: false, message: 'install needs a source' })
                    return
                  }
                  const result = runPnpm(['add', source])
                  if (!result.ok) {
                    json(502, { ok: false, message: `pnpm add failed: ${result.output}` })
                    return
                  }
                  // 路径/git 源装完实际包名 ≠ 源串：从 profile 依赖解析真实包名
                  // （pnpm 已把依赖写进 package.json，key 即包名）。
                  const installedName = resolveInstalledName(source)
                  if (installedName === null) {
                    json(502, { ok: false, message: `pnpm add succeeded but ${source} is not in the profile dependencies` })
                    return
                  }
                  if (isBundlePackage(installedName)) {
                    json(200, { ok: true, kind: 'bundle', name: installedName, needsRestart: true, message: `bundle ${installedName} 已加入层栈——重启 web 生效` })
                    return
                  }
                  const id = installedName.replace(/^@/, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase()
                  writeInsertRow(id, installedName)
                  json(200, { ok: true, kind: 'plugin', name: installedName, id, needsRestart: false, message: `插件 ${installedName} 已挂载（insert 行 ${id}，配置 HMR 实时生效）` })
                } catch (error) {
                  json(500, { ok: false, message: error instanceof Error ? error.message : String(error) })
                }
              })()
            })
            return
          }
          // 已加载插件：运行时启停 + 写 profile patch 持久化
          // （POST /installed/<id>，body {disabled: bool}）
          const installedMatch = /^\/api\/plugin-console\/installed\/([^/]+)$/.exec(path)
          if (method === 'POST' && installedMatch !== null) {
            const id = decodeURIComponent(installedMatch[1]!)
            let body = ''
            ;(req as { on?: (e: string, cb: (c: Buffer) => void) => void })?.on?.('data', (c: Buffer) => { body += c.toString('utf8') })
            ;(req as { on?: (e: string, cb: () => void) => void })?.on?.('end', () => {
              void (async () => {
                try {
                  const parsed = JSON.parse(body) as { disabled?: boolean }
                  const disabled = parsed.disabled === true
                  // 管理工具自身不可停用：禁用会卸载本面板（管理入口消失）。
                  if (id === '@dsh-external/plugin-console') {
                    json(409, { ok: false, message: '管理工具自身不可停用' })
                    return
                  }
                  const loader = (ctx as unknown as { loader?: { entries?(): Generator<unknown> } }).loader
                  let target: { update?(options: { disabled: boolean }): Promise<unknown> } | undefined
                  if (loader?.entries !== undefined) {
                    for (const raw of loader.entries()) {
                      const candidate = raw as { options?: { id?: string }; id?: string }
                      if ((candidate.options?.id ?? candidate.id) === id) {
                        target = raw as { update?(options: { disabled: boolean }): Promise<unknown> }
                        break
                      }
                    }
                  }
                  if (target?.update === undefined) {
                    json(404, { ok: false, message: `loader entry not found: ${id}` })
                    return
                  }
                  // 运行时生效：entry.update({disabled}) 会 dispose/恢复插件 fiber。
                  await target.update({ disabled })
                  // 持久化：写 profile patch（重启后仍保持）。
                  writeUiPluginDisabled(id, disabled)
                  json(200, { ok: true, id, disabled, runtime: true, persisted: true })
                } catch (error) {
                  json(500, { ok: false, message: error instanceof Error ? error.message : String(error) })
                }
              })()
            })
            return
          }
          // bundle 插件安装/更新/卸载（POST /bundles，body {action: 'install'|'update'|'remove', source?|name?}）
          if (method === 'POST' && (path === '/api/plugin-console/bundles' || path === '/api/plugin-console/bundles/')) {
            let body = ''
            ;(req as { on?: (e: string, cb: (c: Buffer) => void) => void })?.on?.('data', (c: Buffer) => { body += c.toString('utf8') })
            ;(req as { on?: (e: string, cb: () => void) => void })?.on?.('end', () => {
              void (async () => {
                try {
                  const parsed = JSON.parse(body) as { action?: string; source?: string; name?: string }
                  if (parsed.action === 'install') {
                    const source = (parsed.source ?? '').trim()
                    if (source.length === 0) {
                      json(400, { ok: false, message: 'install needs a source' })
                      return
                    }
                    const result = runPnpm(['add', source])
                    if (!result.ok) {
                      json(502, { ok: false, message: `pnpm add failed: ${result.output}` })
                      return
                    }
                    json(200, { ok: true, action: 'install', names: result.names, needsRestart: true })
                    return
                  }
                  if (parsed.action === 'update') {
                    const name = (parsed.name ?? '').trim()
                    if (name.length === 0) {
                      json(400, { ok: false, message: 'update needs a package name' })
                      return
                    }
                    const result = runPnpm(['update', name])
                    if (!result.ok) {
                      json(502, { ok: false, message: `pnpm update failed: ${result.output}` })
                      return
                    }
                    json(200, { ok: true, action: 'update', name, names: result.names, needsRestart: true })
                    return
                  }
                  if (parsed.action === 'remove') {
                    const name = (parsed.name ?? '').trim()
                    if (name.length === 0) {
                      json(400, { ok: false, message: 'remove needs a package name' })
                      return
                    }
                    // 管理工具自身不可卸载（同 disable 自毁防护）。
                    if (name === '@dsh-external/plugin-console') {
                      json(409, { ok: false, message: '管理工具自身不可卸载' })
                      return
                    }
                    const result = runPnpm(['remove', name])
                    if (!result.ok) {
                      json(502, { ok: false, message: `pnpm remove failed: ${result.output}` })
                      return
                    }
                    json(200, { ok: true, action: 'remove', name, needsRestart: true })
                    return
                  }
                  json(400, { ok: false, message: 'action must be install, update, or remove' })
                } catch (error) {
                  json(500, { ok: false, message: error instanceof Error ? error.message : String(error) })
                }
              })()
            })
            return
          }
          json(404, { ok: false, message: 'not found' })
        } catch (error) {
          json(500, { ok: false, message: error instanceof Error ? error.message : String(error) })
        }
      },
    })
    return () => {
      clearTimeout(prescanTimer)
      for (const dispose of disposeTools) dispose()
      disposeRoutes()
    }
  }, 'plugin-console: config read/write route + plugin tools')
}
