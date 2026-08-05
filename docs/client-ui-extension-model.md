# 设计：client UI 扩展统一心智模型（场景驱动）

状态：**设计稿，未实现**。目的：取代「专用孔 / 通用容器 / 内容流钩子 / 3 块」的割裂叙事，用**真实插件场景**推导出一个统一模型——**一个 slot 体系 + 四种匹配 + 数据投影**。结论均有源码证据（逐项核实 worktree `feat/plugin-registry-mvp`）。

## 场景清单

| # | 场景 | 一句话 |
|---|---|---|
| S1 | 导航条 | 侧边一条 user message 导航，点击跳转 |
| S2 | 后台任务 UI | 显示 Agent 启动的后台任务 |
| S3 | Turn 折叠 | turn 结束折叠执行过程（**不可行**：区间折叠需官方折叠容器；per-item 回退缝已落地）|
| S4 | 动态卡片 | Agent 输出结构化标记 → 插件渲染动态卡片 |
| S5 | Task board | 侧边栏加区域，点击开新页，卡片排列 Agent + 分派 |

## 场景逐一对照（三要素：数据通道 / 渲染控制 / UI 位置）

### S1 导航条 ✅ 全支持

| 要素 | 机制 | 证据 |
|---|---|---|
| 数据 | `useSession` → nodes 过滤 user | standard kit（`web-react/scoped-slots.tsx:295`） |
| 跳转 | `data-chat-anchor-key` + 滚动（**未版本化实现细节，评审 F6**） | `ChatView.tsx:56-93`（锚点系统真实存在，但无公开契约；tool-group 无锚点、跨窗口需 loadOlder） |
| UI 位置 | 通用容器（overlay/floating）或自渲染 | 本文姊妹稿 |

**契约化缺口（F6）**：锚点属性是内部细节——S1 在自渲染前提下可行，但 `data-chat-*` 属性契约需文档化（与 CSS 变量契约并列），否则插件依赖脆弱内部。

### S2 后台任务 UI ✅ 已实现（task/snapshot 投影）

| 要素 | 机制 | 证据 |
|---|---|---|
| 数据 | **`task/snapshot` 帧（完整快照，对齐 `session/queue`）→ client 适配器 → `useTasks`** | events.ts 帧变体；session.ts 消费；provide tasks hook → standard kit 自动生成 |
| UI 位置 | 通用容器 | 同上 |

**落地（评审 F4 修正）**：线协议取**完整快照姿势**——每变更广播 session 全量列表，重连基线免费；host 侧 `onChanged` + `listOwned` + api-proxy 广播 + **mux 打开推基线**（连接前任务不可见，已修）。tasks 是 session 作用域，`useTasks` 是 session 钩子；列表含 settled 历史。

### S3 Turn 折叠 ⚠️ per-item 回退缝已落地，turn 折叠不可行

| 要素 | 机制 | 证据 |
|---|---|---|
| 数据 | `node.turn` + `streaming` 标志已存在 | `conversation.ts:92`、`AssistantMarkdown` props |
| 渲染控制 | **逐 flow item 过判别式，未命中回退官方渲染** | `conversation.chat.item` chain 槽（`ChatView.tsx` renderItem 外包） |

**机制件落地（评审 F1 拍板）**：方案 (a)——**复用 chain 语义**：ChatView 对每个 flow item 调 `renderSlotChain('conversation.chat.item', { item, ... }, { fallback: 官方渲染 })`——条目判 item 接管、未命中走官方。逐 item 接管/回退是有效通用机制（官方测试验证）。

**turn 折叠场景不可行**：折叠是**区间语义**（N item → 1 折叠头），per-item 缝只能逐 item 替换——hack 折叠有硬缺陷：卸载原生行丢 tool 展开状态、null 占位破坏间距、上下文注入无 turn 归属。正确形态 M2（纯折叠策略 + 官方折叠容器 + 原生常驻）是官方渲染管线新能力，**已决定不做**——turn-fold 移除。

### S4 动态卡片 ⚠️ 需数据侧 marker + 渲染点（安全版）

| 要素 | 机制 | 证据 |
|---|---|---|
| 数据 | **需新增结构化 marker 识别**：frontmatter 不是现有通道（无 remark-frontmatter）；代码块语言只用于 shiki 高亮（`CodeBlock.tsx:12-13`），非插件缝 | `MarkdownText.tsx:90-108`（pre→CodeBlock，lang 仅高亮） |
| 渲染控制 | 按卡片类型 keyed 注册渲染器 | ToolRow keyed toolview 先例 |
| UI 位置 | **渲染点必须在有 slots 访问的层**：`MarkdownText` 是 cordis-free 纯组件（无 ctx、无法 renderSlot），渲染点须在 `AssistantMarkdown`/`ChatView` 层 | `MarkdownText.tsx`（无 ctx） |

**红线**：**不支持 Agent 直接输出 html**——`MarkdownText` 用 react-markdown（默认禁 html）+ URL 白名单（`sanitizeUrl`），这是 XSS 防线（`markdown/MarkdownText.tsx:15`）。动态卡片走「结构化标记 + 插件渲染」，Obsidian 动态卡片同理。

**缺口（评审 F3 修正）**：机制件拆成两件——① **marker 识别**（新 AssistantBlock kind 线协议 vs fence 语言约定，前者动 host+回放兼容，后者零 host 改动但易与 shiki 高亮冲突）；② **卡片 keyed 缝的渲染点**（须在有 slots 访问的组件层）。

### S5 Task board ⚠️ 主体支持，入口待开缝

| 要素 | 机制 | 证据 |
|---|---|---|
| 侧边栏入口 | **list 缝（`sidebar.panel`，已开）** | sidebar 整列 single 由 ui-sidebar 占用（`ui-layout/index.ts:39` 声明、`ui-sidebar` 注册）；`sidebar.panel` 缝归 ui-sidebar（list 槽，shell 直接 renderSlot 渲染全部条目） |
| 打开新页 | **`conversation.view` list 槽（视图环）** | `apply.ts:121-123`（注册条目 = 一个视图 tab）——Obsidian `registerView` 等价物；**session 作用域**；root 经 `ctx.conversation.setView` 切换 |
| Agent 列表 | `useSessions`/`useWorkspaces` | standard kit |
| 分派任务 | `ctx.sessions.openSubagent` 等注入动作 | `runtime/client/sessions/service.ts:328` |
| 卡片渲染 | 视图 tab 内自渲染 | 插件自由 |

**作用域**：`conversation.view` 是 session 作用域——「每 session 的后台看板」用现环 + `ctx.conversation.setView` 切换；「跨 session 全局看板」仍需 root 级视图环（开放项）。

## 统一心智模型：一个 slot 体系 + 四种匹配 + 数据投影

五个场景推导出唯一需要学的模型：

### 1. 一个 slot 体系（两轴模型，评审 F5/F7 修正）

所有**树内嵌入**的 UI 扩展都是**「往槽里注册一个组件」**。槽有三要素：**name（位置）+ kind（匹配）+ scope（数据通道）**：

| kind | 匹配方式 | 场景对应 |
|---|---|---|
| `single` | 固定位置（整列/整区） | sidebar、conversation 主区 |
| `list` | 多条目列表（渲染全部） | **`conversation.view` 视图环（S5 新页）**、**`sidebar.panel`（侧边栏面板入口，S5）**、设置页项 |
| `keyed` | 按维度键匹配（开放取值空间） | 工具名（toolview）、**sessionRow（行内缝）**、卡片类型（S4） |
| `chain` | 按内容判别式路由（**整槽接管**，命中隐藏 fallback） | composer 接管；**S3 需扩展 per-item 回退语义**（当前不覆盖） |

**scope 轴（评审 F5）**：`root` / `session` / `session-maybe` 决定插件能拿到哪些 standard-kit 钩子——root 只有 `useSessions`/`useWorkspaces`，session 才有 `sessionId`/`useSession`/`useProjection`（`web-react/scoped-slots.tsx:289-310`）。**scope 决定数据通道**，与 §2 呼应；漏学会踩「组件为什么拿不到 useSession」。

**开发者只需知道**：「我的插件要往哪个结构挂内容 → 找对应类型的缝（含 scope）→ 注册组件」。不需要知道「内容流」「专用孔」这些词。

**诚实表述（评审 F7）**：这不是「三个机制变一个」，而是**两轴模型**——缝（4 种匹配 + scope）解决树内嵌入；`ctx.ui.mount` 服务（姊妹稿）解决流外附加；数据投影是横切通道。比「3 块」更简单的点在于：缝的 4 种匹配就是官方 `SlotKind`，插件只学一个槽 API。

### 2. 数据投影（与 UI 挂载并列的第二件事）

所有场景的**共同瓶颈不是「UI 怎么挂」，是「数据怎么到浏览器」**：

| 数据 | client 可及性 | 状态 |
|---|---|---|
| 会话（sessions） | `useSessions`/`useSession`/`ctx.sessions` 动作 | ✅ 已有（S1/S5） |
| 工作区（workspaces） | `useWorkspaces` | ✅ 已有 |
| 会话历史（sessionHistory） | `useProjection`（key-addressed cell） | ✅ 已有（ui-trajectory 在用） |
| 后台任务（tasks） | **`useTasks`（task/snapshot 帧投影）** | ✅ 已实现（S2） |

**规律**：官方把 host 服务投影成 client 钩子（sessions/workspaces/sessionHistory 三实例），一次做对所有插件有用。`useTasks` 是第一个补完的实例（原本连 wire 面都没有）。tasks 是 **session 作用域**，`useTasks` 是 session 钩子。

### 3. 通用渲染容器（附加式 UI 的标准化，第二轴）✅ 已实现

浮层/角标/导航条（S1）这类**附加式** UI：官方维护 body 级容器，插件经 `ctx.ui.mount` 渲染（姊妹稿已实现：overlay/floating + per-mount root + error boundary + fiber 生命周期）。解决「流外附加」，与缝是**不同轴**；greeter 已迁移验证。

### 4. 主题/skin（视觉层，已免费）

换颜色/字体/间距 = **CSS 变量覆盖**（插件 CSS 全局注入 `<style data-plugin>` + body 内联变量），**零官方改动**。缺的是「CSS 变量 + 类名契约文档化」。

## 官方需补的机制件清单（按场景推导，评审修正）

| 件 | 场景 | 改动面 | 性质 |
|---|---|---|---|
| `sidebar.panel` list 缝 | S5（已开） | **ui-sidebar** 声明 + SidebarRoot panelArea 渲染（shell 归属） | 开一类缝 |
| `useTasks` client 投影 | S2（已落地） | **`task/snapshot` 帧 + client 适配器 + session 钩子**（`onChanged`/`listOwned` + mux 基线） | 数据投影 |
| 内容流 per-item 回退缝 | S3（已落地） | **`conversation.chat.item` chain 槽**（逐 item 分发 + fallback）；turn 折叠区间语义不可行 | 机制扩展 |
| 卡片 marker + keyed 缝 | S4 | marker 识别（线协议/fence 约定）+ 渲染点（有 slots 的层） | 两件 |
| CSS 变量契约文档化 | 主题 | 文档 | 零代码 |
| `data-chat-*` 锚点属性契约化 | S1 | 文档（现为未版本化实现细节） | 文档 |

**共同点**：都是「**开一类缝 / 补一个投影 / 扩展一个机制**」——一次机制改动服务一整类插件，而非为单个插件挖孔。这正是「档位 A」的形态：**把「每需求改官方源码」变成「官方按结构类型开缝，开一次覆盖一类」**。

## 信任边界与安全红线

- **容器/缝是标准化惯例，不是安全边界**：插件 bundle 执行任意 JS（classic script 注入），安全模型 =「用户启用即信任」（与 client half 一致）。
- **红线：Agent 输出不做任意 html 渲染**（XSS 防线）。动态卡片走「结构化标记 + 插件渲染」，插件只渲染自己信任的数据。
- **生命周期**：所有缝/容器绑定插件 fiber，disable 后清理（跨页面加载生效，页面内不清——与 client half 一致）。

## 验证方案（评审 F8 修正：先自渲染，容器落地后替换）

- **S1 冒烟 ✅ 已落地（`examples/navbar`）**：`vlln/navbar` 自渲染导航条，「纯 DOM 锚点契约」：扫描官方每行 `data-chat-flow-kind="user"` + `data-chat-anchor-key` 渲染导航点，点击 `scrollIntoView` 跳转，observer 监听，dispose 清理。**零数据依赖，只靠锚点契约**。
  - **验证结果**：① 安装/启用 → boot graph 行 + bundle 200；② Chrome dump-dom 见导航条（未冻结）；③ DOM 单测（`tests/navbar.client.spec.ts`）：点渲染/点击跳转/dispose/**无关变更不重建**。
  - **发现（印证 F6）**：导航点只覆盖已渲染行——`data-chat-*` 契约化 + 跨窗口导航待补；`z-index:900`（官方模态之下）。
  - **审查修复**：初版 observer 观察 body，render 重建又触发 observer 无限循环冻结；修复为限定 `[data-chat-flow=""]`，单测锁定。
  - **后续**：导航条可迁移到 `ctx.ui.mount`（容器已落地）。
- **S5 冒烟 ✅ sidebar.panel 缝 + 入口 + 视图切换（`examples/taskboard`）**：ui-sidebar 开 `sidebar.panel` list 缝（`034c03fa`）；ui-conversation 加 `setView` 通道（`005d8061`，F9 闭环；F1 孤儿实例 `b5cf95a9` 修复为写共享实例）；taskboard 注册入口 + 视图，点击 setView 切换（无会话退回浮层）。**浏览器复验**：点击切视图 + `useTasks` 真实任务。
- **数据投影**：`useTasks` 单测（投影正确性 + 响应式 + session 作用域隔离）+ host 侧帧广播/基线单测 + 浏览器复验。
- **安全**：S4 拒绝 html 内嵌的测试（markdown 渲染器对 `<script>` 的处置）。
- **性能（F10）**：S3/S4 的流内分发不破坏 ChatView 的渲染预算（节点级 memo、chunk 风暴只重渲 StreamingTail）——加性能冒烟。

## 开放决策

1. **缝的覆盖面**：官方按「结构类型」开缝的节奏与优先级（先 sidebar.panel 还是先卡片缝）——由官方产品决策。
2. **chain 的 per-item 回退语义（F1，已定）**：`conversation.chat.item` 槽逐 item 分发、fallback 官方渲染（方案 a）；per-item 缝不覆盖区间折叠（turn 折叠不可行，见 S3）。
3. **task board 作用域（已实现）**：`ctx.conversation.setView` 已加；「跨 session 全局看板」仍需 root 级视图环（开放项）。
4. **S4 marker 线协议（F3）**：新 AssistantBlock kind（动 host + 回放兼容）vs fence 语言约定（零 host 改动但易与 shiki 高亮冲突）。
5. **useTasks 线协议（F4，已定）**：`task/snapshot` 完整快照帧，mux 打开推基线；剩余开放：任务跨页面存活语义、输出流投影（当前只投影状态）、投影节流。
6. **数据投影范围**：tasks 之后还有哪些 host 服务值得投影（按插件需求热度）。
7. **CSS 变量契约**：哪些变量可被覆盖、类名契约的稳定承诺——是否需要官方维护「样式契约清单」。
8. **与姊妹稿的关系**：本文统一模型是 `generic-client-render-container-design.md` 的上层抽象（两轴：缝 + mount），不取代；registry-client-half-design.md 是底层机制。

## 参考

- 场景证据：worktree `packages/client/`（ChatView、ui-layout、runtime/client/sessions、web-react/scoped-slots、ui-primitives/markdown）
- 姊妹稿：`generic-client-render-container-design.md`（通用容器）、`registry-client-half-design.md`（client half 机制）
- 对照：[Obsidian Views](https://docs.obsidian.md/Plugins/User+interface/Views)（registerView 等价物 = dsh `conversation.view` 视图环）
