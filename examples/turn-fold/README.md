# vlln/turn-fold

示例插件：验证统一设计文档 [S3 场景](../../docs/client-ui-extension-model.md) 的 **`conversation.chat.item` per-item 回退缝**——内容流逐 item 分发，未命中回退官方渲染。

## 原理

官方 `ui-conversation` 新增 `conversation.chat.item` chain 槽（S3 落地）：`ChatView` 对**每个 flow item**（user/assistant 节点、tool-group 工具组）调 `renderSlotChain`——条目 select 判 item、未命中走 `fallback`（官方渲染）。**per-item transform**，非整槽接管。本插件：

- **注册**：`deferRegistration` → `ctx.slots.register({ name: 'conversation.chat.item', select, locale: NS }, TurnFoldRow)` —— select 判 `tool-group`（已完成工具组）折叠，其余 item 未命中走官方渲染
- **Node half**：空 apply（纯 UI 插件）
- **bundle**：tsdown client preset 构建（React + JSX，react 走平台模块）

## 安装与启用

```sh
dsh plugin install ./examples/turn-fold
dsh plugin enable vlln/turn-fold
```

启用后刷新 Web 页面：对话内容流中的工具调用组（bash/工具行）折叠成一行摘要，用户消息与最终回答仍官方渲染。

## 已验证（真实 web 组合，bundle 与源码同步）

- 安装/启用 → boot graph 含 `vlln/turn-fold` 行（rev 对应当前 bundle）
- **真实 Chrome DOM**：内容流 `data-chat-flow-kind="tool-group"` 的 item 全部被折叠行接管（`tool call(s) folded`），user/assistant 文本官方渲染——per-item 混合接管
- 服务器日志无错误；与 navbar/taskboard 共存正常

## 前置：官方改动

- `conversation.chat.item` per-item 回退缝（S3，worktree `feat/plugin-registry-mvp`）

## 构建（保持 bundle 与源码同步）

同 `taskboard`：staging 复制进 DSH monorepo → tsc → tsdown → 产物复制回本目录。**改源码必须重建 bundle**。

## 已知限制

- **折叠判别只基于 flow item**：select 是 owner 纯函数，无法读 turn 结束状态（如 `turnEnds`）——本示例按"工具组已完成"（全 tool-result）判别；需要会话级状态（如"仅折叠已结束 turn"）的判别需数据投影（如 `useSession` 在组件内、select 保持纯）。
- 折叠行是纯展示（无展开交互）；展开/详情留待后续。
