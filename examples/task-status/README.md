# vlln/task-status

示例插件：验证统一设计文档 [S2 场景](../../docs/client-ui-extension-model.md) 的**后台任务 UI**——对话页对话框（composer）上方的任务状态条。

## 原理

S2 正确形态：后台任务 UI 是对话页**对话框上方的附加状态区**（非独立视图）。本插件经 `conversation.input.dock`（list 槽，输入上方 stacked strip，与 queue/todo 同姿势）注册 `TaskStatusBar`：

- **`conversation.input.dock` 注册**：`deferRegistration` → `ctx.slots.register({ name: 'conversation.input.dock', id: 'task-status', order: 10, locale: NS }, TaskStatusBar)`
- **数据**：`useTasks`（`task/snapshot` 帧投影，官方 `onChanged`/`listOwned` + mux 基线）实时渲染该会话后台任务——running 计数高亮，已结算任务附注
- **Node half**：空 apply（纯 UI 插件）

## 安装与启用

```sh
dsh plugin install ./examples/task-status
dsh plugin enable vlln/task-status
```

启用后刷新 Web 页面：对话页对话框上方出现任务状态条（无任务显示 idle，任务运行显示 running 计数）。

## 已验证（真实 web 组合，bundle 与源码同步）

- 安装/启用 → boot graph 含 `vlln/task-status` 行（rev 对应当前 bundle）
- **真实 Chrome DOM**：`[data-task-status-bar]` 渲染在 textarea 上方（`compareDocumentPosition` 确认）；任务启动后状态条实时显示 running 计数（`useTasks` 帧推送）
- 与 navbar/taskboard 共存正常

## 前置：官方改动

- `conversation.input.dock` 槽（官方既有，queue/todo 同槽）
- `useTasks` 数据投影（S2，worktree `feat/plugin-registry-mvp`）

## 构建（保持 bundle 与源码同步）

同其他示例：staging 复制进 DSH monorepo → tsc（类型必须过）→ tsdown → 产物复制回本目录。**改源码必须重建 bundle**。
