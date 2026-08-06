# vlln/task-status

示例插件：**后台任务状态条**（S2 场景的**自造缝版**）——对话页对话框（composer）上方的任务状态条。UI 与官方机制对齐（`conversation.input.dock` 官方槽），但**数据通道完全自造**（Node half 只读路由 + 客户端轮询），官方树零改动。

## 原理

S2 正确形态：后台任务 UI 是对话页**对话框上方的附加状态区**（非独立视图）。本插件经 `conversation.input.dock`（list 槽，输入上方 stacked strip，与 queue/todo 同姿势）注册 `TaskStatusBar`：

- **`conversation.input.dock` 注册**：`deferRegistration` → `ctx.slots.register({ name: 'conversation.input.dock', id: 'task-status', order: 10, locale: NS }, TaskStatusBar)`——官方既有槽，零改动
- **数据（自造缝）**：Node half 注册只读 JSON 路由 `/plugins/vlln/task-status/tasks`，客户端每 1s 轮询并按 `ownerSession` 过滤当前会话——**不依赖** `useTasks` / `task/snapshot` / `onChanged` / `listOwned`（这些是官方基线没有的推送投影 API）
- **Node half**：`inject ['httpServer', 'tasks', 'agents']`，路由返回宿主任务快照。`tasks.list(caller)` 的 owner fence 让无 agent 身份的调用方只见 unowned 任务，所以遍历 `ctx.agents.list()` 逐个取 owned 任务再并上 unowned（按 id 去重）——这是对 `listOwned` 的插件侧等价实现

## 安装与启用

```sh
dsh plugin install ./examples/task-status
dsh plugin enable vlln/task-status
```

启用后刷新 Web 页面：对话页对话框上方出现任务状态卡片——**只显示活跃任务**（running/stopping），任务执行完毕后自动消失；单任务直接显示任务行，多任务折叠头 + 展开列表，点击任务行展开详情（类型/时间/状态详情）。**仅对话页显示**——切到轨迹等视图隐藏，切回恢复。

## 与 S2 原设计的差异

原设计（已从 plugin-registry patch 移除）把数据投影打进了官方树：`tasks` 服务新增 `onChanged`/`listOwned`、mux 新增 `task/snapshot` 帧、client runtime 新增 `useTasks`。本插件改为插件侧自造：

| 维度 | 原设计（官方投影） | 本插件（自造缝） |
|---|---|---|
| 数据源 | `useTasks`（推送帧） | `fetch` 轮询 Node half 路由（1s） |
| 官方改动 | tasks 服务 + apiproxy + client runtime | 零 |
| 实时性 | 推送（事件即达） | 轮询（≤1s 延迟） |
| 插件复杂度 | 薄（数据现成） | 厚（自建通道 + owner fence 遍历） |

## 前置：官方改动

- `conversation.input.dock` 槽（官方既有，queue/todo 同槽）——**无需 patch**

## 构建（保持 bundle 与源码同步）

当前 `client.js` 是手写等价物（同 `examples/navbar`）。若改用 bundler 产出：staging 复制进 DSH monorepo → tsc（类型必须过）→ tsdown → 产物复制回本目录。**改源码必须重建 bundle**。
