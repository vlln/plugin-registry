// vlln/taskboard 浏览器端 half：注册 sidebar.panel 入口 + conversation.view
// 视图，验证统一设计文档 S5 场景（sidebar 缝 + 视图环）。
import { useEffect, useState } from 'react'
import type { Context } from 'cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { deferRegistration } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Task board copy. */
    'taskboard': Record<string, string>
  }
}

const NS = 'taskboard'
const zh: Record<string, string> = { 'panel.trigger': 'Task Board', 'view.title': 'Task Board', 'view.empty': '暂无会话' }
const en: Record<string, string> = { 'panel.trigger': 'Task Board', 'view.title': 'Task Board', 'view.empty': 'No sessions' }

/** sidebar.panel 入口按钮：点击把当前会话视图切到 task board。 */
export function TaskBoardTrigger(props: PropsRuntime<'sidebar.panel'>): React.ReactNode {
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

/** conversation.view 视图：列出当前会话（Agent 卡片 + 占位分派按钮）。 */
export function TaskBoardView(props: PropsRuntime<'conversation.view'>): React.ReactNode {
  const { t, useSession } = props
  const [snapshot] = useSession(s => s)
  const userCount = snapshot?.nodes.filter(n => n.kind === 'user').length ?? 0
  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>{t('view.title')}</h2>
      {userCount === 0
        ? <p style={{ color: 'var(--dsw-alias-label-tertiary, #888)', fontSize: 13 }}>{t('view.empty')}</p>
        : <p style={{ fontSize: 13 }}>{userCount} 条 user 消息（Agent 活动）</p>}
      <button type="button" style={{ marginTop: 8, padding: '6px 12px', fontSize: 13 }}>
        分派任务（占位）
      </button>
    </div>
  )
}

/** 需要此插件声明的服务：slots（注册槽）+ locale（文案）。 */
export const inject = ['slots', 'locale']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'taskboard: dictionaries')
  ctx.effect(() => {
    const trigger = ctx.slots.register({
      name: 'sidebar.panel',
      id: 'taskboard',
      locale: NS,
    }, TaskBoardTrigger)
    const view = deferRegistration(ctx.slots, 'conversation.view', TaskBoardView, () =>
      ctx.slots.register({
        name: 'conversation.view',
        id: 'taskboard',
        label: 'taskboard',
        locale: NS,
      }, TaskBoardView))
    return () => { trigger(); view() }
  }, 'taskboard: registrations')
}
