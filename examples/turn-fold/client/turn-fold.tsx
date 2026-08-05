// vlln/turn-fold 浏览器端 half：验证 S3 内容流 per-item 回退缝
// （conversation.chat.item chain 槽）。把已完成的工具调用组折叠成一行，
// 未匹配的 flow item（user/assistant 文本等）仍走官方渲染——每个 item
// 独立过判别式，未命中回退官方（per-item transform，而非整槽接管）。
import type { Context } from 'cordis'
import type { ReactNode } from 'react'
// Context merges: slots/locale (runtime) reach this program through their
// client entries.
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// SlotMap merge: conversation.chat.item (ui-conversation) is declared by its
// contract.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { deferRegistration, type PropsLocale, type PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Turn-fold copy. */
    'turn-fold': TurnFoldKey
  }
}

const NS = 'turn-fold'
const zh = {
  'fold.label': '已折叠 {count} 个工具调用',
  'fold.expand': '展开',
} satisfies Record<string, string>
/** Turn-fold namespace key union. */
type TurnFoldKey = keyof typeof zh
const en = {
  'fold.label': '{count} tool call(s) folded',
  'fold.expand': 'Expand',
} satisfies Record<string, string>

/**
 * 折叠已完成工具组的渲染器。select 是 owner 的纯函数（只判 flow item）：
 * tool-group（工具调用组）接管折叠，其余 item 未命中走官方渲染。
 */
export function TurnFoldRow(
  props: PropsRuntime<'conversation.chat.item'> & PropsLocale<'turn-fold'> & { matched: { folded: true } },
): ReactNode {
  const { t } = props
  return (
    <div
      style={{
        padding: '6px 10px', margin: '2px 0', fontSize: 13,
        background: 'var(--dsw-alias-bg-layer-2, #141414)',
        border: '1px solid var(--dsw-alias-border-l2, #333)',
        borderRadius: 6, color: 'var(--dsw-alias-text-muted, #999)',
      }}
    >
      {t('fold.label', { count: 0 })}
    </div>
  )
}

/** 判别式：只折叠工具调用组（已完成 = 全是 tool-result 的组）。 */
export function select(owner: { item: { kind: string; results?: readonly unknown[] } }): { folded: true } | null {
  if (owner.item.kind !== 'tool-group') return null
  // 组里没有 running 调用即已完成（tool-result 组）；折叠它。
  const results = owner.item.results ?? []
  if (results.length === 0) return null
  return { folded: true }
}

/** 需要此插件声明的服务：slots + locale。 */
export const inject = ['slots', 'locale']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'turn-fold: dictionaries')
  ctx.effect(() => {
    const row = deferRegistration(ctx.slots, 'conversation.chat.item', TurnFoldRow, () =>
      ctx.slots.register({
        name: 'conversation.chat.item',
        priority: 1,
        locale: NS,
        select,
      }, TurnFoldRow))
    return () => { row.dispose() }
  }, 'turn-fold: registration')
}
