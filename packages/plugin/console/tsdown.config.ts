/**
 * 薄控制台构建：Node half（host 侧，写 cordis.patch.yml）+ client half
 * （浏览器面板）。0 patch 独立包——不依赖官方 monorepo preset，配置
 * 无 import（tsdown 支持裸对象导出，避免仓库外解析问题）。
 */

export default [
  {
    entry: ['src/index.ts'],
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    outDir: 'lib',
    clean: true,
    // bundle 语义：官方包（@deepseek-ai/*）由 profile 的 pnpm 闭包在挂载时
    // 注入——不打包（本地也无公共 npm 可解析），与 client 配置同理由。
    external: [/@deepseek-ai\//],
  },
  {
    name: '@vlln/plugin-console/client',
    entry: { client: 'src/client/index.ts' },
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    outDir: 'lib',
    dts: false,
    clean: false,
    // 官方 client 契约：bundle 调用 window.__ModuleLoader__.load({id, factory})。
    // CJS（ESM 输出与顶层 return 不兼容，已实证浏览器解析失败）。
    // module/exports 定义放 banner（intro 会被 esbuild 折叠内联，footer 引
    // module 会 ReferenceError——实证）；footer 返回 exports。
    external: [/@deepseek-ai\/dsh-client-/, 'react'],
    outputOptions: {
      entryFileNames: 'index.js',
      banner: 'window.__ModuleLoader__.load({ id: "@vlln/plugin-console", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
      footer: 'return exports; } });',
    },
  },
]
