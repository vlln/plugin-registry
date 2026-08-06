// acme/greeter 的浏览器端 half（client bundle 源码）。
//
// 纯 DOM 自渲染：插件自己创建挂载节点并 append 到 body（官方通用渲染
// 容器 ctx.ui 已从 plugin-registry 移除——本示例演示插件侧自造缝）。
// 生命周期由 apply 返回的 disposer 绑定插件 fiber：卸载自动清理。
//
// 构建：见 README.md「构建 client bundle」——tsdown（dsh 的
// packages/client/tsdown.client.ts preset）产出 client.js；react 走平台
// 模块（PLATFORM_MODULES），bundle 不内联。
import { createRoot } from 'react-dom/client'
import type { Context } from 'cordis'
import type {} from '@deepseek-ai/dsh-client-runtime/client'

/** 纯 DOM 自渲染：不需要服务注入。 */
export const inject = []

export function apply(ctx: Context): void {
  const host = document.createElement('div')
  host.setAttribute('data-greeter', '')
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(
    <div style={{ position: 'fixed', right: 8, bottom: 8, fontSize: 12, opacity: 0.9 }}>
      👋 greeter client half active
    </div>,
  )
  return () => { root.unmount(); host.remove() }
}
