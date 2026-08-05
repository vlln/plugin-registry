// acme/greeter 的浏览器端 half（client bundle 源码）。
//
// 这是 Cordis 插件（导出带 apply 的对象），会被浏览器侧作为 loader entry
// 加载：bundle 的 factory 注册到 window.__ModuleLoader__ 后，浏览器按 graph
// row 创建 fiber，apply(ctx) 在浏览器上下文执行。此示例在页面标题栏追加
// 一个问候标记，演示 client half 能操作 DOM。
//
// 构建：见 README.md「构建 client bundle」——用 tsdown（dsh 的
// packages/client/tsdown.client.ts preset 或等价配置）产出 client.js，
// 随插件目录一起分发。示例提交的 client.js 是手写的最小等价产物，
// 可直接安装启用（无外部依赖，factory 即为导出面）。
export default {
  name: 'greeter-client',
  apply(ctx) {
    if (typeof document !== 'undefined') {
      const tag = document.createElement('span')
      tag.textContent = '👋 greeter client half active'
      tag.style.cssText = 'position:fixed;right:8px;bottom:8px;font-size:12px;opacity:.9;z-index:2147483647'
      document.body?.appendChild(tag)
    }
  },
}
