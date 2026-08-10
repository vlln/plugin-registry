/**
 * 薄控制台面板：两个管理区——
 * 1. repository 插件（.dsh-plugin 包）：repositories 列表增删
 * 2. UI 插件（bundle 插件）：disabled 标记启停
 * 经 /api/plugin-console 自建路由。
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

/** 设置页面板主体。 */
export function ConsolePanel(): React.ReactNode {
  const [state, setState] = useState<RepositoryState>({ repositories: [], present: false })
  const [uiPlugins, setUiPlugins] = useState<UiPluginRow[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    const [repoRes, uiRes] = await Promise.all([
      fetch('/api/plugin-console/repositories', { headers: { accept: 'application/json' } }),
      fetch('/api/plugin-console/ui-plugins', { headers: { accept: 'application/json' } }),
    ])
    const repoBody = (await repoRes.json()) as RepositoryState & { ok?: boolean }
    const uiBody = (await uiRes.json()) as { plugins?: UiPluginRow[]; ok?: boolean }
    setState({ repositories: repoBody.repositories ?? [], present: repoBody.present ?? false })
    setUiPlugins(uiBody.plugins ?? [])
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

  const add = useCallback(async (): Promise<void> => {
    const value = input.trim()
    if (value.length === 0) return
    if (!state.repositories.includes(value)) {
      await save([...state.repositories, value])
    }
    setInput('')
  }, [input, state.repositories, save])

  const remove = useCallback((id: string): void => {
    void save(state.repositories.filter(r => r !== id))
  }, [state.repositories, save])

  useEffect(() => { void refresh() }, [refresh])

  return (
    <div>
      <h3>repository 插件（.dsh-plugin 包）</h3>
      {!state.present ? <p>home cordis.patch.yml 暂无 repository-plugins 行</p> : null}
      {state.repositories.length === 0 && state.present ? <p>已配置 0 个插件</p> : null}
      {error !== undefined ? <p role="alert">{error}</p> : null}
      <ul>
        {state.repositories.map(id => (
          <li key={id}>
            <span>{id}</span>
            <button type="button" disabled={busy} onClick={() => { remove(id) }}>移除</button>
          </li>
        ))}
      </ul>
      <div>
        <input
          type="text"
          value={input}
          placeholder="github:owner/repo#ref&path:/.dsh-plugin"
          onChange={(e) => { setInput(e.target.value) }}
          aria-label="新增插件源"
        />
        <button type="button" disabled={busy} onClick={() => { void add() }}>添加</button>
      </div>

      <h3>UI 插件（bundle 插件）</h3>
      {uiPlugins.length === 0 ? <p>无已配置的 UI 插件</p> : null}
      <ul>
        {uiPlugins.map(plugin => (
          <li key={plugin.id}>
            <span>{plugin.id}</span>
            <span>{plugin.disabled ? '（已停用）' : '（运行中）'}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => { void toggleUiPlugin(plugin.id, !plugin.disabled) }}
            >
              {plugin.disabled ? '启用' : '停用'}
            </button>
          </li>
        ))}
      </ul>

      <p>修改写入 $DSH_HOME/cordis.patch.yml；web 默认无运行中 HMR，重启后生效（官方启用 web hmr 后自动换代）。</p>
    </div>
  )
}
