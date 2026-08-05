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

启用后刷新 Web 页面：对话流列右侧出现导航条（贴近列、留 12px 间距），圆点 = 每个已渲染的 user 消息；点击跳转对应消息。

## 已知限制

- **只扫已渲染的行**：跨窗口的旧 user 消息（未加载进 DOM）不出现——需要官方把 `data-chat-*` 属性契约化 + 提供跨窗口导航才完整（设计文档 F6）。
- **判别/跳转是 DOM 级**：导航点按 DOM 扫描顺序编号（`user #N`），消息增删（翻页）后编号会重排；纯 DOM 方案没有稳定消息 id（锚点 key `node:<seq>` 在 DOM 上，编号按扫描序）。
- **锚点是内部实现细节**：属性未版本化，官方改动可能破坏——`data-chat-*` 契约文档化是待补机制件。行内 CallRow/SubCallRow 另有 `data-chat-anchor-key="call:<callId>"`（行级 wrapper 无锚点，子行有）。
- **页面内 disable 不清除**：disposer 只在 fiber 卸载时执行（页面生命周期终点/HMR 重建）——页面内 disable 插件不触发，刷新后生效（与 client half 一致）。
- **单会话作用域假设**：扫描是 document 级；多会话流并挂（未来 split view）时会把不可见会话的 user 行混入。
- **跳转可能被官方 follow 拉回**：官方 ChatView 在 pinned-to-bottom 时把非 wheel 的程序化滚动拉回底部（保持跟随）——导航点用 `behavior:'auto'` 一次性滚动（至多被拉回一次；smooth 动画会被每帧拉回形成循环，故禁用）。跨窗口导航的官方 seam 是设计文档 F6 的待补项。

## 测试

DOM 级单测见 worktree `packages/plugin/plugin/tests/navbar.client.spec.ts`（3 例）：点渲染/点击跳转/dispose 清理/无关变更不重建。**MutationObserver 观察 body，但只响应流容器替换或流容器内变更 + rAF 去抖**——覆盖对话流挂载/重建（hero → active、会话切换、翻页），且不因其他 UI 变更触发（全量响应 + 每帧 reflow 会拖死页面，手测踩中后收窄）；导航条自身变更被过滤避免循环。位置跟随对话流列（列重建重绑 + ResizeObserver + window resize，position 不进渲染每帧路径）。

## 构建

`client.js` 是手写等价物（同 `examples/greeter`），生产用 bundler 生成（见 [adding-a-client-half](../../docs/cookbook/adding-a-client-half.md)）。
