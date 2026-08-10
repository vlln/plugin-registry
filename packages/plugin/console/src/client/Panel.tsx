/**
 * 薄控制台面板：
 * 1. 已加载插件（读 boot 图 __DSH_BOOT__.entries）——Pill 状态 + 启停（写
 *    profile 级 cordis.patch.yml 的 disabled 标记）
 * 2. repository 插件（.dsh-plugin 包）——repositories 列表增删 + 检查更新
 * 官方组件（Button/Input/Pill）对齐设置页视觉；零 CSS 依赖（官方组件自带
 * module css，经 __ModuleLoader__ 加载）。
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Input, Pill } from '@deepseek-ai/dsh-client-ui-primitives'

interface RepositoryState {
  repositories: string[]
  present: boolean
}

/** 一个 repository 源的更新检查结果（Node half /api/plugin-console/updates）。 */
interface UpdateRow {
  source: string
  ref: string
  refKind: 'sha' | 'branch'
  latestSha: string | null
  hasUpdate: boolean
  error?: string
}

/** loader 树已加载插件（Node half /installed，实时）。 */
interface LoadedPluginRow {
  id: string
  name: string
  disabled: boolean
  version?: string
}

const versionTextStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--dsw-alias-label-caption)',
  whiteSpace: 'nowrap',
  fontFamily: 'ui-monospace, monospace',
}

/** 版本行：v当前 · latest（可更新时高亮）；本地/非 registry 包无 latest。 */
function versionText(plugin: LoadedPluginRow, latest: string | null, checked: boolean): { text: string; canUpdate: boolean } {
  const current = plugin.version === undefined ? '?' : `v${plugin.version}`
  if (!checked) return { text: `${current} · 待检查`, canUpdate: false }
  if (latest === null) return { text: `${current} · 本地`, canUpdate: false }
  if (latest === plugin.version) return { text: `${current} · 已最新`, canUpdate: false }
  return { text: `${current} → v${latest}`, canUpdate: true }
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '6px 10px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  marginBottom: 6,
}

const rowTitleStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 13,
  color: 'var(--dsw-alias-label-primary)',
  fontFamily: 'ui-monospace, monospace',
}

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--dsw-alias-label-primary)',
}

const hintStyle: React.CSSProperties = {
  margin: '2px 0 8px',
  fontSize: 12,
  color: 'var(--dsw-alias-label-caption)',
}

const shortSha = (sha: string): string => sha.slice(0, 7)

/** repository 源行的更新状态文本。 */
function updateText(row: UpdateRow): string {
  if (row.error !== undefined) return '无法检查'
  if (row.latestSha === null) return '未知'
  if (row.refKind === 'sha' && !row.hasUpdate) return `已最新 ${shortSha(row.ref)}`
  if (row.refKind === 'sha') return `有更新 ${shortSha(row.ref)}→${shortSha(row.latestSha)}`
  return `分支 ${row.ref}@${shortSha(row.latestSha)}`
}

/** 设置页面板主体。 */
export function ConsolePanel(): React.ReactNode {
  const [state, setState] = useState<RepositoryState>({ repositories: [], present: false })
  const [installed, setInstalled] = useState<LoadedPluginRow[]>([])
  const [showAll, setShowAll] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [updates, setUpdates] = useState<UpdateRow[] | undefined>(undefined)
  const [checking, setChecking] = useState(false)
  const [bundleInput, setBundleInput] = useState('')
  const [bundleBusy, setBundleBusy] = useState(false)
  const [bundleMsg, setBundleMsg] = useState<string | undefined>(undefined)
  const [versions, setVersions] = useState<Record<string, string | null>>({})
  const [versionChecked, setVersionChecked] = useState<Record<string, boolean>>({})
  const [versionBusy, setVersionBusy] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [repoRes, installedRes, versionsRes] = await Promise.all([
        fetch('/api/plugin-console/repositories', { headers: { accept: 'application/json' } }),
        fetch('/api/plugin-console/installed', { headers: { accept: 'application/json' } }),
        fetch('/api/plugin-console/versions', { headers: { accept: 'application/json' } }),
      ])
      const repoBody = (await repoRes.json()) as RepositoryState & { ok?: boolean }
      const installedBody = (await installedRes.json()) as { plugins?: LoadedPluginRow[]; ok?: boolean }
      const versionsBody = (await versionsRes.json()) as { versions?: { name: string; latest: string | null; checked?: boolean }[]; ok?: boolean }
      setState({ repositories: repoBody.repositories ?? [], present: repoBody.present ?? false })
      setInstalled(installedBody.plugins ?? [])
      const map: Record<string, string | null> = {}
      const checkedMap: Record<string, boolean> = {}
      for (const row of versionsBody.versions ?? []) {
        map[row.name] = row.latest
        checkedMap[row.name] = row.checked === true
      }
      setVersions(map)
      setVersionChecked(checkedMap)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  const save = useCallback(async (repositories: string[]): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const response = await fetch('/api/plugin-console/repositories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repositories }),
      })
      const body = (await response.json()) as { ok?: boolean; message?: string }
      if (body.ok !== true) throw new Error(body.message ?? 'save failed')
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [refresh])

  /** 运行时启停（loader 树立即生效）+ 写 profile patch 持久化。 */
  const togglePlugin = useCallback(async (id: string, disabled: boolean): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const response = await fetch(`/api/plugin-console/installed/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ disabled }),
      })
      const body = (await response.json()) as { ok?: boolean; message?: string }
      if (body.ok !== true) throw new Error(body.message ?? 'toggle failed')
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [refresh])

  /** 检查全部 repository 源的远端更新状态。 */
  const checkUpdates = useCallback(async (): Promise<void> => {
    setChecking(true)
    setError(undefined)
    try {
      const response = await fetch('/api/plugin-console/updates', { headers: { accept: 'application/json' } })
      const body = (await response.json()) as { ok?: boolean; updates?: UpdateRow[]; message?: string }
      if (body.ok !== true) throw new Error(body.message ?? 'check failed')
      setUpdates(body.updates ?? [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setChecking(false)
    }
  }, [])

  /** 把指定源的 ref 更新为远端最新 commit（写配置，官方换代在下次启动）。 */
  const applyUpdate = useCallback(async (source: string): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const response = await fetch('/api/plugin-console/updates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source }),
      })
      const body = (await response.json()) as { ok?: boolean; message?: string }
      if (body.ok !== true) throw new Error(body.message ?? 'update failed')
      await refresh()
      await checkUpdates()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [refresh, checkUpdates])

  const add = useCallback(async (): Promise<void> => {
    const value = input.trim()
    if (value.length === 0) return
    if (!state.repositories.includes(value)) {
      await save([...state.repositories, value])
      setUpdates(undefined)
    }
    setInput('')
  }, [input, state.repositories, save])

  const remove = useCallback((id: string): void => {
    void save(state.repositories.filter(r => r !== id))
  }, [state.repositories, save])

  /** bundle 安装（profile 目录 pnpm add + reconcile 层栈）。 */
  const installBundle = useCallback(async (): Promise<void> => {
    const source = bundleInput.trim()
    if (source.length === 0) return
    setBundleBusy(true)
    setBundleMsg(undefined)
    setError(undefined)
    try {
      const response = await fetch('/api/plugin-console/bundles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'install', source }),
      })
      const body = (await response.json()) as { ok?: boolean; names?: string[]; message?: string }
      if (body.ok !== true) throw new Error(body.message ?? 'install failed')
      setBundleMsg(`已安装并加入层栈：${(body.names ?? []).join(', ') || source}（重启 web 生效）`)
      setBundleInput('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBundleBusy(false)
    }
  }, [bundleInput])

  /** 手动检查最新版本（POST refresh，Node half 30s 防抖）。 */
  const refreshVersions = useCallback(async (): Promise<void> => {
    setVersionBusy(true)
    setError(undefined)
    try {
      const response = await fetch('/api/plugin-console/versions/refresh', { method: 'POST', headers: { accept: 'application/json' } })
      const body = (await response.json()) as { versions?: { name: string; latest: string | null; checked?: boolean }[]; message?: string }
      const map: Record<string, string | null> = {}
      const checkedMap: Record<string, boolean> = {}
      for (const row of body.versions ?? []) {
        map[row.name] = row.latest
        checkedMap[row.name] = row.checked === true
      }
      setVersions(map)
      setVersionChecked(checkedMap)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setVersionBusy(false)
    }
  }, [])

  /** bundle 更新（pnpm update <name>，拉取最新版本）。 */
  const updateBundle = useCallback(async (name: string): Promise<void> => {
    setBundleBusy(true)
    setBundleMsg(undefined)
    setError(undefined)
    try {
      const response = await fetch('/api/plugin-console/bundles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'update', name }),
      })
      const body = (await response.json()) as { ok?: boolean; message?: string }
      if (body.ok !== true) throw new Error(body.message ?? 'update failed')
      setBundleMsg(`${name} 已更新（重启 web 生效）`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBundleBusy(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  if (loading) return <p style={{ color: 'var(--dsw-alias-label-tertiary)' }}>加载中…</p>

  // 区分产品内置（@deepseek-ai/*、@cordisjs/*、cordis: 组合）与用户添加。
  const isOfficial = (p: LoadedPluginRow): boolean =>
    p.name.startsWith('@deepseek-ai/') || p.name.startsWith('@cordisjs/') || p.name.startsWith('cordis:')
  const official = installed.filter(isOfficial)
  const user = installed.filter(p => !isOfficial(p))
  const shown = showAll ? installed : user

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720, color: 'var(--dsw-alias-label-primary)' }}>
      {error !== undefined ? <p role="alert" style={{ color: 'var(--dsw-alias-danger, #d93026)' }}>{error}</p> : null}

      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <h3 style={sectionTitleStyle}>已加载插件（{user.length} 用户 / {official.length} 内置）</h3>
            <p style={hintStyle}>启停立即生效并持久化；版本经启动预扫描 + 手动检查缓存（不频繁打 registry）。</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" variant="ghost" disabled={versionBusy} onClick={() => { void refreshVersions() }}>
              {versionBusy ? '检查中…' : '检查最新版本'}
            </Button>
            {official.length > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => { setShowAll(v => !v) }}>
                {showAll ? '只看用户插件' : `查看所有（${installed.length}）`}
              </Button>
            ) : null}
          </div>
        </div>
        {shown.map(plugin => {
          const latest = versions[plugin.name] ?? null
          const version = versionText(plugin, latest, versionChecked[plugin.name] === true)
          return (
            <div key={plugin.id} style={rowStyle}>
              <span style={rowTitleStyle}>
                {plugin.name}
                <span style={{ display: 'block', ...versionTextStyle }}>{version.text}</span>
              </span>
              {official.includes(plugin) ? <Pill>内置</Pill> : null}
              <Pill active={!plugin.disabled}>{plugin.disabled ? '已停用' : '运行中'}</Pill>
              {!official.includes(plugin) && version.canUpdate ? (
                <Button size="sm" variant="ghost" disabled={busy || bundleBusy} onClick={() => { void updateBundle(plugin.name) }}>更新</Button>
              ) : null}
              <Button size="sm" disabled={busy} onClick={() => { void togglePlugin(plugin.id, !plugin.disabled) }}>
                {plugin.disabled ? '启用' : '停用'}
              </Button>
            </div>
          )
        })}
      </section>

      <section>
        <h3 style={sectionTitleStyle}>安装 bundle 插件</h3>
        <p style={hintStyle}>pnpm add 到 profile 并加入层栈；安装/更新后重启 web 生效。</p>
        {bundleMsg !== undefined ? <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--dsw-alias-success, #1a7f37)' }}>{bundleMsg}</p> : null}
        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            style={{ flex: 1 }}
            value={bundleInput}
            placeholder="git+file:///path/to/plugin 或 registry 包名"
            onChange={(e) => { setBundleInput(e.target.value) }}
            aria-label="bundle 插件源"
          />
          <Button size="sm" disabled={busy || bundleBusy} onClick={() => { void installBundle() }}>
            {bundleBusy ? '安装中…' : '安装'}
          </Button>
        </div>
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <h3 style={sectionTitleStyle}>repository 插件（.dsh-plugin）</h3>
            <p style={hintStyle}>源列表写 home 级配置；更新 = 固定到远端最新 commit。</p>
          </div>
          <Button size="sm" disabled={busy || checking} onClick={() => { void checkUpdates() }}>
            {checking ? '检查中…' : '检查更新'}
          </Button>
        </div>
        {!state.present && state.repositories.length === 0 ? (
          <p style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 }}>未配置 repository 插件源。</p>
        ) : null}
        {state.repositories.map(id => {
          const upd = updates?.find(u => u.source === id)
          const canUpdate = upd !== undefined && (upd.hasUpdate || upd.refKind === 'branch') && upd.latestSha !== null
          return (
            <div key={id} style={rowStyle}>
              <span style={rowTitleStyle}>{id}</span>
              {upd !== undefined ? <Pill active={!upd.hasUpdate && upd.error === undefined && upd.latestSha !== null}>{updateText(upd)}</Pill> : null}
              {canUpdate ? (
                <Button size="sm" disabled={busy} onClick={() => { void applyUpdate(id) }}>更新</Button>
              ) : null}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { remove(id) }}>移除</Button>
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <Input
            style={{ flex: 1 }}
            value={input}
            placeholder="github:owner/repo#ref"
            onChange={(e) => { setInput(e.target.value) }}
            aria-label="新增插件源"
          />
          <Button size="sm" disabled={busy} onClick={() => { void add() }}>添加</Button>
        </div>
      </section>

      <p style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>
        修改写入 $DSH_HOME/cordis.patch.yml；web 默认无运行中 HMR，重启后生效。
      </p>
    </div>
  )
}
