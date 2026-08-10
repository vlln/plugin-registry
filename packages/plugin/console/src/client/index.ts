/**
 * 薄控制台 browser half：设置页「插件」面板。列出当前 repositories
 * （已装 .dsh-plugin 包），支持增删行（写回 cordis.patch.yml → 官方
 * HMR 换代）。fetch 自建路由 `/api/plugin-console`，零官方改动。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { ConsolePanel } from './Panel.tsx'

/** Cordis 插件名。 */
export const name = 'plugin-console-client'

/** 需要 slots（settings.section 插槽）。 */
export const inject = ['slots']

/**
 * 自绘拼图块图标（插件语义，官方 outline 风格：16px、fill currentColor、
 * 圆角主体 + 顶部凹槽 + 右侧圆凸）——设置页导航的 tab 图标是官方硬编码
 * （仅 models 特例，其余统一齿轮，零扩展点），0 patch 下用
 * MutationObserver 找到「插件」tab 行替换其 svg 内容。
 */
const PLUGIN_TAB_ICON_SVG = '<path d="M5 4 H7 A1 1 0 0 0 9 4 H11 A1 1 0 0 0 12 5 V11 A1 1 0 0 0 11 12 H5 A1 1 0 0 0 4 11 V5 A1 1 0 0 0 5 4 Z" fill="currentColor"/><circle cx="12" cy="7.5" r="1.5" fill="currentColor"/>'

/** 替换设置页导航里「插件」tab 的默认齿轮图标为拼图块图标（幂等）。 */
function patchPluginTabIcon(): void {
  for (const btn of document.querySelectorAll('button')) {
    const host = btn as HTMLButtonElement & { dataset: { dshConsoleIcon?: string } }
    if (host.dataset.dshConsoleIcon === '1') continue
    if (btn.textContent?.trim() !== '插件') continue
    const svg = btn.querySelector('svg')
    if (svg === null) continue
    svg.setAttribute('viewBox', '0 0 16 16')
    svg.setAttribute('fill', 'none')
    svg.innerHTML = PLUGIN_TAB_ICON_SVG
    host.dataset.dshConsoleIcon = '1'
  }
}

/** 注册设置页「插件」面板 + 替换 tab 图标（设置页随时打开/关闭，全程监听）。 */
export function apply(ctx: ClientContext): void {
  const observer = new MutationObserver(patchPluginTabIcon)
  observer.observe(document.body, { childList: true, subtree: true })
  patchPluginTabIcon()
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register({
      name: 'settings.section',
      id: 'plugin-console',
      order: 60,
      label: () => '插件',
      inject: () => ({}),
    }, ConsolePanel))
}
