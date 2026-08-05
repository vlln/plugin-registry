// vlln/navbar 的浏览器端 half（自渲染 + DOM 锚点契约）。
//
// 验证设计文档 S1（client-ui-extension-model.md）：自渲染插件能否只靠
// 官方已有的 DOM 锚点属性（data-chat-flow-kind / data-chat-anchor-key）
// 实现「user 消息导航条」，零数据通道依赖。官方 ChatView 在每条消息行
// 打这两个属性（ChatView.tsx:655-657），user 行的
// data-chat-flow-kind === "user"，锚点 key 为 node:<seq>。
//
// 构建：复制此文件为 client.js 的手写等价物（CJS + ModuleLoader 包装，
// 同 greeter 模式），或按 README.md「构建 client bundle」用 bundler 产出。
export default {
  name: 'navbar-client',
  apply() {
    // 导航条容器：fixed 定位，水平位置跟随对话流列（见 position()），
    // z-index 取官方浮层阶梯之下、正文之上。
    const bar = document.createElement('nav')
    bar.setAttribute('aria-label', '用户消息导航')
    bar.style.cssText = 'position:fixed;top:50%;transform:translateY(-50%);z-index:900;display:flex;flex-direction:column;gap:4px;padding:8px;background:rgba(20,20,20,.85);border-radius:8px;font-family:system-ui;max-height:calc(100vh - 32px);overflow-y:auto;'
    const body = document.body
    if (body === null) return
    body.appendChild(bar)

    // 位置：贴近对话流列右缘 + 12px 间距（不是视口右缘）。只在列移动时
    // 触发（列重建 / 列尺寸变化 / 窗口 resize）——绝不放进 render 的每帧
    // 路径：getBoundingClientRect 强制 reflow，高频跑会拖死主线程。
    const position = (): void => {
      const flow = flowOf()
      if (flow === null) return
      // 贴近对话流列右缘 + 12px 间距，但钳制在视口内（不溢出右缘——窄
      // 视口/详情面板展开下列右缘可能贴近甚至越过视口，溢出会盖住滚动条
      // 和交互区）。offsetWidth 读取会触发一次 reflow，仅在列移动时调用。
      const right = flow.getBoundingClientRect().right
      const next = Math.round(Math.min(right + 12, window.innerWidth - bar.offsetWidth - 8))
      const nextLeft = `${Math.max(8, next)}px`
      if (bar.style.left !== nextLeft) bar.style.left = nextLeft
    }
    const flowOf = (): HTMLElement | null => document.querySelector('[data-chat-flow=""]')

    // 重建导航点：扫描官方已渲染的 user 消息行——每个 user 消息一个可
    // 导航点（DOM 锚点契约，非数据通道）。点数未变（无新 user 消息）时
    // 跳过重建，避免 streaming 高频触发下反复清空重建导航条。
    const render = (): void => {
      const rows = [...document.querySelectorAll('[data-chat-flow-kind="user"]')]
      if (rows.length === bar.childElementCount) return
      bar.textContent = ''
      rows.forEach((row, index) => {
        const dot = document.createElement('button')
        dot.type = 'button'
        dot.title = `user #${index + 1}（点击跳转）`
        dot.textContent = String(index + 1)
        dot.style.cssText = 'width:20px;height:20px;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:transparent;color:#fff;font-size:11px;cursor:pointer;'
        dot.addEventListener('click', () => {
          // auto（非 smooth）：官方 ChatView 在非 wheel 滚动且 pinned-to-bottom
          // 时把 scrollTop 拉回底部（follow 逻辑）；smooth 动画每帧触发
          // scroll 事件 → 每帧被拉回 → 滚动永远到不了目标，无限滚动循环
          // 拖死主线程（整页假死）。auto 一次性滚动，至多被拉回一次。
          row.scrollIntoView({ behavior: 'auto', block: 'start' })
        })
        bar.appendChild(dot)
      })
    }

    // 流容器绑定：初始 + 每次检测到流重建（会话切换/hero→active 等）时
    // 重绑尺寸观察并重新定位。sizeObserver 观察流容器尺寸（面板开合、
    // resize 引起的列移动）。
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
    render() // 初始渲染（后续变更经 observer 增量更新）
    window.addEventListener('resize', position)

    // 观察 body 全量，但回调只响应两类变更：流容器被替换（重建），或
    // 变更落在当前流容器内（新消息/翻页）。其他区域（侧边栏、其他插件
    // UI、导航条自身）完全不触发——避免每帧 reflow 拖死页面。rAF 去抖
    // 合并流区域内同帧的多次变更。
    let scheduled = false
    const schedule = (): void => {
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(() => { scheduled = false; render() })
    }
    const observer = new MutationObserver((mutations) => {
      bindFlow() // 流可能刚被替换（会话切换）
      for (const m of mutations) {
        if (m.target === bar || bar.contains(m.target)) continue
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
      window.removeEventListener('resize', position)
      bar.remove()
    }
  },
}
