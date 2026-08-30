# 官方设置面板集成（settings.plugin.item）

第三方插件把配置页写进官方 **设置 → 插件** 面板的方法（rc.8 实测定型，
reference 实现：`vlln/dsh-loop` 的设置卡片 + 动态工具门）。分两个 half：
Node half 注册设置命名空间；client half 注册 keyed 槽卡片 + 传输。零官方改动。

## 1. 契约锚点（当前态）

- `settings.plugin.item` 是 **keyed 槽**（ui-settings-plugins 的
  ConfigurablePluginsTab 声明）：注册必须带 `key`（= 设置命名空间名）；
  **不是 list 槽**——没有 `id`/`order`，缺 key 启动即抛
  `slot settings.plugin.item requires options.key`。
- 渲染方只渲染「已服务（served）的命名空间 ∩ 注册项」——卡片 `key` 必须
  与 Node half 注册的命名空间同名，否则卡片永不出现。
- 注入面：`settingsScope`（ui-settings，读写传输）、`connection`/`remote`
  （线缆）、`locale`（文案）。

## 2. Node half：命名空间 + 动态工具门

```js
import { settingsNamespace } from '@deepseek-ai/dsh-settings' // profile 闭包注入
const SETTINGS_NS = settingsNamespace('my-plugin')            // 命名空间名 = 卡片 key
const SCHEMA = z.object({ myTool: z.boolean().default(true) }) // schemastery
ctx.inject(['settings'], (settingsCtx) => {
  const settings = settingsCtx.settings.register(SETTINGS_NS, SCHEMA, { applies: 'live' })
  // 工具定义表：key = 字段名 = 工具注册名（与 client 段字段表同源）。
  const toolDefs = { myTool: defineTool({ /* ... */ }) }
  const disposers = new Map()
  const sync = () => {
    const value = settings.get()
    for (const [name, def] of Object.entries(toolDefs)) {
      const enabled = value[name] !== false
      if (enabled && !disposers.has(name)) disposers.set(name, ctx.tools.register(def))
      else if (!enabled && disposers.has(name)) { disposers.get(name)(); disposers.delete(name) }
    }
  }
  sync()
  settings.watch(() => sync()) // 每次提交后幂等重算
})
```

要点：

- `applies: 'restart'|'live'` 在 rc.8 **只是 describe 的元数据**，宿主不按
  它分支；「保存即生效」的行为全部在 watch 里自己实现。
- **工具 schemas 无 session 快照**：每次会话组装与每轮 prompt 组装实时解析
  当前全局工具层。因此新会话立即生效，**存量会话的下一轮同样读到新集合**；
  开→关方向会让在飞会话的模型下一轮起看不到该工具（README 说明取舍）。
- 字段名 = 工具名 = 客户端字段表，三处同源；新增工具 = 三处各加一条。
- 关闭只影响 agent 侧工具；命令/路由等用户侧能力不受开关影响（各自独立）。

## 3. Client half：卡片

- 注册：`ctx.slots.register({ name: 'settings.plugin.item', key: SETTINGS_NS,
  locale: settingsNS, inject: () => ({ hooks, actions }) }, Card)`。
- 传输：`ctx.settingsScope.bind({ namespace: SETTINGS_NS })`；读写是
  revision-fenced 文档变更（`set`/`unset` 单字段）。
- **CardForm 暂存语义**：`edit`/`resetField` 只改草稿（不落库）；`save`
  一次提交全部草稿（`unset` = 清除用户层，字段回落 composition 默认）；
  `discard` 丢弃；save 后重读快照逐字段确认，失败置 `failed` 标记。
  纯布尔开关可省略 `resetField` 与「已覆盖/恢复默认」UI——开关本身即状态，
  默认就是开/关，无歧义（参考实现 `vlln/dsh-loop` 即如此）。
- **快照必须引用稳定（React #185 血泪）**：`useSyncExternalStore` 要求内容
  未变时返回同一对象；getSnapshot 每次都新造对象 → 无限重渲 → 控制台
  `Minified React error #185`（"slot entry crashed in 'settings.plugin.item'"）。
  实测模式：字段草稿对象每次变更整体替换（引用即失效信号）+ scope 快照
  引用，做缓存键；未变时原样返回缓存。
- 官方卡片 chrome（tokens 从应用 CSS 取）：li 卡片 `border-l2` / radius12 /
  `bg-layer-3`，hover 或展开 `bg-layer-2`；折叠头 = title（15/600
  `label-primary`）+ description（13 `label-tertiary`）+ 未保存徽章
  （`bg-module-platform` 胶囊）+ 旋转 chevron；字段行 = 标题 + overridden
  徽章 + 「恢复默认」链接 + 控件 + hint；脚注 = discard（描边）/
  save（实底 `label-primary`），禁用统一 opacity .4。
- **官方没有 Switch 组件**（rc.8 实测：app shell 与全部 shipped client
  bundle 中 `role="switch"`/`aria-checked` 零命中；官方控件是 input/select/
  分段/按钮）。要开关就自绘：轨道「开 `brand-primary` / 关 `border-l2` +
  `bg-layer-2`」，滑块 `label-primary-inverted`，focus 环
  `interactive-bg-hover`，`role="switch"` + `aria-checked` 语义。
- locale：独立命名空间（如 `settings.<ns>`），zh/en 两套 copy，与 README
  行为描述保持一致。

## 4. 验证

- describe：`POST /api/settings.describe`，envelope
  `{"type":"client-request","rpcId":...,"method":"settings.describe","payload":{}}`；
  找 `namespaces[]` 中 ns 命中者，读 `revision`/`user`/`value`/`applies`。
- 更新走 revision-CAS：`settings.update {ns, patch, expectedRevision}`；
  revision 从 describe 动态读（写死会撞 `settings-conflict`）。
- 工具门 e2e（无重启、新会话）：`session.create` → `session.rename` →
  `session.prompt`（mode `steer`，问「列出可调用的所有工具名」）→ 轮询
  `session.history`，**事件结构**里取最后一个 `assistant/message` 的
  `content` text，断言工具名在/不在。翻转开关后再开新会话对比。
- 浏览器冒烟：headless Chrome CDP 断言 `role="switch"`、`aria-checked`、
  卡片文本、控制台零 error（React #185 的哨兵）。
