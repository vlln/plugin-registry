# vlln/turn-fold

示例插件：验证统一设计文档 [S3 场景](../../docs/client-ui-extension-model.md) 的 **`conversation.chat.item` per-item 回退缝**——内容流逐 item 分发，未命中回退官方渲染。

## 原理

官方 `ui-conversation` 新增 `conversation.chat.item` chain 槽（S3 落地）：`ChatView` 对**每个 flow item**（user/assistant 节点、tool-group 工具组）调 `renderSlotChain`——条目 select 判 item、未命中走 `fallback`（官方渲染）。**per-item transform**，非整槽接管。本插件：

- **注册**：`deferRegistration` → `ctx.slots.register({ name: 'conversation.chat.item', select, locale: NS }, TurnFoldRow)` —— select 判「已结束 turn 的执行过程」接管（返回 turn）；组件聚合该 turn 的执行过程为一个可展开折叠块，其余执行过程 item 渲染 null（内容已聚合）
- **Node half**：空 apply（纯 UI 插件）
- **bundle**：tsdown client preset 构建（React + JSX，react 走平台模块）

## 安装与启用

```sh
dsh plugin install ./examples/turn-fold
dsh plugin enable vlln/turn-fold
```

启用后刷新 Web 页面：每次**完成的 turn** 的执行过程（工具调用、上下文注入、thinking）默认折叠成一行；**点击展开后渲染官方原生内容**（每个 tool 调用、上下文注入、thinking 原样显示，非自制组件），该 turn 的最后一条回答（Answer）与用户消息不折叠。

## 已验证（真实 web 组合，bundle 与源码同步）

- 安装/启用 → boot graph 含 `vlln/turn-fold` 行（rev 对应当前 bundle）
- **真实 Chrome DOM**：内容流 `data-chat-flow-kind="tool-group"` 的 item 全部被折叠行接管（`tool call(s) folded`），user/assistant 文本官方渲染——per-item 混合接管
- 服务器日志无错误；与 navbar/taskboard 共存正常

## 前置：官方改动

- `conversation.chat.item` per-item 回退缝（S3，worktree `feat/plugin-registry-mvp`）

## 构建（保持 bundle 与源码同步）

同 `taskboard`：staging 复制进 DSH monorepo → tsc → tsdown → 产物复制回本目录。**改源码必须重建 bundle**。

## 已知限制

- **判别是 owner 纯函数**：select 只读 owner 携带的 turn 上下文（`turnEnds`/`answerSeqs`）；正在运行的 turn 不折叠（保持实时过程可见）。
- **展开 = 官方原生渲染**：chain 的 elected 组件注入 `fallback`（官方原生 item，官方 scoped-slots 支持），展开时渲染 `props.fallback`；折叠状态是插件级展开集（默认全折叠，点击加入），select 保持纯。
- **聚合只含流内执行过程**：组件用 `useSession` 聚合该 turn 的执行过程时跳过 tool-call head（空 assistant，不在 flow items 里）——否则首项判定失败。
