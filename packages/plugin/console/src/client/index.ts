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
 * 拼图块图标（插件语义，subagent 审查重画版 SF）：
 * - 顶部 U 型凹槽（0.75 圆角 + 直壁 + r1.25 圆底）与右侧胶囊凸起
 *   （0.75 圆角 + r1.25 半圆顶）共用同一半径组——槽是凸起的负形，
 *   设计语言一致；四角统一 r1.5
 * - stroke 1.5（对齐官方细条 1.34-1.45 视觉）、currentColor
 * - 18 个接点程序化验证 0 处切线不连续；墨迹 x∈[2.0,15.5] 16px 完整
 * 设置页 tab 图标为官方硬编码（仅 models 特例），0 patch 下用
 * MutationObserver 找到「插件」tab 行替换其 svg 内容。
 */
const PLUGIN_TAB_ICON_SVG = '<path d="M4.25 2.75 H5.75 A0.75 0.75 0 0 1 6.5 3.5 V4.25 A1.25 1.25 0 0 0 9.0 4.25 V3.5 A0.75 0.75 0 0 1 9.75 2.75 H11.25 A1.5 1.5 0 0 1 12.75 4.25 V6.0 A0.75 0.75 0 0 0 13.5 6.75 A1.25 1.25 0 0 1 13.5 9.25 A0.75 0.75 0 0 0 12.75 10.0 V11.75 A1.5 1.5 0 0 1 11.25 13.25 H4.25 A1.5 1.5 0 0 1 2.75 11.75 V4.25 A1.5 1.5 0 0 1 4.25 2.75 Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>'

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
