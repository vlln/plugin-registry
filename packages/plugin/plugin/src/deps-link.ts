/**
 * Plugin dependency resolution: installed plugins live under
 * `<dshHome>/plugins`, outside the harness checkout, so standard Node
 * bare-specifier resolution — which walks upward from the importing file —
 * can never reach the checkout's `node_modules`. One shared `node_modules`
 * directory link at the registry root bridges the gap: `@deepseek-ai/*`,
 * `cordis`, and every other package in the checkout's dependency closure
 * resolve with standard Node semantics in any runtime form (source under
 * tsx's paths map, or built under plain Node).
 *
 * The link is best-effort, not a contract: a plugin that never imports a
 * checkout package needs no link, and a deployment that cannot resolve a
 * checkout (e.g. a single-file bundle) skips it. A stale link (the checkout
 * rotated on upgrade) is rebuilt on the next ensure.
 *
 * @module @deepseek-ai/dsh-plugin/deps-link
 */

import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { mkdir, rm, symlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pluginsRoot } from './registry.ts'

/** Checkout marker: the directory that holds the harness `packages/` tree. */
const CHECKOUT_MARKER = 'packages'

/** Launcher names per platform, in resolution order (the win-port ships `.cmd`). */
const LAUNCHER_NAMES = process.platform === 'win32' ? ['dsh.cmd', 'dsh.exe', 'dsh'] : ['dsh']

/**
 * Resolve the harness checkout that owns this module: the nearest ancestor of
 * `entryUrl` (or of the `dsh` launcher on PATH) that contains a `packages/`
 * directory. Returns undefined when no checkout is reachable — the caller
 * treats the dependency link as unavailable, not as an error.
 * @param entryUrl - `import.meta.url` of a module inside the checkout; omit to
 *   resolve the `dsh` launcher on PATH instead.
 * @returns the checkout root, or undefined.
 */
export function resolveCheckout(entryUrl?: string): string | undefined {
  if (entryUrl !== undefined) {
    let dir = dirname(fileURLToPath(entryUrl))
    for (;;) {
      if (existsSync(join(dir, CHECKOUT_MARKER))) return dir
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  for (const dir of (process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':')) {
    for (const name of LAUNCHER_NAMES) {
      const launcher = join(dir, name)
      if (!existsSync(launcher)) continue
      try {
        // The launcher resolves (through its symlink chain) to
        // <checkout>/bin/dsh; the checkout is two levels up.
        const candidate = dirname(dirname(realpathSync(launcher)))
        if (existsSync(join(candidate, CHECKOUT_MARKER))) return candidate
      } catch {
        // broken launcher link — keep scanning
      }
    }
  }
  return undefined
}

/**
 * Ensure the shared dependency link `<dshHome>/plugins/node_modules` exists
 * and points at the current checkout's `node_modules`. Idempotent: an
 * existing link that still resolves to the current target is kept; a stale
 * or missing link is rebuilt. Windows uses a directory junction (ordinary
 * symlinks need privilege).
 * @param dshHome - harness home whose registry gains the link.
 * @param checkout - the checkout to link against; defaults to the checkout
 *   that owns this module.
 * @returns whether the link is in place (false when no checkout is
 *   reachable, the checkout has no node_modules, or the link could not be
 *   created — the registry still works for plugins that never import
 *   checkout packages).
 */
export async function ensureDepsLink(
  dshHome: string,
  checkout: string | undefined = resolveCheckout(import.meta.url),
): Promise<boolean> {
  if (checkout === undefined) return false
  const target = join(checkout, 'node_modules')
  if (!existsSync(target)) return false
  const link = join(pluginsRoot(dshHome), 'node_modules')
  await mkdir(pluginsRoot(dshHome), { recursive: true })
  try {
    // An existing link is kept while it still resolves to the current
    // target; a checkout upgrade rotates the path, so a stale link must be
    // rebuilt rather than trusted.
    if (realpathSync(link) === realpathSync(target)) return true
  } catch {
    // stale link (target gone) or no link at all: rebuild below
  }
  await rm(link, { recursive: true, force: true })
  try {
    if (process.platform === 'win32') {
      execFileSync('cmd', ['/c', 'mklink', '/J', link, target], { stdio: 'pipe' })
    } else {
      await symlink(target, link, 'dir')
    }
    return true
  } catch {
    // No privilege or a filesystem that refuses links: plugins that never
    // import checkout packages are unaffected.
    return false
  }
}
