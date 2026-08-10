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
 * 官方 IconPanelLeftOutline16 的 path（面板语义，16px）——设置页导航
 * 的 tab 图标是官方硬编码（仅 models 特例，其余统一齿轮，零扩展点），
 * 0 patch 下用 MutationObserver 找到「插件」tab 行替换其 svg 内容。
 */
const PLUGIN_TAB_ICON_PATH = 'M9.67272 0.522841C10.8339 0.522841 11.76 0.522714 12.4963 0.602493C13.2453 0.683657 13.8789 0.854248 14.4264 1.25197C14.7504 1.48739 15.0355 1.77247 15.2709 2.0965C15.6686 2.64394 15.8392 3.27758 15.9204 4.02655C16.0002 4.7629 16 5.68895 16 6.85014V9.14986C16 10.3111 16.0002 11.2371 15.9204 11.9735C15.8392 12.7224 15.6686 13.3561 15.2709 13.9035C15.0355 14.2275 14.7504 14.5126 14.4264 14.748C13.8789 15.1458 13.2453 15.3163 12.4963 15.3975C11.76 15.4773 10.8339 15.4772 9.67272 15.4772H6.3273C5.16611 15.4772 4.24006 15.4773 3.50371 15.3975C2.75474 15.3163 2.1211 15.1458 1.57366 14.748C1.24963 14.5126 0.964549 14.2275 0.729131 13.9035C0.331407 13.3561 0.160817 12.7224 0.0796529 11.9735C-0.000126137 11.2371 1.25338e-09 10.3111 1.25338e-09 9.14986V6.85014C1.25329e-09 5.68895 -0.000126137 4.7629 0.0796529 4.02655C0.160817 3.27758 0.331407 2.64394 0.729131 2.0965C0.964549 1.77247 1.24963 1.48739 1.57366 1.25197C2.1211 0.854248 2.75474 0.683657 3.50371 0.602493C4.24006 0.522714 5.16611 0.522841 6.3273 0.522841H9.67272ZM5.54303 1.88715V14.1118C5.78636 14.1128 6.04709 14.1169 6.3273 14.1169H9.67272C10.8639 14.1169 11.7032 14.1164 12.3493 14.0465C12.9824 13.9779 13.3497 13.8494 13.6268 13.6482C13.8354 13.4966 14.0195 13.3125 14.1711 13.1039C14.3723 12.8268 14.5007 12.4595 14.5693 11.8264C14.6393 11.1803 14.6398 10.341 14.6398 9.14986V6.85014C14.6398 5.65896 14.6393 4.81967 14.5693 4.1736C14.5007 3.54048 14.3723 3.17318 14.1711 2.89609C14.0195 2.68747 13.8354 2.50337 13.6268 2.35179C13.3497 2.1506 12.9824 2.02212 12.3493 1.95353C11.7032 1.88358 10.8639 1.88307 9.67272 1.88307H6.3273C6.04709 1.88307 5.78636 1.8862 5.54303 1.88715ZM4.1828 1.91166C3.99125 1.9216 3.8148 1.93577 3.65076 1.95353C3.01764 2.02212 2.65034 2.1506 2.37325 2.35179C2.16463 2.50337 1.98052 2.68747 1.82895 2.89609C1.62776 3.17318 1.49928 3.54048 1.43069 4.1736C1.36074 4.81967 1.36023 5.65896 1.36023 6.85014V9.14986C1.36023 10.341 1.36074 11.1803 1.43069 11.8264C1.49928 12.4595 1.62776 12.8268 1.82895 13.1039C1.98052 13.3125 2.16463 13.4966 2.37325 13.6482C2.65034 13.8494 3.01764 13.9779 3.65076 14.0465C3.81478 14.0642 3.99127 14.0774 4.1828 14.0873V1.91166Z'

/** 替换设置页导航里「插件」tab 的默认齿轮图标为面板图标（幂等）。 */
function patchPluginTabIcon(): void {
  for (const btn of document.querySelectorAll('button')) {
    const host = btn as HTMLButtonElement & { dataset: { dshConsoleIcon?: string } }
    if (host.dataset.dshConsoleIcon === '1') continue
    if (btn.textContent?.trim() !== '插件') continue
    const svg = btn.querySelector('svg')
    if (svg === null) continue
    svg.setAttribute('viewBox', '0 0 16 16')
    svg.setAttribute('fill', 'none')
    svg.innerHTML = `<path fill-rule="evenodd" clip-rule="evenodd" d="${PLUGIN_TAB_ICON_PATH}" fill="currentColor"/>`
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
