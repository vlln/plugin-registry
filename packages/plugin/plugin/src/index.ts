/**
 * Local plugin registry plugin: provides `ctx.plugins` (the runtime registry
 * service) and mounts every enabled plugin under `<dshHome>/plugins` as
 * children of one group fiber. Installation and enablement are registry
 * operations on the same state (`install` / `enable` / `disable` /
 * `uninstall` on the service); `apply` is the load-time sweep that mounts the
 * currently enabled set.
 *
 * @module @deepseek-ai/dsh-plugin
 */

import { Context } from 'cordis'
import z from 'schemastery'
import type Schema from 'schemastery'
import { resolveDshHome } from '@deepseek-ai/dsh-paths'
import { PluginLocalService } from './service.ts'

export * from './manifest.ts'
export * from './registry.ts'
export * from './catalog.ts'
export * from './service.ts'
export * from './scaffold.ts'
export * from './tarball.ts'
export { normalizePlugin } from './load.ts'
export { MANIFEST_FILE_NAME } from './types.ts'
export type {
  CatalogEntry,
  InstalledRecord,
  PluginContributes,
  PluginEngines,
  PluginIndex,
  PluginManifest,
} from './types.ts'

/** Function-plugin display name. */
export const name = 'plugin-local'

/** Services this plugin injects: none, it only reads the local registry. */
export const inject = [] as string[]

/** Config for the plugin-local plugin. */
export interface Config {
  /** Harness home whose plugin registry is mounted. Defaults to `$DSH_HOME` or `~/.dsh`. */
  dshHome?: string
  /** The running dsh version, checked against `engines.dsh` at install. Defaults to the packaged placeholder. */
  harnessVersion?: string
}

/** Schemastery validator for {@link Config}. */
export const Config: Schema<Config> = z.object({
  dshHome: z.string(),
  harnessVersion: z.string(),
})

/**
 * Provide the `ctx.plugins` service and mount every enabled plugin under one
 * group fiber. The returned disposer unloads them all; a plugin that fails to
 * start fails this apply loud so the harness never boots with a half-mounted
 * registry.
 * @param ctx - the plugin context that owns the service and mounts.
 * @param config - the resolved plugin config.
 * @returns an async disposer that unloads every mounted plugin.
 */
export async function apply(ctx: Context, config: Config = {}): Promise<() => Promise<void>> {
  const service = new PluginLocalService(ctx, config.dshHome ?? resolveDshHome(), config.harnessVersion ?? '0.0.1')
  await service.reconcile()
  return () => service.dispose()
}
