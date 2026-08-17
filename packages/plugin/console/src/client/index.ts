/**
 * 薄控制台 browser half：设置页「插件管理」面板（0811 适配）。列出
 * insert 插件（profile patch insert 行，实时挂载/卸载）+ 已加载插件
 * （启停持久化）+ bundle 安装。fetch 自建路由 `/api/plugin-console`，
 * 零官方改动。tab 命名「插件管理」——避免与官方「插件」tab 重名
 * （曾同名导致设置页导航出现两个「插件」，且图标替换误伤官方 tab）。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { ConsolePanel } from './Panel.tsx'

/** Cordis 插件名。 */
export const name = 'plugin-console-client'

/** 需要 slots（settings.section 插槽）。 */
export const inject = ['slots']

/**
 * 插头图标（plugin-line，参考 Clarity 图标库，dsh 风格：fill
 * currentColor 细条 + 16px 显示；fill+stroke 同色叠加加粗线条
 * 0.5u/36 系 ≈ +22%）——设置页导航的 tab 图标是官方硬编码（仅 models
 * 特例，其余统一齿轮，零扩展点），0 patch 下用 MutationObserver 找到
 * 本控制台自己的「插件管理」tab 行替换其 svg 内容。只匹配自身 tab
 * 文本，绝不动官方「插件」tab（同名误换曾把官方 tab 图标改坏）。
 */
const PLUGIN_TAB_ICON_SVG = '<path fill="currentColor" stroke="currentColor" stroke-width="0.5" stroke-linejoin="round" d="M29.81 16H29V8.83a2 2 0 0 0-2-2h-6A5.14 5.14 0 0 0 16.51 2A5 5 0 0 0 11 6.83H4a2 2 0 0 0-2 2V17h2.81A3.13 3.13 0 0 1 8 19.69A3 3 0 0 1 7.22 22A3 3 0 0 1 5 23H2v8.83a2 2 0 0 0 2 2h23a2 2 0 0 0 2-2V26h1a5 5 0 0 0 5-5.51A5.15 5.15 0 0 0 29.81 16m2.41 7A3 3 0 0 1 30 24h-3v7.83H4V25h1a5 5 0 0 0 5-5.51A5.15 5.15 0 0 0 4.81 15H4V8.83h9V7a3 3 0 0 1 1-2.22A3 3 0 0 1 16.31 4A3.13 3.13 0 0 1 19 7.19v1.64h8V18h2.81A3.13 3.13 0 0 1 33 20.69a3 3 0 0 1-.78 2.31"/>'

/** 替换设置页导航里本控制台「插件管理」tab 的默认齿轮图标为插头图标（幂等）。 */
function patchPluginTabIcon(): void {
  for (const btn of document.querySelectorAll('button')) {
    const host = btn as HTMLButtonElement & { dataset: { dshConsoleIcon?: string } }
    if (host.dataset.dshConsoleIcon === '1') continue
    // 只匹配自身 tab 文本（「插件管理」），官方「插件」tab 不受影响。
    if (btn.textContent?.trim() !== '插件管理') continue
    const svg = btn.querySelector('svg')
    if (svg === null) continue
    // plugin-line 是 36 坐标系，缩放到 16px 显示（外层 svg 保持官方 width/height=16）。
    svg.setAttribute('viewBox', '0 0 36 36')
    svg.setAttribute('fill', 'none')
    svg.innerHTML = PLUGIN_TAB_ICON_SVG
    host.dataset.dshConsoleIcon = '1'
  }
}

/** 注册设置页「插件管理」面板 + 替换自身 tab 图标（设置页随时打开/关闭，全程监听）。 */
export function apply(ctx: ClientContext): void {
  const observer = new MutationObserver(patchPluginTabIcon)
  observer.observe(document.body, { childList: true, subtree: true })
  patchPluginTabIcon()
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register({
      name: 'settings.section',
      id: 'plugin-console',
      order: 60,
      label: () => '插件管理',
      inject: () => ({}),
    }, ConsolePanel))
}
