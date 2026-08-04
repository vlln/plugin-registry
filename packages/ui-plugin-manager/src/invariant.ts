/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-plugin-manager`.
 * @module @deepseek-ai/dsh-client-ui-plugin-manager/invariant
 */

/* jscpd:ignore-start */
import type { Context } from 'cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-plugin-manager'

/** Cordis companion plugin name. */
export const name = 'client-ui-plugin-manager-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the settings-section contribution lifecycle is
 * proven by the HMR-safety spec, while the browser-only panel owns no host
 * events or cross-plugin mutable state.
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
