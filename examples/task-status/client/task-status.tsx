// vlln/task-status 浏览器端 half：验证 S2 后台任务 UI——对话页对话框
// （composer）上方的任务状态条。经 `conversation.input.dock`（list 槽，
// 与 queue/todo 同 strip）注册，`useTasks`（task/snapshot 帧投影）实时
// 渲染该会话的后台任务。S2 正确 UI 位置 = 对话框上方，非独立视图。
import type { Context } from 'cordis'
import type { ReactNode } from 'react'
// Context merges: slots/locale (runtime) reach this program through their
// client entries.
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// SlotMap merge: conversation.input.dock (ui-conversation) is declared by its
// contract.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { deferRegistration, type PropsLocale, type PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Task-status copy. */
    'task-status': TaskStatusKey
  }
}

const NS = 'task-status'
const zh = {
  'status.running': '{count} 个后台任务运行中',
  'status.idle': '无后台任务',
  'status.finished': '{count} 已完成',
} satisfies Record<string, string>
/** Task-status namespace key union. */
type TaskStatusKey = keyof typeof zh
const en = {
  'status.running': '{count} background task(s) running',
  'status.idle': 'No background tasks',
  'status.finished': '{count} finished',
} satisfies Record<string, string>

/**
 * 对话页对话框上方的后台任务状态条：`useTasks` 渲染该会话的后台任务
 * （running 计数高亮，已结算任务数附注）——与 queue/todo 同 strip 姿势。
 */
export function TaskStatusBar(
  props: PropsRuntime<'conversation.input.dock'> & PropsLocale<'task-status'>,
): ReactNode {
  const { t, useTasks } = props
  const tasks = useTasks(s => s)
  const running = tasks.filter(task => task.status === 'running').length
  const finished = tasks.length - running
  return (
    <div
      data-task-status-bar=""
      style={{
        padding: '4px 12px', fontSize: 12,
        color: running > 0 ? 'var(--dsw-alias-text-accent, #4c9aff)' : 'var(--dsw-alias-text-muted, #999)',
      }}
    >
      {running > 0 ? t('status.running', { count: running }) : t('status.idle')}
      {finished > 0 && (
        <span style={{ marginLeft: 8, color: 'var(--dsw-alias-text-muted, #999)' }}>
          · {t('status.finished', { count: finished })}
        </span>
      )}
    </div>
  )
}

/** 需要此插件声明的服务：slots + locale。 */
export const inject = ['slots', 'locale']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'task-status: dictionaries')
  ctx.effect(() => {
    const bar = deferRegistration(ctx.slots, 'conversation.input.dock', TaskStatusBar, () =>
      ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'task-status',
        order: 10,
        locale: NS,
      }, TaskStatusBar))
    return () => { bar.dispose() }
  }, 'task-status: registration')
}
