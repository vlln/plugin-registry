// vlln/task-status 浏览器端 half：验证 S2 后台任务 UI——对话页对话框
// （composer）上方的任务状态条。经 `conversation.input.dock`（list 槽，
// 与 queue/todo 同 strip）注册，`useTasks`（task/snapshot 帧投影）实时
// 渲染该会话的后台任务。
//
// 仅对话页显示：对话流列 `[data-chat-flow=""]` 只存在于 Chat 视图（与
// navbar 同一信号）——组件用 MutationObserver 检测其存在性，切到
// trajectory/taskboard 等视图时隐藏、切回恢复。零官方改动。
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
  'status.finished': '{count} 已完成',
  'status.open': '展开',
  'status.close': '收起',
  'task.running': '运行中',
  'task.stopping': '停止中',
  'task.completed': '已完成',
  'task.killed': '已终止',
  'task.failed': '失败',
} satisfies Record<string, string>
/** Task-status namespace key union. */
type TaskStatusKey = keyof typeof zh
const en = {
  'status.running': '{count} background task(s) running',
  'status.finished': '{count} finished',
  'status.open': 'Expand',
  'status.close': 'Collapse',
  'task.running': 'Running',
  'task.stopping': 'Stopping',
  'task.completed': 'Completed',
  'task.killed': 'Killed',
  'task.failed': 'Failed',
} satisfies Record<string, string>

/** 布局变量对齐官方 dock 家族（ConversationRoot.module.css）。 */
const SIDE_CLEARANCE = 'var(--dsh-composer-side-clearance, 16px)'
const DOCK_INSET = 'var(--dsh-composer-dock-inset, 8px)'
const CARD_MAX = 'var(--dsh-composer-card-max-width, 780px)'

/** 每状态视觉：token + glyph 字符（14px outline 家族近似）。 */
const STATUS_META: Record<string, { color: string; glyph: string; label: string }> = {
  running: { color: 'var(--dsw-alias-state-business-primary)', glyph: '●', label: 'task.running' },
  stopping: { color: 'var(--dsw-alias-state-warn-primary)', glyph: '◐', label: 'task.stopping' },
  completed: { color: 'var(--dsw-alias-state-success-primary)', glyph: '✓', label: 'task.completed' },
  killed: { color: 'var(--dsw-alias-label-caption)', glyph: '✕', label: 'task.killed' },
  failed: { color: 'var(--dsw-alias-state-error-primary)', glyph: '!', label: 'task.failed' },
}

/**
 * 对话页对话框上方的后台任务状态条：仅 Chat 视图显示（`[data-chat-flow=""]`
 * 探针），`useTasks` 渲染该会话任务（running 高亮 + 展开逐条）。
 */
export function TaskStatusBar(
  props: PropsRuntime<'conversation.input.dock'> & PropsLocale<'task-status'>,
): ReactNode {
  const { t, useTasks } = props
  const tasks = useTasks(s => s)
  const [inChat, setInChat] = useState(false)
  const [open, setOpen] = useState(false)

  // 对话页探针：flow 列存在性（navbar 同信号）。body 级 observer 只跑
  // querySelector，回调轻量；view 切换（flow 移除/重建）都触发。
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
  const running = tasks.filter(task => task.status === 'running').length
  const finished = tasks.length - running
  if (tasks.length === 0) return null

  const statusOf = (status: string): { color: string; glyph: string; label: string } =>
    STATUS_META[status] ?? { color: 'var(--dsw-alias-label-caption)', glyph: '·', label: status }

  const header = (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '4px 5px 4px 12px',
        cursor: tasks.length > 1 ? 'pointer' : 'default',
      }}
      onClick={tasks.length > 1 ? () => setOpen(v => !v) : undefined}
    >
      <span style={{ width: 16, fontSize: 14, lineHeight: '16px', textAlign: 'center', color: 'var(--dsw-alias-label-tertiary)' }}>
        ⚙
      </span>
      <span style={{ flex: 1, fontSize: 13, lineHeight: '24px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }}>
        {t('status.running', { count: running })}
        {finished > 0 && (
          <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--dsw-alias-label-tertiary)' }}>
            · {t('status.finished', { count: finished })}
          </span>
        )}
      </span>
      {tasks.length > 1 && (
        <span style={{ padding: '0 8px', fontSize: 12, color: 'var(--dsw-alias-label-caption)' }}>
          {open ? t('status.close') : t('status.open')}
        </span>
      )}
    </div>
  )

  const row = (task: { id: string; label: string; status: string; detail?: string }): ReactNode => {
    const meta = statusOf(task.status)
    return (
      <div
        key={task.id}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px',
          borderRadius: 8,
        }}
        title={task.detail}
      >
        <span style={{ width: 16, fontSize: 14, lineHeight: '16px', textAlign: 'center', color: meta.color }}>
          {meta.glyph}
        </span>
        <span style={{ flex: 1, fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.label}
        </span>
        <span style={{ fontSize: 12, color: meta.color, whiteSpace: 'nowrap' }}>
          {t(meta.label as TaskStatusKey)}
        </span>
      </div>
    )
  }

  return (
    <div
      data-task-status-bar=""
      style={{
        width: `calc(100% - 2 * ${SIDE_CLEARANCE} - 4 * ${DOCK_INSET})`,
        maxWidth: `calc(${CARD_MAX} - 4 * ${DOCK_INSET})`,
        margin: '0 auto',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 12,
        background: 'var(--dsw-specific-tip)',
        overflow: 'hidden',
        fontSize: 13,
        fontFamily: 'system-ui',
      }}
    >
      {header}
      {open && (
        <div style={{ maxHeight: 180, overflowY: 'auto', borderTop: '1px solid var(--dsw-alias-border-l1)' }}>
          {tasks.map(row)}
        </div>
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
