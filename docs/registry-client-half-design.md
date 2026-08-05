# 设计：registry 插件支持 client half（浏览器端 UI 插件）

状态：**设计稿（v2，经 subagent 评审修订），未实现**。目标：让 registry 插件（如 `acme/greeter`）安装/启用后，其浏览器端 bundle 能进入 `window.__DSH_BOOT__` boot graph 并在 Web 端呈现/运行——即把 [architecture.md](architecture.md#web-边界registry-插件不是-client-插件) 的「未实现扩展方向」落地。本文基于对官方 client 插件通道的源码调研与独立评审，覆盖现状链路、断点、登记/分发机制、构建契约、生命周期联动、验证方案与开放决策。

## 目标与范围

- **能做**：registry 插件声明 `client` 字段并携带浏览器 bundle → 安装/启用后进入 boot graph，浏览器加载其 bundle，fiber 创建（`inject` 等待生效）。
- **不做**：不改浏览器侧 `ClientModuleLoader` 与 `boot.tsx`（加载契约不变）；不做 client 插件在线市场；不改变「安装默认禁用」信任边界。
- **边界陈述**：两条 client 通道并存——**官方 client 插件**（`dsh-client-*` 包，随产品发布，进 Loader 树）与 **registry client 插件**（用户安装，运行时登记）。前者是产品结构，后者是用户扩展；同一能力建议先做官方包，registry client half 服务本地安装场景。

## 现状链路：官方 client 插件如何进浏览器

浏览器端插件的加载通道（`packages/client/modules`）：

1. **Node 侧扫描**：`ClientModuleHostService`（`src/index.ts`）遍历 `ctx.loader.entries()`（Loader 配置树），对每个 entry 解析 package.json 的 `dshClient` 声明（`platform: 'web'`）+ `exports["./client"]`，得到 bundle 绝对路径（`resolveMeta`）。
2. **组合 graph**：`processOne(entryName)` 把每个合格 entry 建成一行 `WebPluginRecord`（`WebBootEntry`：`id`/`url`/`rev`/`inject`/`immediately`），`compose()` 产出 `WebBootGraph`，经 `injectBootManifest` 注入 `window.__DSH_BOOT__`（index.html `<head>` 首个 script）。
3. **路由服务**：`serveBundle` 处理 `/plugins/<id>/client.js`（及 `.map`），从 table 的 `clientPath` 读文件返回。
4. **浏览器加载**：`ClientModuleLoader`（`src/client/system.ts`）按 graph row 加载外部 classic script → 注册 factory（`window.__ModuleLoader__.load({id, factory})`）→ 首次 import 时 materialize；**bundle 的 id 必须与 graph row id 精确相等**（`arrive()` 校验 `factories.has(id)`，system.ts:104-107）。

扫描是增量式的：任何 `internal/plugin` 事件（fiber 构建/销毁）标记 entry name dirty，微任务 flush 与 loader entries 对照（`entry.fiber !== undefined && !entry.disabled`）。

## 断点：为什么 registry 插件进不了浏览器

`processOne` 只认 Loader 树 entry。registry 插件经 `ctx.plugin()` 运行时挂载，不在 Loader entries 里，**其自身 id 永远不作为 entry name 进入扫描**。

注意机制细节（评审修正）：vendored loader 的 `internal/plugin` handler（`vendor/loader/lib/index.js:682-684`）会把 entry-less fiber **关联到祖先 entry**（`fiber.entry = fiber.parent[Entry.key]`，经 ctx 原型链 `getTraceable` 可达 plugin-local 的 entry ctx）——registry 插件 fiber 的 `fiber.entry` 通常不是 undefined，而是 `@deepseek-ai/dsh-plugin`（plugin-local 的 entry name）。后果：该 fiber 不会在 `ClientModuleHostService` 的 handler 里被 O(1) 丢弃，而是把 `@deepseek-ai/dsh-plugin` 标记 dirty，`processOne` 对其负缓存（无 `dshClient` 声明 → null）。**结论不变**：registry 插件自身 id 永远到不了 `processOne`；且 `internal/plugin` 事件不能作为按 registry 插件粒度的再触发钩子（见「补登记」）。

此外 registry 插件不是 npm 包：没有 package.json 的 `dshClient` 声明与 `exports["./client"]`，`resolveMeta` 无从解析。

## 设计一：登记机制（ClientModuleHostService 增加动态来源）

给 `ClientModuleHostService` 增加两个公开方法，直接把 registry 插件建成一行 table 记录（绕过 Loader entries 检查），`compose`/路由/注入全部复用：

```ts
/** Register one external (non-Loader-entry) client row, e.g. a registry plugin. */
registerExternal(id: string, opts: {
  clientPath: string            // bundle 绝对路径（安装后位于 <dshHome>/plugins/...）
  inject?: string[]             // 图元数据（浏览器 fiber 的 inject 由 bundle 自身导出决定，见「模块表面契约」）
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
- **id 碰撞不变式**：manifest id regex 为 `[a-z0-9-]+\/[a-z0-9-]+`（`manifest.ts:31`），不含 `@`/点，与官方 loader entry 名（npm 包名）不可能碰撞——作为 `registerExternal` 的注释不变式，无需防御代码。
- **时序**：页面加载时 `__DSH_BOOT__` 已固定；运行时 register 的变更对**已加载页面**不生效，下次页面刷新（或 HMR 桥）后可见——MVP 接受「启用后刷新生效」。

### 补登记：host 缺席时怎么办（评审 R1）

`plugin-local` 激活即跑 `reconcile()`（`src/index.ts:84-86`，`inject = []`）；`ClientModuleHostService` 要等 `httpServer`+`loader`（`static inject = ['httpServer', 'loader']`）。web.cordis.yml 明示行序无加载语义——两者**无顺序保证**，且倾向 plugin-local 先激活。mount 期间 root 属性读 `clientModuleHost` 得 undefined → 登记静默跳过，且无再触发 → **进程重启后已启用插件的 client half 从 boot graph 永久消失**。

**选型：`ctx.inject` 延迟补登记（推荐）**。`ctx.inject(['clientModuleHost'], cb)` 是 cordis 标准「等服务就绪再执行」机制（`this.mixin("registry", ["inject", "plugin"])`，任何 ctx 可用；`vendor/cordis/lib/index.js:743,1583-1596`）：

- `PluginLocalService` 在 apply 内注册一个惰性补登记：`this.ctx.inject(['clientModuleHost'], () => this.retryExternalRegistrations())`。
- `mount(id)` 时：host 存在 → 立即 `registerExternal`；host 缺席 → 把 id 记入 `pendingExternal` 集合。
- `retryExternalRegistrations()`：遍历 `pendingExternal` 逐项登记（host 此时已就绪）。
- 纤维生命周期：inject 纤维由 cordis 管理，host 就绪时自动启动、plugin-local 卸载时自动释放。

**备选（不采用，记录理由）**：① 订阅 `internal/service` 事件（`reflect.js:226` 每次服务提供/变更 emit）——事件从提供者 ctx 向上冒泡，plugin-local 与 modules 是兄弟 ctx，监听可达性依赖 isolate 过滤，脆弱；② modules 构造完成后广播补扫——官方包反向感知第三方包，破坏依赖方向。`ctx.inject` 无事件耦合、无反向依赖，是唯一干净选项。

验证补一条用例：「reconcile 时 host 缺席 → host 就绪后 `retryExternalRegistrations` 补登记」。

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
| `inject` | 可选 | **图元数据**：声明插件依赖的 client 服务，进 `__DSH_BOOT__` 行（对齐官方 `dshClient.inject` 语义）；浏览器 fiber 的实际 inject 由 bundle 自身导出决定 |
| `immediately` | 可选 | 是否 stage-one 预取；缺省 false（懒加载） |

校验（评审 O2）：`installPlugin` 已检查 `manifest.main` 存在（`registry.ts:135-137`），**平行检查 `client.main`**（若声明）——坏声明在**安装时**暴露，而不是启用时把仅浏览器侧缺陷放大为 web 组合启动失败。`parseManifest` 对 `client` 做结构校验（main 字符串、inject 字符串数组、immediately 布尔）。

路径安全（评审 Y1）：`client.main` resolve 后断言仍在插件根内（`join(pluginRoot, client.main)` 可越出根，如 `../secret.js`；插件本身是用户显式启用的可信代码，风险有限但校验成本极低）。

## 设计三：分发机制（tarball/目录携带 bundle）

- registry 插件目录（或 tarball 解压后）内含 `client.js` 等构建产物；`installPlugin` 已把整个目录复制进 `<dshHome>/plugins/<publisher>/<name>/`，bundle 随目录落地，**tarball 协议零改动**。
- 启用时 `client.main` 相对插件根解析为绝对路径 → `registerExternal(id, { clientPath })` → `/plugins/<publisher>/<name>/client.js` 可服务。
- 与「安装默认禁用」一致：**只有 enable 才登记**，禁用的插件不进 boot graph、浏览器拿不到其 bundle。

## 构建契约（bundle 格式 + 模块表面）

registry 插件的 client bundle 必须满足浏览器侧加载契约，与官方 client 包同一约束：

- **factory 注册**：脚本执行 `window.__ModuleLoader__.load({ id, factory })`，`factory(require)` 返回导出面（CJS 工厂形态；tsdown client preset 的 banner/footer 生成此结构，`packages/client/tsdown.client.ts`）。**id 必须与 graph row id 精确相等**（`acme/greeter`），否则 `arrive()` 校验失败。
- **模块表面契约（评审 R2）**：bundle 默认导出的模块**必须是 Cordis 插件**（函数 / 类 / 带 `apply(ctx)` 的对象）——浏览器侧每个 graph row 都变成 loader entry（`boot.tsx` 的 `loader.create({ name })`），entry 导入的模块交给 `ctx.registry.plugin`，非插件形状无法激活，boot sweep 报 failed。fiber 级服务等待由 **bundle 自身导出的 `inject`** 决定（`boot.tsx` 只传 `{name}`）；manifest `client.inject` 仅作为图元数据，不参与 fiber 注入。
- **外部依赖只允许平台模块**：`CLIENT_EXTERNALS`（`PLATFORM_MODULES` + runtime store 豁免）——即 `connection`/`runtime`/`ui-slots` 等官方 client 包走 module table 解析；其余 `@deepseek-ai/*` 值导入是构建错误（bundle purity gate），跨插件协作走 cordis 服务。
- **CSS Modules** 由 lightningcss 内联，`<style data-plugin>` 注入；**sourcemap** 可选（`.map` 路由已存在）。

### 构建模板：交付物（评审 R3）

现有 `clientBundle` preset 与 monorepo 深度耦合（`PLATFORM_MODULES`/`CLIENT_EXTERNALS` 清单、purity gate 插件、CSS 虚拟模块、`REPOSITORY_ROOT` 都内嵌），仓库外作者无法使用。**构建模板从「建议」提升为交付物**，两部分：

1. **仓库内 tsdown 骨架**：`examples/greeter` 加 client half，提供可跑的 `tsdown.config.ts`（引用 preset 或等价配置），产出 `client.js`——同时作为冒烟测试的构建步骤。
2. **standalone 构建文档**：独立的作者指南，含 `CLIENT_EXTERNALS` 快照清单、banner/footer/intro 逐字模板（id 作为显式入参）、purity gate 规则、CSS Modules 处理说明——仓库外作者可据此用任意 bundler（tsdown/esbuild/rollup）产出合格 bundle。

这是进入实现阶段的硬门槛：设计稿的冒烟测试必须有可执行的构建步骤。

## 生命周期联动（PluginLocalService）

`packages/plugin/plugin/src/service.ts` 的 `PluginLocalService` 是挂载入口，client 登记与其同步：

| 动作 | Node 侧 | client 侧 |
|---|---|---|
| `mount(id)` 成功 | fiber 创建 + 贡献校验 | 读 `manifest.client` → host 存在则 `registerExternal`，否则入 `pendingExternal` |
| `unmount(id)` | fiber 释放 | `unregisterExternal(id)` |
| `enable(id)` | mount + 索引置位 | 随 mount 登记 |
| `disable(id)` | unmount + 索引复位 | 随 unmount 注销 |
| `uninstall(id)` | unmount + 删目录 | 随 unmount 注销 |
| `reconcile()`（load 时） | 逐个 mount enabled | 随 mount 登记（host 缺席走 pending + 补登记） |
| host 就绪（补登记） | — | `retryExternalRegistrations()` 遍历 pending 登记 |

**可选服务模式**：`clientModuleHost` 只在 Web 组合存在（CLI/headless 组合无 modules 包）。`mount` 内用 root 属性读（与 `verifyContributions` 读 `tools` 同模式）：`(this.ctx.root as { clientModuleHost?: ClientModuleHostService }).clientModuleHost`，undefined 时跳过登记——CLI-only 环境不受影响。`@deepseek-ai/dsh-plugin` 将 `@deepseek-ai/dsh-client-modules` 加入 peerDependencies（type-only import，运行时经 root 属性访问）；更简替代：在 dsh-plugin 内定义最小结构接口（`{ registerExternal(...): string; unregisterExternal(id): void }`）消除整个 peer 依赖（评审 O5，二者皆可，实现时择一）。

**登记回滚（评审 Y2）**：`registerExternal` 放在 `verifyContributions` 成功之后，且与 fiber 创建同处一个失败回滚路径（`service.ts:75-84` 已有「verify 失败 → dispose fiber → 删 mounts」模式）——register 抛错同样回滚，避免「fiber 已挂载但 client 行未登记」半状态。

## 验证方案

- **modules 包单测**（`node-half.spec.ts` 扩展）：`registerExternal` 加行/替换/`unregisterExternal` 删除后 `graph()` 变化；`serveBundle` 对 `/plugins/acme/greeter/client.js` 返回 bundle 内容、未知 id 404；替换语义下 rev 更新（评审 Q4 的升级原子性）。
- **plugin 包测试**（`service.spec.ts` 扩展）：fake `clientModuleHost` 置于 root → `mount` 触发 register、`unmount` 触发 unregister；root 无该服务时 mount 正常跳过；**reconcile 时 host 缺席 → 补登记纤维在 host 就绪后登记 pending 集合**（评审 Y4）。
- **冒烟**：`examples/greeter` 加 client half（tsdown 骨架构建 `client.js`）→ install + enable → 浏览器 boot graph 含 `acme/greeter` 行、`/plugins/acme/greeter/client.js` 200、fiber 创建（bundle 导出 Cordis 插件）。

## 开放决策

1. **白名单强制点（评审 O4）**：`client.inject` 白名单若做，强制点在**构建期 externals 子集**（registry 专用 `CLIENT_EXTERNALS` 白名单，构建时校验）而非浏览器 loader——模块边界（bundle 只能 require 平台模块）与服务边界（fiber 可 inject 哪些服务）是两回事；不设白名单则接受「用户启用即信任」的文档级约束（与现有信任模型一致），设计需明说选哪个。
2. **HMR（评审 O3，大半免费）**：`rebuilt()`/`onGraphChanged`/HMR watch 同步都泛化于 table/graph 通用结构——外部行登记后**自动**获得 bundle 内容 watch、rebuilt 帧与浏览器端 reload（对 boot 时已在图中的行）。真正缺失的只有：运行中 enable 的新行在浏览器端没有对应 entry 创建（hmr client 的 graph frame v1 未用）——超出「不改浏览器侧」范围，记为后续。
3. **多 bundle**：一个插件只支持一个 client bundle（本文假设）还是可声明多个（按 surface）——MVP 取一个。
4. **单实例假设**：`clientModuleHost` 每进程一个，`registerExternal` 的 table 是进程内存态；多 `dshHome`/多 web 组合场景不讨论（MVP 可接受，实现时一句声明）。
5. **升级原子性（评审 Q4）**：同 id 重装新版本（带新 bundle）时 `registerExternal` 替换行覆盖 rev 更新，enable 状态与行替换之间无中间态——补一条测试锁定。

## 参考

- 官方 client 通道实现：`packages/client/modules/src/index.ts`、`src/client/system.ts`、`src/client/manifest.ts`
- 浏览器 entry 创建：`packages/client/web/src/boot.tsx`（`loader.create`、`assertEntriesActive`）
- 构建约定：`packages/client/tsdown.client.ts`（banner/footer、CLIENT_EXTERNALS、purity gate）
- 挂载与校验：`packages/plugin/plugin/src/service.ts`、`src/manifest.ts`、`src/registry.ts`（`manifest.main` 安装时校验）
- cordis 机制：`vendor/cordis/lib/index.js`（`ctx.inject` 等待服务、`internal/service` 事件）、`vendor/loader/lib/index.js`（`internal/plugin` fiber 关联祖先 entry）
- 现有示例：`examples/greeter`（无 client half）
