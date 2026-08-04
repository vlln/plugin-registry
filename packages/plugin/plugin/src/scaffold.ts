/**
 * Plugin scaffolding: generate a valid plugin root (`dsh.plugin.json` +
 * entry + README) so an author starts from a manifest that already passes
 * install-time validation.
 *
 * @module @deepseek-ai/dsh-plugin/scaffold
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MANIFEST_FILE_NAME, type PluginManifest } from './types.ts'
import { parseManifest } from './manifest.ts'

/** Options for {@link scaffoldPlugin}. */
export interface ScaffoldOptions {
  /** Publisher-scoped plugin id, `publisher/name`. */
  id: string
  /** Directory the plugin root is created in. */
  dir: string
  /** Initial semver version; defaults to `0.1.0`. */
  version?: string
  /** One-line description; defaults to `"<name> plugin"`. */
  description?: string
}

/**
 * Create a plugin root directory with a valid manifest, a minimal entry, and
 * a README. The manifest is validated by the same parser install uses, so a
 * scaffolded plugin is guaranteed installable (until its author edits it).
 * @param options - id, output directory, and optional version/description.
 * @returns the created plugin root directory.
 */
export async function scaffoldPlugin(options: ScaffoldOptions): Promise<string> {
  // The manifest pattern guarantees a slash, so the segment after it is the name.
  const name = options.id.slice(options.id.lastIndexOf('/') + 1)

  const manifest: PluginManifest = {
    id: options.id,
    version: options.version ?? '0.1.0',
    main: './index.mjs',
    description: options.description ?? `${name} plugin`,
    engines: { dsh: '>=0.0.1' },
    contributes: { tools: [], skills: [] },
  }
  // Fail loud on an invalid id before any file is written.
  parseManifest(JSON.stringify(manifest), MANIFEST_FILE_NAME)
  await mkdir(options.dir, { recursive: true })
  await writeFile(join(options.dir, MANIFEST_FILE_NAME), `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(join(options.dir, 'index.mjs'), ENTRY_TEMPLATE)
  await writeFile(join(options.dir, 'README.md'), readmeTemplate(manifest))
  return options.dir
}

/** The minimal Cordis plugin entry a scaffolded plugin starts from. */
const ENTRY_TEMPLATE = `// A Cordis plugin: a function, a class, or an object with \`apply(ctx)\`.
// Register capabilities through ctx services — tools on ctx.tools, events
// with ctx.on, prompt sections on ctx.systemPrompt. Declare services your
// plugin needs in \`inject\` so Cordis waits for them.
//
// Example tool registration (requires the composition to mount dsh-tools):
//   inject: ['tools'],
//   apply(ctx) {
//     ctx.tools.register(defineTool({ ... }))
//   }
export default {
  name: 'scaffolded',
  apply(ctx) {
    // Your plugin body.
  },
}
`

/** README template for a scaffolded plugin root. */
function readmeTemplate(manifest: PluginManifest): string {
  return `# ${manifest.id}

${manifest.description}

## Develop

\`dsh plugin install .\` installs this plugin (disabled by default), then
\`dsh plugin enable ${manifest.id}\` activates it. Edit \`index.mjs\` and the
\`contributes\` block in \`${MANIFEST_FILE_NAME}\` together: every tool listed
in \`contributes.tools\` must be registered by the entry, or the mount fails.
`
}
