# 设计：client UI 扩展统一心智模型（场景驱动）

状态：**设计稿，未实现**。目的：取代「专用孔 / 通用容器 / 内容流钩子 / 3 块」的割裂叙事，用**真实插件场景**推导出一个统一模型——**一个 slot 体系 + 四种匹配 + 数据投影**。本文基于对官方源码的逐项核实（worktree `feat/plugin-registry-mvp`），每个场景的结论都有源码证据。

## 场景清单

| # | 场景 | 一句话 |
|---|---|---|
| S1 | 导航条 | 侧边一条 user message 导航，点击跳转 |
| S2 | 后台任务 UI | 显示 Agent 启动的后台任务 |
| S3 | Turn 折叠 | turn 结束后折叠执行过程，只留 Answer |
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

### S2 后台任务 UI ⚠️ 缺数据投影（最高成本项）

| 要素 | 机制 | 证据 |
|---|---|---|
| 数据 | **缺失**：tasks 是 host 侧服务，无 client 投影，且 **connection 无 task 事件帧**（连 wire 面都没有） | `packages/tasks/tasks/src/index.ts`（Node 侧）、`connection/src` 无 task 事件 |
| UI 位置 | 通用容器 | 同上 |

**缺口（F4）**：需新线协议（task/start、task/done 事件帧）→ client 适配器 → provide 钩子——是清单**最高成本项**（不是「仿 sessions」那么简单）。且 `TaskService` 是 **session 作用域**（owned-task 按 session 隔离），`useTasks` 应为 session 作用域钩子。

### S3 Turn 折叠 ⚠️ 内容流分发维度需扩展

| 要素 | 机制 | 证据 |
|---|---|---|
| 数据 | `node.turn` + `streaming` 标志已存在 | `conversation.ts:92`、`AssistantMarkdown` props |
| 渲染控制 | 需**按 turn 分组接管**（非单 node） | `ChatFlowItem` 是 node 级（`chat-flow.ts:16-18`），无 turn 级 item |

**缺口（评审 F1 修正）**：内容流钩子若只按 `node.kind` 路由，覆盖不了 turn 级折叠。且**官方 chain 语义是「整槽接管」（命中条目替换并隐藏 fallback），不支持「每 item 逐条回退官方渲染」**——turn 折叠需要每个 flow item 过判别式、未命中仍走官方渲染。需二选一：(a) 扩展 chain 语义支持条目内注入 fallback（对齐 Obsidian `registerMarkdownPostProcessor` 的逐元素形态）；(b) 承认内容流需要第 5 种形态（per-item transform list）。**当前没有现成机制覆盖**，不是「把 turn 纳入分发维度」这么简单——真正工作是「新开流级缝 + 渲染点 + 回退语义」。

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
| 侧边栏入口 | **keyed 缝（`sidebar.panel` 待开）** | sidebar 整列 single 由 **ui-sidebar** 占用（`ui-layout/index.ts:39` 声明、`ui-sidebar/src/client/index.ts:38-49` 注册）；`sidebar.workspaces`/`sidebar.settings` 是 ui-sidebar 声明的两个 child——`sidebar.panel` 缝应归 **ui-sidebar**（shell）声明+渲染，非 ui-layout/workspace |
| 打开新页 | **`conversation.view` list 槽（视图环）** | `apply.ts:121-123`（注册条目 = 一个视图 tab）——Obsidian `registerView` 等价物，但**session 作用域**（随会话切换重挂，F9） |
| Agent 列表 | `useSessions`/`useWorkspaces` | standard kit |
| 分派任务 | `ctx.sessions.openSubagent` 等注入动作 | `runtime/client/sessions/service.ts:328` |
| 卡片渲染 | 视图 tab 内自渲染 | 插件自由 |

**作用域待定（F9）**：`conversation.view` 是 session 作用域——task board 若是「每 session 的后台看板」正好合适（tasks 本身 session 隔离）；若是「跨 session 全局看板」需 root 级视图环或由 `sidebar.panel` 承载。

## 统一心智模型：一个 slot 体系 + 四种匹配 + 数据投影

五个场景推导出唯一需要学的模型：

### 1. 一个 slot 体系（两轴模型，评审 F5/F7 修正）

所有**树内嵌入**的 UI 扩展都是**「往槽里注册一个组件」**。槽有三要素：**name（位置）+ kind（匹配）+ scope（数据通道）**：

| kind | 匹配方式 | 场景对应 |
|---|---|---|
| `single` | 固定位置（整列/整区） | sidebar、conversation 主区 |
| `list` | 多条目列表 | **`conversation.view` 视图环（S5 新页）**、设置页项 |
| `keyed` | 按维度键匹配（开放取值空间） | 工具名（toolview）、**sessionRow（行内缝）**、**sidebar.panel（待开）**、卡片类型（S4） |
| `chain` | 按内容判别式路由（**整槽接管**，命中隐藏 fallback） | composer 接管；**S3 需扩展 per-item 回退语义**（当前不覆盖） |

**scope 轴（评审 F5）**：`root` / `session` / `session-maybe` 决定插件能拿到哪些 standard-kit 钩子——root 只有 `useSessions`/`useWorkspaces`，session 才有 `sessionId`/`useSession`/`useProjection`（`web-react/scoped-slots.tsx:289-310`）。**scope 决定数据通道**，与 §2 呼应；开发者漏学 scope 会踩「组件为什么拿不到 useSession」。

**开发者只需知道**：「我的插件要往哪个结构挂内容 → 找对应类型的缝（含 scope）→ 注册组件」。不需要知道「内容流」「专用孔」这些词。

**诚实表述（评审 F7）**：这不是「三个机制变一个」，而是**两轴模型**——缝（4 种匹配 + scope）解决树内嵌入；`ctx.ui.mount` 服务（姊妹稿）解决流外附加；数据投影是横切通道。比「3 块」更简单的点在于：缝的 4 种匹配就是官方 `SlotKind`，插件只学一个槽 API。

### 2. 数据投影（与 UI 挂载并列的第二件事）

所有场景的**共同瓶颈不是「UI 怎么挂」，是「数据怎么到浏览器」**：

| 数据 | client 可及性 | 状态 |
|---|---|---|
| 会话（sessions） | `useSessions`/`useSession`/`ctx.sessions` 动作 | ✅ 已有（S1/S5） |
| 工作区（workspaces） | `useWorkspaces` | ✅ 已有 |
| 会话历史（sessionHistory） | `useProjection`（key-addressed cell） | ✅ 已有（ui-trajectory 在用） |
| 后台任务（tasks） | **无 client 投影**（且需新线协议：connection 无 task 事件帧） | ⚠️ 需补，**清单最高成本项**（S2） |

**规律**：官方把 host 服务投影成 client 钩子（sessions/workspaces/sessionHistory 三实例），一次做对所有插件有用。`useTasks` 是第一个待补实例，但**成本高于「仿 sessions」**——tasks 连 wire 面都没有，需新事件帧 → client 适配器 → provide 钩子；且 `TaskService` 是 **session 作用域**（owned-task 按 session 隔离），`useTasks` 应是 session 作用域钩子，非全局。

### 3. 通用渲染容器（附加式 UI 的标准化，第二轴）

浮层/角标/导航条（S1）这类**附加式** UI：官方维护 body 级容器，插件经 `ctx.ui.mount` 渲染（姊妹稿）。它解决「流外附加」，不解决「树内嵌入」——与缝是**不同轴**（mount 服务 vs 树内槽）。

### 4. 主题/skin（视觉层，已免费）

换颜色/字体/间距 = **CSS 变量覆盖**——插件 CSS 全局注入（`<style data-plugin>`）+ body 内联变量（`theme-presenter.ts`），**零官方改动**。缺的是「把 CSS 变量契约 + 类名契约文档化为稳定 API」。

## 官方需补的机制件清单（按场景推导，评审修正）

| 件 | 场景 | 改动面 | 性质 |
|---|---|---|---|
| `sidebar.panel` keyed 缝 | S5 | **ui-sidebar** 声明 + SidebarRoot 渲染（shell 归属） | 开一类缝 |
| `useTasks` client 投影 | S2 | **新线协议（task 事件帧）+ client 适配器 + session 作用域钩子** | 数据投影，最高成本 |
| 内容流 per-item 回退缝 | S3 | **新开流级缝 + 渲染点 + 回退语义**（chain 扩展或新形态） | 机制扩展 |
| 卡片 marker + keyed 缝 | S4 | marker 识别（线协议/fence 约定）+ 渲染点（有 slots 的层） | 两件 |
| CSS 变量契约文档化 | 主题 | 文档 | 零代码 |
| `data-chat-*` 锚点属性契约化 | S1 | 文档（现为未版本化实现细节） | 文档 |

**共同点**：都是「**开一类缝 / 补一个投影 / 扩展一个机制**」——一次机制改动服务一整类插件，而非为单个插件挖孔。这正是「档位 A」的形态：**把「每需求改官方源码」变成「官方按结构类型开缝，开一次覆盖一类」**。

## 信任边界与安全红线

- **容器/缝是标准化惯例，不是安全边界**：插件 bundle 执行任意 JS（classic script 注入），安全模型 =「用户启用即信任」（与 client half 一致）。
- **红线：Agent 输出不做任意 html 渲染**（XSS 防线）。动态卡片走「结构化标记 + 插件渲染」，插件只渲染自己信任的数据。
- **生命周期**：所有缝/容器绑定插件 fiber，disable 后清理（跨页面加载生效，页面内不清——与 client half 一致）。

## 验证方案（评审 F8 修正：先自渲染，容器落地后替换）

- **S1 冒烟（先落地）**：自渲染导航条（greeter 式 DOM + useSession 过滤 + 锚点滚动）——通用容器未实现前先走自渲染；容器落地后替换为 `ctx.ui.mount`。验证「数据（useSession）+ 跳转（锚点）可复用」。
- **S5 冒烟（需先开 sidebar.panel 缝）**：sidebar.panel 入口 + conversation.view 新页 + useSessions + openSubagent。
- **数据投影**：`useTasks` 单测（投影正确性 + 响应式 + session 作用域隔离）。
- **安全**：S4 拒绝 html 内嵌的测试（markdown 渲染器对 `<script>` 的处置）。
- **性能（F10）**：S3/S4 的流内分发不破坏 ChatView 的渲染预算（节点级 memo、chunk 风暴只重渲 StreamingTail）——加性能冒烟。

## 开放决策

1. **缝的覆盖面**：官方按「结构类型」开缝的节奏与优先级（先 sidebar.panel 还是先卡片缝）——由官方产品决策。
2. **chain 的 per-item 回退语义（F1）**：S3 依赖「未命中回退官方 item 渲染」，官方 chain 无此语义——拍板：扩展 chain（条目内注入 fallback）vs 新形态（per-item transform list）vs 接受插件整流接管。
3. **task board 作用域（F9）**：per-session（现 `conversation.view` 环可用，tasks 本身 session 隔离）vs root 级（需新 root 视图环或由 sidebar.panel 承载）——直接决定 S5 是否闭环。
4. **S4 marker 线协议（F3）**：新 AssistantBlock kind（动 host + 回放兼容）vs fence 语言约定（零 host 改动但易与 shiki 高亮冲突）。
5. **useTasks 线协议（F4）**：新事件帧的宿主侧来源、任务跨页面/跨 session 存活语义、投影节流。
6. **数据投影范围**：tasks 之后还有哪些 host 服务值得投影（按插件需求热度）。
7. **CSS 变量契约**：哪些变量可被覆盖、类名契约的稳定承诺——是否需要官方维护「样式契约清单」。
8. **与姊妹稿的关系**：本文统一模型是 `generic-client-render-container-design.md` 的上层抽象（两轴：缝 + mount），不取代；registry-client-half-design.md 是底层机制。

## 参考

- 场景证据：worktree `packages/client/`（ChatView、ui-layout、runtime/client/sessions、web-react/scoped-slots、ui-primitives/markdown）
- 姊妹稿：`generic-client-render-container-design.md`（通用容器）、`registry-client-half-design.md`（client half 机制）
- 对照：[Obsidian Views](https://docs.obsidian.md/Plugins/User+interface/Views)（registerView 等价物 = dsh `conversation.view` 视图环）
