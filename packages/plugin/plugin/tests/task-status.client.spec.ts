// @vitest-environment jsdom
/**
 * DOM 级测试 for the vlln/task-status example plugin's client bundle
 * (registry release in the standalone repo, mirrored here for CI).
 * Verifies (0806 S2 场景):
 * 1. 展开任务卡后 detail 不再有冗余的「类型：<kind> · <time>」行；
 * 2. 输出 tail 累积正确——旧增量契约（无 full 标志）逐次追加；
 *    peek 全文契约（full: true）整段替换；
 * 3. 输出直接渲染（无额外 <pre> 包裹层）。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInThisContext } from 'node:vm'
import { createRoot } from 'react-dom/client'
import * as react from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const BUNDLE_SOURCE = readFileSync(
  join(process.cwd(), 'packages/plugin/plugin/tests/fixtures/task-status.client.js'),
  'utf8',
)

interface Handoff { id: string; factory: (require: (spec: string) => unknown) => unknown }

/** Load the bundle, capture the registered TaskStatusBar via a fake ctx. */
function loadComponent(): (props: unknown) => react.ReactNode {
  const registered: Handoff[] = []
  ;(window as unknown as { __ModuleLoader__: { load: (h: Handoff) => void } }).__ModuleLoader__ = {
    load: (handoff: Handoff) => { registered.push(handoff) },
  }
  const requireStub = (spec: string): unknown => {
    if (spec === 'react') return react
    if (spec === '@deepseek-ai/dsh-client-ui-primitives') {
      return { StateDot: () => null }
    }
    if (spec === '@deepseek-ai/dsh-client-ui-slots') return {}
    throw new Error(`unexpected require: ${spec}`)
  }
  runInThisContext(BUNDLE_SOURCE)
  const handoff = registered.at(-1)
  if (handoff === undefined) throw new Error('bundle did not register a factory')
  const mod = handoff.factory(requireStub) as { apply: (ctx: unknown) => void }
  let component: ((props: unknown) => react.ReactNode) | undefined
  const ctx = {
    effect: (fn: () => unknown): (() => void) => { fn(); return () => {} },
    locale: { register: (): void => {} },
    slots: {
      inject: (_name: string, fn: () => unknown): void => { fn() },
      register: (_opts: unknown, comp: (props: unknown) => react.ReactNode): void => { component = comp },
    },
  }
  mod.apply(ctx)
  if (component === undefined) throw new Error('TaskStatusBar was not registered')
  return component
}

/** fetch stub: TASKS 路由固定返回 running 任务；OUTPUT 路由按调用序返回 delta 或全文。 */
function stubFetch(outputResponses: Array<{ text: string; full?: boolean }>): void {
  let outputCall = 0
  const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<unknown> => {
    const url = String(input)
    if (url.includes('/tasks')) {
      return {
        ok: true,
        json: async () => ({
          tasks: [{
            id: 'bash-test', kind: 'bash', label: '输出行 测试任务', status: 'running',
            startedAt: Date.now() - 1000, ownerSession: 'test-session',
          }],
        }),
      }
    }
    if (url.includes('/output')) {
      const res = outputResponses[Math.min(outputCall, outputResponses.length - 1)]
      outputCall += 1
      return { ok: true, json: async () => ({ ...res, snapshot: { status: 'running' } }) }
    }
    throw new Error(`unexpected fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
}

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  // 对话流列探针：TaskStatusBar 只在 Chat 视图显示。
  const flow = document.createElement('div')
  flow.setAttribute('data-chat-flow', '')
  document.body.appendChild(flow)
})

afterEach(() => {
  root?.unmount()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const t = (key: string, params?: Record<string, unknown>): string => {
  const zh: Record<string, string> = {
    'status.running': '{count} 个后台任务运行中',
    'task.running': '运行中',
  }
  const tmpl = zh[key] ?? key
  return params === undefined ? tmpl : tmpl.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k]))
}

async function mount(): Promise<void> {
  const TaskStatusBar = loadComponent()
  root = createRoot(container)
  root.render(react.createElement(TaskStatusBar, { t, session: { sessionId: 'test-session' } }))
  await wait(20) // effects flush
}

describe('vlln/task-status client bundle', () => {
  it('expands a task card: no redundant 类型 line, output accumulates on the old delta contract, no pre wrapper', async () => {
    stubFetch([
      { text: 'd1' },
      { text: 'd2' },
      { text: 'd3' },
    ])
    await mount()
    await wait(1200) // first tasks poll

    const bar = document.querySelector('[data-task-status-bar]')
    expect(bar).not.toBeNull()
    expect(bar!.textContent).toContain('输出行 测试任务')

    // 展开任务行：React 的 onClick 走根容器事件委托（el.onclick 为 null），
    // 故按文本找最内层含任务标签的 div，派发冒泡 click 触发行处理器。
    const rowEl = Array.from(bar!.querySelectorAll('div')).filter(d => (d.textContent ?? '').includes('输出行')).at(-1)
    expect(rowEl).toBeDefined()
    rowEl!.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    await wait(1200) // 立即 poll + 第 1 个间隔轮询 → d1, d2
    await wait(1200) // d3
    await wait(1200) // 稳定帧

    const text = bar!.textContent
    // 1) 无冗余「类型：」行
    expect(text).not.toContain('类型：')
    // 2) 增量契约下输出累积（d1d2d3 全文可见，而不是只剩最后一个 delta）
    expect(text).toContain('d1d2d3')
    // 3) 输出不再套 <pre> 包裹层
    expect(bar!.querySelector('pre')).toBeNull()
  })

  it('replaces whole output on the peek contract (full: true)', async () => {
    stubFetch([
      { text: 'full-output-v1', full: true },
      { text: 'full-output-v2', full: true },
    ])
    await mount()
    await wait(1200)

    const bar = document.querySelector('[data-task-status-bar]')!
    const rowEl = Array.from(bar.querySelectorAll('div')).filter(d => (d.textContent ?? '').includes('输出行')).at(-1)
    rowEl!.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    await wait(1200) // 立即 poll → full-output-v1
    await wait(1200) // 间隔 poll → full-output-v2（整段替换，不追加）

    const text = bar!.textContent
    expect(text).toContain('full-output-v2')
    // 替换语义：v1 不得残留（追加会变成 v1v2）
    expect(text).not.toContain('full-output-v1full-output-v2')
  })
})
