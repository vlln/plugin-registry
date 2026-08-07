# vlln/turn-fold

示例插件：**turn 尾部活动折叠**（形态 A）——0807 官方 `conversation.chat.turnTail` 链槽的插件验证。每个**完成的 turn** 末尾渲染一个可折叠的「工具活动」摘要头（默认收起，展开显示该 turn 的工具调用列表）。

## 原理

S3「turn 折叠」在 0805 判定不可行（区间折叠需官方折叠容器，`examples/turn-fold` 移除）。**0807 官方补齐了 turn 归属基础设施**，形态 A（尾部摘要折叠）重新可行：

- **`conversation.chat.turnTail` 链槽**（0807 新增）：渲染在 closing assistant 消息正文与 IconActions 之间，**每 turn 一次**——官方 turn 归属锚点
- **`TurnTailOwnerProps`**：`nodes`（整个会话快照）+ `seq`（closing assistant 锚点）+ `openFile`
- **`ConversationNode.turn` 字段**：节点按 turn 编号分组；`turn/end` 事件界定完成的 turn（未完成的 turn 不挂载）
- **官方同槽先例**：`ui-deliverables` 的 `ProducedFiles`（select + 组件同构）

数据通道**零自造**：turn 归属（turn/end 边界）由官方提供，插件只做派生（按 `node.turn` 分组统计工具活动）。这就是 0805 缺的「turn 归属数据」，0807 官方补齐了。

## 形态边界（为什么是「有条件可行」）

| 形态 | 0807 条件 |
|---|---|
| **A. turn 尾部摘要折叠**（本插件） | ✅ 完全可行——turnTail 槽 + nodes.turn 分组 + 自绘折叠头 |
| **B. 整体区间折叠**（隐藏 turn 内官方行） | ⚠️ 需 CSS 隐藏 + 状态同步 hack（官方行仍在 DOM） |
| **C. 原生折叠容器**（官方把 turn 作折叠单元） | ❌ 0807 仍无——需官方在 ChatView 层加 turn 容器 |

turnTail 是「turn 尾部」不是「turn 容器」：只能**追加**折叠头，不能包裹/替换 turn 内已有行。本插件做形态 A（追加式），与官方行零冲突。

## 安装与启用

```sh
dsh registry install ./examples/turn-fold
dsh registry enable vlln/turn-fold
```

启用后刷新 Web 页面：每个完成的 turn 的 assistant 消息下方出现「🔧 N 个工具调用 · M 步」折叠头，点击展开工具调用列表（失败调用标 ✗）。

## 与 S3 原设计差异

原设计（0805）要求**区间折叠**（N item → 1 折叠头，隐藏 turn 内全部行）——需官方折叠容器，已决定不做。本插件实现**追加式尾部折叠**（形态 A），不隐藏官方行，仅依赖 0807 新增的 turnTail 槽。`examples/turn-fold` 以新的形态重新引入（旧 per-item 回退缝 `conversation.chat.item` 已随缝降级移除，不复用）。

## 构建（保持 bundle 与源码同步）

当前 `client.js` 是手写等价物（同 `examples/navbar`）。若改用 bundler 产出：staging 复制进 DSH monorepo → tsc（类型必须过）→ tsdown → 产物复制回本目录。**改源码必须重建 bundle**。
