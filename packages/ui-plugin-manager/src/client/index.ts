/**
 * Plugin manager surface plugin, browser half — a Settings section that
 * browses the local plugin registry: search, install (disabled by default),
 * enable/disable (which mounts/unmounts live on the host), and uninstall.
 * All data crosses the plugins host API; the panel holds only its own
 * browse/search state.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { deferRegistration } from '@deepseek-ai/dsh-client-ui-slots'
import { PluginPanel, type PluginPanelInjected } from './PluginPanel.tsx'

export type { PluginPanelInjected, PluginPanelProps } from './PluginPanel.tsx'

/** Required services (cordis fiber inject). The target slot is declared by ui-settings. */
export const inject = ['slots', 'connection']

/**
 * Register the Settings plugin section once its slot declaration is on the
 * ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as ConnectionHandle
  const injected = (): PluginPanelInjected => ({ api: connection.api })
  ctx.effect(() => {
    const panel = deferRegistration(ctx.slots, 'settings.section', PluginPanel, () =>
      ctx.slots.register({
        name: 'settings.section',
        id: 'plugins',
        order: 60,
        label: () => '插件',
        inject: injected,
      }, PluginPanel))
    return () => { panel.dispose() }
  }, 'ui-plugin-manager: settings section registration')
}
