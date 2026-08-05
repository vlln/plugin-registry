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

启用后刷新 Web 页面：对话页对话框上方出现任务状态卡片（running 计数高亮 + 已完成附注，多任务可展开逐条）。**仅对话页显示**——切到轨迹等视图隐藏，切回恢复。

## 已验证（真实 web 组合，bundle 与源码同步）

- 安装/启用 → boot graph 含 `vlln/task-status` 行（rev 对应当前 bundle）
- **真实 Chrome DOM**：状态卡片渲染在 textarea 上方（官方 token：12px 圆角 + `--dsw-specific-tip` 表面 + `--dsw-alias-border-l1` 边框）；任务启动实时显示 running 计数（`useTasks` 帧推送）
- **仅对话页**：`[data-chat-flow=""]` 探针（与 navbar 同信号）——切 Trajectory 隐藏、切回 Chat 恢复（MutationObserver 双向覆盖 flow 移除/重建）
- 与 navbar/taskboard 共存正常

## 前置：官方改动

- `conversation.input.dock` 槽（官方既有，queue/todo 同槽）
- `useTasks` 数据投影（S2，worktree `feat/plugin-registry-mvp`）

## 构建（保持 bundle 与源码同步）

同其他示例：staging 复制进 DSH monorepo → tsc（类型必须过）→ tsdown → 产物复制回本目录。**改源码必须重建 bundle**。
