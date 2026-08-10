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
  },
  {
    entry: ['src/client/index.ts'],
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outDir: 'lib',
    // 官方 client 契约：bundle 调用 window.__ModuleLoader__.load({id, factory})
    external: [/@deepseek-ai\/dsh-client-/, 'react'],
    banner: 'window.__ModuleLoader__.load({ id: "@dsh-external/plugin-console", factory: (require) => {',
    footer: 'return module.exports; } });',
  },
]
