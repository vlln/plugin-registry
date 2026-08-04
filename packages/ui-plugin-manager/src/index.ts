/**
 * Plugin manager surface plugin, node half. The empty apply exists so the
 * plugin appears in the host cordis.yml / Loader; the browser half ships the
 * Settings plugin panel through exports["./client"], discovered from the
 * package.json dshClient declaration.
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
