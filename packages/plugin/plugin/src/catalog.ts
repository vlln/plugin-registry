/**
 * Local plugin catalog: the browse/install data source for the web plugin
 * panel. One JSON file under the harness home lists discoverable plugins with
 * a local source directory each — the Obsidian community-plugins shape with
 * local paths, so the same client flow later swaps this file for a remote
 * registry without touching the API or UI.
 *
 * @module @deepseek-ai/dsh-plugin/catalog
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import z from 'schemastery'
import type Schema from 'schemastery'
import type { CatalogEntry } from './types.ts'
import { installPlugin, type InstallOptions, type ListedPlugin } from './registry.ts'

/** File name of the local plugin catalog under the harness home. */
export const CATALOG_FILE_NAME = 'plugins-catalog.json'

/** Schemastery validator for one catalog entry. */
export const CatalogEntrySchema: Schema<CatalogEntry> = z.object({
  id: z.string(),
  version: z.string(),
  description: z.string().default(''),
  source: z.string(),
})

/** Schemastery validator for the whole catalog file. */
export const CatalogSchema: Schema<CatalogEntry[]> = z.array(CatalogEntrySchema)

/**
 * Resolve the catalog file path for one harness home.
 * @param dshHome - the harness home.
 * @returns the absolute catalog file path.
 */
export function catalogFile(dshHome: string): string {
  return join(dshHome, CATALOG_FILE_NAME)
}

/**
 * Read the catalog, or an empty list when no catalog file exists. A corrupt
 * catalog fails loud so a typo never silently hides the whole browse list.
 * @param dshHome - the harness home.
 * @returns the catalog entries.
 */
export async function readCatalog(dshHome: string): Promise<CatalogEntry[]> {
  let text: string
  try {
    text = await readFile(catalogFile(dshHome), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  return CatalogSchema(JSON.parse(text) as CatalogEntry[] | null)
}

/**
 * Find one catalog entry by id.
 * @param dshHome - the harness home.
 * @param id - the catalog entry id.
 * @returns the entry, or undefined when absent.
 */
export async function findCatalogEntry(dshHome: string, id: string): Promise<CatalogEntry | undefined> {
  const entries = await readCatalog(dshHome)
  return entries.find(entry => entry.id === id)
}

/**
 * Install a catalog entry from its local source directory. The source's
 * manifest is the authority: engine range and entry presence are checked
 * against it, exactly as a direct `dsh plugin install <dir>` would.
 * @param dshHome - the harness home.
 * @param id - the catalog entry id.
 * @param options - registry home and harness version for {@link installPlugin}.
 * @returns the installed plugin.
 */
export async function installFromCatalog(dshHome: string, id: string, options: InstallOptions): Promise<ListedPlugin> {
  const entry = await findCatalogEntry(dshHome, id)
  if (entry === undefined) throw new Error(`plugin ${id} is not in the catalog`)
  return installPlugin(entry.source, options)
}
