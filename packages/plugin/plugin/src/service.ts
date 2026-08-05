/**
 * Runtime plugin registry service: `ctx.plugins`. Owns the mounted set of
 * enabled plugins under one group fiber and the registry operations behind
 * them, so a live harness (web settings panel, CLI-equivalent API) can list,
 * install, enable, disable, and uninstall with the mount set kept in sync —
 * enable mounts immediately, disable unmounts immediately.
 *
 * @module @deepseek-ai/dsh-plugin/service
 */

import { pathToFileURL } from 'node:url'
import { join, resolve } from 'node:path'
import { Context, Service, type Fiber } from 'cordis'
import type { ToolRegistry } from '@deepseek-ai/dsh-tools'
import { normalizePlugin } from './load.ts'
import { ensureDepsLink } from './deps-link.ts'
import type { PluginClient } from './types.ts'

declare module 'cordis' {
  interface Context {
    /** The runtime plugin registry service, provided by the `plugin-local` plugin. */
    plugins: PluginLocalService
  }
}
import { readManifest, type PluginManifest } from './manifest.ts'
import { installFromCatalog, readCatalog } from './catalog.ts'
import { listPlugins, pluginDir, readIndex, setEnabled, uninstallPlugin, type ListedPlugin } from './registry.ts'

/**
 * Minimal structural face of the web client-modules host service
 * (`ClientModuleHostService`). Kept structural to avoid a peer dependency on
 * the official package: the service is reached through a root property read
 * (non-strict reflection), and only these two methods are consumed.
 */
interface ClientModuleHost {
  registerExternal(id: string, options: { clientPath: string; inject?: string[]; immediately?: boolean }): string
  unregisterExternal(id: string): void
}

/** One pending external client registration, deferred until the web host is available. */
interface PendingExternal {
  id: string
  clientPath: string
  inject?: string[]
  immediately?: boolean
}

/**
 * Resolve a plugin's client bundle path from its root, rejecting a path that
 * escapes the plugin root (a `client.main` of `../secret.js` would otherwise
 * be served by the web bundle route).
 * @param pluginRoot - the installed plugin's directory.
 * @param clientMain - the manifest `client.main` value.
 * @returns the absolute bundle path.
 */
function resolveClientPath(pluginRoot: string, clientMain: string): string {
  const resolved = resolve(pluginRoot, clientMain)
  if (resolved !== pluginRoot && !resolved.startsWith(`${pluginRoot}/`)) {
    throw new Error(`plugin client entry ${JSON.stringify(clientMain)} escapes the plugin root`)
  }
  return resolved
}

/** One row of the plugin browse list served to the web panel. */
export interface PluginEntryView {
  /** Publisher-scoped plugin id. */
  id: string
  /** Installed version when installed, else the catalog-advertised version. */
  version: string
  /** One-line summary. */
  description: string
  /** Whether the plugin is installed in the registry. */
  installed: boolean
  /** Whether the installed plugin is mounted (and will mount on the next load). */
  enabled: boolean
}

/**
 * The `ctx.plugins` service: registry operations plus the live mount set.
 * Mounted plugins are children of one group fiber, so disposing the service
 * unloads them all.
 */
export class PluginLocalService extends Service {
  private group: Fiber
  private mounts = new Map<string, Fiber>()
  /** External client registrations deferred until the web client-modules host exists. */
  private pendingExternal = new Map<string, PendingExternal>()

  /**
   * Create the service and its group fiber.
   * @param ctx - the context that owns the service and mounts.
   * @param dshHome - harness home whose plugin registry is managed.
   * @param harnessVersion - the running dsh version, checked at install.
   */
  constructor(ctx: Context, private dshHome: string, private harnessVersion: string) {
    super(ctx, 'plugins')
    this.group = ctx.plugin({ name: 'plugin-local', apply: () => {} })
    // Deferred re-registration: plugin-local has no inject (it activates
    // immediately), while the web client-modules host waits on httpServer +
    // loader — no ordering guarantees between them. Without this, enabled
    // plugins' client halves would silently vanish from the boot graph after
    // every restart. ctx.inject waits for the host, then flushes the pending
    // set; the fiber is cordis-owned and disposed with this service.
    ctx.inject(['clientModuleHost'], () => { this.retryExternalRegistrations() })
  }

  /**
   * The web client-modules host service, or undefined in non-web compositions
   * (CLI/headless). Root property read: the host writes its isolate key on the
   * root context, whose non-runtime property read returns undefined for an
   * absent service — unlike this fiber's ctx, which throws for an uninjected
   * name.
   */
  private get clientModuleHost(): ClientModuleHost | undefined {
    return (this.ctx.root as { clientModuleHost?: ClientModuleHost }).clientModuleHost
  }

  /**
   * Mount one installed plugin's entry as a child of the group fiber. A
   * plugin that fails to start throws, and a plugin already mounted is a
   * no-op.
   * @param id - the installed plugin id.
   */
  async mount(id: string): Promise<void> {
    if (this.mounts.has(id)) return
    const manifest = await readManifest(pluginDir(this.dshHome, id))
    // Dependency link best-effort (also re-ensured on reconcile): a plugin
    // whose entry imports checkout packages needs the shared node_modules
    // link; a plugin that never does is unaffected by an unlinkable checkout.
    await ensureDepsLink(this.dshHome)
    const entryUrl = pathToFileURL(join(pluginDir(this.dshHome, id), manifest.main)).href
    const plugin = normalizePlugin(await import(entryUrl))
    const fiber = this.group.ctx.plugin(plugin)
    await fiber.await()
    this.mounts.set(id, fiber)
    try {
      this.verifyContributions(id, manifest)
      this.registerClient(id, manifest)
    } catch (error) {
      // A broken mount (unregistered contribution, or an unresolvable client
      // half) unwinds the fiber, the mounts entry, and any pending client row
      // so a failed mount never leaves a half-mounted plugin behind.
      await fiber.dispose()
      this.mounts.delete(id)
      this.pendingExternal.delete(id)
      throw error
    }
  }

  /**
   * Register the plugin's client half with the web host, or defer it until the
   * host exists. A plugin without a `client` manifest field has no browser
   * surface and is skipped.
   * @param id - the installed plugin id.
   * @param manifest - the plugin's manifest, read at mount time.
   */
  private registerClient(id: string, manifest: PluginManifest): void {
    if (manifest.client === undefined) return
    const clientPath = resolveClientPath(pluginDir(this.dshHome, id), manifest.client.main)
    const host = this.clientModuleHost
    if (host === undefined) {
      this.pendingExternal.set(id, {
        id,
        clientPath,
        ...(manifest.client.inject !== undefined ? { inject: manifest.client.inject } : {}),
        ...(manifest.client.immediately !== undefined ? { immediately: manifest.client.immediately } : {}),
      })
      return
    }
    this.registerWithHost(host, id, clientPath, manifest.client)
  }

  /**
   * Register one client half with the web host and drop any pending row for
   * the same id (a direct registration supersedes a deferred one).
   * @param host - the web client-modules host.
   * @param id - the installed plugin id.
   * @param clientPath - the resolved bundle path.
   * @param client - the manifest client declaration.
   */
  private registerWithHost(host: ClientModuleHost, id: string, clientPath: string, client: PluginClient): void {
    host.registerExternal(id, {
      clientPath,
      ...(client.inject !== undefined ? { inject: client.inject } : {}),
      ...(client.immediately !== undefined ? { immediately: client.immediately } : {}),
    })
    this.pendingExternal.delete(id)
  }

  /**
   * Unregister the plugin's client half (if any) and drop its pending row.
   * @param id - the installed plugin id.
   */
  private unregisterClient(id: string): void {
    this.pendingExternal.delete(id)
    this.clientModuleHost?.unregisterExternal(id)
  }

  /**
   * Flush deferred client registrations once the web host is available. Only
   * plugins still mounted are registered (an unmount in the startup window
   * dropped the row — the enable-only invariant); each registration is
   * isolated so one broken bundle neither blocks the rest nor is silently
   * lost — it stays pending for the next flush or re-mount.
   */
  private retryExternalRegistrations(): void {
    const host = this.clientModuleHost
    if (host === undefined) return
    for (const [id, pending] of [...this.pendingExternal]) {
      if (!this.mounts.has(id)) {
        this.pendingExternal.delete(id)
        continue
      }
      try {
        host.registerExternal(id, {
          clientPath: pending.clientPath,
          ...(pending.inject !== undefined ? { inject: pending.inject } : {}),
          ...(pending.immediately !== undefined ? { immediately: pending.immediately } : {}),
        })
        this.pendingExternal.delete(id)
      } catch (error) {
        // Keep the row pending: a later flush (or re-mount) retries it.
        this.ctx.logger.error(error)
      }
    }
  }

  /**
   * Assert every tool the manifest declares in `contributes.tools` is actually
   * registered by the mounted plugin. Declared names are a contract, not an
   * advertisement: a plugin that omits one fails loud with the missing names
   * so the author fixes the manifest or the registration. When the composition
   * mounts no `ctx.tools` service there is no tool surface to verify, and the
   * check is skipped.
   * @param id - the installed plugin id.
   * @param manifest - the plugin's manifest, read at mount time.
   */
  private verifyContributions(id: string, manifest: PluginManifest): void {
    // Root property read: every provider writes its isolate key on the root
    // context, and the root's non-runtime property read falls back to a
    // non-strict reflection that returns undefined for an absent service —
    // unlike this fiber's ctx, which throws for an uninjected name.
    const tools = (this.ctx.root as { tools?: ToolRegistry }).tools
    if (tools === undefined) return

    const registered = new Set(tools.schemas().map(schema => schema.name))
    const missing = manifest.contributes.tools.filter(name => !registered.has(name))
    if (missing.length === 0) return
    throw new Error(
      `plugin ${id} declares tools [${missing.join(', ')}] in contributes but registered none of them`,
    )
  }

  /**
   * Unmount one installed plugin, disposing its fiber and every registration
   * it made (including the client half). A plugin not mounted is a no-op.
   * @param id - the installed plugin id.
   */
  async unmount(id: string): Promise<void> {
    const fiber = this.mounts.get(id)
    if (fiber === undefined) return
    await fiber.dispose()
    this.mounts.delete(id)
    this.unregisterClient(id)
  }

  /**
   * Mount every enabled plugin in the index (the load-time sweep).
   */
  async reconcile(): Promise<void> {
    // Ensure the shared dependency link once before the sweep so a plugin
    // that imports checkout packages resolves on first mount (mount also
    // re-ensures, covering a checkout rotation mid-session).
    await ensureDepsLink(this.dshHome)
    const index = await readIndex(this.dshHome)
    for (const [id, record] of Object.entries(index).sort(([a], [b]) => a.localeCompare(b))) {
      if (record.enabled) await this.mount(id)
    }
  }

  /**
   * Install a catalog entry (disabled by default) without mounting it.
   * @param id - the catalog entry id.
   * @returns the installed plugin.
   */
  install(id: string): Promise<ListedPlugin> {
    return installFromCatalog(this.dshHome, id, { dshHome: this.dshHome, harnessVersion: this.harnessVersion })
  }

  /**
   * Enable an installed plugin and mount it immediately. Enablement persists
   * only after the mount succeeds, so a broken plugin never stays marked
   * enabled.
   * @param id - the installed plugin id.
   */
  async enable(id: string): Promise<void> {
    await this.assertInstalled(id)
    await this.mount(id)
    await setEnabled(this.dshHome, id, true)
  }

  /**
   * Unmount and disable an installed plugin.
   * @param id - the installed plugin id.
   */
  async disable(id: string): Promise<void> {
    await this.assertInstalled(id)
    await this.unmount(id)
    await setEnabled(this.dshHome, id, false)
  }

  /**
   * Unmount and remove an installed plugin from the registry.
   * @param id - the installed plugin id.
   */
  async uninstall(id: string): Promise<void> {
    await this.unmount(id)
    await uninstallPlugin(this.dshHome, id)
  }

  /**
   * List the browse rows: every catalog entry plus every installed plugin,
   * merged by id and sorted, with install and enable state.
   * @returns the plugin browse list.
   */
  async list(): Promise<PluginEntryView[]> {
    const installed = await listPlugins(this.dshHome)
    const byId = new Map(installed.map(plugin => [plugin.id, plugin]))
    const catalog = await readCatalog(this.dshHome)
    const rows: PluginEntryView[] = catalog.map((entry) => {
      const installedPlugin = byId.get(entry.id)
      return {
        id: entry.id,
        version: installedPlugin?.record.version ?? entry.version,
        description: installedPlugin?.manifest.description ?? entry.description,
        installed: installedPlugin !== undefined,
        enabled: installedPlugin?.record.enabled ?? false,
      }
    })
    for (const plugin of installed) {
      if (!catalog.some(entry => entry.id === plugin.id)) {
        rows.push({
          id: plugin.id,
          version: plugin.record.version,
          description: plugin.manifest.description,
          installed: true,
          enabled: plugin.record.enabled,
        })
      }
    }
    return rows.sort((a, b) => a.id.localeCompare(b.id))
  }

  /**
   * Assert a plugin exists in the registry index, failing loud with the
   * registry's stable message instead of a filesystem error from a missing
   * directory.
   * @param id - the installed plugin id.
   */
  private async assertInstalled(id: string): Promise<void> {
    const index = await readIndex(this.dshHome)
    if (index[id] === undefined) throw new Error(`plugin ${id} is not installed`)
  }

  /**
   * Unload every mounted plugin through the group fiber.
   * @returns a promise resolving once the group is disposed.
   */
  dispose(): Promise<void> {
    this.mounts.clear()
    this.pendingExternal.clear()
    return this.group.dispose()
  }
}
