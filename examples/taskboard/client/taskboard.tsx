// vlln/taskboard 浏览器端 half：注册 sidebar.panel 入口，验证统一设计
// 文档 S5 场景的 sidebar 缝机制件。
import type { Context } from 'cordis'
import type { ReactNode } from 'react'
// Context merges: slots (runtime) and locale (locale plugin) reach this program
// through their client entry type-only imports.
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
const zh = { 'panel.trigger': 'Task Board' } satisfies Record<string, string>
/** Task board namespace key union. */
type TaskBoardKey = keyof typeof zh
const en = { 'panel.trigger': 'Task Board' } satisfies Record<string, string>

/** sidebar.panel 入口按钮（宽行态）。 */
export function TaskBoardTrigger(props: PropsRuntime<'sidebar.panel'> & PropsLocale<'taskboard'>): ReactNode {
  const { t } = props
  return (
    <button
      type="button"
      style={{ width: '100%', padding: '6px 10px', border: 'none', background: 'transparent', color: 'inherit', textAlign: 'left', cursor: 'pointer', fontSize: 13 }}
    >
      {t('panel.trigger')}
    </button>
  )
}

/** 需要此插件声明的服务：slots + locale。 */
export const inject = ['slots', 'locale']

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
