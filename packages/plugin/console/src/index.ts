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
          json(404, { ok: false, message: 'not found' })
        } catch (error) {
          json(500, { ok: false, message: error instanceof Error ? error.message : String(error) })
        }
      },
    })
  }, 'plugin-console: config read/write route')
}
