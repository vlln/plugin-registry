/**
 * Web panel management route for the plugin registry — a self-owned
 * `/api/plugin-registry` prefix route served on the official `httpServer`
 * seam, replacing the apiproxy `plugins` RPC domain (patch-slimming B class:
 * an officially open seam carries what used to be official-tree wiring).
 *
 * The route is registered only when `httpServer` is composed (web shapes);
 * CLI/headless compositions simply never mount it. The browser half of the
 * ui-plugin-manager panel fetches these endpoints directly.
 * @module @deepseek-ai/dsh-plugin/panel-route
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { PluginLocalService } from './service.ts'

/** One plugin browse row (wire projection of the registry's PluginEntryView). */
export interface PluginEntryView {
  /** Publisher-scoped plugin id. */
  readonly id: string
  /** Installed version when installed, else the catalog-advertised version. */
  readonly version: string
  /** One-line summary. */
  readonly description: string
  /** Whether the plugin is installed in the registry. */
  readonly installed: boolean
  /** Whether the installed plugin is mounted (and will mount on the next load). */
  readonly enabled: boolean
}

/** The route's `handler` face matches the official WebRoute contract. */
export type PluginRegistryRoute = {
  kind: 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/** Bounded body reader (16 MiB cap, matching the host API carrier's posture). */
function readBody(req: IncomingMessage, limit = 16 * 1024 * 1024): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString('utf8')
      if (raw.length > limit) rejectBody(new Error('request body too large'))
    })
    req.on('end', () => resolveBody(raw))
    req.on('error', rejectBody)
  })
}

/**
 * Build the plugin-registry management route for one registry service.
 * @param plugins - the registry service; undefined means the composition has
 * no plugin-local, and the route answers 503 for every operation.
 * @returns the WebRoute to register on the host web server.
 */
export function createPluginRegistryRoute(plugins: PluginLocalService | undefined): PluginRegistryRoute {
  const json = (res: ServerResponse, status: number, body: Record<string, unknown>): void => {
    res.statusCode = status
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(body))
  }
  const ok = (res: ServerResponse, value: Record<string, unknown>): void => json(res, 200, { ok: true, ...value })
  const fail = (res: ServerResponse, status: number, message: string): void => json(res, status, { ok: false, message })

  return {
    kind: 'prefix',
    path: '/api/plugin-registry',
    handler: async (req, res): Promise<void> => {
      const method = req.method ?? 'GET'
      const path = (req.url ?? '/').split('?')[0] ?? '/'
      try {
        if (plugins === undefined) {
          fail(res, 503, 'plugin registry is absent: this deployment does not mount @deepseek-ai/dsh-plugin in its composition')
          return
        }
        if (method === 'GET' && (path === '/api/plugin-registry/plugins' || path === '/api/plugin-registry/plugins/')) {
          ok(res, { plugins: await plugins.list() })
          return
        }
        const match = /^\/api\/plugin-registry\/plugins\/(install|enable|disable|uninstall)$/.exec(path)
        if (method === 'POST' && match !== null) {
          const action = match[1]
          const body = JSON.parse(await readBody(req)) as { id: string }
          if (action === 'install') {
            const installed = await plugins.install(body.id)
            ok(res, { id: installed.id })
            return
          }
          if (action === 'enable') {
            await plugins.enable(body.id)
            ok(res, { id: body.id })
            return
          }
          if (action === 'disable') {
            await plugins.disable(body.id)
            ok(res, { id: body.id })
            return
          }
          await plugins.uninstall(body.id)
          ok(res, { id: body.id })
          return
        }
        fail(res, 404, 'not found')
      } catch (error) {
        fail(res, 500, error instanceof Error ? error.message : String(error))
      }
    },
  }
}
