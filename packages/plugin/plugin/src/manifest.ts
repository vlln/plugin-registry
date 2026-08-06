/**
 * Manifest protocol for locally installed harness plugins: schema validation
 * and engine compatibility. A manifest is the declaration layer a plugin
 * author ships; the registry installs it, the runtime mounts its entry.
 *
 * @module @deepseek-ai/dsh-plugin/manifest
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import z from 'schemastery'
import type Schema from 'schemastery'
import { satisfies } from 'semver'
import { MANIFEST_FILE_NAME, type PluginEngines, type PluginManifest } from './types.ts'

export type { PluginManifest } from './types.ts'

/** Schemastery validator for the manifest `engines` block. */
export const EnginesSchema: Schema<PluginEngines> = z.object({
  dsh: z.string(),
})

/** Schemastery validator for the manifest `contributes` block. */
export const ContributesSchema: Schema<PluginManifest['contributes']> = z.object({
  tools: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
})

/**
 * Schemastery validator for the manifest `client` block. The `.default(undefined)`
 * is load-bearing: schemastery fills a missing object field with the schema's
 * default (an object's default is `{}`), so without it an absent `client`
 * would come back as `{}` instead of being omitted. `main` cannot be marked
 * required here for the same reason — a nested `.required()` would reject a
 * manifest that omits `client` entirely; the caller (installPlugin) checks
 * `client.main` presence instead.
 */
export const ClientSchema: Schema<NonNullable<PluginManifest['client']>> = z.object({
  main: z.string(),
  inject: z.array(z.string()),
  immediately: z.boolean(),
  // `never` satisfies the `default(value: T)` signature where T is the full
  // object type; the runtime default is deliberately undefined so an absent
  // `client` field stays omitted instead of becoming `{}`.
}).default(undefined as never)

/** Schemastery validator for the whole {@link PluginManifest}. */
export const ManifestSchema: Schema<PluginManifest> = z.object({
  // The negative lookahead keeps the first segment off `node_modules`, which
  // would resolve through the shared dependency link into the checkout (see
  // pluginDir's guard — the schema is the earlier, louder failure).
  // Two id conventions coexist: the native `publisher/name` and the scoped
  // npm package name `@scope/name` (the incremental-compat bridge for
  // official-format plugins, whose client bundle id is their package name).
  // Both stay exactly two slash-separated segments; segments are lowercase
  // alphanumerics plus `-`/`.`, never `.`/`..`, `?`/`#`/`%`, or control
  // chars (url contract and plugin-dir safety — see
  // docs/official-plugin-incremental-compat.md).
  id: z.string().pattern(
    /^(?!node_modules\/)(?:@[a-z0-9][a-z0-9-.]*\/[a-z0-9][a-z0-9-.]*|[a-z0-9][a-z0-9-.]*\/[a-z0-9][a-z0-9-.]*)$/,
  ),
  version: z.string(),
  main: z.string(),
  description: z.string().default(''),
  engines: EnginesSchema.default({ dsh: '>=0.0.1' }),
  contributes: ContributesSchema.default({ tools: [], skills: [] }),
  client: ClientSchema,
})

/** The plugin id for a publisher and name pair, as validated by the schema. */
export type PluginId = string

/**
 * Parse and validate manifest text. Fails loud with the offending id segments
 * named so an author can fix the manifest without reading the harness.
 * @param text - raw manifest file content.
 * @param source - display name of the manifest location for error messages.
 * @returns the validated manifest.
 */
export function parseManifest(text: string, source: string): PluginManifest {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    // JSON.parse rejects only with a SyntaxError, whose message is always present.
    throw new Error(`invalid JSON in ${source}: ${(error as SyntaxError).message}`)
  }
  return ManifestSchema(raw as PluginManifest | null)
}

/**
 * Read and validate the manifest of a plugin root directory.
 * @param pluginRoot - directory containing `dsh.plugin.json`.
 * @returns the validated manifest.
 */
export async function readManifest(pluginRoot: string): Promise<PluginManifest> {
  const file = join(pluginRoot, MANIFEST_FILE_NAME)
  const text = await readFile(file, 'utf8')
  return parseManifest(text, file)
}

/**
 * Assert the running harness version satisfies the manifest engine range.
 * @param engines - the manifest's declared engine ranges.
 * @param harnessVersion - the running DeepSeek Harness version.
 */
export function checkEngine(engines: PluginEngines, harnessVersion: string): void {
  if (!satisfies(harnessVersion, engines.dsh)) {
    throw new Error(
      `plugin requires dsh ${engines.dsh}, running ${harnessVersion}`,
    )
  }
}
