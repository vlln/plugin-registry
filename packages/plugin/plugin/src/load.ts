/**
 * Runtime mounting of enabled local plugins: import each enabled plugin's
 * entry module and mount it as a child of one group fiber, so disposal of the
 * group unwinds every mounted plugin predictably.
 *
 * @module @deepseek-ai/dsh-plugin/load
 */

import type { Plugin } from 'cordis'

/**
 * Narrow a module namespace to a mountable cordis plugin: the Loader's
 * `default ?? module` normalization, plus a shape check so a missing or
 * mis-exported entry fails loud instead of mounting `undefined`.
 * @param module - the imported entry module namespace.
 * @returns the mountable plugin.
 */
export function normalizePlugin(module: unknown): Plugin {
  const candidate = (module as { default?: unknown } | undefined)?.default ?? module
  if (typeof candidate === 'function') return candidate as Plugin
  if (typeof candidate === 'object' && candidate !== null
    && typeof (candidate as { apply?: unknown }).apply === 'function') {
    return candidate as Plugin
  }
  throw new Error(
    'plugin entry must default-export or named-export a cordis plugin '
    + '(a function, a class, or an object with apply)',
  )
}
