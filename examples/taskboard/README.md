# vlln/taskboard

示例插件：侧边栏 task board 入口——验证统一设计文档 [S5 场景](../../docs/client-ui-extension-model.md) 的 **`sidebar.panel` 缝**机制件。

## 原理

官方 `ui-sidebar` 新增 `sidebar.panel` 区域（浏览区与设置脚之间，list 槽）。第三方插件注册一个条目，侧边栏即出现入口。本插件：

- **`sidebar.panel` 注册**：`ctx.slots.register({ name: 'sidebar.panel', id: 'taskboard', locale: NS }, TaskBoardTrigger)` —— React 组件（按钮）渲染进官方 panelArea
- **Node half**：空 apply（纯 UI 插件）
- **bundle**：tsdown client preset 构建（React + JSX，react 走平台模块）

## 安装与启用

```sh
dsh plugin install ./examples/taskboard
dsh plugin enable vlln/taskboard
```

启用后刷新 Web 页面：侧边栏浏览区与设置脚之间出现「Task Board」按钮（官方 `panelArea` 区域渲染第三方注册组件）。

## 已验证（真实 web 组合）

- 安装/启用 → boot graph 含 `vlln/taskboard` 行
- 真实 Chrome DOM：`<div class="panelArea"><button>Task Board</button></div>` 出现在侧边栏（regionArea 与 footArea 之间）
- 服务器日志无错误；导航条（navbar）共存正常

## 前置：官方 `sidebar.panel` 缝

本插件依赖 ui-sidebar 的 `sidebar.panel` 缝（worktree 分支已开，随 PR 合并；未合并时需该改动在官方树）。

## 构建

`client.js` 用 tsdown 构建（同 `dsh-subagent-tree` 的 registry 模式）：staging 复制进 DSH monorepo → tsc → tsdown bundle → 产物复制回本目录。

## 已知限制

- **入口仅验证缝机制**：task board 的「打开新页 + Agent 卡片 + 分派」是占位——`conversation.view` 是 session 作用域，第三方注册需 session ctx，留作后续。
- 侧边栏折叠（rail 态）下按钮仍渲染（`SidebarPanelOwnerProps.wide` 已传，插件可按 wide 切换样式，本示例未做）。
