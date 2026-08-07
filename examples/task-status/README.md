# vlln/task-status

示例插件：**后台任务状态条**（S2 场景）——对话页对话框（composer）上方的任务状态条。UI 与官方机制对齐（`conversation.input.dock` 官方槽），**数据通道自造**（Node half 只读路由 + 客户端轮询），官方树仅一处最小 seam 扩展（`tasks.peek`，见下）。

## 原理

S2 正确形态：后台任务 UI 是对话页**对话框上方的附加状态区**（非独立视图）。本插件经 `conversation.input.dock`（list 槽，输入上方 stacked strip，与 queue/todo 同姿势）注册 `TaskStatusBar`：

- **`conversation.input.dock` 注册**：`ctx.slots.inject` → `ctx.slots.register({ name: 'conversation.input.dock', id: 'task-status', order: 10, locale: NS }, TaskStatusBar)`——官方既有槽，零改动
- **数据（自造缝）**：Node half 注册只读 JSON 路由 `/plugins/vlln/task-status/tasks`，客户端每 1s 轮询并按 `ownerSession` 过滤当前会话——**不依赖** `useTasks` / `task/snapshot` / `onChanged` / `listOwned`（这些是官方基线没有的推送投影 API）
- **Node half**：`inject ['httpServer', 'tasks', 'agents']`，路由返回宿主任务快照。`tasks.list(caller)` 的 owner fence 让无 agent 身份的调用方只见 unowned 任务，所以遍历 `ctx.agents.list()` 逐个取 owned 任务再并上 unowned（按 id 去重）——这是对 `listOwned` 的插件侧等价实现

## 输出 tail：`tasks.peek`（非消耗式，零竞争）

展开任务时客户端**自动轮询**输出路由（无需按钮）。路由走宿主 `tasks.peek(id, owner)`——**非消耗式读取**：

- **不推进 per-task 游标**：`read` 的游标全局唯一，自动轮询若走 `read` 会抢走官方 `task_output` 工具读到的增量（同一游标竞争）。`peek` 返回当前保留输出全文且**游标不动**——插件轮询与官方工具读取互不干扰，官方工具始终读到完整增量。
- **不标记 reported**：终态通知仍由首次消耗式 `read`/`wait` 交付，插件 tail 不会吞掉完成通知。
- **整段替换渲染**：peek 每次返回全文（重复轮询同一文本），客户端**替换**而非追加。

这是本示例对官方 seam 的**唯一一处最小扩展**：`TaskService` 新增抽象 `peek`，`TaskHooks` 新增可选 `peekOutput`，`BashProcess` 新增 `peekOutput`（bounded 保留窗口的非消耗视图，lossy/spill 语义与 `readOutput` 一致）。final-output 任务（无 `peekOutput` 钩子）自动回退到幂等的终态输出，行为与 `read` 一致。

## 安装与启用

```sh
dsh registry install ./examples/task-status
dsh registry enable vlln/task-status
```

启用后刷新 Web 页面：对话页对话框上方出现任务状态卡片——**只显示活跃任务**（running/stopping），任务执行完毕后自动消失；单任务直接显示任务行，多任务折叠头 + 展开列表，点击任务行展开详情（类型/时间/状态详情 + 实时输出 tail）。**仅对话页显示**——切到轨迹等视图隐藏，切回恢复。

## 与 S2 原设计的差异

原设计（已从 plugin-registry patch 移除）把数据投影打进了官方树：`tasks` 服务新增 `onChanged`/`listOwned`、mux 新增 `task/snapshot` 帧、client runtime 新增 `useTasks`。本插件改为插件侧自造 + 一个最小 seam 扩展：

| 维度 | 原设计（官方投影） | 本插件（自造缝 + peek） |
|---|---|---|
| 数据源 | `useTasks`（推送帧） | `fetch` 轮询 Node half 路由（1s） |
| 官方改动 | tasks 服务 + apiproxy + client runtime | 仅 `tasks.peek` / `peekOutput` 最小 seam |
| 实时性 | 推送（事件即达） | 轮询（≤1s 延迟） |
| 插件复杂度 | 薄（数据现成） | 厚（自建通道 + owner fence 遍历） |
| 输出 tail | — | 非消耗式 peek，与 `task_output` 零竞争 |

## 前置：官方改动

- `conversation.input.dock` 槽（官方既有，queue/todo 同槽）——**无需 patch**
- `tasks.peek` / `TaskHooks.peekOutput` / `BashProcess.peekOutput`（本示例引入的最小 seam 扩展，见 plugin-registry 0806 patch）

## 已知限制

- **官方输出缓冲上限**：后台任务内存缓冲保留尾部（溢出 spill 落盘），超限任务的早期输出从源头丢弃，任何读端（含本插件与 `task_output`）都拿不到完整历史。
- **peek 与 `read` 的视图差**：`peek` 显示当前保留输出全文；官方 `task_output` 读的是消耗式增量。两者互不竞争，但同一任务的"全文视图"与"增量视图"在超限场景下各有截断（都由官方缓冲上限决定）。

## 构建（保持 bundle 与源码同步）

当前 `client.js` 是手写等价物（同 `examples/navbar`）。若改用 bundler 产出：staging 复制进 DSH monorepo → tsc（类型必须过）→ tsdown → 产物复制回本目录。**改源码必须重建 bundle**。
