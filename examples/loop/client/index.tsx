// acme/loop 浏览器端 half：对话页输入框上方的活动循环状态条。经
// `conversation.input.dock`（list 槽，与 queue/todo/goal/task-status 同一
// 官方槽家族）注册。Node half 注册只读状态路由，本组件每 1s 轮询并只渲染
// 当前会话（agentId === session.sessionId）的活动 loop——有则显示
// "🔁 loop: every 5m — prompt"，无则 null。零官方改动。
import { useEffect, useState } from 'react'
import type { Context } from 'cordis'
import type { ReactNode } from 'react'
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
  'active': 'loop: 每 {interval} — {prompt}',
  'next': '下次 {countdown}',
} satisfies Record<string, string>
/** Loop namespace key union. */
type LoopKey = keyof typeof zh
const en = {
  'active': 'loop: every {interval} — {prompt}',
  'next': 'next {countdown}',
} satisfies Record<string, string>

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
 * 探针），轮询该会话活动 loop。有则单行展示；无则 null。
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

  // 每轮渲染时刷新倒计时（轮询本身已驱动重渲染）。
  const loop = loops[0]
  if (loop === undefined) return null
  const countdown = countdownTo(loop.nextTickAt)
  const countdownText = countdown > 0 ? `${countdown}s` : 'now'

  return (
    <div
      data-loop-bar=""
      style={{
        display: 'flex', alignItems: 'center', gap: 6, height: 28,
        margin: '0 auto', padding: '0 12px',
        width: 'calc(100% - 2 * var(--dsh-composer-side-clearance, 16px) - 4 * var(--dsh-composer-dock-inset, 8px))',
        maxWidth: 'calc(var(--dsh-composer-card-max-width, 780px) - 4 * var(--dsh-composer-dock-inset, 8px))',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 10,
        background: 'var(--dsw-specific-tip)',
        fontSize: 13,
        fontFamily: 'system-ui',
      }}
    >
      <span style={{ width: 16, fontSize: 14, lineHeight: '16px', textAlign: 'center' }}>🔁</span>
      <span style={{ flex: 1, fontSize: 13, lineHeight: '28px', color: 'var(--dsw-alias-label-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {t('active', { interval: loop.intervalText, prompt: loop.prompt })}
      </span>
      <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-caption)', whiteSpace: 'nowrap' }}>
        {t('next', { countdown: countdownText })}
      </span>
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
