/** Plugin manager settings panel: browse, search, install, enable/disable, uninstall. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-settings' SlotMap merge ('settings.section') into view.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import type { PluginEntryView } from '@deepseek-ai/dsh-host-apiproxy'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './PluginPanel.module.css'

/** Registrant-owned dependencies of {@link PluginPanel}: the host plugins API. */
export interface PluginPanelInjected {
  api: Pick<IApiClient, 'plugins'>
}

/** The settings-section owner props plus the injected plugins API. */
export type PluginPanelProps = PropsRuntime<'settings.section'> & PluginPanelInjected

/** A registry action a row can trigger. */
type Action = 'install' | 'enable' | 'disable' | 'uninstall'

/** One row's action set derived from install/enable state. */
function actionsFor(plugin: PluginEntryView): readonly Action[] {
  if (!plugin.installed) return ['install']
  if (plugin.enabled) return ['disable', 'uninstall']
  return ['enable', 'uninstall']
}

/** Render the plugin browse list and its controls against the host plugins API. */
export function PluginPanel(props: PluginPanelProps): React.ReactNode {
  const { api } = props
  const [plugins, setPlugins] = useState<PluginEntryView[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const refresh = useCallback(async (): Promise<void> => {
    const response = await api.plugins.list({})
    if (response.result.ok) setPlugins([...response.result.value.plugins])
  }, [api])

  const run = useCallback(async (action: 'install' | 'enable' | 'disable' | 'uninstall', id: string): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const call = api.plugins[action]
      const response = await call({ id })
      // The RPC carrier returns ok:false for business failures (a broken
      // enable, a missing source) instead of throwing — surface it or the
      // click looks dead.
      if (!response.result.ok) {
        const message = response.result.error.message
        setError(`操作失败：${id} — ${message}`)
        return
      }
      await refresh()
    } catch (caught: unknown) {
      setError(`操作失败：${id} — ${caught instanceof Error ? caught.message : String(caught)}`)
    } finally {
      setBusy(false)
    }
  }, [api, refresh])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle.length === 0) return plugins
    return plugins.filter(plugin =>
      plugin.id.toLowerCase().includes(needle) || plugin.description.toLowerCase().includes(needle))
  }, [plugins, query])

  return (
    <div className={css.panel}>
      <Input
        type="search"
        value={query}
        placeholder="搜索插件（id 或描述）"
        onChange={(event) => { setQuery(event.target.value) }}
        aria-label="搜索插件"
      />
      {error !== undefined ? <p className={css.error} role="alert">{error}</p> : null}
      <ul className={css.list}>
        {filtered.map(plugin => (
          <li key={plugin.id} className={css.row}>
            <div className={css.rowText}>
              <span className={css.title}>
                {plugin.id}
                <span className={plugin.enabled ? css.badgeOn : css.badgeOff}>
                  {plugin.enabled ? '已启用' : plugin.installed ? '已禁用' : '未安装'}
                </span>
              </span>
              <span className={css.meta}>
                v{plugin.version}
                {plugin.description ? ` — ${plugin.description}` : ''}
              </span>
            </div>
            <div className={css.actions}>
              {actionsFor(plugin).map(action => (
                <Button
                  key={action}
                  variant={action === 'install' || action === 'enable' ? 'primary'
                    : action === 'uninstall' ? 'ghost'
                      : 'outline'}
                  disabled={busy}
                  className={action === 'uninstall' ? css.danger : undefined}
                  onClick={() => { void run(action, plugin.id) }}
                >
                  {action === 'install' ? '安装'
                    : action === 'enable' ? '启用'
                      : action === 'disable' ? '禁用'
                        : '卸载'}
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {plugins.length === 0 ? <p className={css.empty}>尚未发现插件。可在 $DSH_HOME/plugins-catalog.json 中登记可安装插件。</p> : null}
    </div>
  )
}
