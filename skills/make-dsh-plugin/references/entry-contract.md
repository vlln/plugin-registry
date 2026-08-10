# Entry 契约详情（dsh.entry）

`dsh.entry` 指向的完整 Cordis 插件契约。权威：`docs/cookbook/creating-a-repository-plugin.md`；本文件是 SKILL.md 的深读材料，仅在开发 Node half 时读取。

## package.json 模板

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "type": "module",
  "files": ["index.mjs", "src", "client", "client.js", "assets",
            "dsh-plugin.mjs", "dsh-plugin-assets"],
  "scripts": { "prepack": "dsh-plugin-prepare" },
  "dsh": { "entry": "./index.mjs" },
  "devDependencies": { "@deepseek-ai/dsh-repository-plugin": "0.0.1" },
  "dependencies": { "@deepseek-ai/dsh-tools": "0.0.1", "cordis": "^4.0.0-rc.7" }
}
```

## 约束

- **`dsh` 字段 strict**：只允许 `skills`/`mcpServers`/`entry`（官方 schema）。无 `contributes`——工具在 entry 内经 `defineTool` 注册。
- **`scripts.prepack` 必须调用 `dsh-plugin-prepare`**（devDep `@deepseek-ai/dsh-repository-plugin`）——生成固定 wrapper `dsh-plugin.mjs` + `dsh-plugin-assets/`，勿手写。
- **`dsh.entry` 是完整 Cordis 插件**：`name`/`inject`/`Config`/注册/启动失败/effect 清理语义全保留。

## Node half 最小模板

```js
import { defineTool } from '@deepseek-ai/dsh-tools'

export default {
  name: 'my-plugin',
  inject: ['httpServer', 'tools'],
  apply(ctx) {
    ctx.tools.register(defineTool({
      name: 'my_tool',
      description: 'What it does.',
      parameters: { type: 'object', properties: {} },
      output: { schema: { type: 'string' } },
      execute: async () => 'result',
    }))
  },
}
```

## 能力面

- **完整 Cordis**：事件（`ctx.on`）、服务（`ctx.provide`）、命令、system prompt、TUI——无需声明。
- **工具**：`ctx.tools.register(defineTool(...))`。
- **注册是 effect**：返回 disposer，用 `ctx.effect()`/`ctx.on()` 持有生命周期，disable 时清理。

## 依赖解析

entry 可 import 官方包（`@deepseek-ai/*`、`cordis`），官方运行时解析闭包。不要发明额外依赖。

## 验证

- Node half 改动 → 门禁 + 重启 web（ESM 缓存：已挂载插件需重启）。
- 挂载后日志无 `plugin tree failed to load`。
