# Cookbook：创建 registry 插件

> **历史文档（2026-08 转向后）**：本文描述 plugin-registry 已移除的独立机制（patch/CLI/`ctx.plugins`），仅作决策依据与演进记录保留；当前形态见 [official-0809-coverage](../official-0809-coverage.md) 与 `packages/plugin/console`。


目标：从零产出一个可安装、可启用的 registry 插件。前置：DSH 源码环境已集成 plugin-registry（见 [集成到 dsh](integrating-into-dsh.md)），`dsh registry` 命令可用。

## 1. 脚手架

```sh
dsh registry create acme/cool-tool
```

在 `./cool-tool` 生成三个文件：

| 文件 | 内容 |
|---|---|
| `dsh.plugin.json` | 清单（完整字段定义见 [manifest-format](../manifest-format.md)）：`id`（`publisher/name`）、`version`、`main`、`engines.dsh`、`contributes` |
| `index.mjs` | Cordis 插件入口（空 `apply(ctx)`） |
| `README.md` | 一句话说明 + 安装启用命令 |

清单经过与安装相同的解析器校验，所以**脚手架产物保证可安装**（直到你编辑它）。

## 2. 写入口

`index.mjs` 导出 Cordis 插件：函数、类或带 `apply(ctx)` 的对象。通过 ctx 服务注册能力。最小工具示例：

```js
import { defineTool } from '@deepseek-ai/dsh-tools'

export default {
  name: 'cool-tool',
  inject: ['tools'],               // 等待官方树 tools 服务就绪
  apply(ctx) {
    ctx.tools.register(defineTool({
      name: 'cool_tool',
      description: 'What it does.',
      parameters: { /* JSON Schema */ },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      execute: async (args) => 'result',
    }))
  },
}
```

其他能力面：`ctx.on()` 事件、`ctx.provide()` 新服务、`ctx.commands` 命令、`ctx.systemPrompt`、`ctx.tui` 覆盖层。能力上限是完整 Cordis，不是 `contributes` 声明（见 [architecture.md](../architecture.md#能力面-vs-声明面contributes)）。

**依赖解析**：入口可 `import` 官方包（`@deepseek-ai/*`、`cordis`）及 checkout 依赖闭包内的任意包——registry 在 `<dshHome>/plugins/node_modules` 维护指向 checkout 的共享链接（安装/挂载时自动确保，built 形态也成立）。插件**不能声明自己的 npm 依赖**（`dsh.plugin.json` 无 dependencies 字段），可用依赖 = checkout 的依赖闭包（见 [architecture.md](../architecture.md#插件依赖解析共享-nodemodules-链接)）。

## 3. 同步 contributes

`dsh.plugin.json` 的 `contributes.tools` 必须与入口实际注册的工具**逐名一致**：每个声明的必须注册，每个注册的必须声明。这是清单契约——启用时校验，缺失即报错回滚（[architecture.md](../architecture.md#信任边界)）。

```json
{ "contributes": { "tools": ["cool_tool"], "skills": [] } }
```

## 4. 安装、启用、验证

```sh
dsh registry install ./cool-tool        # 安装（默认禁用——信任边界）
dsh registry enable acme/cool-tool      # 启用（实时挂载）
dsh registry list                       # 验证：enabled acme/cool-tool@0.1.0
```

**验证点**：`dsh registry list` 显示 enabled 且版本正确；若启用失败，报错列出声明但未注册的工具。

**验证边界**：`enable` 只校验 contributes 名称与 manifest；工具 schema（value-schema DSL）与挂载错误只在 **web 重启**时暴露——验证循环必须包含一次 web 重启并确认日志无 `plugin tree failed to load`（实例：输出 schema 的 `required` 数组通过 enable 却在 web boot 崩溃）。

**带 client half 的生效边界**：enable 是**服务端实时**（`plugin.list` 立即可见），但浏览器端有进程边界——`dsh registry enable` 在 CLI 进程注册 client bundle，**已运行的 web 不感知，需重启 web**；在 **Web 面板里点启用**则是同进程，**刷新页面即可**（`__DSH_BOOT__` 在页面加载时固定，运行时新增的 bundle 不进已加载页面）。开发期 HMR 只对已在图内的 bundle 生效，新增 bundle 仍需刷新。

## 5. 开发-验证循环

```sh
dsh registry disable acme/cool-tool && dsh registry enable acme/cool-tool   # 改完重挂载
dsh registry uninstall acme/cool-tool                                     # 卸载
```

## 参考

- 完整可安装示例：`examples/greeter`（清单 + 入口 + README）
- Agent Skill `make-dsh-plugin`：同一流程的 agent 指导版，含常见坑
- 分发：见 [分发插件](distributing-plugins.md)
