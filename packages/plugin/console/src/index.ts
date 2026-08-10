/**
 * 薄控制台 Node half：读写 `$DSH_HOME/cordis.patch.yml` 的
 * `repository-plugins` 行（官方仓库插件的用户配置层，homePatchPath）。
 * 经 httpServer 提供 `/api/plugin-console` 路由供浏览器面板调用。
 *
 * 0 patch：完全官方机制——glue 插件经 bundle 挂载，config 是官方
 * HMR-watched 的 home 级用户 patch 层。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFile, spawnSync } from 'node:child_process'
import { join } from 'node:path'
import type { Context } from 'cordis'

/** 解析 resolveDshHome（官方 dsh-paths）。 */
function resolveDshHome(): string {
  return process.env.DSH_HOME?.trim() !== '' && process.env.DSH_HOME !== undefined
    ? process.env.DSH_HOME
    : join(process.env.HOME ?? '/tmp', '.dsh')
}

/** home 级用户 patch 文件（官方 homePatchPath）。 */
function homePatchPath(): string {
  return join(resolveDshHome(), 'cordis.patch.yml')
}

/**
 * UI 插件（bundle 插件）的用户覆盖文件：当前 profile 的 cordis.patch.yml。
 * bundle 层的挂载行在此被用户的 `disabled: true/false` 覆盖（官方 patch
 * 语义：按 id 覆盖同名行）。当前 profile = 启动时的 profile（web 默认）。
 */
function profilePatchPath(): string {
  return join(resolveDshHome(), 'profiles', 'web', 'cordis.patch.yml')
}

interface RepositoryRow {
  /** 当前 repositories 列表。 */
  repositories: string[]
  /** repository-plugins 行是否存在。 */
  present: boolean
}

/** 读当前 repositories 列表（解析 home cordis.patch.yml 的 repository-plugins 行）。 */
function readRepositories(): RepositoryRow {
  const file = homePatchPath()
  let content: string
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    return { repositories: [], present: false }
  }
  // 简化解析：找 `- id: repository-plugins` 行后的 `repositories:` 列表。
  // （正式版用 YAML 解析器；原型用行级匹配足够验证机制。）
  const lines = content.split('\n')
  const repos: string[] = []
  let inRepoBlock = false
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    if (line.includes('id: repository-plugins')) {
      inRepoBlock = true
      continue
    }
    if (inRepoBlock) {
      if (line.trim().startsWith('repositories:')) {
        // 收集后面的 - xxx 列表项
        for (let j = i + 1; j < lines.length; j += 1) {
          const item = lines[j]!
          if (item.trimStart().startsWith('- ')) {
            repos.push(item.trim().slice(2).trim())
          } else if (!item.trimStart().startsWith('#')) {
            break
          }
        }
        break
      }
      if (line.trim().startsWith('- id:')) break
    }
  }
  return { repositories: repos, present: inRepoBlock }
}

/** 写 repositories 列表（重建 home cordis.patch.yml 的 repository-plugins 行）。 */
function writeRepositories(repositories: string[]): void {
  const file = homePatchPath()
  const block = [
    '# Home-level patch layer (HMR-watched). 薄控制台写入目标。',
    '- id: repository-plugins',
    '  config:',
    '    repositories:',
    ...repositories.map(r => `      - ${r}`),
    '',
  ].join('\n')
  writeFileSync(file, block)
  console.log(`[plugin-console] wrote ${repositories.length} repositories to ${file}`)
}

/** 一个 Loader 树插件的启停状态（bundle 插件，官方 disabled 标记管理）。 */
interface UiPluginRow {
  /** 插件 id（bundle 挂载行的 id）。 */
  id: string
  /** 是否被禁用（disabled: true）。未声明 = 启用。 */
  disabled: boolean
}

/**
 * 读 Loader 树插件的 disabled 状态：解析 home cordis.patch.yml 的所有
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
  // 丢弃空数组文档行（`[]`）与纯注释/空行，保证输出是单一 patch 列表文档
  // （`[]` + 追加列表会拼成双文档 YAML，启动解析失败——已实证）。
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
      // 无 disabled 行：在 id 行后插入
      significant.splice(targetLine + 1, 0, `${targetIndent}  disabled: ${String(disabled)}`)
    } else {
      significant[disabledLine] = `${targetIndent}  disabled: ${String(disabled)}`
    }
  }
  writeFileSync(file, significant.join('\n'))
  console.log(`[plugin-console] set ${id} disabled=${String(disabled)} in ${file}`)
}

/** 解析 `github:owner/repo#ref&path:...` 源为 {owner, repo, ref, tail}。 */
function parseSource(source: string): { owner: string; repo: string; ref: string; tail: string } | null {
  const match = /^github:([^/\s#&]+)\/([^/\s#&]+)#([^\s#&]+)/.exec(source)
  if (match === null) return null
  return { owner: match[1]!, repo: match[2]!, ref: match[3]!, tail: source.slice(match[0].length) }
}

/** 40-hex commit（固定引用可对比）；分支/标签名则只能报告远端最新。 */
function isCommitSha(value: string): boolean {
  return /^[0-9a-f]{40}$/.test(value)
}

/** git ls-remote 结果：missing=true 表示远端无此 ref（未推送/已删除），sha=null 且 missing=false 表示网络/认证失败。 */
interface GitRemoteResult {
  sha: string | null
  missing: boolean
}

/** git ls-remote 取远端 ref 指向的 commit；区分网络失败与远端无此 ref。 */
function gitRemoteCommit(owner: string, repo: string, ref: string): Promise<GitRemoteResult> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['ls-remote', `https://github.com/${owner}/${repo}.git`, ref],
      { timeout: 15_000 },
      (error, stdout) => {
        if (error) {
          resolve({ sha: null, missing: false })
          return
        }
        const sha = stdout.split('\n')[0]?.split('\t')[0] ?? ''
        resolve(isCommitSha(sha) ? { sha, missing: false } : { sha: null, missing: true })
      },
    )
  })
}

/** 一个 repository 源的更新检查结果。 */
interface UpdateCheckRow {
  source: string
  ref: string
  refKind: 'sha' | 'branch'
  latestSha: string | null
  hasUpdate: boolean
  error?: string
}

/** 当前 profile 目录（bundle 安装/更新的 pnpm 工作目录）。 */
function profileWebDir(): string {
  return join(resolveDshHome(), 'profiles', 'web')
}

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
function reconcileBundles(added: string[]): string[] {
  const before = readProfileManifest() as {
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
 * bundle 安装/更新：在 profile 目录跑 pnpm add/update，然后 reconcile 层栈。
 * 与官方 `dsh plugin <sub>`（pnpm forwarder + reconcile）同机制。
 * @param args - pnpm 子命令参数（add <source> 或 update <name>）。
 * @returns {names, output} 新增层名与 pnpm 输出（失败时 output 为错误信息）。
 */
function runPnpm(args: string[]): { ok: boolean; names: string[]; output: string } {
  const dir = profileWebDir()
  const result = spawnSync('pnpm', args, { cwd: dir, encoding: 'utf8', timeout: 120_000 })
  const output = (result.stdout ?? '') + (result.stderr ?? '')
  if (result.status !== 0) {
    return { ok: false, names: [], output: output.slice(-1000) }
  }
  const names = reconcileBundles([])
  return { ok: true, names, output: output.slice(-500) }
}

/** 检查全部已配置源的远端状态。 */
async function checkUpdates(sources: string[]): Promise<UpdateCheckRow[]> {
  const rows: UpdateCheckRow[] = []
  for (const source of sources) {
    const parsed = parseSource(source)
    if (parsed === null) {
      rows.push({ source, ref: '', refKind: 'sha', latestSha: null, hasUpdate: false, error: 'unsupported source (expected github:owner/repo#ref)' })
      continue
    }
    const result = await gitRemoteCommit(parsed.owner, parsed.repo, parsed.ref)
    if (result.sha === null) {
      rows.push({
        source,
        ref: parsed.ref,
        refKind: isCommitSha(parsed.ref) ? 'sha' : 'branch',
        latestSha: null,
        hasUpdate: false,
        error: result.missing ? 'remote has no such ref（未推送或已删除）' : 'cannot reach remote (network/credentials)',
      })
      continue
    }
    rows.push({
      source,
      ref: parsed.ref,
      refKind: isCommitSha(parsed.ref) ? 'sha' : 'branch',
      latestSha: result.sha,
      hasUpdate: parsed.ref !== result.sha,
    })
  }
  return rows
}

interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: unknown, res: { statusCode: number; setHeader(k: string, v: string): void; end(body: string): void }) => void | Promise<void>
  }): () => void
}

/** Cordis 插件名。 */
export const name = 'plugin-console'

/** 需要宿主 web server（web 组合）+ loader（读/改 loader 树条目）。 */
export const inject = ['httpServer', 'loader']

/** loader 树条目投影（条目短 id + 包名 + 当前 disabled + 当前版本）。 */
interface LoadedEntryRow {
  /**
   * 条目短 id（EntryOptions.id，如 dsh-loop）——profile patch 的
   * `- id:` 匹配这个（含父前缀的完整 id `include:dsh-loop` 匹配不上，
   * 已实证重启不生效）。
   */
  id: string
  /** 包名（@dsh-external/dsh-loop 等；@deepseek-ai/* = 官方内置）。 */
  name: string
  /** 当前是否被禁用（含父条目禁用继承）。 */
  disabled: boolean
  /** 已安装版本（读 profile node_modules 的 package.json）；未装/读不到为 undefined。 */
  version?: string
}

/** 版本检查缓存：name -> { latest, checkedAt }（10 分钟 TTL，进程内存）。 */
const versionCache = new Map<string, { latest: string | null; checkedAt: number }>()
const VERSION_CACHE_TTL_MS = 10 * 60 * 1000

/** npm view <name> version（registry 最新版）；失败/非 registry 包返回 null。结果缓存 10 分钟。 */
function npmLatestVersion(name: string): string | null {
  const cached = versionCache.get(name)
  if (cached !== undefined && Date.now() - cached.checkedAt < VERSION_CACHE_TTL_MS) {
    return cached.latest
  }
  let latest: string | null = null
  try {
    const result = spawnSync('npm', ['view', name, 'version'], { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'] })
    const text = (result.stdout ?? '').trim()
    if (result.status === 0 && /^\d+(\.\d+)+/.test(text)) {
      latest = text.split('\n')[0]!.trim()
    }
  } catch {
    // 保持 null（无法查询 = 非 registry 包或网络问题）。
  }
  versionCache.set(name, { latest, checkedAt: Date.now() })
  return latest
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

/** 遍历 loader 树收集全部条目（含嵌套子树），id 取短 id（options.id）。 */
function collectLoaderEntries(ctx: ConsoleCtx): LoadedEntryRow[] {
  const loader = (ctx as unknown as { loader?: { entries?(): Generator<unknown> } }).loader
  if (loader?.entries === undefined) return []
  const rows: LoadedEntryRow[] = []
  for (const raw of loader.entries()) {
    const entry = raw as { id?: string; options?: { id?: string; name?: string }; disabled?: boolean }
    const id = entry.options?.id ?? entry.id
    if (typeof id !== 'string' || id.length === 0) continue
    const name = entry.options?.name ?? id
    rows.push({
      id,
      name,
      disabled: entry.disabled === true,
      version: readInstalledVersion(name),
    })
  }
  return rows
}

interface ConsoleCtx extends Context {
  httpServer?: WebServerLike
}

/** 注册控制台路由：GET 读列表，POST 写列表。 */
export function apply(ctx: ConsoleCtx): void {
  ctx.effect(() => {
    const httpServer = ctx.httpServer
    if (httpServer === undefined) return () => {}
    return httpServer.register({
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
          if (method === 'GET' && (path === '/api/plugin-console/repositories' || path === '/api/plugin-console/repositories/')) {
            json(200, { ok: true, ...readRepositories() })
            return
          }
          if (method === 'POST' && (path === '/api/plugin-console/repositories' || path === '/api/plugin-console/repositories/')) {
            let body = ''
            ;(req as { on?: (e: string, cb: (c: Buffer) => void) => void })?.on?.('data', (c: Buffer) => { body += c.toString('utf8') })
            ;(req as { on?: (e: string, cb: () => void) => void })?.on?.('end', () => {
              const parsed = JSON.parse(body) as { repositories?: string[] }
              writeRepositories(parsed.repositories ?? [])
              json(200, { ok: true })
            })
            return
          }
          // 更新检查：对每个已配置源查远端最新 commit
          if (method === 'GET' && (path === '/api/plugin-console/updates' || path === '/api/plugin-console/updates/')) {
            void (async () => {
              try {
                const rows = await checkUpdates(readRepositories().repositories)
                json(200, { ok: true, updates: rows })
              } catch (error) {
                json(500, { ok: false, message: error instanceof Error ? error.message : String(error) })
              }
            })()
            return
          }
          // 更新执行：把指定源的 ref 更新为远端最新 commit（写配置，官方换代在下次启动）
          if (method === 'POST' && (path === '/api/plugin-console/updates' || path === '/api/plugin-console/updates/')) {
            let body = ''
            ;(req as { on?: (e: string, cb: (c: Buffer) => void) => void })?.on?.('data', (c: Buffer) => { body += c.toString('utf8') })
            ;(req as { on?: (e: string, cb: () => void) => void })?.on?.('end', () => {
              void (async () => {
                try {
                  const parsed = JSON.parse(body) as { source?: string }
                  const source = parsed.source ?? ''
                  const current = readRepositories().repositories
                  if (!current.includes(source)) {
                    json(404, { ok: false, message: `source not configured: ${source}` })
                    return
                  }
                  const parsedSource = parseSource(source)
                  if (parsedSource === null) {
                    json(400, { ok: false, message: 'unsupported source (expected github:owner/repo#ref)' })
                    return
                  }
                  const result = await gitRemoteCommit(parsedSource.owner, parsedSource.repo, parsedSource.ref)
                  if (result.sha === null) {
                    json(result.missing ? 400 : 502, {
                      ok: false,
                      message: result.missing ? 'remote has no such ref（未推送或已删除）' : 'cannot reach remote (network/credentials)',
                    })
                    return
                  }
                  if (result.sha === parsedSource.ref) {
                    json(200, { ok: true, updated: false, source, latestSha: result.sha })
                    return
                  }
                  const updated = `github:${parsedSource.owner}/${parsedSource.repo}#${result.sha}${parsedSource.tail}`
                  writeRepositories(current.map(item => item === source ? updated : item))
                  json(200, { ok: true, updated: true, source, from: parsedSource.ref, to: latest })
                } catch (error) {
                  json(500, { ok: false, message: error instanceof Error ? error.message : String(error) })
                }
              })()
            })
            return
          }
          // 已加载插件：读 loader 树（实时，含运行时启停后的状态）
          if (method === 'GET' && (path === '/api/plugin-console/installed' || path === '/api/plugin-console/installed/')) {
            json(200, { ok: true, plugins: collectLoaderEntries(ctx) })
            return
          }
          // bundle 版本检查：对每个包查 registry 最新版（npm view，缓存 10 分钟）
          if (method === 'GET' && (path === '/api/plugin-console/versions' || path === '/api/plugin-console/versions/')) {
            void (async () => {
              try {
                const names = [...new Set(collectLoaderEntries(ctx).map(row => row.name).filter(name => !name.startsWith('@deepseek-ai/') && !name.startsWith('@cordisjs/') && !name.startsWith('cordis:')))]
                const versions = names.map(name => ({
                  name,
                  latest: npmLatestVersion(name),
                }))
                json(200, { ok: true, versions })
              } catch (error) {
                json(500, { ok: false, message: error instanceof Error ? error.message : String(error) })
              }
            })()
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
                  // 运行时启停：用与 GET /installed 相同的 entries() 遍历匹配条目
                  // （resolve 可能命中不同的 Entry 对象——已实证状态不生效）。
                  // 匹配短 id（options.id），与 patch 的 `- id:` 一致。
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
          // bundle 插件安装/更新（POST /bundles，body {action: 'install'|'update', source?|name?}）
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
                  json(400, { ok: false, message: 'action must be install or update' })
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
  }, 'plugin-console: config read/write route')
}
