# 设计：client UI 扩展统一心智模型（场景驱动）

> **历史文档（2026-08 转向后）**：本文描述 plugin-registry 已移除的独立机制（patch/CLI/`ctx.plugins`），仅作决策依据与演进记录保留；当前形态见 [official-0809-coverage](official-0809-coverage.md) 与 `packages/plugin/console`。


状态：**设计稿**。目的：取代「专用孔 / 通用容器 / 内容流钩子 / 3 块」的割裂叙事，用**真实插件场景**推导出一个统一模型——**一个 slot 体系 + 四种匹配 + 数据投影**。早期为示例落地进官方树的缝（`useTasks`/`task/snapshot`、`ctx.ui.mount`、`sidebar.panel`、`conversation.chat.item`）已**从官方树回退**，示例插件改为插件侧自造缝（见 [examples/task-status](../examples/task-status/README.md)）；本模型仍是插件 UI 扩展的指导框架，但「数据投影 / 通用容器」当前是插件自建通道而非官方 API。

## 场景清单

| # | 场景 | 一句话 |
|---|---|---|
| S1 | 导航条 | 侧边一条 user message 导航，点击跳转 |
| S2 | 后台任务 UI | 对话页**对话框上方**的任务状态条（官方槽 + 插件自造轮询通道） |
| S3 | Turn 折叠 | turn 结束折叠执行过程（**不可行**：区间折叠需官方折叠容器） |
| S4 | 动态卡片 | Agent 输出结构化标记 → 插件渲染动态卡片 |
| S5 | Task board | 用户**委派任务给 Agent** 的委派台（**工作区级**）——**暂不做** |

## 场景逐一对照（三要素：数据通道 / 渲染控制 / UI 位置）

### S1 导航条 ✅ 全支持

| 要素 | 机制 | 证据 |
|---|---|---|
| 数据 | `useSession` → nodes 过滤 user | standard kit（`web-react/scoped-slots.tsx`） |
| 跳转 | `data-chat-anchor-key` + 滚动（**未版本化实现细节，F6**） | ChatView 锚点系统 |
| UI 位置 | 自渲染（DOM 锚点契约） | `examples/navbar` |

**契约化缺口（F6）**：锚点属性是内部细节——S1 在自渲染前提下可行，但 `data-chat-*` 属性契约需文档化，否则插件依赖脆弱内部。

### S2 后台任务 UI ✅ 自造缝版

| 要素 | 机制 |
|---|---|
| 数据 | Node half 只读 JSON 路由 + 客户端 1s 轮询（插件自建，`ownerSession` 过滤会话） |
| UI 位置 | 对话页对话框上方的任务状态条（`conversation.input.dock` 官方槽，与 queue/todo 同 strip） |

示例 `examples/task-status`：不依赖推送投影，`tasks.list(caller)` 的 owner fence 由 Node half 遍历 `ctx.agents.list()` 绕过（插件侧等价于 `listOwned`）。代价：实时性降为轮询粒度、插件代码更厚；收益：官方树零改动。

### S3 Turn 折叠 ❌ 不可行

折叠是**区间语义**（N item → 1 折叠头）。早期尝试的 per-item 回退缝（`conversation.chat.item` chain 槽）只覆盖逐 item 替换，hack 折叠有硬缺陷（卸载原生行丢展开状态、null 占位破坏间距、上下文无 turn 归属）。正确形态需官方折叠容器，**已决定不做**。

### S4 动态卡片 ⚠️ 需数据侧 marker + 渲染点（安全版）

| 要素 | 机制 | 证据 |
|---|---|---|
| 数据 | **需新增结构化 marker 识别** | `MarkdownText.tsx`（无 ctx，无法 renderSlot） |
| 渲染控制 | 按卡片类型 keyed 注册渲染器 | ToolRow keyed toolview 先例 |
| UI 位置 | **渲染点必须在有 slots 访问的层**：`AssistantMarkdown`/`ChatView` 层 | `MarkdownText` 是 cordis-free 纯组件 |

**红线**：**不支持 Agent 直接输出 html**（react-markdown 默认禁 html + URL 白名单，XSS 防线）。动态卡片走「结构化标记 + 插件渲染」。

### S5 Task board ⚠️ 暂不做

S5 是**用户委派任务给 Agent 的委派台**（工作区级，非 session 归属），需工作区作用域视图——**已决定暂不做**。

## 统一心智模型：一个 slot 体系 + 四种匹配 + 数据投影

五个场景推导出唯一需要学的模型：

### 1. 一个 slot 体系

所有**树内嵌入**的 UI 扩展都是**「往槽里注册一个组件」**。槽有三要素：**name（位置）+ kind（匹配）+ scope（数据通道）**：

| kind | 匹配方式 | 场景对应 |
|---|---|---|
| `single` | 固定位置（整列/整区） | sidebar、conversation 主区 |
| `list` | 多条目列表（渲染全部） | **`conversation.view` 视图环**、`conversation.input.dock`（任务/队列条）、设置页项 |
| `keyed` | 按维度键匹配（开放取值空间） | 工具名（toolview）、卡片类型（S4） |
| `chain` | 按内容判别式路由（整槽接管） | composer 接管 |

**scope 轴**：`root` / `session` / `session-maybe` 决定插件能拿到哪些 standard-kit 钩子——root 只有 `useSessions`/`useWorkspaces`，session 才有 `sessionId`/`useSession`/`useProjection`。**scope 决定数据通道**。

**开发者只需知道**：「我的插件要往哪个结构挂内容 → 找对应类型的缝（含 scope）→ 注册组件」。

### 2. 数据投影（横切通道）

所有场景的**共同瓶颈不是「UI 怎么挂」，是「数据怎么到浏览器」**：

| 数据 | client 可及性 | 状态 |
|---|---|---|
| 会话（sessions） | `useSessions`/`useSession`/`ctx.sessions` 动作 | ✅ 官方 |
| 工作区（workspaces） | `useWorkspaces` | ✅ 官方 |
| 会话历史（sessionHistory） | `useProjection`（key-addressed cell） | ✅ 官方 |
| 后台任务（tasks） | 无官方投影——**插件自建**（Node 路由轮询，见 S2） | 自造缝 |

**规律**：官方把 host 服务投影成 client 钩子（sessions/workspaces/sessionHistory），一次做对所有插件有用。tasks 投影曾实现为 `useTasks`/`task/snapshot`，已回退——需要推送式任务数据的插件当前须自建通道。

### 3. 主题/skin（视觉层，已免费）

换颜色/字体/间距 = **CSS 变量覆盖**（插件 CSS 全局注入 + body 内联变量），**零官方改动**。缺的是「CSS 变量 + 类名契约文档化」。

## 官方可补的机制件清单（按场景推导）

| 件 | 场景 | 性质 |
|---|---|---|
| `useTasks` client 投影 | S2 | 数据投影（**已回退**，插件自建通道可替代） |
| 卡片 marker + keyed 缝 | S4 | 两件：marker 识别 + 渲染点 |
| CSS 变量契约文档化 | 主题 | 文档（零代码） |
| `data-chat-*` 锚点属性契约化 | S1 | 文档（现为未版本化实现细节） |

**共同点**：都是「**开一类缝 / 补一个投影 / 扩展一个机制**」——一次机制改动服务一整类插件。早期把示例级缝（`sidebar.panel`、`conversation.chat.item`、`ctx.ui.mount`）打进官方树被证明是过度投资：零消费插件、可用插件侧自造缝替代，已回退。官方按需补缝，不预开。

## 信任边界与安全红线

- **容器/缝是标准化惯例，不是安全边界**：插件 bundle 执行任意 JS，安全模型 =「用户启用即信任」。
- **红线：Agent 输出不做任意 html 渲染**（XSS 防线）。动态卡片走「结构化标记 + 插件渲染」。
- **生命周期**：所有缝/容器绑定插件 fiber，disable 后清理（跨页面加载生效，页面内不清——与 client half 一致）。

## 验证方案

- **S1 冒烟 ✅ 已落地（`examples/navbar`）**：纯 DOM 自渲染，「DOM 锚点契约」：扫描 `data-chat-flow-kind="user"` + `data-chat-anchor-key` 渲染导航点，点击跳转，observer 监听，dispose 清理。零数据依赖。
- **S2 ✅ 已落地（`examples/task-status`）**：官方槽 + Node 轮询路由，仅对话页、完成后消失、点击展开详情（自造缝版）。
- **安全**：S4 拒绝 html 内嵌的测试。

## 开放决策

1. **缝的覆盖面**：官方按「结构类型」开缝的节奏与优先级——由官方产品决策（当前纪律：有真实消费者才开）。
2. **数据投影范围**：tasks 之外哪些 host 服务值得官方投影（当前纪律：示例不驱动官方 API，插件自建）。
3. **S4 marker 线协议（F3）**：新 AssistantBlock kind（动 host + 回放兼容）vs fence 语言约定（零 host 改动但易与 shiki 高亮冲突）。
4. **CSS 变量契约**：哪些变量可被覆盖、类名契约的稳定承诺。
5. **与姊妹稿的关系**：本文统一模型是 `generic-client-render-container-design.md` 的上层抽象（该稿的 `ctx.ui.mount` 已回退，其「附加式 UI 标准化」方向仍有效）；`registry-client-half-design.md` 是底层机制。

## 参考

- 场景证据：worktree `packages/client/`（ChatView、ui-layout、runtime/client/sessions、web-react/scoped-slots、ui-primitives/markdown）
- 姊妹稿：`generic-client-render-container-design.md`（通用容器，已回退）、`registry-client-half-design.md`（client half 机制）
- 对照：[Obsidian Views](https://docs.obsidian.md/Plugins/User+interface/Views)（registerView 等价物 = dsh `conversation.view` 视图环）
