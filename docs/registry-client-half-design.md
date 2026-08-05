# 设计：registry 插件支持 client half（浏览器端 UI 插件）

状态：**设计稿，未实现**。目标：让 registry 插件（如 `acme/greeter`）安装/启用后，其浏览器端 bundle 能进入 `window.__DSH_BOOT__` boot graph 并在 Web 端呈现/运行——即把 [architecture.md](architecture.md#web-边界registry-插件不是-client-插件) 的「未实现扩展方向」落地。本文基于对官方 client 插件通道的源码调研，覆盖现状链路、断点、登记/分发机制、构建契约、生命周期联动、验证方案与开放决策。

## 目标与范围

- **能做**：registry 插件声明 `client` 字段并携带浏览器 bundle → 安装/启用后进入 boot graph，浏览器加载其 bundle，fiber 创建（`inject` 等待生效）。
- **不做**：不改浏览器侧 `ClientModuleLoader`（加载契约不变）；不做 client 插件在线市场；不改变「安装默认禁用」信任边界。

## 现状链路：官方 client 插件如何进浏览器

浏览器端插件的加载通道（`packages/client/modules`）：

1. **Node 侧扫描**：`ClientModuleHostService`（`src/index.ts`）遍历 `ctx.loader.entries()`（Loader 配置树），对每个 entry 解析 package.json 的 `dshClient` 声明（`platform: 'web'`）+ `exports["./client"]`，得到 bundle 绝对路径（`resolveMeta`）。
2. **组合 graph**：`processOne(entryName)` 把每个合格 entry 建成一行 `WebPluginRecord`（`WebBootEntry`：`id`/`url`/`rev`/`inject`/`immediately`），`compose()` 产出 `WebBootGraph`，经 `injectBootManifest` 注入 `window.__DSH_BOOT__`（index.html `<head>` 首个 script）。
3. **路由服务**：`serveBundle` 处理 `/plugins/<id>/client.js`（及 `.map`），从 table 的 `clientPath` 读文件返回。
4. **浏览器加载**：`ClientModuleLoader`（`src/client/system.ts`）按 graph row 加载外部 classic script → 注册 factory（`window.__ModuleLoader__.load({id, factory})`）→ 首次 import 时 materialize。

扫描是增量式的：任何 `internal/plugin` 事件（fiber 构建/销毁）标记 entry name dirty，微任务 flush 与 loader entries 对照（`entry.fiber !== undefined && !entry.disabled`）。

## 断点：为什么 registry 插件进不了浏览器

`processOne` 只认 Loader 树 entry：

```ts
// internal/plugin 事件处理（构造函数内）
ctx.on('internal/plugin', (fiber) => {
  const entryName = fiber.entry?.options.name
  if (entryName === undefined) return   // ← registry 插件在这里被丢弃
  ...
})
```

registry 插件经 `ctx.plugin()` 在**运行时动态挂载**，`fiber.entry` 为 undefined（手动挂载/子插件），被 O(1) 丢弃；`processOne` 也只在 `ctx.loader.entries()` 里找名字。因此 registry 插件的 client bundle 永远进不了 table / boot graph。此外 registry 插件不是 npm 包：没有 package.json 的 `dshClient` 声明与 `exports["./client"]`，`resolveMeta` 无从解析。

## 设计一：登记机制（ClientModuleHostService 增加动态来源）

给 `ClientModuleHostService` 增加两个公开方法，直接把 registry 插件建成一行 table 记录（绕过 Loader entries 检查），`compose`/路由/注入全部复用：

```ts
/** Register one external (non-Loader-entry) client row, e.g. a registry plugin. */
registerExternal(id: string, opts: {
  clientPath: string            // bundle 绝对路径（安装后位于 <dshHome>/plugins/...）
  inject?: string[]
  immediately?: boolean
}): string                      // bundle rev

/** Remove a previously registered external row; unknown id is a no-op. */
unregisterExternal(id: string): void
```

要点：

- `registerExternal` 读 bundle 内容算 rev（复用 `shortHash`），建成 `graphRow(id, rev, inject, immediately)` 存入 table；若 id 已存在则替换（重装/重建场景）。`compose()` + `notifyGraphChanged()` 与扫描路径共享同一实现。
- **路由零改动**：`serveBundle` 按 `/plugins/<id>/client.js` 查 `clientPath(id)` 读文件——id 含斜杠（`acme/greeter`）与 scoped 包名同构，`pathname.slice(prefix.length, -suffix.length)` 已支持（现有注释即声明此意）。
- **注入零改动**：`injectBootManifest` 读 `this.composed`，外部行与扫描行一样进入 `__DSH_BOOT__`。
- **依赖方向**：`@deepseek-ai/dsh-plugin`（第三方 registry 包）调用 `@deepseek-ai/dsh-client-modules`（官方包）——官方包不被第三方反向依赖，方向正确。
- **时序**：页面加载时 `__DSH_BOOT__` 已固定；运行时 register 的变更对**已加载页面**不生效，下次页面刷新（或 HMR 桥）后可见——MVP 接受「启用后刷新生效」。

## 设计二：manifest client 字段（声明形态）

`dsh.plugin.json` 增加可选 `client` 对象，镜像官方 `dshClient` 声明的语义：

```json
{
  "id": "acme/greeter",
  "client": {
    "main": "./client.js",
    "inject": ["@deepseek-ai/dsh-client-connection"],
    "immediately": false
  }
}
```

| 字段 | 必填 | 含义 |
|---|---|---|
| `main` | ✅ | 浏览器 bundle 相对路径（相对插件根；与 `main` 并列，指向构建产物） |
| `inject` | 可选 | 浏览器侧依赖的 client 服务（`connection`/`runtime` 等官方 client 包名） |
| `immediately` | 可选 | 是否 stage-one 预取；缺省 false（懒加载） |

校验：`manifest.ts` 的解析器（`parseManifest`）对 `client` 做结构校验（main 为字符串、inject 为字符串数组、immediately 为布尔），坏声明在安装/启用时报错——与现有 `contributes` 同级的「声明即契约」。

## 设计三：分发机制（tarball/目录携带 bundle）

- registry 插件目录（或 tarball 解压后）内含 `client.js` 等构建产物；`installPlugin` 已把整个目录复制进 `<dshHome>/plugins/<publisher>/<name>/`，bundle 随目录落地，**tarball 协议零改动**。
- 启用时 `client.main` 相对插件根解析为绝对路径 → `registerExternal(id, { clientPath })` → `/plugins/<publisher>/<name>/client.js` 可服务。
- 与「安装默认禁用」一致：**只有 enable 才登记**，禁用的插件不进 boot graph、浏览器拿不到其 bundle。

## 构建契约（bundle 格式）

registry 插件的 client bundle 必须满足浏览器侧加载契约，与官方 client 包同一约束：

- **factory 注册**：脚本执行 `window.__ModuleLoader__.load({ id, factory })`，`factory(require)` 返回导出面（CJS 工厂形态；tsdown client preset 的 banner/footer 生成此结构，`packages/client/tsdown.client.ts`）。
- **外部依赖只允许平台模块**：`CLIENT_EXTERNALS`（`PLATFORM_MODULES` + runtime store 豁免）——即 `connection`/`runtime`/`ui-slots` 等官方 client 包走 module table 解析；其余 `@deepseek-ai/*` 值导入是构建错误（bundle purity gate），跨插件协作走 cordis 服务。
- **CSS Modules** 由 lightningcss 内联，`<style data-plugin>` 注入。
- **sourcemap** 可选：`.map` 路由已存在，作者可随包分发。

实现上建议提供一份「registry client bundle 构建模板」（tsdown config 骨架或构建脚本），作者在插件目录内构建产物后随插件分发——构建不发生在安装时。

## 生命周期联动（PluginLocalService）

`packages/plugin/plugin/src/service.ts` 的 `PluginLocalService` 是挂载入口，client 登记与其同步：

| 动作 | Node 侧 | client 侧 |
|---|---|---|
| `mount(id)` 成功 | fiber 创建 + 贡献校验 | 读 `manifest.client` → 存在则 `registerExternal` |
| `unmount(id)` | fiber 释放 | `unregisterExternal(id)` |
| `enable(id)` | mount + 索引置位 | 随 mount 登记 |
| `disable(id)` | unmount + 索引复位 | 随 unmount 注销 |
| `uninstall(id)` | unmount + 删目录 | 随 unmount 注销 |
| `reconcile()`（load 时） | 逐个 mount enabled | 随 mount 登记 |

**可选服务模式**：`clientModuleHost` 只在 Web 组合存在（CLI/headless 组合无 modules 包）。`mount` 内用 root 属性读（与 `verifyContributions` 读 `tools` 同模式）：`(this.ctx.root as { clientModuleHost?: ClientModuleHostService }).clientModuleHost`，undefined 时跳过登记——CLI-only 环境不受影响。`@deepseek-ai/dsh-plugin` 需将 `@deepseek-ai/dsh-client-modules` 加入 peerDependencies（type-only import，运行时经 root 属性访问）。

## 验证方案

- **modules 包单测**（`packages/client/modules/tests/node-half.spec.ts` 扩展）：`registerExternal` 加行/替换/`unregisterExternal` 删除后 `graph()` 变化；`serveBundle` 对 `/plugins/acme/greeter/client.js` 返回 bundle 内容、未知 id 404。
- **plugin 包测试**（`service.spec.ts` 扩展）：fake `clientModuleHost` 置于 root → `mount` 触发 register、`unmount` 触发 unregister；root 无该服务时 mount 正常跳过。
- **冒烟**：`examples/greeter` 加 client half（带构建产物）→ install + enable → 浏览器 boot graph 含 `acme/greeter` 行、`/plugins/acme/greeter/client.js` 200、fiber 创建。

## 开放决策

1. **bundle 构建模板归属**：仓库内提供 tsdown 模板 vs 文档示例 vs 社区自备——影响作者上手成本。
2. **`inject` 白名单**：registry client half 可注入的官方 client 服务是否设白名单（安全面）还是开放所有平台模块。
3. **HMR**：外部行是否纳入 `rebuilt()`/`onGraphChanged` 通知（启用后不刷新即生效）——MVP 可不做。
4. **校验强度**：`client.main` 指向缺失文件时，启用报错（与 `contributes` 一致）还是仅警告。
5. **多 bundle**：一个插件只支持一个 client bundle（本文假设）还是可声明多个（按 surface）。

## 参考

- 官方 client 通道实现：`packages/client/modules/src/index.ts`、`src/client/system.ts`、`src/client/manifest.ts`
- 构建约定：`packages/client/tsdown.client.ts`（banner/footer、CLIENT_EXTERNALS、purity gate）
- registry 挂载：`packages/plugin/plugin/src/service.ts`、`src/manifest.ts`、`src/registry.ts`
- 现有示例：`examples/greeter`（无 client half）
