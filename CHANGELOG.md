# Changelog

本仓库（plugin-registry 示例 + 文档）的变更记录。官方机制件改动在 worktree（`dsh2026/test-vlln` 的 `feat/plugin-registry-mvp` 分支）按提交记录，本表汇总与示例/文档对应的交付。

## 基线

本仓库是「官方基线 + patch + package」构建式仓库（见 [AGENTS.md](AGENTS.md)），交付时需标明基线：

- **机制分支基线**：官方 0805 快照（`20260805T134133Z`，提交 `9e785ce`）——worktree 分支已对齐
- **patch 基线**：`patches/dsh-plugin-registry.patch` 已基于官方 0805 快照重新生成（84 文件，含 S2/S3/mount 机制件），与机制分支同步

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
- integrating-into-dsh 补「运行」段：build + 启动命令、registry 验证、TSX_TSCONFIG_PATH 指向坑（实测 0805 基线 + 脚本安装后启动 Web 成功、greeter 安装启用通过）
