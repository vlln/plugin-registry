/**
 * Local plugin registry: install, uninstall, and enablement state under
 * `<dshHome>/plugins`, with one directory per plugin and one index file.
 * Registry operations are plain filesystem facts — no runtime services.
 *
 * Consistency contract: every mutation is serialized per harness home, the
 * index commits through a same-directory temporary file plus rename (readers
 * never see a truncated index, and a failed write leaves no partial state),
 * and a failed install rolls the copied directory back so the operation can
 * be retried. An uninstall failure leaves the directory removed and the
 * index record intact, which is safe to retry (the directory removal is
 * idempotent).
 *
 * @module @deepseek-ai/dsh-plugin/registry
 */

import { access, cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { InstalledRecord, PluginIndex, PluginManifest } from './types.ts'
import { checkEngine, readManifest } from './manifest.ts'
import { ensureDepsLink } from './deps-link.ts'

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

/** The resolved root of the plugin registry for one harness home. */
export function pluginsRoot(dshHome: string): string {
  return join(dshHome, PLUGINS_DIR_NAME)
}

/** The index file path for one harness home. */
export function indexFile(dshHome: string): string {
  return join(pluginsRoot(dshHome), INDEX_FILE_NAME)
}

/** The installed directory for one plugin id. */
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
 * Write the plugin index atomically: a same-directory temporary file that is
 * renamed over the index, so a reader never observes a truncated index and a
 * failed write leaves the previous index intact.
 * @param dshHome - harness home whose registry is written.
 * @param index - the full index to persist.
 */
export async function writeIndex(dshHome: string, index: PluginIndex): Promise<void> {
  await mkdir(pluginsRoot(dshHome), { recursive: true })
  const file = indexFile(dshHome)
  const staging = `${file}.tmp`
  await writeFile(staging, `${JSON.stringify(index, null, 2)}\n`)
  await rename(staging, file)
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
 *
 * The index write is the commit point: if it fails, the copied directory is
 * rolled back so the registry returns to the pre-install state and the
 * operation can be retried. A leftover directory without an index record
 * (from a crashed run) is cleaned up first.
 * @param sourceDir - directory containing `dsh.plugin.json`.
 * @param options - registry home and harness version.
 * @returns the installed plugin.
 */
export function installPlugin(sourceDir: string, options: InstallOptions): Promise<ListedPlugin> {
  return withRegistryLock(options.dshHome, () => installPluginLocked(sourceDir, options))
}

async function installPluginLocked(sourceDir: string, options: InstallOptions): Promise<ListedPlugin> {
  const manifest = await readManifest(sourceDir)
  checkEngine(manifest.engines, options.harnessVersion)
  const target = pluginDir(options.dshHome, manifest.id)
  const before = await readIndex(options.dshHome)
  if (before[manifest.id] !== undefined) throw new Error(`plugin ${manifest.id} is already installed`)
  if (await exists(target)) {
    // The index has no record but the directory exists: a crashed install
    // left residue. Remove it so the install can proceed (and retry cleanly).
    await rm(target, { recursive: true, force: true })
  }
  if (!(await exists(join(sourceDir, manifest.main)))) {
    throw new Error(`plugin ${manifest.id} manifest entry ${JSON.stringify(manifest.main)} is missing`)
  }
  if (manifest.client !== undefined) {
    // A `client: {}` (or non-string main) passes schemastery, which omits
    // absent fields — surface it here so a broken declaration fails at
    // install, not at web-boot.
    if (typeof manifest.client.main !== 'string' || manifest.client.main === '') {
      throw new Error(`plugin ${manifest.id} client entry is missing a main path`)
    }
    if (!(await exists(join(sourceDir, manifest.client.main)))) {
      throw new Error(`plugin ${manifest.id} client entry ${JSON.stringify(manifest.client.main)} is missing`)
    }
  }
  await mkdir(pluginsRoot(options.dshHome), { recursive: true })
  await cp(sourceDir, target, { recursive: true })
  const record: InstalledRecord = {
    version: manifest.version,
    enabled: false,
    installedAt: new Date().toISOString(),
  }
  try {
    const index = await readIndex(options.dshHome)
    index[manifest.id] = record
    await writeIndex(options.dshHome, index)
  } catch (error) {
    await rm(target, { recursive: true, force: true })
    throw error
  }
  // Dependency link is best-effort: a plugin that never imports a checkout
  // package needs no link, and an unlinkable deployment is not an install
  // failure (the runtime re-ensures at mount anyway).
  await ensureDepsLink(options.dshHome)
  return { id: manifest.id, record, manifest }
}

/**
 * Set the enabled state of an installed plugin.
 * @param dshHome - harness home whose registry is updated.
 * @param id - the installed plugin id.
 * @param enabled - the new enabled state.
 */
export function setEnabled(dshHome: string, id: string, enabled: boolean): Promise<void> {
  return withRegistryLock(dshHome, () => setEnabledLocked(dshHome, id, enabled))
}

async function setEnabledLocked(dshHome: string, id: string, enabled: boolean): Promise<void> {
  const index = await readIndex(dshHome)
  const record = index[id]
  if (record === undefined) throw new Error(`plugin ${id} is not installed`)
  if (record.enabled !== enabled) {
    record.enabled = enabled
    await writeIndex(dshHome, index)
  }
}

/**
 * Uninstall a plugin: remove its directory and drop its index record. The
 * directory removal is idempotent, so a failed index write leaves a state
 * that is safe to retry.
 * @param dshHome - harness home whose registry is updated.
 * @param id - the installed plugin id.
 */
export function uninstallPlugin(dshHome: string, id: string): Promise<void> {
  return withRegistryLock(dshHome, () => uninstallPluginLocked(dshHome, id))
}

async function uninstallPluginLocked(dshHome: string, id: string): Promise<void> {
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

/** Chain tail per harness home: serializes registry mutations process-locally. */
const registryQueues = new Map<string, Promise<unknown>>()

/**
 * Run a registry mutation under a per-harness-home serial queue, so
 * read-modify-write sequences (install, enable, uninstall) never interleave
 * and a concurrent batch cannot drop updates. The queue tail swallows errors
 * so one failed mutation never blocks later ones.
 * @param dshHome - harness home whose registry queue is used.
 * @param task - the mutation to run after all earlier ones settle.
 * @returns the task's promise, preserving its rejection.
 */
function withRegistryLock<T>(dshHome: string, task: () => Promise<T>): Promise<T> {
  const tail = registryQueues.get(dshHome) ?? Promise.resolve()
  const run = tail.then(task, task)
  registryQueues.set(dshHome, run.then(() => undefined, () => undefined))
  return run
}
