# 设计：client 通用渲染容器（generic client render container）

> **历史文档（2026-08 转向后）**：本文描述 plugin-registry 已移除的独立机制（patch/CLI/`ctx.plugins`），仅作决策依据与演进记录保留；当前形态见 [official-0809-coverage](official-0809-coverage.md) 与 `packages/plugin/console`。


状态：**设计已回退**（曾实现为 runtime client half `ctx.ui`，2026-08 缝降级中从官方树移除；`examples/greeter` 已改回纯 DOM 自渲染）。本文保留作为「附加式 UI 标准化」方向的设计记录：目标曾让 registry client 插件获得 Obsidian 式的通用 UI 挂载能力——官方维护一组通用渲染容器与 API，插件往里渲染自己的 React UI，而不是依赖官方为每个插件挖专用 slot hole。当前纪律：插件自建（自渲染/自造缝），官方不为示例开通用 API。本文是 [registry client half](registry-client-half-design.md) 的能力扩展设想：前者解决「bundle 怎么进浏览器」，本文解决「插件的 UI 挂到哪里」。

## 问题：专用 hole 的扩展成本

registry client 插件想改官方 UI 只有两条路，都有成本：

1. **填官方 slot hole**：需要官方在 `SlotMap` 声明 + 组件渲染 `renderSlot` 出口。每个需求都要改官方组件（如 `ui-workspace` 的 `sessionRow`/`sessionRow.branch` 扩展孔——已存在，但只有测试注册者），一次改动只服务一类扩展。
2. **自渲染**（greeter 式）：`document.body.appendChild` 直接画，零依赖，但只能做浮层/角标，不能嵌入官方组件树结构。

**矛盾**：registry 已经用 patch 改官方源码（机制层），那「为每个插件挖专用孔」不如「挖一个通用容器」——一次机制改动，所有插件受益，且回归 patch 的机制层性质（不改具体组件内部）。

## 参照：Obsidian 的通用容器模式

Obsidian 插件能「任意改 UI」靠的是官方维护**通用扩展点**，不是为每个插件定制（[Views](https://docs.obsidian.md/Plugins/User+interface/Views)、[Plugin Development](https://deepwiki.com/obsidianmd/obsidian-api/3-plugin-development)）：

| Obsidian API | 形态 | 本质 |
|---|---|---|
| `registerView` + `ItemView` | 插件定义视图类，官方创建标签页/面板承载 | **通用容器**（视图区） |
| `addRibbonIcon` | 插件声明图标，官方渲染到侧栏 | **通用插口**（侧栏图标区） |
| `app.workspace` 布局 API | 插件操作面板/叶子 | **通用容器管理** |
| `registerMarkdownPostProcessor` | 插件处理每个渲染的 markdown | **内容注入钩子** |

关键：**官方只维护「容器的通用规则」，插件往容器里填自己的 React/DOM 内容**。dsh 缺的正是这一层——目前只有「专用孔」和「裸 DOM」两个极端。

## 设计：通用渲染容器

### 核心机制：共享 React 实例 + 独立 per-mount root

**前提（评审 F2 定案）**：插件 bundle 与官方**共享同一个 React 实例**——react 是平台种子模块（`PLATFORM_MODULES` 含 react/react-dom，`web/src/platform.ts`），所有合规 bundle（含 registry 插件）经 module table 解析同一 react。「插件内联 react」不是可选项（会导致官方组件在插件 root 下 Invalid hook call），是构建契约（`CLIENT_EXTERNALS` 含 react）。真正隔离来自**独立 React root**，不是独立 react 实例。

官方 UI 是 React 树（`createRoot(#root)`）；`ui-primitives` 的 `Modal`/`Menu` 用 `createPortal(..., document.body)` 证明 body 级 DOM 管理安全（官方 root 管理 portal 节点，React 保留它们）。通用容器在此基础上新增**第二 root 模式**（官方代码库唯一 `createRoot` 在 `boot.tsx`，无第二 root 先例——本设计引入）：

```ts
// 机制层新增（推荐放 runtime client half，与 slots/sessions 同居）
// 官方在 body 下懒创建命名容器节点；每个 mount 获得一个子节点 + 独立 root。
const mount = ctx.ui.mount({
  container: 'overlay',        // 官方维护的固定容器集合之一
  priority: 100,              // 容器内子节点排序（升序，同值按挂载先后）
})
mount.render(<MyPluginPanel />)   // 独立 root 渲染进子节点，随 fiber dispose 卸载
```

**root 归属（评审 F3 定案）**：官方服务持有 per-mount root + per-mount 子节点（挂在共享容器下按 priority 排序）。每个 mount 一个子节点 + 一个 root（两个 root 挂同一 div 是 React 错误）。`dispose` 卸载 root 并移除该子节点；**共享容器节点由官方永久持有**（多插件共享，懒创建）。**错误隔离**：per-mount root 包 error boundary（对齐 slot 体系的 `SlotErrorBoundary`），插件 render 崩溃只影响自己，不炸页面。

**生命周期路由（评审 F4 定案）**：`mount` 实现必须复刻 `SlotsService.register` 的原型方法模式（`this.ctx` 绑调用方 ctx，使 effect/unload 级联路由进插件 fiber）；插件 bundle 必须 `export const inject = ['ui']`（否则未注入服务名直接访问会 throw，boot sweep 报 failed）。

### 容器类型（评审 F6 定案：MVP 只做浮层类）

| 容器 | 语义 | 用途 | 类比 Obsidian |
|---|---|---|---|
| `overlay` | fixed 浮层（z-index 阶梯中定位，见信任边界） | 全局浮层、通知、HUD | Modal/Notice |
| `floating` | 任意定位浮窗 | 自由浮窗 | 自定义视图 |

**MVP 只做浮层类容器（overlay/floating）**——body 级容器只能 fixed/absolute 定位，做到真实布局集成（如侧栏底部、状态条）必须进官方布局树（`ui-layout` 的 AppFrame 只有 sidebar/conversation/details 三槽位）= 改官方组件，与「不改任何官方 UI 组件」矛盾。sidebar/footer 的**布局集成**留作后续决策（需接受官方组件改动）。固定集合保持「官方维护容器、插件填内容」边界。

### API 形态

```ts
// 插件 bundle 入口必须声明（评审 F4）：未注入服务名直接访问会 throw
export const inject = ['ui']

// 挂载点：一次性获取，插件 apply 期间持有
interface UiMount {
  /** 把 React 节点渲染进 per-mount root；重复调用替换内容。 */
  render(node: ReactNode): void
  /** 卸载 root 并移除本 mount 的子节点（共享容器节点由官方持有）。 */
  dispose(): void
}
// 服务提供：ctx.ui（机制层服务，web 组合存在）
ctx.ui.mount(options: { container: UiContainerName; priority?: number }): UiMount
```

- **React 实例共享、root 独立**（评审 F2/F3）：插件与官方共享同一 react 实例（平台种子），但每个 mount 是**独立 React root**——组件树与官方树隔离，同时官方组件（ui-primitives 等）可在插件 root 下安全渲染。
- **CSS 全局注入 + 主题继承**（评审 F9）：插件 CSS Modules 经 tsdown 内联为 `<style data-plugin>` 追加进 `document.head`——**全局样式**，仅靠 hash 类名防碰撞（无作用域隔离；插件样式可命中官方类名，官方 token 可被插件覆盖，与官方 client 包一致）。主题变量继承成立：官方 token 是 body 内联 CSS 变量 + `body[data-ds-dark-theme]`，body 下容器自然继承，视觉一致。
- **生命周期（评审 F1 修正）**：`mount` 绑定插件 fiber——`ctx.effect(() => { const m = ctx.ui.mount(...); m.render(<X/>); return () => m.dispose() })`。**但浏览器 fiber 只在页面 boot 时由 boot graph 创建，运行时 disable 不拆已加载页面的 fiber**——mount 生效于**下一页面加载**；页面内 disable 不清 UI（与 client half 的「启用后刷新生效」一致）。若要页面内实时卸载，需浏览器侧 graph→fiber 对账（独立机制，超出本设计）。
- **与 slot 的关系**：slot 解决「嵌入官方组件树内部」（结构性、需官方挖孔）；通用容器解决「挂到固定浮层区」（附加式、零官方组件改动）。两者互补，不是替代。

### 与现有能力的关系

| | 专用 slot hole | 自渲染（greeter） | 通用渲染容器（本文） |
|---|---|---|---|
| 官方组件改动 | 需要（声明+渲染） | 无 | **无（机制层）** |
| 嵌入官方树内部 | ✅ | ❌ | ❌（只能附加） |
| 附加 UI（浮层/面板） | 视 hole | ✅ | ✅（标准化） |
| React 实例 | 官方树内共享 | 插件自备（不合规） | **共享官方 react + 独立 root** |
| 生命周期 | fiber 管理 | 手动 | **fiber 管理（刷新后生效）** |
| CSS | 树内作用域 | 全局注入 | 全局注入（hash 防碰撞）+ 主题继承 |

### 信任边界与安全（评审 F5/F7 修正）

- **容器 API 是标准化惯例，不是安全边界**（评审 F7）：registry 插件 bundle 以 classic `<script>` 注入页面、执行任意 JS——本可 `document.querySelector('#root')` 直接改官方树（greeter 示例已 `document.body.appendChild` + 最高 z-index）。真实安全模型是「**用户启用即信任**」（与 client half 一致）。容器的价值是**标准化与生命周期管理**，不是新增能力。
- **z-index 阶梯**（评审 F5）：官方浮层是阶梯而非单一最高——Modal 1000、Menu 1100、HoverCard/Tooltip 100。**overlay 容器取 900-999**（正文之上、官方浮层之下），避免插件浮层盖住官方弹窗；空容器 `pointer-events: none` 防挡点击。
- **信任不变**：只有 enable 才登记（跨页面加载维度生效）；容器不提供侵入官方组件树的能力（API 层）。

### Patch 落地范围（机制层，评审 F6/F10 修正）

- **改动面**：runtime client half 加 `ctx.ui` 服务 + 容器节点管理（懒创建）；**不改任何官方 UI 组件**（无 `Rows.tsx` 式改动）——MVP 只做浮层类容器（overlay/floating），body 级节点即可承载。
- **官方升级冲突**：本设计将 patch 从组合层（apps/cli）推进到 packages/client 机制层——向后兼容的增量，但与官方组件结构**不**完全解耦（runtime client half 会被官方升级触及）。冲突概率低于专用 hole（不改组件内部），但高于纯组合层改动；实现前评估 runtime 的升级冲突面。
- **示例**：greeter 改用 `ctx.ui.mount({container:'overlay'})` 替代 `document.body.appendChild`（展示标准化用法；冒烟验证）。

## 验证方案（评审 F1 修正：刷新后生效）

- **单测**（runtime client half）：`mount` 懒创建容器节点与 per-mount 子节点、`render` 挂独立 root、`dispose` 卸载 root 并移除子节点；同容器多 mount 按 priority 排序；空容器不拦截事件（pointer-events:none）；插件 render 崩溃被 error boundary 隔离。
- **浏览器验证**：真实 web 组合下 greeter 改用通用容器 → enable 后**刷新**浮层显示、disable 后**刷新**消失、官方 UI 不受影响。
- **生命周期**：enable → 刷新 → mount+render；disable → 刷新 → 消失（页面内 disable 不清 UI——浏览器 fiber 只在 boot 时创建）。HMR rebuilt 帧触发整页 reload，fiber 重建 → effect 重跑 → 旧 mount 由 dispose 清理（补一条 HMR 冒烟）。

## 开放决策（评审后修订）

1. **容器归属**：**runtime client half**（与 slots/sessions/workspaces 同居，推荐；`@deepseek-ai/dsh-client-runtime/client` 已在 CLIENT_EXTERNALS 豁免清单，插件类型可达性最顺）vs client-modules 浏览器 half（模块系统，语义不贴）。**复用 `SlotsService.register` 的 ctx.effect 注册模式**（非 deferRegistration——那是等 slot 声明，容器无声明概念）。
2. **React 实例**：**已定（评审 F2）**——共享官方 react 是唯一合规路径（平台种子 + CLIENT_EXTERNALS）。剩余问题是**强制缺口**：purity gate 只拦 `@deepseek-ai/*`，standalone 作者内联 react 无构建错误，运行时才炸。需 standalone 文档把「externalize react/react-dom/jsx-runtime」列为硬性验收项；如需机械强制，容器服务侧做双实例检测（比较 `$$typeof` 与官方 Symbol 常量）。
3. **优先级语义**：容器内子节点按 priority 升序 + DOM 顺序，同值按挂载先后；不暴露跨插件协商 API。
4. **容器集合**：MVP 只做 overlay/floating 浮层类（F6 定案）；sidebar/footer 的布局集成需接受官方组件改动（AppFrame 加通用挂载区），留作后续决策；不做「按插件 id 动态容器」。
5. **替换官方组件**：保持不做；未来若要，独立设计「官方树内通用视图区」。
6. **新增——数据缝（F8）**：容器组件的数据通道——MVP 用「apply 时 `ctx.get` + props 下传」的文档级约定，写明 locale 文案（`t`）、主题色（CSS 变量继承）、session/workspace 数据三条通道；或提供最小 `useSession` 等价物。
7. **新增——patch 冲突面（F10 引申）**：本设计将 patch 从组合层推进到 packages/client（runtime）机制层，官方升级冲突概率高于现状——实现前评估 runtime client half 的升级冲突面并写明。

## 参考

- 现有机制：`registry-client-half-design.md`（bundle 进浏览器）、`packages/client/ui-slots`（slot 体系）、`ui-primitives` 的 `Modal.tsx`（createPortal 先例）
- 官方新增：`ui-workspace` 的 `sessionRow` hole（专用孔路径的实例，证明其成本）
- 对照：[Obsidian Views](https://docs.obsidian.md/Plugins/User+interface/Views)
