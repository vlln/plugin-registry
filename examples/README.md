# 从零开发一个 registry 插件

最快路径：**复制 `examples/greeter` 改**，或 **`dsh plugin create` 脚手架**。两种方式得到的插件都能直接安装、启用、验证。

## 方式一：脚手架（推荐起点）

```sh
dsh plugin create acme/cool-tool        # 在 ./cool-tool 生成 dsh.plugin.json + index.mjs + README
cd cool-tool
# 编辑 index.mjs：写你的插件逻辑（注册工具、监听事件、提供服务…）
# 编辑 dsh.plugin.json：把 contributes.tools 声明成入口实际注册的工具名
dsh plugin install .                    # 安装（默认禁用）
dsh plugin enable acme/cool-tool        # 启用（实时挂载；声明未注册会报错回滚）
```

## 方式二：复制示例改

```sh
cp -r examples/greeter ./my-tool
# 改 dsh.plugin.json 的 id/description/contributes，改 index.mjs 的工具注册
dsh plugin install ./my-tool && dsh plugin enable <publisher>/<name>
```

进阶示例：`examples/loop` 演示命令 + 工具双形态（`/loop` 命令 + `loop` 工具 + `ctx.interval` 定时 + `agent.followup` 每轮驱动），需要定时循环能力时直接安装它：`dsh plugin install ./examples/loop && dsh plugin enable acme/loop`。

## 一个插件 = 清单 + Cordis 入口

| 文件 | 必须 | 说明 |
|---|---|---|
| `dsh.plugin.json` | ✅ | `id`（`publisher/name`）、`version`、`main`（入口路径）、`engines.dsh`、`contributes.tools` |
| `index.mjs` | ✅ | Cordis 插件：导出函数 / 类 / 带 `apply(ctx)` 的对象；通过 `ctx` 服务注册能力 |
| `README.md` | 建议 | 一句话说明 + 安装启用命令 |

## 工具注册模板

```js
import { defineTool } from '@deepseek-ai/dsh-tools'

export default {
  name: 'my-tool',
  inject: ['tools'],                 // 等待官方树 tools 服务就绪
  apply(ctx) {
    ctx.tools.register(defineTool({
      name: 'my_tool',
      description: 'What it does.',
      parameters: { /* JSON Schema 参数 */ },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      execute: async (args) => 'result',
    }))
  },
}
```

## 除了工具还能做什么

插件是完整 Cordis 插件，能力不限工具：`ctx.on()` 事件、`ctx.provide()` 新服务、`ctx.commands` 命令、`ctx.systemPrompt` 提示词、`ctx.tui` 覆盖层。`contributes` 目前只校验 `tools`/`skills`，其余能力「无声明但可用」（详见仓库根 README「能力面 vs 声明面」）。

## 开发-验证循环

```sh
dsh plugin disable acme/cool-tool && dsh plugin enable acme/cool-tool   # 改完重挂载
dsh plugin list                                                          # 看状态与版本
dsh plugin uninstall acme/cool-tool                                      # 卸载
```

## 分发

打 tarball 分发：

```sh
tar -czf cool-tool.tgz -C ./cool-tool .
dsh plugin install cool-tool.tgz     # 解压严格校验，防路径穿越
```

## 校验器

启用时 registry 校验 `contributes.tools` 每个声明都已被入口注册；缺失 → 报错并回滚挂载（不产生半挂载状态）。这是「声明即契约」的防线：改清单必须同步改入口，反之亦然。
