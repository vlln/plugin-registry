// vlln/navbar 的浏览器端 half（自渲染 + DOM 锚点契约）。
//
// 实现 issue dsh-external/issues#144「对话节点导航条」规格（registry 插件
// 版）：对话区右缘等距节点串（每 user 消息一节点）——激活药丸跟随阅读
// 位置、悬停/聚焦玻璃预览卡（6 行截断）、点击平滑滚动 + 品牌蓝高亮环、
// >11 节点滑动窗口、平时隐形悬停浮现磨砂胶囊、prefers-reduced-motion、
// <2 条 user 消息自动隐藏。
//
// 零数据通道依赖：只靠官方锚点属性（data-chat-flow-kind="user" /
// data-chat-anchor-key，ChatView 每条消息行都打）。
//
// 构建：复制此文件为 client.js 的手写等价物（CJS + ModuleLoader 包装，
// 同 greeter 模式），或按 README.md「构建 client bundle」用 bundler 产出。
export default {
  name: 'navbar-client',
  apply() {
    const body = document.body
    if (body === null) return

    const STYLE_ID = 'vlln-navbar-style'
    if (document.getElementById(STYLE_ID) === null) {
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = `
[data-vlln-navbar] {
  position: fixed; top: 50%; transform: translateY(-50%); z-index: 900;
  display: flex; flex-direction: column; gap: 10px; padding: 8px;
  border-radius: 12px; font-family: system-ui;
  max-height: calc(100vh - 32px); overflow-y: auto;
  background: transparent; border: 1px solid transparent;
  transition: background .18s ease, border-color .18s ease;
}
[data-vlln-navbar]:hover {
  background: rgba(30, 30, 34, .55);
  -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
  border-color: rgba(255, 255, 255, .08);
}
[data-vlln-dot] {
  width: 7px; height: 7px; border-radius: 999px; padding: 0; border: none;
  background: rgba(128, 128, 140, .45); cursor: pointer; flex: none;
  transition: width .22s ease, background .22s ease, transform .22s ease;
}
[data-vlln-dot]:hover { background: rgba(128, 128, 140, .8); transform: scale(1.25); }
[data-vlln-dot].active {
  width: 22px; border-radius: 999px;
  background: var(--dsw-alias-text-accent, #4c9aff);
}
[data-vlln-dot].pulse { animation: vlln-navbar-pulse .9s ease-out; }
@keyframes vlln-navbar-pulse {
  0% { box-shadow: 0 0 0 0 rgba(76, 154, 255, .55); }
  100% { box-shadow: 0 0 0 10px rgba(76, 154, 255, 0); }
}
[data-vlln-preview] {
  position: fixed; z-index: 910; max-width: 320px; min-width: 200px;
  padding: 10px 12px; border-radius: 10px; font-size: 12px; line-height: 1.55;
  color: var(--dsw-alias-text-1, #eee);
  background: rgba(24, 24, 28, .72);
  -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px);
  border: 1px solid rgba(255, 255, 255, .1);
  box-shadow: 0 8px 28px rgba(0, 0, 0, .35);
  overflow: hidden; white-space: pre-wrap; word-break: break-word;
  display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical;
  pointer-events: none;
}
[data-vlln-more] { width: 3px; height: 3px; border-radius: 999px; background: rgba(128,128,140,.5); flex: none; }
@media (prefers-reduced-motion: reduce) {
  [data-vlln-navbar], [data-vlln-dot], [data-vlln-dot].active, [data-vlln-dot].pulse {
    transition: none; animation: none;
  }
}
`
      document.head.appendChild(style)
    }

    // 导航条容器（等距节点串；平时隐形，悬停浮现磨砂胶囊托底）。
    const bar = document.createElement('nav')
    bar.setAttribute('data-vlln-navbar', '')
    bar.setAttribute('aria-label', '用户消息导航')
    body.appendChild(bar)
    // 预览卡（悬停/聚焦节点时贴节点弹出，玻璃模糊 + 6 行截断）。
    const preview = document.createElement('div')
    preview.setAttribute('data-vlln-preview', '')
    preview.style.display = 'none'
    body.appendChild(preview)

    const flowOf = (): HTMLElement | null => document.querySelector('[data-chat-flow=""]')
    const scrollerOf = (): HTMLElement | null => {
      const flow = flowOf()
      if (flow === null) return null
      let n: HTMLElement | null = flow.parentElement
      while (n !== null) {
        const s = getComputedStyle(n)
        if (s.overflowY === 'auto' || s.overflowY === 'scroll') return n
        n = n.parentElement
      }
      return null
    }
    const userRows = (): HTMLElement[] =>
      [...document.querySelectorAll<HTMLElement>('[data-chat-flow-kind="user"]')]

    // 位置：贴近对话流列右缘 + 12px，钳制视口内（列移动时触发，不进每帧路径）。
    const position = (): void => {
      const flow = flowOf()
      if (flow === null) return
      const right = flow.getBoundingClientRect().right
      const next = Math.round(Math.min(right + 12, window.innerWidth - bar.offsetWidth - 8))
      const nextLeft = `${Math.max(8, next)}px`
      if (bar.style.left !== nextLeft) bar.style.left = nextLeft
    }

    // 激活态：当前阅读头经过的最后一条 user 消息。滚动只重算激活（rAF
    // 节流，无逐帧测量）；激活药丸在节点串上滑动。
    let activeIndex = -1
    const computeActive = (): number => {
      const rows = userRows()
      if (rows.length === 0) return -1
      const mid = window.innerHeight * 0.35 // 阅读头参考线
      let idx = 0
      for (let i = 0; i < rows.length; i++) {
        const top = rows[i]!.getBoundingClientRect().top
        if (top <= mid) idx = i
        else break
      }
      return idx
    }

    const WINDOW = 11 // 超过则滑动窗口
    const HALF_WINDOW = 5

    // 预览：显示消息开头（最多 6 行，CSS line-clamp 截断）。
    const showPreview = (row: HTMLElement, anchor: HTMLElement): void => {
      const text = (row.textContent ?? '').trim()
      if (text === '') return
      preview.textContent = text
      preview.style.display = 'block'
      const r = anchor.getBoundingClientRect()
      const cardW = 320
      const x = r.left - cardW - 14
      preview.style.left = `${Math.max(8, x)}px`
      preview.style.top = `${Math.min(window.innerHeight - 120, r.top - 12)}px`
    }
    const hidePreview = (): void => { preview.style.display = 'none' }

    // 渲染节点串：等距节点 + 滑动窗口（>11 时显示激活 ± 5，端点细点）。
    const render = (): void => {
      position()
      const rows = userRows()
      // <2 条 user 消息自动隐藏。
      if (rows.length < 2) {
        bar.style.display = 'none'
        return
      }
      bar.style.display = 'flex'
      const active = computeActive()
      activeIndex = active
      // 窗口：>11 节点时截断（显示激活附近一段），端点细点暗示还有更多。
      const windowed = rows.length > WINDOW
      const lo = windowed ? Math.max(0, active - HALF_WINDOW) : 0
      const hi = windowed ? Math.min(rows.length - 1, active + HALF_WINDOW) : rows.length - 1
      // 重建（点数/窗口变化时才重建；滚动只走 updateActive 不重建）。
      const dotCount = hi - lo + 1 + (windowed ? 2 : 0) // +2 端点细点
      if (bar.childElementCount === dotCount && rows.length >= 2) {
        updateActive()
        return
      }
      bar.textContent = ''
      if (windowed && lo > 0) {
        const more = document.createElement('span')
        more.setAttribute('data-vlln-more', '')
        bar.appendChild(more)
      }
      for (let i = lo; i <= hi; i++) {
        const dot = document.createElement('button')
        dot.type = 'button'
        dot.setAttribute('data-vlln-dot', '')
        dot.title = `user #${i + 1}（点击跳转）`
        const row = rows[i]!
        dot.addEventListener('mouseenter', () => showPreview(row, dot))
        dot.addEventListener('mouseleave', hidePreview)
        dot.addEventListener('focus', () => showPreview(row, dot))
        dot.addEventListener('blur', hidePreview)
        dot.addEventListener('click', () => {
          // 平滑滚动。官方 ChatView 在 pinned-to-bottom 时把非 wheel 的
          // 程序化滚动拉回底部（follow 逻辑）；先派发一个 wheel 事件触发
          // 官方 onWheel 记录 wheel 起源，使本次滚动被视为用户滚轮输入、
          // 不被拉回（合成 wheel 无默认滚动，只建立起源标记）。
          const scroller = scrollerOf()
          if (scroller !== null) {
            scroller.dispatchEvent(new WheelEvent('wheel', {
              deltaY: 1, bubbles: true, cancelable: true,
            }))
          }
          row.scrollIntoView({ behavior: 'smooth', block: 'start' })
          // 到达提示：药丸绽开品牌蓝高亮环。
          dot.classList.add('pulse')
          setTimeout(() => dot.classList.remove('pulse'), 950)
        })
        if (i === active) dot.classList.add('active')
        bar.appendChild(dot)
      }
      if (windowed && hi < rows.length - 1) {
        const more = document.createElement('span')
        more.setAttribute('data-vlln-more', '')
        bar.appendChild(more)
      }
    }

    // 滚动只重算激活态（rAF 节流）：激活药丸滑动，不动节点重建。
    const updateActive = (): void => {
      const next = computeActive()
      if (next === activeIndex) return
      activeIndex = next
      render()
    }

    // 流容器绑定：初始 + 每次检测到流重建（会话切换/hero→active 等）时
    // 重绑尺寸观察并重新定位。
    let flow = flowOf()
    let sizeObserver: ResizeObserver | null = null
    const bindFlow = (): void => {
      const next = flowOf()
      if (next === flow) return
      flow = next
      sizeObserver?.disconnect()
      sizeObserver = flow === null ? null : new ResizeObserver(() => { position() })
      if (sizeObserver !== null && flow !== null) sizeObserver.observe(flow)
      position()
    }
    bindFlow()
    window.addEventListener('resize', position)
    // 滚动监听：重算激活态（rAF 节流）。
    let scrollScheduled = false
    const onScroll = (): void => {
      if (scrollScheduled) return
      scrollScheduled = true
      requestAnimationFrame(() => { scrollScheduled = false; updateActive() })
    }
    let scroller = scrollerOf()
    const bindScroller = (): void => {
      const next = scrollerOf()
      if (next === scroller) return
      scroller?.removeEventListener('scroll', onScroll)
      scroller = next
      scroller?.addEventListener('scroll', onScroll, { passive: true })
    }
    bindScroller()
    render()

    // 观察 body 全量，但回调只响应两类变更：流容器被替换，或变更落在
    // 当前流容器内（新消息/翻页/内容尺寸变化）。其他区域完全不触发——
    // 避免每帧 reflow 拖死页面。rAF 去抖合并同帧多次变更。
    let scheduled = false
    const schedule = (): void => {
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(() => { scheduled = false; render() })
    }
    const observer = new MutationObserver((mutations) => {
      bindFlow()
      bindScroller()
      for (const m of mutations) {
        if (m.target === bar || bar.contains(m.target)) continue
        if (m.target === preview || preview.contains(m.target)) continue
        if (flow !== null && (m.target === flow || flow.contains(m.target))) {
          schedule()
          return
        }
      }
    })
    observer.observe(body, { childList: true, subtree: true })

    // 插件生命周期：unload 时清理（fiber dispose → apply 返回的 disposer）。
    return () => {
      observer.disconnect()
      sizeObserver?.disconnect()
      scroller?.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', position)
      bar.remove()
      preview.remove()
      document.getElementById(STYLE_ID)?.remove()
    }
  },
}
