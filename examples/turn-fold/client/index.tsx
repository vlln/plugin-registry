// vlln/turn-fold 浏览器端 half：0807 官方 `conversation.chat.turnTail`
// 链槽的插件验证——每个**完成的 turn** 末尾渲染一个可折叠的「工具活动」
// 摘要头（默认收起），展开显示该 turn 内的工具调用列表。
//
// 形态 A（turn 尾部摘要折叠）：不隐藏官方行，只在 closing assistant 的
// 正文与 IconActions 之间**追加**一个折叠头。这与 ui-deliverables 的
// ProducedFiles（官方同槽先例）同构——select 从 owner.nodes 按 turn
// 分组派生内容，null 谢绝（无活动的 turn 不挂载）。
//
// 数据通道：零自造。owner 提供整个会话快照 nodes + closing assistant 的
// seq，插件按 node.turn 分组——turn 归属（turn/end 边界）由 0807 官方
// 提供，插件只做派生。这就是 0805 判定「不可行」的 turn 归属数据，
// 0807 官方补齐了（assistantActionsSeqs/turnEnds）。
import { useState } from 'react'
import type { Context } from 'cordis'
import type { ConversationNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
// Locale namespace merge (turn-fold copy lives in this entry).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

/** 本插件的 locale 字典 key（zh 为源）。 */
export type TurnFoldKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'turn-fold': TurnFoldKey
  }
}

const NS = 'turn-fold'
/** 简体中文字典（key 源）。 */
const zh = {
  'fold.tools': '{count} 个工具调用',
  'fold.steps': '{count} 步',
  'fold.errors': '{count} 个失败',
  'fold.expand': '展开工具活动',
  'fold.collapse': '收起',
  'fold.empty': '（无工具调用）',
  'fold.tool': '调用 {name}',
  'fold.errored': '失败',
}
/** 英文字典（同 key 集）。 */
const en: Record<TurnFoldKey, string> = {
  'fold.tools': '{count} tool call(s)',
  'fold.steps': '{count} step(s)',
  'fold.errors': '{count} failed',
  'fold.expand': 'Expand tool activity',
  'fold.collapse': 'Collapse',
  'fold.empty': '(no tool calls)',
  'fold.tool': 'called {name}',
  'fold.errored': 'failed',
}

/** 该 turn 的活动摘要（select 的匹配值；空 = 无活动，谢绝挂载）。 */
export interface TurnActivity {
  /** 工具调用数（含失败）。 */
  toolCount: number
  /** 失败的工具调用数。 */
  errorCount: number
  /** turn 内 assistant 步骤数（含 closing 那步）。 */
  stepCount: number
  /** 工具调用列表（first-seen 顺序，按 seq）。 */
  tools: readonly { name: string; isError: boolean }[]
}

/**
 * 派生 closing assistant（seq）所在 turn 的活动摘要。分组规则与官方
 * ui-deliverables 的 producedForClosing 同构：user 消息重置 turn 边界、
 * 不同 turn 号重置累积、遇到 closing seq 返回——tool-result 不携带
 * turn，边界从携带 turn 的节点读取。
 * @param nodes - 整个会话快照（surface order）。
 * @param seq - closing assistant 的 seq（渲染锚点）。
 * @returns 该 turn 的活动摘要；无工具调用时 tools 为空数组（仍挂载，
 *   因为 stepCount 展示 turn 步数也有价值——由调用方决定是否谢绝）。
 */
export function activityForClosing(nodes: readonly ConversationNode[], seq: number): TurnActivity {
  const tools: { name: string; isError: boolean }[] = []
  let toolCount = 0
  let errorCount = 0
  let stepCount = 0
  let turn: number | undefined

  const reset = (): void => {
    tools.length = 0
    toolCount = 0
    errorCount = 0
    stepCount = 0
  }

  for (const node of nodes) {
    if (node.kind === 'user') {
      // 新 turn：用户消息重置累积（tool-result 无 turn 字段，边界读自
      // 携带 turn 的节点；user 消息后下一个报 turn 的是当前 turn）。
      turn = undefined
      reset()
      continue
    }
    // 携带 turn 的节点（assistant/command/model-retry/turn-error 等；
    // tool-result 无 turn 字段，不在此分支）。
    if ('turn' in node) {
      if (turn !== undefined && node.turn !== turn) reset()
      turn = node.turn
      if (node.kind === 'assistant') stepCount += 1
    } else if (node.kind === 'tool-result') {
      toolCount += 1
      if (node.isError) errorCount += 1
      const name = node.call?.name ?? node.callId
      tools.push({ name, isError: node.isError })
    }
    if (node.kind === 'assistant' && node.seq === seq) {
      return { toolCount, errorCount, stepCount, tools }
    }
  }
  return { toolCount, errorCount, stepCount, tools }
}

/**
 * chain 槽选择器：该 turn 有工具活动或步骤才挂载，否则 null 谢绝。
 * @param owner - turnTail owner 数据（nodes + closing seq）。
 * @returns 摘要匹配值；空 turn 返回 null。
 */
export function selectTurnActivity(owner: TurnTailOwnerProps): TurnActivity | null {
  const activity = activityForClosing(owner.nodes, owner.seq)
  if (activity.toolCount === 0 && activity.stepCount === 0) return null
  return activity
}

/** 折叠头组件 props：select 匹配值 + 槽 owner 的 openFile + locale。 */
export type TurnFoldProps = Pick<TurnTailOwnerProps, 'openFile'> & {
  matched: TurnActivity
} & PropsLocale<typeof NS>

/**
 * turn 尾部活动折叠头：默认收起（「🔧 N 工具 · M 步」），点击展开显示
 * 该 turn 的工具调用列表。官方 DisclosureRow 是内部组件不可 import，
 * 这里自绘同构折叠头（24px 行 + chevron 旋转 + 展开内容）。
 * @param props - 匹配的活动摘要 + 文件打开器 + locale。
 * @returns 折叠头节点。
 */
export function TurnFold({ matched, t }: TurnFoldProps) {
  const [open, setOpen] = useState(false)
  const parts: string[] = []
  if (matched.toolCount > 0) parts.push(t('fold.tools', { count: String(matched.toolCount) }))
  if (matched.stepCount > 0) parts.push(t('fold.steps', { count: String(matched.stepCount) }))
  if (matched.errorCount > 0) parts.push(t('fold.errors', { count: String(matched.errorCount) }))
  const summary = parts.length > 0 ? parts.join(' · ') : t('fold.empty')
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0,
      fontSize: 12, color: 'var(--dsw-alias-label-tertiary)',
    }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label={t(open ? 'fold.collapse' : 'fold.expand')}
        style={{
          display: 'flex', alignItems: 'center', height: 24, gap: 6,
          padding: '0 4px', border: 'none', background: 'none', cursor: 'pointer',
          font: 'inherit', color: 'inherit', textAlign: 'left',
        }}
      >
        <span style={{
          display: 'inline-flex', width: 16, height: 16, alignItems: 'center',
          justifyContent: 'center', transition: 'transform .18s ease',
          transform: open ? 'rotate(90deg)' : 'none',
        }}>▶</span>
        <span style={{ fontSize: 13, lineHeight: '24px' }}>🔧 {summary}</span>
      </button>
      {open && (
        <ul style={{ margin: '2px 0 4px', padding: '0 0 0 26px', listStyle: 'none' }}>
          {matched.tools.map(tool => (
            <li key={`${tool.name}:${tool.isError}`} style={{ lineHeight: '20px' }}>
              <span style={{ opacity: tool.isError ? 0.6 : 1 }}>
                {tool.isError ? '✗' : '·'} {tool.name}
                {tool.isError ? `（${t('fold.errored')}）` : ''}
              </span>
            </li>
          ))}
          {matched.tools.length === 0 && (
            <li style={{ lineHeight: '20px' }}>{t('fold.empty')}</li>
          )}
        </ul>
      )}
    </div>
  )
}

/**
 * 插件主体：注册 turnTail 链槽 + locale。`ctx.slots.inject` 等待槽声明、
 * 随声明坍缩自动移除、重声明后重跑（0806+ slots 契约）。
 * @param ctx - client root context。
 */
export const inject = ['slots', 'locale']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'turn-fold: dictionaries')
  ctx.slots.inject('conversation.chat.turnTail', () =>
    ctx.slots.register({
      name: 'conversation.chat.turnTail',
      select: selectTurnActivity,
      locale: NS,
    }, TurnFold))
}
