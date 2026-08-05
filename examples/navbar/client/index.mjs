// vlln/navbar 的浏览器端 half（自渲染 + DOM 锚点契约）。
//
// 验证设计文档 S1（client-ui-extension-model.md）：自渲染插件能否只靠
// 官方已有的 DOM 锚点属性（data-chat-flow-kind / data-chat-anchor-key）
// 实现「user 消息导航条」，零数据通道依赖。官方 ChatView 在每条消息行
// 打这两个属性（ChatView.tsx:655-657），user 行的
// data-chat-flow-kind === "user"，锚点 key 为 node:<seq>。
//
// 构建：复制此文件为 client.js（无外部依赖、无 CSS、无 sourcemap），
// 或按 README.md「构建 client bundle」用 bundler 产出。
export default {
  name: 'navbar-client',
  apply() {
    // 导航条容器：fixed 定位到右缘（z-index 取官方浮层阶梯之下、正文之上）。
    const bar = document.createElement('nav')
    bar.setAttribute('aria-label', '用户消息导航')
    bar.style.cssText = 'position:fixed;right:8px;top:50%;transform:translateY(-50%);z-index:900;display:flex;flex-direction:column;gap:4px;padding:8px;background:rgba(20,20,20,.85);border-radius:8px;font-family:system-ui;'
    const body = document.body
    if (body === null) return
    body.appendChild(bar)

    // 重建导航条：扫描官方已渲染的 user 消息行（DOM 锚点契约，非数据通道）。
    const render = (): void => {
      bar.textContent = ''
      const rows = [...document.querySelectorAll('[data-chat-flow-kind="user"]')]
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

    // 官方重渲染（新消息/翻页）后重建：MutationObserver 监听会话流区域。
    const observer = new MutationObserver(() => { render() })
    observer.observe(body, { childList: true, subtree: true })
    // 插件生命周期：unload 时清理（fiber dispose → apply 返回的 disposer）。
    return () => {
      observer.disconnect()
      bar.remove()
    }
  },
}
