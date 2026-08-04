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
import { join } from 'node:path'
import { Context, Service, type Fiber } from 'cordis'
import type { ToolRegistry } from '@deepseek-ai/dsh-tools'
import { normalizePlugin } from './load.ts'

declare module 'cordis' {
  interface Context {
    /** The runtime plugin registry service, provided by the `plugin-local` plugin. */
    plugins: PluginLocalService
  }
}
import { readManifest, type PluginManifest } from './manifest.ts'
import { installFromCatalog, readCatalog } from './catalog.ts'
import { listPlugins, pluginDir, readIndex, setEnabled, uninstallPlugin, type ListedPlugin } from './registry.ts'

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

  /**
   * Create the service and its group fiber.
   * @param ctx - the context that owns the service and mounts.
   * @param dshHome - harness home whose plugin registry is managed.
   * @param harnessVersion - the running dsh version, checked at install.
   */
  constructor(ctx: Context, private dshHome: string, private harnessVersion: string) {
    super(ctx, 'plugins')
    this.group = ctx.plugin({ name: 'plugin-local', apply: () => {} })
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
    const entryUrl = pathToFileURL(join(pluginDir(this.dshHome, id), manifest.main)).href
    const plugin = normalizePlugin(await import(entryUrl))
    const fiber = this.group.ctx.plugin(plugin)
    await fiber.await()
    this.mounts.set(id, fiber)
    try {
      this.verifyContributions(id, manifest)
    } catch (error) {
      // A declared-but-unregistered contribution is a broken mount: unwind the
      // fiber and the mounts entry so a failed verification never leaves a
      // half-mounted plugin behind.
      await fiber.dispose()
      this.mounts.delete(id)
      throw error
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
   * it made. A plugin not mounted is a no-op.
   * @param id - the installed plugin id.
   */
  async unmount(id: string): Promise<void> {
    const fiber = this.mounts.get(id)
    if (fiber === undefined) return
    await fiber.dispose()
    this.mounts.delete(id)
  }

  /**
   * Mount every enabled plugin in the index (the load-time sweep).
   */
  async reconcile(): Promise<void> {
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
    return this.group.dispose()
  }
}
