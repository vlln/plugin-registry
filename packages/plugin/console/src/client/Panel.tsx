/**
 * 薄控制台面板：列出/增删 repository 插件（经 /api/plugin-console）。
 */
import { useCallback, useEffect, useState } from 'react'

interface RepositoryState {
  repositories: string[]
  present: boolean
}

/** 设置页面板主体。 */
export function ConsolePanel(): React.ReactNode {
  const [state, setState] = useState<RepositoryState>({ repositories: [], present: false })
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    const response = await fetch('/api/plugin-console/repositories', { headers: { accept: 'application/json' } })
    const body = (await response.json()) as RepositoryState & { ok?: boolean }
    setState({ repositories: body.repositories ?? [], present: body.present ?? false })
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
      <h3>插件（repository-plugins）</h3>
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
      <p>修改写入 $DSH_HOME/cordis.patch.yml；web 默认无运行中 HMR，重启后生效（官方启用 web hmr 后自动换代）。</p>
    </div>
  )
}
