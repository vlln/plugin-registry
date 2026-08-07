// acme/loop 浏览器端 half：对话页输入框上方的活动循环状态条。经
// `conversation.input.dock`（list 槽，与 queue/todo/goal/task-status 同一
// 官方槽家族）注册。Node half 注册只读状态路由，本组件每 1s 轮询并只渲染
// 当前会话（agentId === session.sessionId）的活动 loop。
//
// 视觉对齐官方 GoalBar（Figma 1236:32276 家族）：36px 高、12px 圆角、
// --dsw-specific-tip 背景、官方 icon（IconRefreshOutline16）+ StateDot
// （ongoing 活动指示）。有循环显示「● ⟳ 循环中 · prompt · 5m · 下次 23s」，
// 无则 null。零官方改动。
import { useEffect, useState } from 'react'
import type { Context } from 'cordis'
import type { ReactNode } from 'react'
import { IconRefreshOutline16, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
// Context merges: slots/locale (runtime) reach this program through their
// client entries.
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// SlotMap merge: conversation.input.dock (ui-conversation) is declared by its
// contract.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Loop copy. */
    'loop': LoopKey
  }
}

/** Node half 只读活动 loop 路由（与 examples/loop/index.mjs 的 LOOPS_PATH 一致）。 */
const LOOPS_PATH = '/plugins/acme/loop/loops'

/** 轮询间隔：状态条不需要亚秒刷新。 */
const POLL_MS = 1000

const NS = 'loop'
const zh = {
  'active': '循环中',
  'next': '下次 {countdown}',
} satisfies Record<string, string>
/** Loop namespace key union. */
type LoopKey = keyof typeof zh
const en = {
  'active': 'Looping',
  'next': 'next {countdown}',
} satisfies Record<string, string>

/** 布局变量对齐官方 dock 家族（ConversationRoot.module.css / GoalBar / QueueDock）。 */
const SIDE_CLEARANCE = 'var(--dsh-composer-side-clearance, 16px)'
const DOCK_INSET = 'var(--dsh-composer-dock-inset, 8px)'
const CARD_MAX = 'var(--dsh-composer-card-max-width, 780px)'

/** Node half 返回的 wire loop 视图（agentId 即宿主 session id）。 */
interface WireLoop {
  agentId: string
  prompt: string
  intervalMs: number
  intervalText: string
  nextTickAt: number
}

/** 会话级轮询 hook：每 POLL_MS 拉取 Node half 路由，返回该会话的活动 loop。 */
function useSessionLoops(sessionId: string): WireLoop[] {
  const [loops, setLoops] = useState<WireLoop[]>([])
  useEffect(() => {
    let alive = true
    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(`${LOOPS_PATH}?sessionId=${encodeURIComponent(sessionId)}`, { headers: { accept: 'application/json' } })
        if (!res.ok) return
        const data = (await res.json()) as { loops?: WireLoop[] }
        if (alive && Array.isArray(data.loops)) setLoops(data.loops)
      } catch {
        // 瞬态网络错误：保持上一帧，下轮重试。
      }
    }
    void poll()
    const timer = setInterval(() => { void poll() }, POLL_MS)
    return () => { alive = false; clearInterval(timer) }
  }, [sessionId])
  return loops
}

/** 下一次 tick 倒计时（秒）；已过则显示 0。 */
function countdownTo(nextTickAt: number): number {
  return Math.max(0, Math.ceil((nextTickAt - Date.now()) / 1000))
}

/**
 * 对话页输入框上方的活动循环状态条：仅 Chat 视图显示（`[data-chat-flow=""]`
 * 探针），轮询该会话活动 loop。有则单行展示（官方 dock 卡片视觉）；无则 null。
 */
export function LoopBar(
  props: PropsRuntime<'conversation.input.dock'> & PropsLocale<'loop'>,
): ReactNode {
  const { t, session } = props
  const loops = useSessionLoops(session.sessionId)
  const [inChat, setInChat] = useState(false)

  // 对话页探针：flow 列存在性（navbar/task-status 同信号）。body 级 observer
  // 只跑 querySelector，回调轻量；view 切换（flow 移除/重建）都触发。
  useEffect(() => {
    const check = (): void => {
      setInChat(document.querySelector('[data-chat-flow=""]') !== null)
    }
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => { observer.disconnect() }
  }, [])

  if (!inChat) return null
  if (loops.length === 0) return null

  const loop = loops[0]
  if (loop === undefined) return null
  const countdown = countdownTo(loop.nextTickAt)
  const countdownText = countdown > 0 ? `${countdown}s` : 'now'

  return (
    // 双层 dock 结构（对齐官方 GoalBar / QueueDock）：外层 dock 列负责与
    // 同槽卡片同宽同基准（card cap 减 4 inset，居中），内层 bar 满宽限 max。
    // 直接用 width:100% 会与 queue/todo 卡片的宽度基准错位干涉。
    <div data-loop-dock="" style={{
      boxSizing: 'border-box',
      width: `calc(100% - 2 * ${SIDE_CLEARANCE} - 4 * ${DOCK_INSET})`,
      margin: '0 auto',
    }}>
      <div
        data-loop-bar=""
        style={{
          boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%',
          maxWidth: `calc(${CARD_MAX} - 4 * ${DOCK_INSET})`,
          height: 36,
          margin: '0 auto',
          padding: '4px 12px',
          border: '1px solid var(--dsw-alias-border-l1)',
          borderRadius: 12,
          background: 'var(--dsw-specific-tip)',
          fontSize: 13,
          fontFamily: 'system-ui',
        }}
      >
      {/* 活动指示：ongoing 像素点 + 循环 icon */}
      <span style={{ display: 'inline-flex', flex: 'none', alignItems: 'center', gap: 8 }}>
        <StateDot state="ongoing" size={10} />
        <span style={{ display: 'inline-flex', flex: 'none', color: 'var(--dsw-alias-label-tertiary)' }}>
          <IconRefreshOutline16 size={14} />
        </span>
      </span>
      {/* 状态标签（13/24 medium，与 Todo/Queue 标题同族） */}
      <span style={{
        flex: 'none', fontSize: 13, lineHeight: '24px', fontWeight: 500,
        color: 'var(--dsw-alias-label-primary)',
      }}>
        {t('active')}
      </span>
      {/* prompt：主文本，省略号截断 */}
      <span style={{
        flex: 1, minWidth: 0, overflow: 'hidden', fontSize: 13, lineHeight: '20px',
        color: 'var(--dsw-alias-label-primary-dimmed)', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {loop.prompt}
      </span>
      {/* 间隔 + 倒计时 */}
      <span style={{ flex: 'none', fontSize: 12, lineHeight: '20px', color: 'var(--dsw-alias-label-caption)', whiteSpace: 'nowrap' }}>
        {loop.intervalText} · {t('next', { countdown: countdownText })}
      </span>
      </div>
    </div>
  )
}

/** 需要此插件声明的服务：slots + locale。 */
export const inject = ['slots', 'locale']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'loop: dictionaries')
  // 0806 slots 契约：注册走 ctx.slots.inject（等待槽声明、随声明坍缩自动移除）。
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register({
      name: 'conversation.input.dock',
      id: 'loop',
      order: 20,
      locale: NS,
    }, LoopBar))
}
