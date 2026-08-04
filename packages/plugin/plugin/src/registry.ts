/**
 * Local plugin registry: install, uninstall, and enablement state under
 * `<dshHome>/plugins`, with one directory per plugin and one index file.
 * Registry operations are plain filesystem facts — no runtime services.
 *
 * @module @deepseek-ai/dsh-plugin/registry
 */

import { access, cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { InstalledRecord, PluginIndex, PluginManifest } from './types.ts'
import { checkEngine, readManifest } from './manifest.ts'

/** Directory name under the harness home that holds installed plugins. */
export const PLUGINS_DIR_NAME = 'plugins'

/** File name of the local plugin index under the plugins directory. */
export const INDEX_FILE_NAME = 'index.json'

/** Installed plugin plus its manifest, as `listPlugins` returns. */
export interface ListedPlugin {
  /** The plugin id. */
  id: string
  /** The install record from the index. */
  record: InstalledRecord
  /** The plugin's manifest read from its installed directory. */
  manifest: PluginManifest
}

/** Options for {@link installPlugin}. */
export interface InstallOptions {
  /** Harness home under which the plugin registry lives. */
  dshHome: string
  /** The running DeepSeek Harness version, checked against `engines.dsh`. */
  harnessVersion: string
}

/**
 * Resolve the plugin registry root for one harness home.
 * @param dshHome - the harness home.
 * @returns the absolute registry directory.
 */
export function pluginsRoot(dshHome: string): string {
  return join(dshHome, PLUGINS_DIR_NAME)
}

/**
 * Resolve the plugin index file path for one harness home.
 * @param dshHome - the harness home.
 * @returns the absolute index file path.
 */
export function indexFile(dshHome: string): string {
  return join(pluginsRoot(dshHome), INDEX_FILE_NAME)
}

/**
 * Resolve the installed directory for one plugin id.
 * @param dshHome - the harness home.
 * @param id - the installed plugin id.
 * @returns the absolute plugin directory.
 */
export function pluginDir(dshHome: string, id: string): string {
  return join(pluginsRoot(dshHome), id)
}

/**
 * Read the plugin index, or an empty index when no plugins are installed yet.
 * @param dshHome - harness home whose registry is read.
 * @returns the parsed index.
 */
export async function readIndex(dshHome: string): Promise<PluginIndex> {
  try {
    const text = await readFile(indexFile(dshHome), 'utf8')
    return JSON.parse(text) as PluginIndex
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}

/**
 * Write the plugin index, creating the registry root if needed.
 * @param dshHome - harness home whose registry is written.
 * @param index - the full index to persist.
 */
export async function writeIndex(dshHome: string, index: PluginIndex): Promise<void> {
  await mkdir(pluginsRoot(dshHome), { recursive: true })
  await writeFile(indexFile(dshHome), `${JSON.stringify(index, null, 2)}\n`)
}

/**
 * List every installed plugin with its manifest, sorted by id.
 * @param dshHome - harness home whose registry is listed.
 * @returns the installed plugins.
 */
export async function listPlugins(dshHome: string): Promise<ListedPlugin[]> {
  const index = await readIndex(dshHome)
  const listed: ListedPlugin[] = []
  for (const [id, record] of Object.entries(index).sort(([a], [b]) => a.localeCompare(b))) {
    const manifest = await readManifest(pluginDir(dshHome, id))
    listed.push({ id, record, manifest })
  }
  return listed
}

/**
 * Install a plugin from a local source directory: validate its manifest and
 * engine range, copy the directory into the registry, and record it as
 * disabled. A plugin must be explicitly enabled before the runtime mounts it.
 * @param sourceDir - directory containing `dsh.plugin.json`.
 * @param options - registry home and harness version.
 * @returns the installed plugin.
 */
export async function installPlugin(sourceDir: string, options: InstallOptions): Promise<ListedPlugin> {
  const manifest = await readManifest(sourceDir)
  checkEngine(manifest.engines, options.harnessVersion)
  const target = pluginDir(options.dshHome, manifest.id)
  if (await exists(target)) throw new Error(`plugin ${manifest.id} is already installed`)
  if (!(await exists(join(sourceDir, manifest.main)))) {
    throw new Error(`plugin ${manifest.id} manifest entry ${JSON.stringify(manifest.main)} is missing`)
  }
  await mkdir(pluginsRoot(options.dshHome), { recursive: true })
  await cp(sourceDir, target, { recursive: true })
  const index = await readIndex(options.dshHome)
  const record: InstalledRecord = {
    version: manifest.version,
    enabled: false,
    installedAt: new Date().toISOString(),
  }
  index[manifest.id] = record
  await writeIndex(options.dshHome, index)
  return { id: manifest.id, record, manifest }
}

/**
 * Set the enabled state of an installed plugin.
 * @param dshHome - harness home whose registry is updated.
 * @param id - the installed plugin id.
 * @param enabled - the new enabled state.
 */
export async function setEnabled(dshHome: string, id: string, enabled: boolean): Promise<void> {
  const index = await readIndex(dshHome)
  const record = index[id]
  if (record === undefined) throw new Error(`plugin ${id} is not installed`)
  if (record.enabled !== enabled) {
    record.enabled = enabled
    await writeIndex(dshHome, index)
  }
}

/**
 * Uninstall a plugin: remove its directory and drop its index record.
 * @param dshHome - harness home whose registry is updated.
 * @param id - the installed plugin id.
 */
export async function uninstallPlugin(dshHome: string, id: string): Promise<void> {
  const index = await readIndex(dshHome)
  if (index[id] === undefined) throw new Error(`plugin ${id} is not installed`)
  await rm(pluginDir(dshHome, id), { recursive: true, force: true })
  const remaining: PluginIndex = {}
  for (const [key, value] of Object.entries(index)) {
    if (key !== id) remaining[key] = value
  }
  await writeIndex(dshHome, remaining)
}

/**
 * Assert a path is an existing directory (the install source must be a plugin
 * root, not a manifest file).
 * @param path - the candidate directory path.
 */
export async function requireDirectory(path: string): Promise<void> {
  const info = await stat(path)
  if (!info.isDirectory()) {
    throw new Error(`install expects a plugin directory, got file ${JSON.stringify(path)}`)
  }
}

/** Resolve whether a path exists on disk. */
async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  )
}
