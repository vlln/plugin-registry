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
    bar.style.cssText = 'position:fixed;top:50%;transform:translateY(-50%);z-index:900;display:flex;flex-direction:column;gap:4px;padding:8px;background:rgba(20,20,20,.85);border-radius:8px;font-family:system-ui;'
    const body = document.body
    if (body === null) return
    body.appendChild(bar)

    // 位置：贴近对话流列右缘 + 12px 间距（不是视口右缘）——对话流是居中
    // 列，侧边栏/细节面板开合或窗口 resize 都会移动它，所以每次定位都
    // 现算现设；只在 left 变化时写样式，避免无谓重排。
    const position = (): void => {
      const flow = document.querySelector('[data-chat-flow=""]')
      if (flow === null) return
      const next = `${Math.round(flow.getBoundingClientRect().right + 12)}px`
      if (bar.style.left !== next) bar.style.left = next
    }

    // 重建导航点：扫描官方已渲染的 user 消息行——每个 user 消息一个可
    // 导航点（DOM 锚点契约，非数据通道）。点数未变（无新 user 消息）时
    // 跳过重建，避免 streaming 高频触发下反复清空重建导航条。
    const render = (): void => {
      position()
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
          row.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
        bar.appendChild(dot)
      })
    }
    render()

    // 观察 body 全量 + 过滤自身变更 + rAF 去抖：覆盖对话流挂载/重建
    // （hero → active、会话切换、翻页）——之前只观察 apply 时的流容器，
    // 它重建（或启动时尚未挂载）后导航条就再也不会更新。过滤掉 bar 自身
    // 的变更防止重建循环，rAF 合并同帧多次变更。
    let scheduled = false
    const observer = new MutationObserver((mutations) => {
      if (mutations.some(m => m.target === bar || bar.contains(m.target))) return
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(() => { scheduled = false; render() })
    })
    observer.observe(body, { childList: true, subtree: true })
    // 列宽变化（面板开合/resize）不动导航点集合但移动列：单独跟一次尺寸。
    const flow = document.querySelector('[data-chat-flow=""]')
    const sizeObserver = flow === null ? null : new ResizeObserver(() => { position() })
    if (sizeObserver !== null && flow !== null) sizeObserver.observe(flow)
    window.addEventListener('resize', position)

    // 插件生命周期：unload 时清理（fiber dispose → apply 返回的 disposer）。
    return () => {
      observer.disconnect()
      sizeObserver?.disconnect()
      window.removeEventListener('resize', position)
      bar.remove()
    }
  },
}
