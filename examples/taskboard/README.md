# vlln/taskboard

示例插件：侧边栏 task board 入口——验证统一设计文档 [S5 场景](../../docs/client-ui-extension-model.md) 的 **`sidebar.panel` 缝**机制件。

## 原理

官方 `ui-sidebar` 新增 `sidebar.panel` 区域（浏览区与设置脚之间，list 槽）。第三方插件注册一个条目，侧边栏即出现入口。本插件：

- **`sidebar.panel` 注册**：`deferRegistration`（声明感知延迟，避免与 ui-sidebar 激活竞态）→ `ctx.slots.register({ name: 'sidebar.panel', id: 'taskboard', locale: NS }, TaskBoardTrigger)` —— React 组件（按钮）渲染进官方 panelArea
- **Node half**：空 apply（纯 UI 插件）
- **bundle**：tsdown client preset 构建（React + JSX，react 走平台模块）

## 安装与启用

```sh
dsh plugin install ./examples/taskboard
dsh plugin enable vlln/taskboard
```

启用后刷新 Web 页面：侧边栏浏览区与设置脚之间出现「Task Board」按钮（官方 `panelArea` 区域渲染第三方注册组件）。

## 已验证（真实 web 组合，bundle 与源码同步）

- 安装/启用 → boot graph 含 `vlln/taskboard` 行（rev 对应当前 bundle）
- 真实 Chrome DOM：`<div class="panelArea"><button>Task Board</button></div>` 出现在侧边栏（regionArea 与 footArea 之间）
- **点击行为（有当前会话）**：经 `ctx.conversation.setView('taskboard')` 切到 task board 视图（F9 跨槽通道，官方 `005d8061`）；无当前会话时退回自渲染浮层
- 服务器日志无错误；导航条（navbar）共存正常

## 前置：官方改动

- ui-sidebar 的 `sidebar.panel` 缝（`034c03fa`）
- ui-conversation 的 `ctx.conversation.setView` 跨槽通道（`005d8061`）

## 构建（保持 bundle 与源码同步）

`client.js` 用 tsdown 构建（同 `dsh-subagent-tree` 的 registry 模式）：staging 复制进 DSH monorepo → tsc（类型必须过）→ tsdown bundle → 产物复制回本目录。**改源码必须重建 bundle**，否则产物与源码漂移（审查发现过此问题）。

## 已知限制

- **点击切视图需当前会话**：`ctx.conversation.setView` 是 scope-addressed（无会话时 root 调用抛错），本插件无会话时退回浮层。**浏览器验证受环境限制**（webtest home 无持久化当前会话，headless 无法选中）；setView 机制由官方单测覆盖（`service-orchestration.spec.ts`）。
- **Agent 卡片/分派是占位**：tasks 数据无 client 投影（S2 最高成本项）。
- 侧边栏折叠（rail 态）下按钮仍渲染为宽行（`SidebarPanelOwnerProps.wide` 已传，但本示例未做 `!wide` 图标化，rail 下会被裁切）——与 ui-settings 触发器的 rail 模式对照可改进。
