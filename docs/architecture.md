# 架构：plugin-registry 的两层插件模型

本文是 plugin-registry 的系统地图：registry 插件是什么、怎么加载、能力边界在哪。阅读顺序：先看两层模型，再沿「加载路径 → 能力面 → 服务关系 → 信任边界 → web 边界」展开。

## 两层插件模型

本仓库在 dsh 的 cordis.yml 官方插件树之上提供**第二层插件**。两层机制相同（都是 Cordis 插件：函数/类/带 `apply(ctx)` 的对象 + `inject`/`effect`），**管理权不同**：

| 层次 | 定义 | 加载 | 管理 |
|---|---|---|---|
| **官方插件** | 产品随发布固定的组合（agent-loop、llm、tools、fs、skill-local、ui-* 等） | Loader 按配置树启动时静态加载 | 产品结构，随版本发布 |
| **第三方插件** | 用户安装的带 `dsh.plugin.json` 的插件 | `plugin-local` 扫描 `<dshHome>/plugins` 索引，运行时动态挂载 | 用户通过 `dsh plugin` / Web 面板管理 |

**边界：**

- 本仓库**不管理、不替换** cordis.yml 官方插件树——那是产品声明式组合。
- 两层插件**互相可见**：第三方插件可 `inject` 官方树服务（`tools`、`skills`、`commands`…）。
- 有意不做「统一管理」（registry 也管官方插件）：版本/更新、组合顺序、跨 surface 差异属产品层，且与在线市场路线重叠。

## 加载路径：registry 插件不在 Loader 配置树里

| | 官方树（静态） | registry 插件（动态） |
|---|---|---|
| 来源 | cordis.yml entry | `<dshHome>/plugins` + `index.json` |
| 加载者 | Loader（配置驱动，启动时） | `plugin-local`（索引驱动，运行时） |
| 生命周期 | 随启动/配置 | `enable`/`disable`/`uninstall` |
| 进 Loader 树？ | 是 | 否（`ctx.plugin()` 动态挂载） |

后果：

- registry 插件**不出现在** cordis.yml / dump-config 的组合输出里。
- `modules` 的 dshClient 扫描只看 Loader 树 → registry 插件的 client half **不靠扫描**进 `__DSH_BOOT__`，而是启用时经 `ClientModuleHostService.registerExternal` 运行时登记（见「web 边界」）。
- 两者**同进程同 context**：registry 插件可 inject 官方树服务，官方插件可见它提供的服务。

### 插件依赖解析：共享 node_modules 链接

插件在 `<dshHome>/plugins`（checkout 树外），标准 Node 裸名解析（从 import 文件向上找 node_modules）够不到 checkout——built 形态下 `import '@deepseek-ai/dsh-tools'` 会 `ERR_MODULE_NOT_FOUND`（源码形态靠 tsx paths 兜底，是开发期隐式红利，非契约）。

机制：`<dshHome>/plugins/node_modules` 建**共享目录链接**指向 checkout 的依赖闭包（`ensureDepsLink`：安装/挂载/启动扫描时确保，checkout 轮转后失效自动重建，Windows 用 junction）。目标**优先 pnpm 虚拟 store 公共层**（`checkout/node_modules/.pnpm/node_modules`——pnpm 默认隔离下非提升包如 node-pty/ws 与 workspace/vendor 包唯一全可见处），不存在时（扁平布局/自定义 hoist/非 pnpm）回退顶层 `node_modules`。链接是物理事实，任何运行形态（tsx 源码 / built 纯 Node）下 `@deepseek-ai/*`、`cordis` 及 checkout 依赖闭包内任意包都按标准解析命中。

边界：链接**尽力而为**——不 import 官方包的插件无需它；解析不到 checkout 的部署（如单文件 bundle）跳过，不影响安装与挂载。插件**不能声明自己的 npm 依赖**（`dsh.plugin.json` 无 dependencies 字段）；可用依赖 = checkout 的依赖闭包（公共层暴露面即官方树自身闭包）。

**与 0806 profile 依赖解析的分工**：官方 profile/bundle 机制为**组合内服务**提供依赖解析（`<dshHome>/profiles/node_modules`，`healProfilesModuleFallback` 从 app 闭包 BFS 建链接）——registry 服务（plugin-local/ui-plugin-manager）作 bundle 层时走官方闭包；deps-link 只服务**动态安装的插件**（`<dshHome>/plugins/`），两者不重叠。

**双装互斥**：同一包可同时有 `dsh.plugin.json` 与 bundle 形态。`registerExternal` 碰撞守卫拦 Loader entry 同名；bundle 层行非 Loader entry，由 **plugin-local 的 profile bundles 守卫**（mount 时检查 `<dshHome>/profiles/*` 的 `dsh.profile.bundles`）补上——两种安装方式强制二选一。

## 能力面 vs 声明面（contributes）

`contributes` 字段目前只有 `tools` / `skills`（仅 `tools` 做挂载时校验）——这是**校验范围**，不是**能力上限**。

registry 挂载的插件是完整 Cordis 插件，可注册：

- `ctx.tools` 工具、`ctx.skills` 技能提供者
- `ctx.on()` / `ctx.waterfall()` 事件监听（拦截、权限、审计）
- `ctx.provide()` / `Service` 子类提供**新服务** `ctx.xxx`
- `ctx.commands` 命令、`ctx.systemPrompt` 提示词、`ctx.settings` 配置、`ctx.tui` TUI 覆盖层…

示例：插件可注册 3 个工具 + 监听 `agent/request` + 提供新服务 + 注册 `/hello` 命令；`contributes` 只需声明 `{ "tools": [...] }`，其余能力「无声明但可用」。

## 服务的关系：registry 管插件，插件用服务

`ctx.tasks`（后台任务）、`ctx.workflows`（工作流引擎）等是**官方树提供的服务**，不是 registry 管理的对象。

registry 插件是**消费者**：`inject: ['tasks']` 登记自己的后台任务、`inject: ['workflows']` 调用引擎。这些任务/运行由 tasks/workflows 管理，与 registry 无关。

### 新服务 vs 内置服务

- ✅ 可管理「**提供新 `ctx.xxx` 服务**」的插件（其他插件可 inject；enable/disable 即服务出现/消失）。
- ❌ 不可与官方树**并存**提供同名 `ctx.xxx`（`tools`/`tasks`/`workflows`/`sessions`…）：官方树启动时提供，同名 `provide` 会注册冲突——属产品层。
- 🔄 可**接管**被官方树移除的服务：若官方树摘除某服务插件（如 workflow 独立化），registry 可挂载其独立版成为唯一提供者——但须全家搬迁（服务实现 + 消费者工具同仓）且 Config 全有默认值。见 [cookbook：独立判定](cookbook/distributing-plugins.md#独立判定什么插件能进-registry需要什么迁移完整性)。

## 信任边界

- 安装记录为**禁用**；只有显式 `enable`（CLI、API 或 Web 面板）才挂载。代码只在人明确选择后执行。
- 启用是**实时**的：服务立即挂载，索引更新只在挂载成功后持久化；挂载失败（如声明的工具未注册）报错并回滚，不产生半挂载状态。
- 安装/启停经过按 `dshHome` 的串行队列（`withRegistryLock`），索引写入用同目录 `.tmp` + `rename` 原子提交，安装失败回滚已复制的目录——并发与崩溃下索引不损坏。

## web 边界：registry 插件的 client half

「web 插件」分两种：**被 Web 面板管理**（浏览/搜索/安装/启停/卸载——`ui-plugin-manager` 面板，✅）与**在浏览器里跑**（带 UI 的 client 插件，✅ 经 `client` 声明支持）。

### 加载通道：官方 client 插件 vs registry client half

浏览器端插件的加载通道（`packages/client/modules`）：浏览器侧按 `window.__DSH_BOOT__`（boot graph）逐行加载 bundle；Node 侧 `ClientModuleHostService` 由 **Loader 树扫描**（`dshClient` 声明 + `exports["./client"]`）与 **`registerExternal` 动态登记**（registry 插件启用时登记；`compose`/`/plugins` 路由/`__DSH_BOOT__` 注入全部复用）共同组成 graph。

两条通道并存：**官方 client 插件**（`dsh-client-*` 包，随产品发布，进 Loader 树）与 **registry client half**（用户安装，运行时登记）。前者是产品结构，后者是用户扩展；同一能力建议先做官方包。

**官方插件增量兼容**：官方格式插件（npm/cordis 包，bundle id = 包名）加一个 `dsh.plugin.json` 增量清单即可进 registry——id 用包名（`@scope/name`），bundle 零重构建，官方通道不受影响（非破坏）；同一插件两种安装方式**强制二选一**（`registerExternal` 拒绝与 Loader entry 同名，碰撞守卫），不会双挂载（互斥）。规范见 [官方插件增量兼容](official-plugin-incremental-compat.md)。

### registry client half 机制

- **声明**：`dsh.plugin.json` 可选 `client` 对象（`main` 指向构建好的 bundle、`inject` 图元数据、`immediately` 预取标记）；`client.main` 在**安装时**校验存在（与 `manifest.main` 平行）。
- **登记**：`PluginLocalService` 启用挂载成功后 `registerExternal(id, { clientPath, ... })`；`unmount`/`disable`/`uninstall` 时 `unregisterExternal`。浏览器 fiber 的 `inject` 由 **bundle 自身导出**决定，manifest `client.inject` 只是图元数据。
- **补登记**：`plugin-local` 激活先于 `clientModuleHost` 就绪（无顺序保证），用 `ctx.inject(['clientModuleHost'])` 延迟补登记——host 缺席时挂载进 pending 集合，host 就绪后复查仍 mounted 再登记，避免重启后已启用插件的 client half 静默消失。
- **分发**：tarball/目录携带构建产物，安装时整目录复制进 `<dshHome>/plugins/`，`/plugins/<publisher>/<name>/client.js` 路由直接可服务。
- **构建契约**：bundle 调用 `window.__ModuleLoader__.load({ id, factory })`（id 必须等于插件 id），factory 返回 **Cordis 插件导出面**；外部依赖只允许平台模块，其余内联。生产构建用 tsdown client preset 或等价 bundler。

完整机制与设计决策见 [registry client half 设计稿](registry-client-half-design.md)（已实现）。示例：`examples/greeter` 带可安装的 client half。

**UI 挂载扩展方向**：client half 的 UI 挂载走两条官方通道——**官方 slot hole**（如 `conversation.input.dock` 等官方既有槽）或**插件自渲染**（裸 DOM / 自建通道）。统一扩展心智模型见 [client UI 扩展统一模型](client-ui-extension-model.md)（设计稿）；早期为示例打进官方树的缝（`useTasks`/`task/snapshot`、`ctx.ui.mount`、`sidebar.panel`、`conversation.chat.item`）已回退，示例插件（navbar/task-status/greeter）演示插件侧自造缝。

## 与 pi-mono 插件的对比

参考 [pi-mono](https://github.com/pi-mono) 的扩展机制做横向对比。pi 的插件是：**Harness Extensions**（`harness-v2.md`：events 观察 + hooks 拦截）与 `.pi/extensions/*.ts` 本地脚本（放文件即加载，无管理）。

| 维度 | pi-mono 扩展 | plugin-registry |
|---|---|---|
| 形态 | `.pi/extensions/*.ts` 本地脚本 | 清单 + Cordis 插件入口 |
| 接入 | harness events + hooks | inject 服务 + 注册工具/事件/服务/命令 |
| 事件/钩子拦截 | ✅ events + hooks | ✅ `agent/*`、`tools/*` waterfall（等价） |
| 工具/命令/提示词 | ✅ | ✅ `ctx.tools`/`commands`/`systemPrompt` |
| **TUI 修改** | ✅ 开放组件树 | ⚠️ 受限覆盖层 |
| 安装/发现 | 放文件即生效 | ✅ 安装/启停 + Web 面板 |
| 校验/兼容 | 无 | ✅ contributes 校验 + engines |
| 启停 | 无 | ✅ 默认禁用 + 实时热挂载 |
| 信任 | 直接执行 | ✅ 显式信任边界 |

TUI 差异：pi 开放 pi-tui 组件树（`ctx.ui.custom` 注入组件）；dsh 是受限覆盖层（`ctx.tui.openOverlay()` 只给 viewport/主题/重绘/关闭，不给底层树）——命令与事件驱动 UI 平齐，改主 UI 布局不如 pi 开放（安全取舍）。

**结论**：

- **能力面**：事件/钩子/工具/命令覆盖 pi，且补上 pi 没有的**安装-启停-校验-分发管理**。
- **TUI 表面**：pi 开放组件树，dsh 受限覆盖层——命令与事件驱动平齐，改主 UI 不如 pi 开放。
- **本质不同**：pi 是「代码扩展点」（零协议、放文件即用）；plugin-registry 是「带生命周期的分发生态」（清单 + 管理，换安全可控）。
