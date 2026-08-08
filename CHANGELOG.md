# Changelog

本仓库（plugin-registry 示例 + 文档）的变更记录。机制件改动在官方 snapshot 宿主仓库的机制分支按提交记录，本表汇总与示例/文档对应的交付。

## 基线

本仓库是「官方基线 + patch + package」构建式仓库（见 [AGENTS.md](AGENTS.md)），交付时需标明基线：

- **机制分支基线**：官方 0808 快照（`20260808T121140Z`，提交 `57ffa9de`）——机制分支 `feat/plugin-registry-mvp-0808` 已对齐
- **patch 基线**：`patches/dsh-plugin-registry-0808.patch` 基于官方 0808 快照（54 文件，纯平台接线：CLI `dsh registry` 子命令、apiproxy `plugins` 域、client-modules `registerExternal` + 碰撞守卫、host 帧 `client-graph-changed` 自动刷新、tasks/bash 非消耗式 `peek` seam、依赖闭包）；旧 0807/0806 patch 保留供对应基线追溯

## 2026-08（0808 基线升级）

官方发布 0808 快照（`snapshot-20260808T121140Z-7f25d3e98c`，1248 文件变更）后升级：契约评估（slots 注入 API / HostFrame / ctx 服务名 / profile-bundle 均未变；**web 形状组合变化**——tool 展示从单一 `conversation.chat.toolview` 重构为 `conversation.chat.tool`（whole-call seat）+ `tool.call.toolview`（per-call 子槽）+ `conversation.details.tool`（详情委托），机制分支未触碰这些槽，分发层示例所用 `conversation.chat.turnTail` / `conversation.input.dock` 均保留）→ 0808 验证站 3way 应用 0807 patch（仅 args.ts 冲突，手工并入官方新增 `RunInvocation`）+ CLI registry list / web 插件面板 / 插件 client.js 全验证 → 机制分支重放（`feat/plugin-registry-mvp-0808`，cherry-pick 冲突仅 args.ts 一处；api-proxy session 代理/恢复重构与 plugins 域自动合并共存；125 测试全过）→ 重建 0808 patch（54 文件，纯净基线 `git apply --check` 通过）。

0808 官方新增 `dsh run` 子命令（headless 一次性任务）与 typert 域包；tool 槽重构属 ui-conversation/ui-tool 包内组合变化，不影响 registry 机制契约。

## 2026-08（0807 基线升级）

官方发布 0807 快照（`snapshot-20260807T130646Z-e8a0f1a758`，551 文件变更）后升级：契约评估（slots/HostFrame/profile-bundle/ModuleLoader/manifest 均未变，DOM 锚点保留，tasks/bash 仅 pwsh 格式改动）→ 0807 验证站 3way 应用旧 patch + 127 测试全过 + web 端到端验证 → 机制分支重放（`feat/plugin-registry-mvp-0807`，适配 `ApiProxyDefaults.provider/model → defaultTarget` 闭包）→ 重建 0807 patch（54 文件，纯净基线 `git apply --check` 通过）。

0807 官方已吸收部分机制文档（`services.md` 的 `BashProcess.peekOutput` 行等）；官方新增 `ui-skill` 包（含 locale 路径引用 bug，非机制引入）。

## 2026-08（任务输出 tail 零竞争：tasks.peek）

task-status 实时 tail 与官方 `task_output` 工具的读取竞争问题（`tasks.read` 游标全局 per-task，自动轮询会抢走工具增量）的根治：官方 seam 新增**非消耗式读取**，插件 tail 与工具读取互不干扰：

- **seam（机制分支）**：`TaskService` 抽象 `peek(id, caller?)`（返回保留输出，不推进游标、不标记 reported——终态通知仍由首次消耗式 read/wait 交付）；`TaskHooks` 可选 `peekOutput?()`（缺省回退到与 `read` 一致的终态幂等输出）；`BashProcess.peekOutput()`（bounded 保留窗口非消耗视图，lossy/spill 语义与 `readOutput` 一致），bash-local / pwsh-local 实现，tool-bash 接线
- **示例**：task-status Node half 输出路由改 `ctx.tasks.peek`，client 由「增量追加」改「整段替换」渲染（peek 重复轮询返回同一全文）；展开卡去冗余行/去包裹层，新增双契约回归测试（`task-status.client.spec.ts`：旧增量契约追加累积 + peek 全文契约整段替换）
- **验证**：`/tmp/dsh-0806` 集成验证——peek 非消耗（重复轮询同文本）、官方 read 在多次 peek 后仍读完整增量、peek 始终显示保留全文


## 2026-08（插件启停自动刷新）

registry enable/disable 通过 `registerExternal`/`unregisterExternal` 改变 client-modules graph；boot manifest 页面加载时固定，故 apiproxy 在 host 流推送纯信号帧 `host/client-graph-changed`，浏览器收到后 `location.reload()` 拾取新 `__DSH_BOOT__`：

- **host 侧**：`events.ts` HostFrame union 加 `{ type: 'host/client-graph-changed' }` + schema；api-proxy 的 events.host disposers 订阅 `clientModuleHost.onGraphChanged`（跨 isolate 走 `ctx.root`，与 plugin service 一致）
- **client 侧**：`manager.ts` 收到该帧 → `window.location.reload()`
- **验证**：WebSocket 连 `/api/events.host`，`plugin.disable/enable`（有 client half 的插件，如 greeter）→ 立即收到 `client-graph-changed` 帧（先于 RPC 响应）；无 client half 的插件（如 loop）不触发（`unregisterExternal` 无行可删，正确行为）


## 2026-08（0806 对齐的架构修复）

架构审查发现的 3 个问题修复：

- **🔴 bundle 安装死路**：registry bundle 不再声明 private 包依赖（@deepseek-ai/dsh-plugin 等未发布，npm 解析必败）；`@deepseek-ai/dsh-client-ui-plugin-manager` 加入 apps/cli 依赖闭包（0806 patch），bundle 的 insert 行经 profile 依赖 fallback（`healProfilesModuleFallback`）解析——`dsh plugin --profile web add <bundle>` 路径跑通
- **🟠 双装互斥扩展**：plugin-local mount 时检查 `<dshHome>/profiles/*` 的 `dsh.profile.bundles`，同一包已作为 bundle 层安装则拒绝（补 registerExternal 的 Loader-entry 守卫覆盖不到的 bundle 层场景）
- **🟠 分发侧同步 0806**：repo 的 ui-plugin-manager 客户端 `deferRegistration → ctx.slots.inject`（0806 slots 契约）；install-into-dsh.mjs、integrating-into-dsh、uninstalling-plugins、distributing-plugins、AGENTS、architecture 全部 0805 → 0806 基线 + bundle 化流程
- **依赖解析分工**（architecture.md 记录）：profile 闭包服务组合内服务，deps-link 只服务动态插件，不重叠

## 2026-08（deps-link 增强：pnpm 虚拟 store 公共层）

`ensureDepsLink` 的目标从「checkout 顶层 node_modules」改为「**pnpm 虚拟 store 公共层优先、顶层回退**」（`deps-link.ts` target 选择，约 6 行）：

- **修复**：pnpm 默认隔离下非提升包（node-pty/ws，仅存于 `.pnpm/` store）与 workspace/vendor 包（顶层本就不可见）现在都能经公共层解析——依赖它们的插件（如 dsh-web-terminal）经 registry 安装后不再 `ERR_MODULE_NOT_FOUND`
- **兼容**：扁平布局（node-linker hoisted）/自定义 hoist/非 pnpm 无公共层 → 存在性检查回退顶层 = 原行为；轮转重建/Windows junction/并发安全/真实目录保护全部继承
- **测试**：`deps-link.spec.ts` 补公共层优先/顶层回退/轮转重建/公共层 only 包解析 4 例
- **文档**：architecture.md 依赖解析段改「公共层优先」机制描述，删除待办表述

## 2026-08（官方插件增量兼容）

官方格式插件（npm/cordis 包）加一个 `dsh.plugin.json` 增量清单即可进 registry——bundle 零重构建、官方通道不受影响（非破坏 + 互斥）：

- **manifest id 放宽**：接受 scoped npm 包名（`@scope/name`，含 `@`/点）与原生 `publisher/name` 并存；保留 `node_modules` 负前瞻、单斜杠、禁 `..`/`?`/`#`/大写（`manifest.ts` + `manifest.spec.ts` 补正/负例）
- **碰撞守卫**：`registerExternal` 拒绝与 Loader entry 同名（防 loader 扫描 delete/重建互踩 + Node half 双挂载），官方插件走 Loader 树，registry 登记失败走 mount 回滚（官方 patch：`client/modules` registerExternal + `node-half.spec.ts` 测试反转）
- **patch 重建**：30 文件，`git apply --check` 在 0805 基线通过
- **文档**：新增 `docs/official-plugin-incremental-compat.md`（设计规范）；architecture/README/registry-client-half-design（id 碰撞不变式改显式守卫）同步

## 2026-08（缝降级：示例级缝退出官方树）

把上一轮打进官方树的**示例驱动缝**回退为插件侧自造缝——官方树只保留平台接线（第二层插件系统本身），示例数据/渲染需求由插件自己实现：

### 官方树（worktree 分支，patch 重建）

- **移除 `useTasks` 数据投影**：tasks `onChanged`/`listOwned`、apiproxy `task/snapshot` 帧 + 基线回放、client runtime task-store 全部退出官方树
- **移除 `ctx.ui.mount` 通用渲染容器**：runtime `ui-mount.ts` 服务退出官方树
- **移除零消费预留缝**：`sidebar.panel` 槽、`conversation.chat.item` chain 槽、`scoped-slots` fallback 注入、`storeInstance` 公开 API
- **patch 重建**：30 文件（26 修改 + 4 新增），`git apply --check` 在 0805 基线通过

### 示例插件（本仓库）

- **`examples/task-status`** 重写为自造缝：Node half `inject ['httpServer','tasks','agents']` 注册只读任务路由（遍历 `agents.list()` 绕过 owner fence），客户端 1s 轮询 + `conversation.input.dock` 官方槽渲染，不再依赖 useTasks/task-snapshot
- **`examples/greeter`** 重写为纯 DOM 自渲染（`createRoot` + `appendChild`），不再依赖 `ctx.ui`
- `examples/navbar` 不变（本就是纯 DOM 自渲染）

### 文档

- `docs/client-ui-extension-model.md`：S2/S3/sidebar.panel/useTasks/ctx.ui 更新为回退后状态（压缩）
- `docs/generic-client-render-container-design.md`：状态改「已回退」
- `docs/architecture.md`、根 README、examples/README：UI 扩展方向与示例描述同步

## 2026-08（plugin-registry 机制件大轮）

### 机制件（官方树，worktree 分支）

- **`sidebar.panel` list 缝**：ui-sidebar 声明侧边栏面板入口区，插件注册条目即出现入口（S5 入口机制）
- **`conversation.view` 视图环 + `ctx.conversation.setView` 通道**：session 作用域多视图切换；F1 修复（setView 写共享 store 实例）
- **`useTasks` 数据投影**：`task/snapshot` 线协议（完整快照姿势 + mux 打开基线）→ client 适配器 → session 作用域钩子（S2 数据通道）
- **`conversation.chat.item` per-item 回退缝**：ChatView 逐 flow item 分发，未命中回退官方渲染（S3 机制件；turn 折叠场景不可行，已记录）
- **`ctx.ui.mount` 通用渲染容器**：runtime `ctx.ui` 服务，overlay/floating 容器 + per-mount 独立 React root + error boundary + fiber 生命周期（统一模型第二轴）
- **官方 0805 基线对齐**：分支基线推进到官方 08-05 快照（含会话缓冲重构等），机制件在新基线验证通过

### 示例插件（本仓库）

- **`examples/navbar`**（S1）：自渲染导航条，纯 DOM 锚点契约，仅对话页显示（`[data-chat-flow=""]` 探针）
- **`examples/task-status`**（S2）：对话页对话框上方任务状态条（`conversation.input.dock` + `useTasks`），官方 token 卡片、仅对话页、完成后自动消失、点击展开详情
- **`examples/greeter`**：client half 迁移到 `ctx.ui.mount`（overlay 浮层替代自渲染）
- **`examples/turn-fold` / `examples/taskboard`**：已移除（S3 turn 折叠区间语义不可行；S5 委派台暂不做——原因记录于设计文档）

### 文档

- `docs/client-ui-extension-model.md`：统一心智模型（一个 slot 体系 + 四种匹配 + 数据投影；两轴 = 缝 + mount）
- `docs/generic-client-render-container-design.md`：通用渲染容器设计（已实现）
- `docs/registry-client-half-design.md`：registry client half 机制（既有）
- `scripts/install-into-dsh.mjs`：一键集成脚本（复制包 + 打补丁 + 装依赖），README 与 integrating-into-dsh 推广
- integrating-into-dsh 补「运行」段：官方方式 `npm run build && ./bin/dsh web`、registry 验证、TSX_TSCONFIG_PATH 指向坑（实测 0805 基线 + 脚本安装后 `./bin/dsh web` 启动成功、插件 API 返回 greeter enabled）
- 文档补 client half 生效边界：CLI `plugin enable` 服务端实时但已运行 web 需重启；面板内启用同进程、刷新页面即可（creating-a-plugin 验证点 + integrating-into-dsh 步骤 3）
