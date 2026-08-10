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
 * 官方 IconCodeOutline16（`</>` 代码符号，插件/扩展语义）——设置页导航
 * 的 tab 图标是官方硬编码（仅 models 特例，其余统一齿轮，零扩展点），
 * 0 patch 下用 MutationObserver 找到「插件」tab 行替换其 svg 内容。
 * 使用官方 path（含 fill-rule/clip-rule），尺寸外观与官方图标 100% 一致。
 */
const PLUGIN_TAB_ICON_SVG = '<path fill-rule="evenodd" clip-rule="evenodd" d="M12.3368 1.53569L11.931 4.43172H14.8086V5.79673H11.7404L11.1962 9.67859H14.2839V11.0436H11.0056L10.4994 14.6529L9.14873 14.4643L9.62731 11.0436H5.75876L5.25252 14.6529L3.90186 14.4643L4.38043 11.0436H1.69141V9.67859H4.57104L5.11417 5.79673H2.21609V4.43172H5.30581L5.73724 1.34713L7.08995 1.53569L6.68414 4.43172H10.5527L10.9841 1.34713L12.3368 1.53569ZM5.94937 9.67859H9.81791L10.361 5.79673H6.49353L5.94937 9.67859Z" fill="currentColor"/>'

/** 替换设置页导航里「插件」tab 的默认齿轮图标为代码图标（幂等）。 */
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
