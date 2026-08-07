// @vitest-environment jsdom
/**
 * DOM-level test for the vlln/navbar example plugin's client bundle
 * (registry release in the standalone repo, mirrored here for CI).
 * Verifies: dots render from user rows (0806 锚点契约：data-time-hover-root +
 * 气泡结构，排除 assistant/Think 行), click scrolls to the anchor, stale dot
 * closures re-resolve rows after DOM replacement, dispose cleans up, and an
 * unrelated DOM change does NOT trigger a rebuild storm (the MutationObserver
 * self-trigger regression).
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

/** 0806 DOM 结构：flowItem（data-chat-flow-kind + data-chat-anchor-key）内嵌
 * userRow（data-time-hover-root + 气泡）。返回 userRow（navbar 的行锚点）。 */
function userRow(flow: HTMLElement, seq: number, text = ''): HTMLElement {
  const item = document.createElement('div')
  item.setAttribute('data-chat-flow-kind', 'user')
  item.setAttribute('data-chat-anchor-key', `node:${seq}`)
  const row = document.createElement('div')
  row.setAttribute('data-time-hover-root', '')
  const bubble = document.createElement('div')
  bubble.className = 'bubble'
  bubble.textContent = text
  row.appendChild(bubble)
  item.appendChild(row)
  flow.appendChild(item)
  return row
}

function bar(): HTMLElement | null {
  return document.querySelector('nav[aria-label="用户消息导航"]')
}

function preview(): HTMLElement | null {
  return document.querySelector('[data-vlln-preview]')
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
    userRow(flowEl, 100, 'first')
    userRow(flowEl, 101, 'second')
    // assistant/Think 行（data-time-hover-root 但无气泡）不得被当成 user 行。
    const think = document.createElement('div')
    think.setAttribute('data-time-hover-root', '')
    const thinkBody = document.createElement('div')
    thinkBody.className = 'markdown-body'
    think.textContent = 'Think ...'
    think.appendChild(thinkBody)
    flowEl.appendChild(think)

    const disposer = loadPlugin().apply({}) as () => void

    expect(bar()).not.toBeNull()
    // 每个 user 行一个 dot；assistant/Think 行不产生 dot。
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

  it('re-resolves stale rows after DOM replacement (click/preview use the latest row)', () => {
    const flowEl = flow()
    userRow(flowEl, 100, 'A')
    userRow(flowEl, 101, 'B')
    const disposer = loadPlugin().apply({}) as () => void
    const dots = bar()!.querySelectorAll('[data-vlln-dot]')
    expect(dots).toHaveLength(2)

    // 用同锚点的新节点原位替换第 1 个 user 行（React 重建场景：旧节点脱离文档）。
    const oldItem = document.querySelector<HTMLElement>('[data-chat-anchor-key="node:100"]')!
    const newItem = document.createElement('div')
    newItem.setAttribute('data-chat-flow-kind', 'user')
    newItem.setAttribute('data-chat-anchor-key', 'node:100')
    const newRow = document.createElement('div')
    newRow.setAttribute('data-time-hover-root', '')
    const newBubble = document.createElement('div')
    newBubble.className = 'bubble'
    newBubble.textContent = 'A2'
    newRow.appendChild(newBubble)
    newItem.appendChild(newRow)
    oldItem.replaceWith(newItem)

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // 重建后 dot 仍为 2 个；悬停/聚焦预览显示的是最新行文本（防旧闭包）。
        const after = bar()!.querySelectorAll('[data-vlln-dot]')
        expect(after).toHaveLength(2)
        after[0]!.dispatchEvent(new FocusEvent('focus'))
        expect(preview()!.textContent).toBe('A2')
        expect(newRow.isConnected).toBe(true)

        // 点击仍触发第一步跳转（resolveRow 命中当前节点）。
        after[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        expect(Math.abs(scrollerOf().scrollTop)).toBe(1)

        disposer()
        resolve()
      }, 50)
    })
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
    // the row set is unchanged (no user row added) so the rebuild is
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
