/**
 * Tarball installation: `dsh plugin install foo.tgz` — the single-file
 * distribution unit for plugins. The tarball is extracted into a staging
 * directory (strict mode rejects path traversal), the plugin root inside it
 * is located, and the existing directory installer takes over, so tarball
 * installs get the same manifest and engine validation as directory installs.
 *
 * @module @deepseek-ai/dsh-plugin/tarball
 */

import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { x as extractTarball } from 'tar'
import { MANIFEST_FILE_NAME } from './types.ts'
import { readManifest } from './manifest.ts'
import { installPlugin, type InstallOptions, type ListedPlugin } from './registry.ts'

/** Accepted tarball suffixes. */
export const TARBALL_EXTENSIONS = ['.tgz', '.tar.gz'] as const

/**
 * Whether a path names a tarball by suffix.
 * @param path - the candidate install source.
 * @returns whether the path ends in a recognized tarball suffix.
 */
export function isTarball(path: string): boolean {
  return TARBALL_EXTENSIONS.some(extension => path.endsWith(extension))
}

/**
 * Install a plugin from a `.tgz`/`.tar.gz` file. The tarball is extracted
 * with strict traversal protection into a staging directory, the plugin root
 * inside it is located (the archive root, or a single top-level directory
 * containing `dsh.plugin.json`), and {@link installPlugin} validates and
 * copies it into the registry.
 * @param tarballPath - the tarball file path.
 * @param options - registry home and harness version.
 * @returns the installed plugin.
 */
export async function installFromTarball(tarballPath: string, options: InstallOptions): Promise<ListedPlugin> {
  const info = await stat(tarballPath)
  if (!info.isFile()) {
    throw new Error(`install expects a tarball file or plugin directory, got ${JSON.stringify(tarballPath)}`)
  }
  const staging = await mkdtemp(join(tmpdir(), 'dsh-plugin-tgz-'))
  try {
    await extractTarball({ file: tarballPath, cwd: staging, strict: true })
    const root = await locatePluginRoot(staging)
    const installed = await installPlugin(root, options)
    return installed
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

/**
 * Locate the plugin root inside an extracted staging directory: the staging
 * directory itself when it holds `dsh.plugin.json`, else the single
 * top-level subdirectory that does. Anything else fails loud.
 * @param staging - the extraction target directory.
 * @returns the plugin root directory.
 */
export async function locatePluginRoot(staging: string): Promise<string> {
  try {
    await readManifest(staging)
    return staging
  } catch {
    // fall through to the single-subdirectory search
  }
  const entries = await readdir(staging, { withFileTypes: true })
  const candidates = entries.filter(entry => entry.isDirectory() && entry.name !== 'node_modules')
  for (const entry of candidates) {
    try {
      await readManifest(join(staging, entry.name))
      return join(staging, entry.name)
    } catch {
      // not this one
    }
  }
  throw new Error(`tarball contains no plugin root: no ${MANIFEST_FILE_NAME} at the archive root or in a single top-level directory`)
}
