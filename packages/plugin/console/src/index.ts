/**
 * 薄控制台 Node half：读写 `$DSH_HOME/cordis.patch.yml` 的
 * `repository-plugins` 行（官方仓库插件的用户配置层，homePatchPath）。
 * 经 httpServer 提供 `/api/plugin-console` 路由供浏览器面板调用。
 *
 * 0 patch：完全官方机制——glue 插件经 bundle 挂载，config 是官方
 * HMR-watched 的 home 级用户 patch 层。
 */
import { readFileSync, writeFileSync } from 'node:fs'
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
  let targetLine = -1
  let targetIndent = ''
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^- id:\s*([^\s]+)/.exec(lines[i]!.trim())
    if (match !== null && match[1] === id) {
      targetLine = i
      targetIndent = /^(\s*)-/.exec(lines[i]!)?.[1] ?? ''
      break
    }
  }
  if (targetLine === -1) {
    // 目标行不存在：追加一个新的挂载行 + disabled 标记
    lines.push(`${targetIndent}- id: ${id}`)
    lines.push(`${targetIndent}  disabled: ${String(disabled)}`)
  } else {
    // 找到该行子树内的 disabled 行
    let disabledLine = -1
    for (let j = targetLine + 1; j < lines.length; j += 1) {
      const next = lines[j]!
      if (next.trimStart().startsWith('- id:')) break
      if (/disabled:\s*(true|false)/.test(next.trim())) {
        disabledLine = j
        break
      }
    }
    if (disabledLine === -1) {
      // 无 disabled 行：在 id 行后插入
      lines.splice(targetLine + 1, 0, `${targetIndent}  disabled: ${String(disabled)}`)
    } else {
      lines[disabledLine] = `${targetIndent}  disabled: ${String(disabled)}`
    }
  }
  writeFileSync(file, lines.join('\n'))
  console.log(`[plugin-console] set ${id} disabled=${String(disabled)} in ${file}`)
}

interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: unknown, res: { statusCode: number; setHeader(k: string, v: string): void; end(body: string): void }) => void
  }): () => void
}

/** Cordis 插件名。 */
export const name = 'plugin-console'

/** 需要宿主 web server（web 组合）。 */
export const inject = ['httpServer']

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
      handler: (req, res) => {
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
          // UI 插件管理：读 Loader 树插件的 disabled 状态
          if (method === 'GET' && (path === '/api/plugin-console/ui-plugins' || path === '/api/plugin-console/ui-plugins/')) {
            json(200, { ok: true, plugins: readUiPlugins() })
            return
          }
          // UI 插件管理：设置一个插件的 disabled 状态（POST /ui-plugins/<id>，body {disabled: bool}）
          const uiMatch = /^\/api\/plugin-console\/ui-plugins\/([^/]+)$/.exec(path)
          if (method === 'POST' && uiMatch !== null) {
            const id = decodeURIComponent(uiMatch[1]!)
            let body = ''
            ;(req as { on?: (e: string, cb: (c: Buffer) => void) => void })?.on?.('data', (c: Buffer) => { body += c.toString('utf8') })
            ;(req as { on?: (e: string, cb: () => void) => void })?.on?.('end', () => {
              const parsed = JSON.parse(body) as { disabled?: boolean }
              writeUiPluginDisabled(id, parsed.disabled === true)
              json(200, { ok: true, id, disabled: parsed.disabled === true })
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
