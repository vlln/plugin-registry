/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-plugin`.
 * @module @deepseek-ai/dsh-plugin/invariant
 */

/* jscpd:ignore-start */
import type { Context } from 'cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-plugin'

/** Cordis companion plugin name. */
export const name = 'plugin-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the registry is plain filesystem state validated at
 * install time, and mounting is a load-time effect owned by the caller's
 * fiber; neither owns an authoritative event stream a runtime check could
 * assert against.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
