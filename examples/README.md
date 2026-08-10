# 从零开发一个 registry 插件

> **已废弃（2026-08 转向后）**：本目录示例演示 plugin-registry 已移除的旧机制
> （`dsh.plugin.json` + `dsh registry` CLI + `ctx.plugins` 管理）。官方 0809 已提供
> 仓库插件格式（`.dsh-plugin`），当前交付物为薄控制台（`packages/plugin/console`）。
> 本目录仅作历史演进记录保留，不再作为开发模板。


最快路径：**复制 `examples/greeter` 改**，或 **`dsh registry create` 脚手架**。两种方式得到的插件都能直接安装、启用、验证。

## 方式一：脚手架（推荐起点）

```sh
dsh registry create acme/cool-tool        # 在 ./cool-tool 生成 dsh.plugin.json + index.mjs + README
cd cool-tool
# 编辑 index.mjs：写你的插件逻辑（注册工具、监听事件、提供服务…）
# 编辑 dsh.plugin.json：把 contributes.tools 声明成入口实际注册的工具名
dsh registry install .                    # 安装（默认禁用）
dsh registry enable acme/cool-tool        # 启用（实时挂载；声明未注册会报错回滚）
```

## 方式二：复制示例改

```sh
cp -r examples/greeter ./my-tool
# 改 dsh.plugin.json 的 id/description/contributes，改 index.mjs 的工具注册
dsh registry install ./my-tool && dsh registry enable <publisher>/<name>
```

进阶示例：`examples/loop` 演示命令 + 工具双形态（`/loop` 命令 + `loop` 工具 + `ctx.interval` 定时 + `agent.followup` 每轮驱动），需要定时循环能力时直接安装它：`dsh registry install ./examples/loop && dsh registry enable acme/loop`。

浏览器端示例：`examples/greeter` 带 client half（`client` 声明 + `client.js` bundle），启用后 Web 刷新可见右下角问候标记——演示插件同时拥有 Node 侧工具与浏览器侧 UI，见 [`examples/greeter/README.md`](greeter/README.md)。

UI 示例：`examples/navbar`（S1 自渲染导航条）、`examples/task-status`（S2 对话框上方后台任务状态条，自造缝：官方槽 + Node 轮询路由）——见各目录 README 与 [统一心智模型](../docs/client-ui-extension-model.md)。

## 一个插件 = 清单 + Cordis 入口

| 文件 | 必须 | 说明 |
|---|---|---|
| `dsh.plugin.json` | ✅ | 清单（完整字段定义见 [manifest-format](../docs/manifest-format.md)）：`id`（`publisher/name`）、`version`、`main`（入口路径）、`engines.dsh`、`contributes.tools` |
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
dsh registry disable acme/cool-tool && dsh registry enable acme/cool-tool   # 改完重挂载
dsh registry list                                                          # 看状态与版本
dsh registry uninstall acme/cool-tool                                      # 卸载
```

## 分发

打 tarball 分发：

```sh
tar -czf cool-tool.tgz -C ./cool-tool .
dsh registry install cool-tool.tgz     # 解压严格校验，防路径穿越
```

## 校验器

启用时 registry 校验 `contributes.tools` 每个声明都已被入口注册；缺失 → 报错并回滚挂载（不产生半挂载状态）。这是「声明即契约」的防线：改清单必须同步改入口，反之亦然。
