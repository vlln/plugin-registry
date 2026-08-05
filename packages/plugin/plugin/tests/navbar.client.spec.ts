// @vitest-environment jsdom
/**
 * DOM-level test for the vlln/navbar example plugin's client bundle
 * (registry release in the standalone repo, mirrored here for CI).
 * Verifies: dots render from user rows, click scrolls to the anchor,
 * dispose cleans up, and an unrelated DOM change does NOT trigger a
 * rebuild storm (the MutationObserver self-trigger regression).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInThisContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const BUNDLE_SOURCE = readFileSync(
  join(process.cwd(), 'packages/plugin/plugin/tests/fixtures/navbar.client.js'),
  'utf8',
)

interface Handoff { id: string; factory: (require: (spec: string) => unknown) => unknown }

function loadPlugin(): { apply: (ctx: unknown) => unknown } {
  const registered: Handoff[] = []
  ;(window as unknown as { __ModuleLoader__: { load: (h: Handoff) => void } }).__ModuleLoader__ = {
    load: (handoff: Handoff) => { registered.push(handoff) },
  }
  // The bundle runs in the page scope and calls window.__ModuleLoader__.load;
  // runInThisContext keeps it in the jsdom window's global context.
  runInThisContext(BUNDLE_SOURCE)
  const handoff = registered.at(-1)
  if (handoff === undefined) throw new Error('bundle did not register a factory')
  return handoff.factory(() => { throw new Error('no require in this bundle') }) as { apply: (ctx: unknown) => unknown }
}

/** jsdom has no ResizeObserver/IntersectionObserver; the bundle follows the
 * flow column's size for placement and tracks active rows via IO. */
class ObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObserverStub)
  vi.stubGlobal('IntersectionObserver', ObserverStub)
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

function flow(): HTMLElement {
  // 滚动容器（官方 [data-conversation-scroll] 的 overflow 祖先）包裹流列：
  // 点击跳转（jumpToRow）经 scrollerOf 找它。
  const scroller = document.createElement('div')
  scroller.style.overflowY = 'auto'
  const el = document.createElement('div')
  el.setAttribute('data-chat-flow', '')
  scroller.appendChild(el)
  document.body.appendChild(scroller)
  return el
}

function userRow(flow: HTMLElement, seq: number): HTMLElement {
  const row = document.createElement('div')
  row.setAttribute('data-chat-flow-kind', 'user')
  row.setAttribute('data-chat-anchor-key', `node:${seq}`)
  flow.appendChild(row)
  return row
}

function bar(): HTMLElement | null {
  return document.querySelector('nav[aria-label="用户消息导航"]')
}

function scrollerOf(): HTMLElement {
  const flow = document.querySelector<HTMLElement>('[data-chat-flow=""]')!
  let n: HTMLElement | null = flow.parentElement
  while (n !== null) {
    const s = getComputedStyle(n)
    if (s.overflowY === 'auto' || s.overflowY === 'scroll') return n
    n = n.parentElement
  }
  throw new Error('no scroller')
}

describe('vlln/navbar client bundle', () => {
  it('renders one nav dot per user row and scrolls to the anchor on click', () => {
    const flowEl = flow()
    userRow(flowEl, 100)
    userRow(flowEl, 101)
    const scroll = vi.fn()
    document.querySelectorAll<HTMLElement>('[data-chat-anchor-key="node:100"]').forEach((el) => { el.scrollIntoView = scroll })

    const disposer = loadPlugin().apply({}) as () => void

    expect(bar()).not.toBeNull()
    // One compact dot per user row (no text label — pure dots, title tooltip).
    const dots = bar()!.querySelectorAll('[data-vlln-dot]')
    expect(dots).toHaveLength(2)
    expect(dots[0]!.getAttribute('aria-label')).toContain('user #1')

    dots[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    // jumpToRow 手动平滑：第一步立即改 scrollTop ±1（wheel 起源内）。
    // jsdom 无布局（rect 全 0），方向判定退化——只断言发生了第一步移动。
    expect(Math.abs(scrollerOf().scrollTop)).toBe(1)

    disposer()
    expect(bar()).toBeNull()
  })

  it('re-renders dots when the flow region changes; fewer than 2 user rows hides the rail', () => {
    const flowEl = flow()
    userRow(flowEl, 100)
    const disposer = loadPlugin().apply({}) as () => void
    // One user row: the rail auto-hides (<2), so no dots.
    expect(bar()!.querySelectorAll('[data-vlln-dot]')).toHaveLength(0)

    userRow(flowEl, 102) // second user row -> observer fires -> two dots appear
    return new Promise<void>((resolve) => {
      // Wait past the rAF-debounced rebuild (jsdom rAF ~16ms > setTimeout 0).
      setTimeout(() => {
        expect(bar()!.querySelectorAll('[data-vlln-dot]')).toHaveLength(2)
        disposer()
        resolve()
      }, 50)
    })
  })

  it('does not rebuild on unrelated DOM changes (body-scoped observer filters its own mutations)', () => {
    flow()
    const disposer = loadPlugin().apply({}) as () => void

    // A change outside the flow region fires the body-scoped observer, but
    // the dot count is unchanged (no user row added) so the rebuild is
    // skipped — and the bar's own mutations never re-trigger it.
    const other = document.createElement('div')
    other.id = 'unrelated'
    document.body.appendChild(other)
    other.textContent = 'x'

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // Reaching here means no freeze (the regression loop would hang).
        expect(bar()).not.toBeNull()
        expect(bar()!.textContent).toBe('')
        disposer()
        resolve()
      }, 50)
    })
  })
})
