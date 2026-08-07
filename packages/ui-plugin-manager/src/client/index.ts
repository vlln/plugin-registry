/**
 * Plugin manager surface plugin, browser half — a Settings section that
 * browses the local plugin registry: search, install (disabled by default),
 * enable/disable (which mounts/unmounts live on the host), and uninstall.
 * All data crosses the plugins host API; the panel holds only its own
 * browse/search state.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { PluginPanel, type PluginPanelInjected } from './PluginPanel.tsx'

export type { PluginPanelInjected, PluginPanelProps } from './PluginPanel.tsx'

/** Required services (cordis fiber inject). The target slot is declared by ui-settings. */
export const inject = ['slots', 'connection']

/**
 * Register the Settings plugin section. 0806 dropped the deferred-registration
 * helper; the current contract is `slots.inject(name, () => register(...))`,
 * matching every other settings-section plugin.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as ConnectionHandle
  const injected = (): PluginPanelInjected => ({ api: connection.api })
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register({
      name: 'settings.section',
      id: 'plugins',
      order: 60,
      label: () => '插件',
      inject: injected,
    }, PluginPanel))
}
