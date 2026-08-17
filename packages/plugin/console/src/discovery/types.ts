/**
 * 发现层类型（0813 适配）：外部插件只有 profile bundle 一条官方安装路径。
 * - 源集合（sources.yml）：索引源 = 组织级 hub index.json
 *   （schema plugin-sources/index/v1，唯一现成官方可装插件索引）。
 * - 安装态 = profile 的 `dsh.profile.bundles`（bundle 插件）＋ profile
 *   `cordis.patch.yml` 的 insert 行（非 bundle 插件，配置 HMR 实时挂载）。
 * - TOFU 锁（lock.yml）：记录 resolved 包引用，防内容漂移。
 */

/** sources.yml 中一个源条目（用户可编辑配置）。 */
export interface PluginSource {
  /** 源 id（cache/<source-id>/ 目录名）。 */
  id: string
  /** 枚举协议：读现成索引。 */
  kind: 'index'
  /** 定位：hub catalog 的 URL 或本地文件路径。 */
  locator: string
  /** 信任层级（供应链防线；缺省 community）。 */
  trust?: 'official' | 'community' | 'untrusted'
}

/** 插件能力面（从 catalog 派生）。 */
export type PluginFace = 'tool' | 'skill' | 'mcp' | 'ui' | 'bundle'

/** 统一插件条目（枚举结果，first-index：sourceId 记录归属源）。 */
export interface PluginEntry {
  /** 插件 id = 安装规范（npm 包名），与 plugin_install/status 的 canonical 一致。 */
  id: string
  /** 官方安装形态：bundle 走 profile bundles 层；plugin 走 insert 行。 */
  kind: 'bundle' | 'plugin'
  /** 官方安装规范（npm 包名），可原样喂给 plugin_install。 */
  source: string
  /** 能力面。 */
  faces: PluginFace[]
  /** 一句话描述。 */
  description?: string
  /** 归属源 id。 */
  sourceId: string
}

/** 每源枚举快照（cache/<source-id>/entries.json，派生数据）。 */
export interface EnumerateSnapshot {
  /** 拉取时间（ISO）。 */
  fetchedAt: string
  /** 条件刷新用（304）。 */
  etag?: string
  entries: PluginEntry[]
}

/** lock.yml 条目（TOFU：resolved 引用）。 */
export interface LockEntry {
  /** canonical 身份（包名 / 仓库名）。 */
  canonical: string
  kind: 'bundle' | 'plugin'
  /** 固化的引用。 */
  ref: string
  /** 内容哈希（可选）。 */
  hash?: string
  recordedAt: string
}
