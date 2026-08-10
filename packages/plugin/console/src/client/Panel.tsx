/**
 * 薄控制台面板：两个管理区——
 * 1. repository 插件（.dsh-plugin 包）：repositories 列表增删
 * 2. UI 插件（bundle 插件）：disabled 标记启停
 * 经 /api/plugin-console 自建路由。零 CSS 依赖（inline 样式，对齐
 * create-dsh-plugin 的零 CSS 构建形态——保持构建链简单）。
 */
import { useCallback, useEffect, useState } from 'react'

interface RepositoryState {
  repositories: string[]
  present: boolean
}

interface UiPluginRow {
  id: string
  disabled: boolean
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

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '6px 10px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  marginBottom: 6,
}

const badgeStyle = (on: boolean): React.CSSProperties => ({
  display: 'inline-block',
  marginLeft: 8,
  padding: '1px 8px',
  borderRadius: 999,
  fontSize: 12,
  color: on ? 'var(--dsw-alias-success, #1a7f37)' : 'var(--dsw-alias-label-tertiary)',
  background: on ? 'var(--dsw-alias-success-weak, rgba(26,127,55,0.12))' : 'var(--dsw-alias-surface-l3)',
})

const shortSha = (sha: string): string => sha.slice(0, 7)

const updateBadgeStyle = (tone: 'ok' | 'warn' | 'error' | 'muted'): React.CSSProperties => ({
  display: 'inline-block',
  marginLeft: 8,
  padding: '1px 8px',
  borderRadius: 999,
  fontSize: 12,
  color: tone === 'ok'
    ? 'var(--dsw-alias-success, #1a7f37)'
    : tone === 'warn'
      ? 'var(--dsw-alias-warning, #9a6700)'
      : tone === 'error'
        ? 'var(--dsw-alias-danger, #d93026)'
        : 'var(--dsw-alias-label-tertiary)',
  background: tone === 'ok'
    ? 'var(--dsw-alias-success-weak, rgba(26,127,55,0.12))'
    : tone === 'warn'
      ? 'var(--dsw-alias-warning-weak, rgba(154,103,0,0.12))'
      : 'var(--dsw-alias-surface-l3)',
})

/** repository 源行的更新状态徽章。 */
function UpdateBadge({ row }: { row: UpdateRow }): React.ReactNode {
  if (row.error !== undefined) return <span style={updateBadgeStyle('error')}>无法检查</span>
  if (row.latestSha === null) return <span style={updateBadgeStyle('muted')}>未知</span>
  if (row.refKind === 'sha' && !row.hasUpdate) return <span style={updateBadgeStyle('ok')}>已最新 {shortSha(row.ref)}</span>
  if (row.refKind === 'sha') return <span style={updateBadgeStyle('warn')}>有更新 {shortSha(row.ref)}→{shortSha(row.latestSha)}</span>
  return <span style={updateBadgeStyle('warn')}>分支 {row.ref}@{shortSha(row.latestSha)}</span>
}

/** 设置页面板主体。 */
export function ConsolePanel(): React.ReactNode {
  const [state, setState] = useState<RepositoryState>({ repositories: [], present: false })
  const [uiPlugins, setUiPlugins] = useState<UiPluginRow[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [updates, setUpdates] = useState<UpdateRow[] | undefined>(undefined)
  const [checking, setChecking] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [repoRes, uiRes] = await Promise.all([
        fetch('/api/plugin-console/repositories', { headers: { accept: 'application/json' } }),
        fetch('/api/plugin-console/ui-plugins', { headers: { accept: 'application/json' } }),
      ])
      const repoBody = (await repoRes.json()) as RepositoryState & { ok?: boolean }
      const uiBody = (await uiRes.json()) as { plugins?: UiPluginRow[]; ok?: boolean }
      setState({ repositories: repoBody.repositories ?? [], present: repoBody.present ?? false })
      setUiPlugins(uiBody.plugins ?? [])
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

  const toggleUiPlugin = useCallback(async (id: string, disabled: boolean): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const response = await fetch(`/api/plugin-console/ui-plugins/${encodeURIComponent(id)}`, {
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

  useEffect(() => { void refresh() }, [refresh])

  if (loading) return <p style={{ color: 'var(--dsw-alias-label-tertiary)' }}>加载中…</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720, color: 'var(--dsw-alias-label-primary)' }}>
      {error !== undefined ? <p role="alert" style={{ color: 'var(--dsw-alias-danger, #d93026)' }}>{error}</p> : null}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>repository 插件（.dsh-plugin 包）</h3>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>
              配置在 home 级 $DSH_HOME/cordis.patch.yml，增删行 = 装/卸。
            </p>
          </div>
          <button type="button" disabled={busy || checking} onClick={() => { void checkUpdates() }}>
            {checking ? '检查中…' : '检查更新'}
          </button>
        </div>
        {!state.present ? <p style={{ color: 'var(--dsw-alias-label-tertiary)' }}>暂无 repository-plugins 行</p> : null}
        {state.repositories.length === 0 && state.present ? <p style={{ color: 'var(--dsw-alias-label-tertiary)' }}>已配置 0 个插件</p> : null}
        {state.repositories.map(id => {
          const upd = updates?.find(u => u.source === id)
          return (
            <div key={id} style={rowStyle}>
              <span style={{ flex: 1 }}>
                {id}
                <span style={badgeStyle(true)}>已装</span>
                {upd !== undefined ? <UpdateBadge row={upd} /> : null}
              </span>
              {upd !== undefined && (upd.hasUpdate || upd.refKind === 'branch') && upd.latestSha !== null && (
                <button type="button" disabled={busy} onClick={() => { void applyUpdate(id) }}>更新</button>
              )}
              <button type="button" disabled={busy} onClick={() => { void remove(id) }}>移除</button>
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ flex: 1, height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2)' }}
            type="text"
            value={input}
            placeholder="github:owner/repo#ref&path:/.dsh-plugin"
            onChange={(e) => { setInput(e.target.value) }}
            aria-label="新增插件源"
          />
          <button type="button" disabled={busy} onClick={() => { void add() }}>添加</button>
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>UI 插件（bundle 插件）</h3>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>
          配置在 profile 级 cordis.patch.yml，disabled 标记 = 停/启。
        </p>
        {uiPlugins.length === 0 ? <p style={{ color: 'var(--dsw-alias-label-tertiary)' }}>无已配置的 UI 插件（未配置的默认启用）</p> : null}
        {uiPlugins.map(plugin => (
          <div key={plugin.id} style={rowStyle}>
            <span style={{ flex: 1 }}>
              {plugin.id}
              <span style={badgeStyle(!plugin.disabled)}>{plugin.disabled ? '已停用' : '运行中'}</span>
            </span>
            <button type="button" disabled={busy} onClick={() => { void toggleUiPlugin(plugin.id, !plugin.disabled) }}>
              {plugin.disabled ? '启用' : '停用'}
            </button>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>
        修改写入 $DSH_HOME/cordis.patch.yml；web 默认无运行中 HMR，重启后生效（官方启用 web hmr 后自动换代）。
      </p>
    </div>
  )
}
