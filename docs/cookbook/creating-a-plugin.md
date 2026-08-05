# Cookbook：创建 registry 插件

目标：从零产出一个可安装、可启用的 registry 插件。前置：DSH 源码环境已集成 plugin-registry（见 [集成到 dsh](integrating-into-dsh.md)），`dsh plugin` 命令可用。

## 1. 脚手架

```sh
dsh plugin create acme/cool-tool
```

在 `./cool-tool` 生成三个文件：

| 文件 | 内容 |
|---|---|
| `dsh.plugin.json` | 清单：`id`（`publisher/name`）、`version`、`main`、`engines.dsh`、`contributes` |
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
dsh plugin install ./cool-tool        # 安装（默认禁用——信任边界）
dsh plugin enable acme/cool-tool      # 启用（实时挂载）
dsh plugin list                       # 验证：enabled acme/cool-tool@0.1.0
```

**验证点**：`dsh plugin list` 显示 enabled 且版本正确；若启用失败，报错列出声明但未注册的工具。

## 5. 开发-验证循环

```sh
dsh plugin disable acme/cool-tool && dsh plugin enable acme/cool-tool   # 改完重挂载
dsh plugin uninstall acme/cool-tool                                     # 卸载
```

## 参考

- 完整可安装示例：`examples/greeter`（清单 + 入口 + README）
- Agent Skill `plugin-registry-create`：同一流程的 agent 指导版，含常见坑
- 分发：见 [分发插件](distributing-plugins.md)
