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
- `modules` 的 dshClient 扫描只看 Loader 树 → registry 插件的浏览器 bundle 不会进入 `__DSH_BOOT__`（client 插件应走独立 dshClient 包通道，见「web 边界」）。
- 两者**同进程同 context**：registry 插件可 inject 官方树服务，官方插件可见它提供的服务。

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
- ❌ 不可管理/替换 dsh **内置** `ctx.xxx`（`tools`/`tasks`/`workflows`/`sessions`…）：官方树启动时提供，同名 `provide` 会注册冲突——属产品层。

## 信任边界

- 安装记录为**禁用**；只有显式 `enable`（CLI、API 或 Web 面板）才挂载。代码只在人明确选择后执行。
- 启用是**实时**的：服务立即挂载，索引更新只在挂载成功后持久化；挂载失败（如声明的工具未注册）报错并回滚，不产生半挂载状态。
- 安装/启停经过按 `dshHome` 的串行队列（`withRegistryLock`），索引写入用同目录 `.tmp` + `rename` 原子提交，安装失败回滚已复制的目录——并发与崩溃下索引不损坏。

## web 边界：registry 插件不是 client 插件

「web 插件」分两种：**被 Web 面板管理**（浏览/搜索/安装/启停/卸载——`ui-plugin-manager` 面板，✅）与**在浏览器里跑**（带 UI 的 client 插件，❌ 当前不支持）。

浏览器端插件的加载通道与 registry 挂载通道无关：

1. 浏览器侧：`apps/web` 启动时解析 `window.__DSH_BOOT__`（boot graph），按行加载每个 client 插件的 bundle。
2. Node 侧：`ClientModuleHostService` **只扫描 Loader 配置树的 entries**，找带 `dshClient` 声明的包，把 `exports["./client"]` 的构建产物编进 boot graph。
3. registry 插件经 `ctx.plugin()` 运行时挂载，**不在 Loader entries 里**——扫描对无 entry 的 fiber（手动挂载/子插件）直接丢弃。

所以 registry 插件的浏览器 bundle 永远进不了 `__DSH_BOOT__`。client 插件应做成**独立 `dsh-client-*` 包**（`dshClient` 声明 + `exports ./client` + tsdown client preset + web roster 行），走官方组合通道——`ui-plugin-manager` 自己就是这个形态。

**若要让 registry 插件带 client half**，需要打通两条路（未实现，属扩展方向）：

1. **登记**：registry 插件安装/启用时把其 client 包声明注入 boot graph（`ClientModuleHostService` 增加来自 `plugin-local` 的动态 dshClient 行来源）。
2. **分发**：registry 插件的 tarball 需包含 client bundle，安装时放进 `<dshHome>/plugins` 且能被 `/plugins` 路由服务到。

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

TUI 差异补充：pi 开放 **pi-tui 组件树**（`ctx.ui.custom` 拿 tui 实例、注入组件、`ui.notify`）；dsh 是**受限覆盖层**（`ctx.tui.openOverlay()` 只给 viewport/主题/重绘/关闭，不给底层树）——命令与事件驱动 UI 平齐，改主 UI 布局不如 pi 开放（安全取舍）。

**结论**：

- **能力面**：事件/钩子/工具/命令覆盖 pi，且补上 pi 没有的**安装-启停-校验-分发管理**。
- **TUI 表面**：pi 开放组件树，dsh 受限覆盖层——命令与事件驱动平齐，改主 UI 不如 pi 开放。
- **本质不同**：pi 是「代码扩展点」（零协议、放文件即用）；plugin-registry 是「带生命周期的分发生态」（清单 + 管理，换安全可控）。
