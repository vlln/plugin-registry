// vlln/taskboard 浏览器端 half：注册 sidebar.panel 入口，点击展开浮层展示
// Agent/会话活动（S5 场景）。视图切换（conversation.view）需 root→session
// 跨槽通道（F9 未实现），此处用自渲染浮层替代——root 作用域内完成。
import { useState } from 'react'
import type { Context } from 'cordis'
import type { ReactNode } from 'react'
// Context merges: slots (runtime), locale, and sessions (for the session
// count the overlay reads) reach this program through their client entries.
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// SlotMap merge: sidebar.panel is declared by ui-sidebar's contract.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
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
  'panel.overlayTitle': 'Task Board',
  'panel.empty': '暂无会话',
  'panel.sessions': '会话：',
  'panel.dispatch': '分派任务（占位）',
} satisfies Record<string, string>
/** Task board namespace key union. */
type TaskBoardKey = keyof typeof zh
const en = {
  'panel.trigger': 'Task Board',
  'panel.overlayTitle': 'Task Board',
  'panel.empty': 'No sessions',
  'panel.sessions': 'Sessions: ',
  'panel.dispatch': 'Dispatch (placeholder)',
} satisfies Record<string, string>

/** sidebar.panel 入口按钮：点击展开浮层。 */
export function TaskBoardTrigger(props: PropsRuntime<'sidebar.panel'> & PropsLocale<'taskboard'>): ReactNode {
  const { t, useSessions } = props
  const [open, setOpen] = useState(false)
  const list = useSessions(s => s)
  const count = list === undefined ? 0 : Object.keys(list.byId).length
  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(v => !v) }}
        style={{ width: '100%', padding: '6px 10px', border: 'none', background: 'transparent', color: 'inherit', textAlign: 'left', cursor: 'pointer', fontSize: 13 }}
      >
        {t('panel.trigger')}
      </button>
      {open && (
        <div style={{ position: 'fixed', right: 16, top: 16, zIndex: 900, width: 280, padding: 16, background: 'var(--dsw-alias-bg-layer-1, #1e1e1e)', border: '1px solid var(--dsw-alias-border-l2, #444)', borderRadius: 8, fontFamily: 'system-ui' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>{t('panel.overlayTitle')}</h3>
          {count === 0
            ? <p style={{ fontSize: 13, color: 'var(--dsw-alias-label-tertiary, #888)' }}>{t('panel.empty')}</p>
            : <p style={{ fontSize: 13 }}>{t('panel.sessions')}{count}</p>}
          <button
            type="button"
            onClick={() => { setOpen(false) }}
            style={{ marginTop: 10, padding: '6px 12px', fontSize: 13 }}
          >
            {t('panel.dispatch')}
          </button>
        </div>
      )}
    </>
  )
}

/** 需要此插件声明的服务：slots + locale + sessions。 */
export const inject = ['slots', 'locale', 'sessions']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'taskboard: dictionaries')
  // Declaration-aware deferral: ui-sidebar activates without any waitable
  // service, so a bare register races boot (intermittent 'slot is not
  // declared'). Mirrors how ui-settings/ui-workspace register their seats.
  ctx.effect(() => {
    const deferred = deferRegistration(ctx.slots, 'sidebar.panel', TaskBoardTrigger, () =>
      ctx.slots.register({
        name: 'sidebar.panel',
        id: 'taskboard',
        locale: NS,
      }, TaskBoardTrigger))
    return () => { deferred.dispose() }
  }, 'taskboard: registrations')
}
