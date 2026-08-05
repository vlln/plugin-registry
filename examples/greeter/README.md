# acme/greeter

示例插件：注册一个 `greet` 工具，并带浏览器端 client half（页面右下角显示问候标记）。演示 registry 插件的完整形态：Node 侧工具 + 浏览器侧 UI。

## 文件

| 文件 | 作用 |
|---|---|
| `dsh.plugin.json` | 清单：身份、入口、兼容范围、`contributes.tools` 声明、`client.main` 声明 |
| `index.mjs` | Node 侧 Cordis 插件入口：`inject: ['tools']` + `ctx.tools.register(...)` |
| `client.js` | 浏览器端 bundle 产物（`window.__ModuleLoader__.load` 契约） |
| `client/index.tsx` | client bundle 源码（`ctx.ui.mount` 渲染，tsdown 构建见下） |

## 安装与启用

```sh
dsh plugin install ./examples/greeter   # 安装（默认禁用）
dsh plugin enable acme/greeter          # 启用：挂载 greet 工具 + 登记 client half
dsh plugin list                         # 看到 enabled acme/greeter@0.1.0
```

启用后：模型可调用 `greet` 工具；Web 端刷新页面后，右下角出现「👋 greeter client half active」（经 `ctx.ui.mount({container:'overlay'})` 渲染进官方通用渲染容器——见 [通用渲染容器设计](../../docs/generic-client-render-container-design.md)）。

## 构建 client bundle

生产插件请用构建工具生成 `client.js`，而不是手写。两个途径：

1. **在 dsh 源码环境内**（推荐）：插件目录放 `tsdown.config.ts`，引用 dsh 的 client preset 或等价配置（外部依赖只能是平台模块 `connection`/`runtime` 等，其余内联；见独立仓库 `docs/registry-client-half-design.md`「构建契约」），构建产物随插件分发。
2. **任意 bundler**：按契约手工产出——脚本调用 `window.__ModuleLoader__.load({ id, factory })`，`factory(require)` 返回 Cordis 插件导出面，`id` 必须等于插件 id（`acme/greeter`）。本示例的 `client.js` 即此形式的最小产物。

## 契约要点

- `contributes.tools` 声明的 `greet` 与入口注册的工具名**必须一致**，否则启用报错并回滚挂载。
- `client.main` 指向的 bundle 必须存在（安装时校验）；bundle 的 `id` 必须等于插件 id。
- 浏览器 fiber 的 `inject` 由 **bundle 自身导出**决定；manifest `client.inject` 只是图元数据。
- 能力不限工具：插件还能监听事件、提供服务、注册命令等（详见仓库根 README「能力面 vs 声明面」）。
