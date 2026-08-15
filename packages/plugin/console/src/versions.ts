/**
 * 版本检查：原生 fetch 查询 npm registry JSON API（零子进程）。
 *
 * 背景：旧实现 spawn `npm view <name> version` 并靠管道读 stdout——在受限
 * 宿主环境（sandboxed host）里子进程管道捕获会被拦截（EPERM），查询必然
 * 失败；且失败被空 catch 折叠成 null、照常写缓存，UI 永远显示「已检查但
 * 无更新」，用户无法区分「已是最新」「本地包」「检查失败」。
 *
 * 本实现不发任何子进程，任何环境可工作；404（非 registry 包：git/link
 * 依赖）与网络/HTTP 错误分开表达，调用方可区分「本地包」与「检查失败」。
 */
export interface VersionCheckResult {
  /** registry 最新版；非 registry 包（404）为 null。 */
  latest: string | null
  /** 检查失败原因（网络/超时/非 404 HTTP 错误）；成功或 404 为 null。 */
  error: string | null
}

const DEFAULT_REGISTRY = 'https://registry.npmjs.org'

/** npm registry 根（npm_config_registry 环境变量优先，兼容镜像源）。 */
export function registryRoot(): string {
  const configured = process.env.npm_config_registry
  return (configured !== undefined && configured.trim() !== '' ? configured : DEFAULT_REGISTRY).replace(/\/+$/, '')
}

/** scoped 包名（@scope/name）在 registry URL 路径中需把 / 编码为 %2f。 */
export function registryPackagePath(name: string): string {
  return name.startsWith('@') ? name.replace('/', '%2f') : name
}

/**
 * 查询某包在 registry 上的最新版本（GET <registry>/<name>/latest）。
 * 永不抛出：失败折叠为 { latest: null, error }，由调用方记录/展示。
 */
export async function npmViewLatest(name: string, fetchFn: typeof fetch = fetch): Promise<VersionCheckResult> {
  const url = `${registryRoot()}/${registryPackagePath(name)}/latest`
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(15_000) })
    if (res.status === 404) return { latest: null, error: null }
    if (!res.ok) return { latest: null, error: `registry ${res.status}` }
    const data = await res.json() as { version?: string }
    return { latest: data.version ?? null, error: null }
  } catch (caught) {
    return { latest: null, error: caught instanceof Error ? caught.message : String(caught) }
  }
}
