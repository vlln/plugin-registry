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
 * 拼图块图标（插件语义）：饱满线条风格——主体占满 15/16、2px stroke、
 * 凹槽/凸起 r2 圆润、currentColor 跟随主题。设置页导航的 tab 图标是
 * 官方硬编码（仅 models 特例，其余统一齿轮，零扩展点），0 patch 下用
 * MutationObserver 找到「插件」tab 行替换其 svg 内容。
 */
const PLUGIN_TAB_ICON_SVG = '<path d="M4.5 3 H6 A2 2 0 0 0 10 3 H11.5 A2 2 0 0 0 13.5 5 V6.5 A2 2 0 0 1 13.5 11.5 V12 A1.5 1.5 0 0 1 12 13.5 H4 A1.5 1.5 0 0 1 2.5 12 V4 A1.5 1.5 0 0 1 4 2.5 H4.5 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'

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
