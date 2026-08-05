/**
 * Shared types for the local plugin registry protocol.
 * @module @deepseek-ai/dsh-plugin/types
 */

/** Stable file name of a plugin manifest, relative to the plugin root. */
export const MANIFEST_FILE_NAME = 'dsh.plugin.json'

/** Contribution declarations a plugin makes about its model-facing surface. */
export interface PluginContributes {
  /** Tool names the plugin registers on `ctx.tools`. */
  tools: string[]
  /** Skill names the plugin registers on `ctx.skills`. */
  skills: string[]
}

/**
 * The browser-side half of a plugin: a prebuilt client bundle served to the
 * web shell. Optional — a plugin without this field is Node-only.
 */
export interface PluginClient {
  /** Relative path from the plugin root to the built client bundle. */
  main: string
  /** Graph metadata declaring client-service dependencies (informational; the fiber's actual inject comes from the bundle's own export). */
  inject?: string[]
  /** Stage-one prefetch mark for the boot manifest; absent means lazy (fetched on demand). */
  immediately?: boolean
}

/**
 * Engine compatibility declarations. Each value is a semver range satisfied by
 * the running harness version at install and mount time.
 */
export interface PluginEngines {
  /** Semver range the running DeepSeek Harness version must satisfy. */
  dsh: string
}

/**
 * The plugin manifest: identity, entry, and declared contributions. The entry
 * (`main`) must default-export or named-export a Cordis {@link Plugin}.
 */
export interface PluginManifest {
  /** Publisher-scoped unique id, `publisher/name` (lowercase alphanumeric plus hyphen). */
  id: string
  /** Semver version of this plugin release. */
  version: string
  /** Relative path from the plugin root to the Cordis plugin entry module. */
  main: string
  /** One-line human summary of what the plugin does. */
  description: string
  /** Engine ranges the running harness must satisfy. */
  engines: PluginEngines
  /** Declared model-facing contributions (informational at install time). */
  contributes: PluginContributes
  /** Optional browser-side half; a plugin without it is Node-only. */
  client?: PluginClient
}

/** One record in the local plugin index: install state keyed by plugin id. */
export interface InstalledRecord {
  /** The installed plugin version, copied from its manifest at install time. */
  version: string
  /** Whether the runtime mounts this plugin on the next load. */
  enabled: boolean
  /** ISO timestamp of the install. */
  installedAt: string
}

/** The whole local plugin index, keyed by plugin id. */
export type PluginIndex = Record<string, InstalledRecord>

/** One discoverable plugin in the local catalog (the "market" data source). */
export interface CatalogEntry {
  /** Publisher-scoped id, matching the installed plugin's manifest id. */
  id: string
  /** Version advertised by the catalog. */
  version: string
  /** One-line summary for the browse list. */
  description: string
  /** Local directory containing the plugin root (`dsh.plugin.json`). */
  source: string
}
