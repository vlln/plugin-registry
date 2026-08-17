/**
 * 安装源规范化与已装包名解析（0817 修 #19 / #4 假成功部分）。
 *
 * - normalizeSource：把完整 GitHub 项目 URL（https://github.com/o/r、
 *   github.com/o/r）规范化为 pnpm 的 github:o/r 速记——pnpm 装完依赖值
 *   就是 github:o/r 形态，统一后依赖匹配、层栈登记与 lock 记录共用同一
 *   形态；npm 包名 / github:o/r / link: 等原样透传。保留 #ref（含
 *   &path: 子目录）后缀，/tree/<branch> 网页路径映射为 #branch。
 * - resolveInstalledName：pnpm add 后从 profile 依赖解析真实包名——源串
 *   可能是指向路径/git 的安装源（/path/to/pkg、github:o/r#ref），依赖
 *   key 才是包名（pnpm 按包的真实 name 写入 package.json）。先精确匹配，
 *   再回退到依赖值包含源串的 key。找不到返回 null。
 *
 * 工具面（discovery/tools.ts）与 HTTP 面（index.ts 安装路由）共用本模块，
 * 避免两处行为分叉（#19 根因之一）。
 */
export function normalizeSource(source: string): string {
  const s = source.trim()
  const m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/#?]+)(.*)$/.exec(s)
  if (m === null) return s
  let repo = `${m[1]}/${m[2]}`
  if (repo.endsWith('.git')) repo = repo.slice(0, -'.git'.length)
  let suffix = m[3] ?? ''
  // 丢弃查询串（?tab=... 等非安装规格）。
  const query = suffix.indexOf('?')
  if (query !== -1) suffix = suffix.slice(0, query)
  // /tree/<branch> 网页路径 → #branch；其余子路径不可安装，退回根。
  const tree = /^\/tree\/(.+)$/.exec(suffix)
  if (tree !== null) suffix = `#${tree[1]}`
  else if (suffix.startsWith('/')) suffix = ''
  return `github:${repo}${suffix}`
}

/** 从 profile 依赖解析 pnpm add 后写入的真实包名；无匹配返回 null。 */
export function resolveInstalledName(
  manifest: { dependencies?: Record<string, string> } | null | undefined,
  source: string,
): string | null {
  const deps = manifest?.dependencies ?? {}
  if (typeof deps[source] === 'string') return source
  const hit = Object.keys(deps).find(key => deps[key] === source || deps[key]?.includes(source))
  return hit ?? null
}
