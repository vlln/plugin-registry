# vlln/navbar

示例插件：user 消息导航条——每条 user 消息一个圆点，点击滚动跳转到对应消息。验证设计文档 [S1 场景](../../docs/client-ui-extension-model.md) 的「自渲染 + DOM 锚点契约」主张。

## 原理

官方 `ChatView` 在每条消息行打两个 DOM 属性（`ChatView.tsx:655-657`）：

- `data-chat-flow-kind="user"` —— 行类型（assistant/command/user/tool-group…）
- `data-chat-anchor-key="node:<seq>"` —— 消息锚点

本插件**纯 DOM 自渲染**：扫描 `[data-chat-flow-kind="user"]` 行渲染导航点，点击 `scrollIntoView` 跳转。**零数据通道依赖**，只依赖官方锚点契约（这是设计文档要验证的关键点）。

## 安装与启用

```sh
dsh plugin install ./examples/navbar
dsh plugin enable vlln/navbar
```

启用后刷新 Web 页面：右缘出现导航条，圆点 = 已渲染的 user 消息；点击跳转对应消息。

## 已知限制

- **只扫已渲染的行**：跨窗口的旧 user 消息（未加载进 DOM）不出现——需要官方把 `data-chat-*` 属性契约化 + 提供跨窗口导航才完整（设计文档 F6）。
- **锚点是内部实现细节**：属性未版本化，官方改动可能破坏——`data-chat-*` 契约文档化是待补机制件。行内 CallRow/SubCallRow 另有 `data-chat-anchor-key="call:<callId>"`（行级 wrapper 无锚点，子行有）。
- **页面内 disable 不清除**：disposer 只在 fiber 卸载时执行（页面生命周期终点/HMR 重建）——页面内 disable 插件不触发，刷新后生效（与 client half 一致）。
- **单会话作用域假设**：扫描是 document 级；多会话流并挂（未来 split view）时会把不可见会话的 user 行混入。
- **流式期间跳转可能被拉回**：官方 follow 逻辑（流式时保持底部）可能覆盖 smooth 滚动——demo 级，静态会话无竞态。

## 测试

DOM 级单测见 worktree `packages/plugin/plugin/tests/navbar.client.spec.ts`（3 例）：点渲染/点击跳转/dispose 清理/无关变更不重建。**MutationObserver 必须限定会话流区域**（`[data-chat-flow=""]`）——观察整个 body 会把导航条自身重建计入变更，形成无限微任务循环冻结页面（已修复并有用例锁定）。

## 构建

`client.js` 是手写等价物（同 `examples/greeter`），生产用 bundler 生成（见 [adding-a-client-half](../../docs/cookbook/adding-a-client-half.md)）。
