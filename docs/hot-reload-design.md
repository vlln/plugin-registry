# 设计：registry UI 插件真热更新（True Hot Reload）

> **历史文档（2026-08 转向后）**：描述已移除的独立机制，仅作演进记录；当前形态见 [official-0809-coverage](official-0809-coverage.md) 与 `packages/plugin/console`。


## 背景与现状

registry 插件启停目前是「近似热更新」：服务端实时（plugin-local 同进程挂载/卸载），浏览器端收到 host 帧 `host/client-graph-changed`（纯信号）后**整页 `location.reload()`** 重新拉 `__DSH_BOOT__`——会话上下文、输入、滚动全部丢失。

目标：启停/升级插件时**不整页刷新**，只增删/替换对应 client 模块的 UI。

## 官方既有 HMR（复用基础）

官方 dev graphs 已具备 fiber 级热替换（非整页刷新）：

- webserver stat-poll bundle → rev 变化 → `/plugins/events` SSE 推 `{type:'rebuilt',id,rev}` 帧（连接时先推 `{type:'graph',graph}` 全图）
- 浏览器 `client-hmr` 原地替换 fiber：invalidate → prefetch → registry.delete → drain inertia → delete entry.fiber → removeOwnedStyles → entry.refresh() → await()；串行队列 + 失败 self-heal
- 下游 fiber 按 provider fiber uid 记录 activation epoch（`vendor/cordis/src/fiber.ts` `_refresh`）——替换 provider 后原生级联刷新下游
- 插件 CSS 带 `data-plugin` 标记（`removeOwnedStyles` 定向移除）

## 核实事实（关键机制位）

| 事实 | 来源 | 含义 |
|---|---|---|
| `reload()` 的 `findEntry` 要求 entry 已在 loader 树，否则只 warn | `client/hmr/src/client/index.ts` | rebuilt 帧对运行中新增行是 unknown entry——O3「缺失」的精确位置 |
| `_refresh`：impl 缺失 → epoch=INACTIVE → 下游 `_unload()` | `vendor/cordis/src/fiber.ts` | 删除 provider 的级联机制上支持 |
| `registerExternal` 替换且 rev 变 → 已触发 `onRebuilt` | `client/modules/src/index.ts` | 替换/升级路径零新工作 |
| `loader.create` 只在 boot 期使用（`boot.tsx`）；运行期 create 未经验证 | `client/web/src/boot.tsx` | 运行期新增 entry 是最大不确定点 |
| graph 帧是「连接时快照，v1 未用」；host 帧是纯信号 | `hmr/src/index.ts`、`api/events.ts` | 增量应用的数据通道已存在 |

## 方案分层

### 服务端（改动小）

- graph 变化时（`onGraphChanged`）除 host 信号外，同时向 `/plugins/events` 推 `{type:'graph',graph}` 全图帧——图小，推全图让浏览器 diff，天然覆盖多插件并发变更，免 diff 协议
- `host/client-graph-changed` 保留为降级路径（无 HMR 消费能力时仍 reload）
- mount/unmount → registerExternal/unregisterExternal → onGraphChanged 链路现成

### 浏览器端（核心新工作）

- **graph diff 应用器**：收到 graph 帧 → 与本地 entry 集合 + rev diff：
  - added：加载 fiber（entry 预创建策略，见困难 1）
  - removed：teardown 序列（registry.delete → drain → delete entry.fiber → removeOwnedStyles），不 refresh
  - updated（rev 变）：直接复用 client-hmr `reload(id)`（entry 已在图时）
- `client-graph-changed` 分支从 reload 改为触发 graph 拉取/应用（host 信号兜底）
- 串行队列（复用 client-hmr queue 模式）

## 关键困难与解法

1. **运行期 entry 创建**（最难）：`loader.create` 围绕 boot 流程（await() 屏障、settled 投影），运行期 create 未验证。**解法：entry 预创建**——boot 时预创建全部已启用插件的 entry（廉价配置节点），运行期 enable/disable 只做 fiber 层加载/拆除（entry 复用），把「新增 entry」变成「entry 已在 → 操作 fiber」，与 rebuilt 语义对齐
2. **无替换拆除的时序**：删除 provider 时下游 epoch 变 INACTIVE 会 `_unload()`（机制支持），难点在 drain 顺序——provider 拆除须先于下游检查；被 inject 插件卸载连带停依赖方（文档级约束，对齐 cordis 语义）
3. **diff 时序与回滚**：复用 client-hmr v1 策略——不主动回滚，失败留本地旧态 + 下帧 self-heal；单通道 SSE 保序；队列串行化
4. **React 状态边界**：fiber 重建 = UI 重挂载丢状态（官方 dev HMR 同样如此）。**不做状态保持**；收益仍是「页面不刷新、会话/输入/滚动保留」
5. **自渲染 DOM 清理**：CSS 有 `data-plugin` 标记现成；自渲染 DOM 无统一 dispose 契约——机制件提供文档级契约 + 示例跟进（自渲染注册 dispose 进 effect）

## Spike 验证（2026-08，Node 侧同款 cordis loader）

两个关键赌注已实证（`scripts/spike-hotreload.ts`，builtins 直喂插件，无浏览器依赖）：

| 步骤 | 观察 | 结论 |
|---|---|---|
| boot 后**运行期 `loader.create`** 新 entry（inject 依赖已有服务） | fiber 直接 **ACTIVE** | 运行期 entry 创建**可行**——`loader.create` 无 boot 状态机守卫（难点 1 降级）|
| 运行期**拆除 provider**（无替换：disabled）| provider fiber 消失；依赖方 fiber → **PENDING**（非崩溃/悬空）| 级联停用干净（难点 2 降级）|
| 重新提供后 | 依赖方 **PENDING → ACTIVE 自动恢复** | 增删恢复闭环成立 |
| 对已存在 entry 重复 `create` | 抛「service 已注册」| 有防双挂保护——**entry 已存在时 enable 必须走 update 激活，不能 create** |

**风险重估**：实施风险主项（运行期 loader 状态机）已排除——Stage 1 从「约五五开」上调为**主要风险在浏览器端集成**（bundle fetch、ModuleLoader、React 渲染的端到端），loader 层不再是不确定点。「entry 预创建」策略从必需降级为可选优化（运行期 create 直接可行）。

### 浏览器端端到端 spike（jsdom + 真实 bundle）

jsdom 复用真实链路（cordis Loader + ClientModuleSystem 作 `loader.internal` + 真实 tsdown 产物 bundle，`loadBundle` 注入本地文件免网络）验证四步（`packages/client/web/tests/spike-e2e.spec.ts`）：

| 步骤 | 观察 | 结论 |
|---|---|---|
| boot：create entry → await | fiber ACTIVE + bundle 渲染 DOM | 真实 bundle 运行时加载/激活/渲染链路通 |
| 运行期 create 第二 entry | fiber ACTIVE + 第二个 DOM 渲染 | 浏览器端运行期新增 entry 可行 |
| 拆除（disabled）| fiber 消失 + ctx.effect disposer 清理 DOM（2→1）| 卸载清理走 effect 链 |
| 重新激活 | fiber ACTIVE + 恢复渲染 | 增删恢复闭环（浏览器端）|

**实现契约发现**：bundle 的 `apply` **直接返回 disposer 不会被 fiber 卸载调用**（spike 初版失败）；必须用 `ctx.effect(() => disposer)` 显式注册才会被 `_unload` 清理。真实插件（`ctx.effect(() => ctx.slots.register(...))`）天然符合——插件卸载契约 = 副作用一律走 `ctx.effect`。

**风险重估（终）**：浏览器端集成主风险（bundle 加载 / ModuleLoader 链路 / fiber 激活 / 渲染 / 清理）也实证通过——Stage 1 剩余为**工程实施**（服务端帧编码 + 浏览器 diff 应用器接线，复用既有通道与已验证机制），不再有未验证的核心机制赌注。

## 实施状态（2026-08，Stage 1 已落地）

服务端与浏览器端改动已进机制分支（`feat/plugin-registry-mvp-0808`，patch 同步）：

- **服务端**：`host/client-graph-changed` 帧带 `entries`（`ClientGraphEntryView` id/url/rev + zod schema）；`onGraphChanged` 推 `clientModuleHost.graph()` 当前表
- **浏览器端**：`ClientModuleSystem.addRow`（rev 变 invalidate 旧 bundle，升级自动覆盖）；runtime 帧路由转 `client/graph-changed` 事件 → `applyClientGraph`（added → addRow + create / re-activate，removed → disabled in place；串行 + self-heal）；manager 移除 reload
- **测试**：modules addRow（新 id import、rev 变重载）、events schema（带 entries、旧形拒绝）、runtime 应用器（create / re-activate / disable 三用例）；既有相关包 798 测试通过
- **剩余验收点**：浏览器 UI 端到端（真实面板内启停 → 页面不刷新 + UI 增删）——机制层已全部验证，UI 层为后续人工/自动化验收

## 渐进 Stage

**Stage 1（核心价值）**：服务端 graph 变化推帧 + 浏览器端 graph diff 应用器（entry 预创建 + 替换复用 reload + 删除 teardown）。验收：面板内 enable/disable/升级插件**页面不刷新**，UI 增删/替换生效；被 inject 插件卸载时依赖方停止且不崩溃；并发串行稳定；失败下帧 self-heal。

**Stage 2（一致性硬化）**：帧 rev 序号、失败投影（FAILED 状态显示）、删除拓扑序、重连后全图对账。验收：web 重启后浏览器重连自动收敛；fetch 失败明确状态而非静默。

**Stage 3（明确不做）**：React 状态保持层——官方不做、侵入 slots 注册契约、插件可经 store/服务自持状态绕过，收益边际。

**明确不做**：
- 平台模块热更新（react/ui-slots 等 externals 冻结表）：会破坏所有插件单例引用，只随整版 web 发布
- 跨进程热更新（CLI 启停触发浏览器刷新）：CLI 只写 registry JSON，web 进程无 fs.watch 不感知；面板内启停是主路径

## 与既有评审的承接

`registry-client-half-design.md` 评审 O3 判定：替换路径「大半免费」（rebuilt/onGraphChanged/HMR watch 泛化）——核实成立（`onRebuilt` 现成）；「运行中 enable 新行无 entry 创建（graph frame v1 未用）」记为后续——即本设计 Stage 1 的核心工作；O3「不改浏览器侧」的隐含假设在本设计中明确放弃（必须改浏览器侧消费分支）。

## 结论

替换（升级）免费复用 client-hmr；新工作收敛为「graph 帧从连接时快照变增量事件 + 浏览器端对 added/removed 的 entry 级应用（entry 预创建规避运行期 create 假设）」；级联刷新与 teardown 由 cordis `_refresh`/`registry.delete` 原生支撑；不碰 cordis 内核与 React 状态。
