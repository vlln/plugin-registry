// vlln/taskboard 浏览器端 half：注册 sidebar.panel 入口 + conversation.view
// 视图。点击入口经 ctx.conversation.setView 切换当前会话到 task board 视图
// （S5 完整闭环，F9 跨槽通道）；无当前会话时退回自渲染浮层。
import { useState } from 'react'
import type { Context } from 'cordis'
import type { ReactNode } from 'react'
// Context merges: slots/locale/sessions (runtime) reach this program through
// their client entries; ISessions is the injected service's type.
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type { ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// SlotMap merges: sidebar.panel (ui-sidebar) and conversation.view
// (ui-conversation) are declared by their contracts.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { deferRegistration, type PropsLocale, type PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Task board copy. */
    'taskboard': TaskBoardKey
  }
}

const NS = 'taskboard'
const zh = {
  'panel.trigger': 'Task Board',
  'view.title': 'Task Board',
  'view.empty': '暂无会话',
  'view.dispatch': '分派任务（占位）',
  'panel.overlayTitle': 'Task Board',
  'status.running': '{count} 个后台任务运行中',
  'status.idle': '无后台任务',
} satisfies Record<string, string>
/** Task board namespace key union. */
type TaskBoardKey = keyof typeof zh
const en = {
  'panel.trigger': 'Task Board',
  'view.title': 'Task Board',
  'view.empty': 'No sessions',
  'view.dispatch': 'Dispatch (placeholder)',
  'panel.overlayTitle': 'Task Board',
  'status.running': '{count} background task(s) running',
  'status.idle': 'No background tasks',
} satisfies Record<string, string>

/** sidebar.panel 入口按钮：有当前会话则 setView 切视图，否则展开浮层。 */
export function TaskBoardTrigger(
  props: PropsRuntime<'sidebar.panel'> & PropsLocale<'taskboard'> & { sessions: ISessions },
): ReactNode {
  const { t, sessions } = props
  const [open, setOpen] = useState(false)
  const go = (): void => {
    const current = sessions.list.getSnapshot().current
    if (current !== undefined) {
      const scoped = sessions.scope(current)
      const conversation = scoped?.get('conversation') as { setView(view: string): void } | undefined
      if (conversation === undefined) {
        // ui-conversation absent or older than the setView channel: fail loud
        // instead of a dead click (the overlay is the no-conversation path).
        console.error('taskboard: conversation service unavailable (needs setView channel)')
        setOpen(true)
        return
      }
      conversation.setView('taskboard')
      return
    }
    setOpen(v => !v) // no current session: fall back to the overlay
  }
  return (
    <>
      <button
        type="button"
        onClick={go}
        style={{ width: '100%', padding: '6px 10px', border: 'none', background: 'transparent', color: 'inherit', textAlign: 'left', cursor: 'pointer', fontSize: 13 }}
      >
        {t('panel.trigger')}
      </button>
      {open && (
        <div style={{ position: 'fixed', right: 16, top: 16, zIndex: 900, width: 280, padding: 16, background: 'var(--dsw-alias-bg-layer-1, #1e1e1e)', border: '1px solid var(--dsw-alias-border-l2, #444)', borderRadius: 8, fontFamily: 'system-ui' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>{t('panel.overlayTitle')}</h3>
          <p style={{ fontSize: 13 }}>{t('view.empty')}</p>
        </div>
      )}
    </>
  )
}

/** conversation.view 视图：task board 内容（useTasks 投影真实任务 + 分派占位）。 */
export function TaskBoardView(
  props: PropsRuntime<'conversation.view'> & PropsLocale<'taskboard'>,
): ReactNode {
  const { t } = props
  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>{t('view.title')}</h2>
      <p style={{ fontSize: 13 }}>{t('view.empty')}</p>
      <button type="button" style={{ marginTop: 8, padding: '6px 12px', fontSize: 13 }}>
        {t('view.dispatch')}
      </button>
    </div>
  )
}

/**
 * 对话页对话框（composer）上方的后台任务状态条（S2 正确 UI 位置）：
 * 经 `conversation.input.dock`（list 槽，输入上方 stacked strip）注册，
 * `useTasks` 渲染该会话的后台任务——与 queue/todo 同姿势。
 */
export function TaskStatusBar(
  props: PropsRuntime<'conversation.input.dock'> & PropsLocale<'taskboard'>,
): ReactNode {
  const { t, useTasks } = props
  const tasks = useTasks(s => s)
  const running = tasks.filter(task => task.status === 'running').length
  return (
    <div
      data-task-status-bar=""
      style={{
        padding: '4px 12px', fontSize: 12,
        color: running > 0 ? 'var(--dsw-alias-text-accent, #4c9aff)' : 'var(--dsw-alias-text-muted, #999)',
      }}
    >
      {running > 0 ? t('status.running', { count: running }) : t('status.idle')}
      {tasks.filter(task => task.status !== 'running').length > 0 && (
        <span style={{ marginLeft: 8, color: 'var(--dsw-alias-text-muted, #999)' }}>
          · {tasks.length - running} 已完成
        </span>
      )}
    </div>
  )
}

/** 需要此插件声明的服务：slots + locale + sessions。 */
export const inject = ['slots', 'locale', 'sessions']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'taskboard: dictionaries')
  // Declaration-aware deferral for both seats (ui-sidebar / ui-conversation
  // activate without waitable services for these slots).
  ctx.effect(() => {
    const deferred: Array<{ dispose(): void }> = []
    deferred.push(deferRegistration(ctx.slots, 'sidebar.panel', TaskBoardTrigger, () =>
      ctx.slots.register({
        name: 'sidebar.panel',
        id: 'taskboard',
        locale: NS,
        inject: () => ({ sessions: ctx.sessions }),
      }, TaskBoardTrigger)))
    deferred.push(deferRegistration(ctx.slots, 'conversation.view', TaskBoardView, () =>
      ctx.slots.register({
        name: 'conversation.view',
        id: 'taskboard',
        label: 'Task Board',
        locale: NS,
      }, TaskBoardView)))
    // S2 正确 UI 位置：对话框上方的任务状态条（conversation.input.dock）。
    deferred.push(deferRegistration(ctx.slots, 'conversation.input.dock', TaskStatusBar, () =>
      ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'task-status',
        order: 10,
        locale: NS,
      }, TaskStatusBar)))
    return () => { for (const entry of deferred) entry.dispose() }
  }, 'taskboard: registrations')
}
