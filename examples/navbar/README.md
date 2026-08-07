# vlln/navbar

示例插件：**对话节点导航条**（issue dsh-external/issues#144 规格）——对话区右缘等距节点串，每条 user 消息一个节点：激活药丸跟随阅读位置、悬停/聚焦玻璃预览卡（6 行截断）、点击平滑滚动 + 品牌蓝高亮环、>11 节点滑动窗口、平时隐形悬停浮现磨砂胶囊、`prefers-reduced-motion`、<2 条 user 消息自动隐藏。验证设计文档 [S1 场景](../../docs/client-ui-extension-model.md) 的「自渲染 + DOM 锚点契约」主张。

## 原理

官方 `ChatView` 在每条消息行打两个 DOM 属性（`ChatView.tsx:655-657`）：

- `data-time-hover-root` + `[class*="bubble"]` —— user 消息行（0806 起 UserStyleBubble：data-time-hover-root 是消息容器共有属性，气泡结构是 user 专属；`data-chat-flow-kind` 已移除）
- `data-chat-anchor-key="node:<seq>"` —— 消息锚点

本插件**纯 DOM 自渲染**：扫描 `[data-time-hover-root]` 行中非 pending-steering 且含气泡（`[class*="bubble"]`）的 user 行渲染导航点，点击**手动 rAF 缓动滚动**（每帧续 wheel 起源，防官方 follow 拉回）。**零数据通道依赖**，只依赖官方锚点契约（这是设计文档要验证的关键点）。

## 安装与启用

```sh
dsh registry install ./examples/navbar
dsh registry enable vlln/navbar
```

启用后刷新 Web 页面：对话流列右侧出现导航条（贴近列、留 12px 间距），圆点 = 每个已渲染的 user 消息；点击跳转对应消息。

## 已知限制

- **只扫已渲染的行**：跨窗口的旧 user 消息（未加载进 DOM）不出现——需要官方把 `data-chat-*` 属性契约化 + 提供跨窗口导航才完整（设计文档 F6）。
- **判别/跳转是 DOM 级**：导航点按 DOM 扫描顺序编号（`user #N`），消息增删（翻页）后编号会重排；纯 DOM 方案没有稳定消息 id（锚点 key `node:<seq>` 在 DOM 上，编号按扫描序）。
- **锚点是内部实现细节**：属性未版本化，官方改动可能破坏——`data-chat-*` 契约文档化是待补机制件。行内 CallRow/SubCallRow 另有 `data-chat-anchor-key="call:<callId>"`（行级 wrapper 无锚点，子行有）。
- **页面内 disable 不清除**：disposer 只在 fiber 卸载时执行（页面生命周期终点/HMR 重建）——页面内 disable 插件不触发，刷新后生效（与 client half 一致）。
- **单会话作用域假设**：扫描是 document 级；多会话流并挂（未来 split view）时会把不可见会话的 user 行混入。
- **行节点被替换后旧 dot 闭包失效（已修）**：对话流重建（会话切换/视图重挂载/React 节点替换）后，dot 闭包可能持有已脱离文档的旧行——`getBoundingClientRect` 全 0，点击只会略微上移（滚动容器顶偏移量）而非跳转。修复：点击/悬停时按 `data-chat-anchor-key` 重新解析当前行（找不到才回退闭包内的行），且行集合/流容器变化时重建 dot（纯滚动仍只移动激活态）。回归测试见下。
- **跳转可能被官方 follow 拉回**：官方 ChatView 在 pinned-to-bottom 时把非 wheel 的程序化滚动拉回底部（保持跟随）——导航点在点击时及每帧续发 `wheel` 事件刷新官方 wheel 起源（`wheelStartRef` 2 rAF 过期），使程序化滚动被判定为用户滚动而不拉回；`behavior:'auto'` 一次性滚动已弃用（smooth 会被每帧拉回形成循环）。跨窗口导航的官方 seam 是设计文档 F6 的待补项。

## 测试

DOM 级单测见 worktree `packages/plugin/plugin/tests/navbar.client.spec.ts`（4 例）：点渲染/点击跳转/行替换后重解析/dispose 清理/无关变更不重建。**MutationObserver 观察 body，但只响应流容器替换或流容器内变更 + rAF 去抖**——覆盖对话流挂载/重建（hero → active、会话切换、翻页），且不因其他 UI 变更触发（全量响应 + 每帧 reflow 会拖死页面，手测踩中后收窄）；导航条自身变更被过滤避免循环。位置跟随对话流列（列重建重绑 + ResizeObserver + window resize，position 不进渲染每帧路径）。

## 构建

`client.js` 是手写等价物（同 `examples/greeter`），生产用 bundler 生成（见 [adding-a-client-half](../../docs/cookbook/adding-a-client-half.md)）。
