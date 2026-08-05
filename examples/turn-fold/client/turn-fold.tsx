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
import type { ChatFlowItemOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
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
  'fold.label': '已折叠第 {count} 轮执行过程',
  'fold.expand': '展开',
} satisfies Record<string, string>
/** Turn-fold namespace key union. */
type TurnFoldKey = keyof typeof zh
const en = {
  'fold.label': 'Turn {count} execution folded',
  'fold.expand': 'Expand',
} satisfies Record<string, string>

/**
 * 折叠已结束 turn 的"执行过程"的渲染器：工具调用组 + 中间文本（非 Answer）。
 * select 是 owner 纯函数，用 owner 携带的 turn 上下文判别：
 * - tool-group：所属 turn 已结束 → 折叠
 * - assistant：非 Answer（不在 answerSeqs）且所属 turn 已结束 → 折叠（中间文本）
 * - Answer / user / 未结束 turn 的 item → 未命中走官方渲染
 */
export function TurnFoldRow(
  props: PropsRuntime<'conversation.chat.item'> & PropsLocale<'turn-fold'> & { matched: { folded: true; turn: number } },
): ReactNode {
  const { t, matched } = props
  return (
    <div
      style={{
        padding: '6px 10px', margin: '2px 0', fontSize: 13,
        background: 'var(--dsw-alias-bg-layer-2, #141414)',
        border: '1px solid var(--dsw-alias-border-l2, #333)',
        borderRadius: 6, color: 'var(--dsw-alias-text-muted, #999)',
      }}
    >
      {t('fold.label', { count: matched.turn })}
    </div>
  )
}

/** 判别式：折叠"已结束 turn 的执行过程"（工具组 + 中间文本），Answer 与未结束 turn 走官方。 */
export function select(owner: ChatFlowItemOwnerProps): { folded: true; turn: number } | null {
  const { item, turnEnds, answerSeqs } = owner
  if (item.kind === 'tool-group') {
    // 工具组：所属 turn 已结束即为执行过程。
    return turnEnds.has(item.turn) ? { folded: true, turn: item.turn } : null
  }
  const node = item.node
  if (node.kind === 'assistant') {
    // Answer（每 turn 最后 content assistant）保留；中间文本在 turn 结束后折叠。
    if (answerSeqs.has(node.seq)) return null
    return turnEnds.has(node.turn) ? { folded: true, turn: node.turn } : null
  }
  return null
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
