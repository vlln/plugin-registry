// vlln/turn-fold 浏览器端 half：验证 S3 内容流 per-item 回退缝
// （conversation.chat.item chain 槽）。把已完成的工具调用组折叠成一行，
// 未匹配的 flow item（user/assistant 文本等）仍走官方渲染——每个 item
// 独立过判别式，未命中回退官方（per-item transform，而非整槽接管）。
import { useSyncExternalStore } from 'react'
import type { Context } from 'cordis'
import type { ReactNode } from 'react'
// Context merges: slots/locale (runtime) reach this program through their
// client entries.
import type { ConversationNode } from '@deepseek-ai/dsh-client-runtime/client'
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
  'fold.summary': '第 {count} 轮执行过程（{tools} 个步骤）',
  'fold.expand': '展开',
  'fold.collapse': '收起',
} satisfies Record<string, string>
/** Turn-fold namespace key union. */
type TurnFoldKey = keyof typeof zh
const en = {
  'fold.summary': 'Turn {count} execution ({tools} steps)',
  'fold.expand': 'Expand',
  'fold.collapse': 'Collapse',
} satisfies Record<string, string>

/**
 * 原样折叠已结束 turn 的执行过程：一次 turn 完成，把该 turn 的中间过程
 * （工具调用组 + 中间文本）默认折叠成一行；**点击展开后渲染官方原生
 * 内容**（每个 tool 调用、上下文注入、thinking 原样显示）——不是自制
 * 组件替代。
 *
 * 机制：chain 的 elected 组件注入 `fallback`（官方原生渲染，官方
 * scoped-slots 支持）；组件读展开集（默认全折叠）——折叠中渲染折叠行，
 * 展开时渲染 `props.fallback`（原生）。select 始终接管「已结束 turn 的
 * 执行过程」，展开与否由组件层决定，select 保持纯。
 *
 * 聚合策略：折叠态只让该 turn 第一个流内执行过程 item 渲染折叠行、其余
 * 渲染 null；展开态每个执行过程 item 都渲染自己的 fallback——原生 items
 * 原样恢复（tool 调用、上下文注入、thinking 全在）。
 */
/** 每 turn 最后一条有内容 assistant 的 seq（= Answer 判别，官方语义的本地复制）。 */
function lastAssistantSeqs(nodes: readonly ConversationNode[]): ReadonlySet<number> {
  const lastByTurn = new Map<number, number>()
  for (const node of nodes) {
    if (node.kind !== 'assistant') continue
    const hasText = node.blocks.some(b => (b.kind === 'text' || b.kind === 'reasoning') && b.text.trim() !== '')
    if (!hasText) continue
    lastByTurn.set(node.turn, node.seq)
  }
  return new Set(lastByTurn.values())
}

/** 展开集：默认全部折叠（空集），点击折叠行加入 turn 显示原生。 */
let expanded = new Set<number>()
const expandListeners = new Set<() => void>()
function toggleExpanded(turn: number): void {
  expanded = new Set(expanded)
  if (expanded.has(turn)) expanded.delete(turn)
  else expanded.add(turn)
  for (const fn of [...expandListeners]) fn()
}
const subscribeExpanded = (fn: () => void): (() => void) => {
  expandListeners.add(fn)
  return () => { expandListeners.delete(fn) }
}

export function TurnFoldRow(
  props: PropsRuntime<'conversation.chat.item'> & PropsLocale<'turn-fold'>
  & { matched: { folded: true; turn: number }; fallback?: ReactNode },
): ReactNode {
  const { t, matched, useSession, item, fallback } = props
  const nodes = useSession(s => s.nodes)
  // 该 turn 的执行过程（tool-result + 非 Answer assistant 的中间文本）。
  const answerSeqs = lastAssistantSeqs(nodes)
  const processSeqs: number[] = []
  for (const node of nodes) {
    const turn = node.kind === 'assistant' || node.kind === 'tool-result' ? node.turn : undefined
    if (turn !== matched.turn) continue
    if (node.kind === 'tool-result') {
      processSeqs.push(node.seq)
    } else if (node.kind === 'assistant' && !answerSeqs.has(node.seq)
      && node.blocks.some(b => (b.kind === 'text' || b.kind === 'reasoning') && b.text.trim() !== '')) {
      // 只聚合流内中间文本：tool-call head（空 assistant）被 deriveChatFlow
      // 跳过、不在 flow items 里——算进来会让流内首项的 selfSeq 判定失败。
      processSeqs.push(node.seq)
    }
  }
  if (processSeqs.length === 0) return null
  useSyncExternalStore(subscribeExpanded, () => expanded)
  if (expanded.has(matched.turn)) {
    // 展开：渲染官方原生内容（每个执行过程 item 原样出现——tool 调用、
    // 上下文注入、thinking 都是官方渲染）。
    return <>{fallback}</>
  }
  // 折叠：只让该 turn 第一个执行过程 item 渲染折叠行，其余执行过程 item
  // 隐藏（内容在展开时由各自的 fallback 原样恢复）。
  const selfSeq = item.kind === 'tool-group' ? item.results[0]!.seq : item.node.seq
  if (selfSeq !== Math.min(...processSeqs)) return null
  return (
    <div
      style={{
        margin: '2px 0', fontSize: 13,
        background: 'var(--dsw-alias-bg-layer-2, #141414)',
        border: '1px solid var(--dsw-alias-border-l2, #333)',
        borderRadius: 6, color: 'var(--dsw-alias-text-muted, #999)',
      }}
    >
      <button
        type="button"
        onClick={() => toggleExpanded(matched.turn)}
        style={{
          width: '100%', padding: '6px 10px', border: 'none', background: 'transparent',
          color: 'inherit', textAlign: 'left', cursor: 'pointer', fontSize: 13,
        }}
      >
        {t('fold.summary', { count: matched.turn, tools: processSeqs.length })}
        {' '}
        {t('fold.expand')}
      </button>
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
