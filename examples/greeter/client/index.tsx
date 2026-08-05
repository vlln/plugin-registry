// acme/greeter 的浏览器端 half（client bundle 源码）。
//
// 用 ctx.ui.mount 渲染问候标记——通用渲染容器（generic client render
// container）：官方维护 overlay 浮层容器，插件渲染自己的 React UI 进去，
// 替代早期的 document.body.appendChild 自渲染。生命周期由 mount 绑定
// 插件 fiber：卸载自动 dispose。
//
// 构建：见 README.md「构建 client bundle」——tsdown（dsh 的
// packages/client/tsdown.client.ts preset）产出 client.js；react 走平台
// 模块（CLIENT_EXTERNALS），bundle 不内联。
import type { Context } from 'cordis'
import type {} from '@deepseek-ai/dsh-client-runtime/client'

/** 需要此插件声明的服务：ui（通用渲染容器）。 */
export const inject = ['ui']

export function apply(ctx: Context): void {
  const mount = ctx.ui.mount({ container: 'overlay', priority: 100 })
  mount.render(
    <div style={{ position: 'fixed', right: 8, bottom: 8, fontSize: 12, opacity: 0.9 }}>
      👋 greeter client half active
    </div>,
  )
}
