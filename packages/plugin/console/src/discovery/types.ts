/**
 * 插件发现层类型：源集合（sources.yml）／插件描述符／枚举快照／TOFU 锁
 * （lock.yml）。协议定稿见 docs/plugin-discovery-design.md。
 */

/** sources.yml 中一个源条目（用户可编辑配置，唯一配置入口）。 */
export interface PluginSource {
  /** 源 id（cache/<source-id>/ 目录名）。 */
  id: string
  /** 枚举协议：读现成索引 / 手写清单 / 单仓库探测。 */
  kind: 'index' | 'manifest' | 'single'
  /** 定位：index 的 JSON/git URL、manifest 的本地文件、single 的官方源串。 */
  locator: string
  /** 信任层级（供应链防线；缺省 community）。 */
  trust?: 'official' | 'community' | 'untrusted'
}

/** 插件能力面（从插件 dsh 字段派生）。 */
export type PluginFace = 'tool' | 'skill' | 'mcp' | 'ui' | 'bundle'

/** 统一插件条目（枚举结果，first-index：sourceId 记录归属源）。 */
export interface PluginEntry {
  /** 插件 id（npm 包名 / 仓库名）。 */
  id: string
  /** 官方安装形态。 */
  kind: 'repository' | 'bundle'
  /** 官方格式源（github:o/r#ref&path 或 npm 包）。 */
  source: string
  /** 索引源可能无精确 ref（install 前解析）。 */
  refHint: string | null
  /** 能力面。 */
  faces: PluginFace[]
  /** 一句话描述。 */
  description?: string
  /** 归属源 id（多源不合并候选池）。 */
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

/** lock.yml 条目（TOFU：resolved commit + 内容哈希，防 ref 内容漂移）。 */
export interface LockEntry {
  /** canonical 身份（owner/repo 或包名）。 */
  canonical: string
  kind: 'repository' | 'bundle'
  /** 固化的精确 ref（install 时解析出的 commit sha 或 tag 的解析结果）。 */
  ref: string
  /** 内容哈希（cargo cksum 式；repository 可记 resolved commit 本身）。 */
  hash?: string
  recordedAt: string
}
