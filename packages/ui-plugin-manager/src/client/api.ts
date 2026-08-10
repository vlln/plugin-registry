/**
 * Client fetch face for the plugin manager's self-owned route. Replaces the
 * apiproxy `plugins` RPC domain (patch-slimming B class): the browser half
 * talks to `/api/plugin-registry` directly, the route registered by the
 * panel's host half on an officially open seam.
 * @module @deepseek-ai/dsh-client-ui-plugin-manager/client/api
 */

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

/** One plugin id addressed by every mutating endpoint. */
export interface PluginIdPayload {
  /** The plugin id. */
  readonly id: string
}

interface WireEnvelope {
  readonly ok: boolean
  readonly message?: string
  readonly plugins?: readonly PluginEntryView[]
  readonly id?: string
}

/** List every browse row: catalog entries merged with installed state. */
export async function listPlugins(): Promise<readonly PluginEntryView[]> {
  const response = await fetch('/api/plugin-registry/plugins', { headers: { accept: 'application/json' } })
  const body = (await response.json()) as WireEnvelope
  if (!response.ok || body.ok !== true || body.plugins === undefined) {
    throw new Error(body.message ?? `list failed (HTTP ${response.status})`)
  }
  return body.plugins
}

/** Run one mutating registry action and resolve with the touched plugin id. */
export async function runPluginAction(action: 'install' | 'enable' | 'disable' | 'uninstall', id: string): Promise<string> {
  const response = await fetch(`/api/plugin-registry/plugins/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id } satisfies PluginIdPayload),
  })
  const body = (await response.json()) as WireEnvelope
  if (!response.ok || body.ok !== true || body.id === undefined) {
    throw new Error(body.message ?? `${action} failed (HTTP ${response.status})`)
  }
  return body.id
}
