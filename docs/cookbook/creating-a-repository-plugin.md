# Cookbook：创建官方 repository-plugin（0809 格式）

> 本文是「创建官方 repository-plugin」的权威文档。官方 0809 的仓库插件格式（`.dsh-plugin` + `cordis.patch.yml` 安装）替代旧机制（`dsh.plugin.json`/`dsh registry`，已移除，见 [official-0809-coverage](../official-0809-coverage.md)）。完整参考实现：`whale-girl`（GUI 宠物插件，含门禁/决策/素材契约/自渲染 client）。

## 仓库布局

插件仓库（或仓库子目录）本身即插件，安装在 `.dsh-plugin/` 子目录：

```
my-plugin/
├── .dsh-plugin/
│   ├── package.json   # name/version + dsh.entry + scripts.prepack
│   ├── index.mjs      # Node half 入口：完整 Cordis 插件
│   ├── client/        # client 源码（自渲染脚本）
│   ├── client.js      # 构建产物（生成物，勿手改）
│   ├── assets/        # entry 路由静态服务的文件
│   └── src/           # 纯逻辑（零宿主依赖，可单测）
├── docs/  decisions/  # 仓库元资产（不进插件包）
└── scripts/           # 门禁与生成器（不进插件包）
```

分发路径全部留在 `.dsh-plugin/` 内（官方 containment 契约）。

## package.json——entry 契约

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

- **`dsh` 字段 strict**：只允许 `skills`/`mcpServers`/`entry`。无 `contributes`——工具在 entry 内经 `defineTool` 注册。
- **`scripts.prepack` 必须调用 `dsh-plugin-prepare`**（devDep `@deepseek-ai/dsh-repository-plugin`），生成固定 wrapper `dsh-plugin.mjs` + `dsh-plugin-assets/`，勿手写。
- **`dsh.entry` 是完整 Cordis 插件**：`name`/`inject`/`Config`/注册/启动失败/effect 清理语义全保留。

## Node half——Cordis entry

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

- 能力上限是完整 Cordis——事件（`ctx.on`）、服务（`ctx.provide`）、命令、system prompt、TUI，无需声明。
- **依赖解析**：entry 可 import 官方包（`@deepseek-ai/*`、`cordis`），官方运行时解析闭包；不要发明额外依赖。
- **注册是 effect**：`ctx.tools.register` 返回 disposer，用 `ctx.effect()`/`ctx.on()` 持有生命周期，disable 时清理。

## client half（可选）——自渲染

官方格式无动态 client-half 机制，带 UI 的插件自渲染：

1. entry 注册 httpServer 路由服务 client 脚本（`GET /my-plugin/ui.js`，`application/javascript`）
2. client 脚本自执行 DOM 渲染（无 `__ModuleLoader__` 契约），fetch entry 状态路由渲染进页面
3. 页面注入是插件自己的事（entry 向宿主页注入 `<script src="/my-plugin/ui.js">`，或宿主提供配置注入点）

完整模式见 `whale-girl`（`/whale-girl/ui.js` + `/whale-girl/state` + `/whale-girl/assets/*` 路由、tapIndex 注入）。

## 安装与验证

`$DSH_HOME/cordis.patch.yml` 一行：

```yaml
repository-plugins:
  repositories:
    - github:owner/my-plugin#<commit>&path:/.dsh-plugin
```

- 分发 = GitHub 仓库本身（clone + pnpm prepare + prepack），无发布流程、无注册表
- **安装与启用分离**——验证挂载后日志无 `plugin tree failed to load`

## 开发规范（让插件可维护）

参考 `whale-girl` 的纪律：

- **门禁**：机械检查 + 自证测试（每个门禁有非法样例测试证明会拒绝）；门禁清单在 `scripts/gates/run.mjs`，按改动面跑最窄证据
- **决策记录**：每个非平凡改动随附决策记录（`decisions/implemented/...`）——problem → decision → alternatives → consequences
- **生成物勿手改**：`client.js` 由构建生成（`--check` 守卫新鲜度）
- **按改动面验证**：client 改动 → 重建 + 浏览器冒烟；Node half 改动 → 门禁 + 重启 web（ESM 缓存：已挂载插件需重启）；assets → 重装 + 刷新（路由按请求读磁盘）
- **首次环境行为即沉淀**：宿主覆盖注入 CSS 等环境事实，第一次踩坑就写 bug-fix 决策记录标注「环境事实」

## 关联

- 官方格式决策与实证：[official-0809-coverage](../official-0809-coverage.md)
- 参考实现：`whale-girl` 迁移决策（`decisions/implemented/simplification/2026-08-10-migrate-to-official-repository-plugin.md`）
- 薄控制台：`packages/plugin/console`（经 `$DSH_HOME/cordis.patch.yml` 管理官方 repository 插件）
