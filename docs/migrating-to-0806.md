# 迁移指南：0805 → 0806

官方 0806 大重构（profile/bundle 机制、slots 契约、命令面）对 registry 插件有 3 处**破坏性变化**。本指南给插件作者自查与迁移；示例 `examples/task-status` 已按 0806 迁移（可对照）。

## 1. 命令面：`dsh plugin` → `dsh registry`

0806 起官方占用 `dsh plugin` 作为 **profile 的 pnpm 依赖管理**（`dsh plugin --profile <p> add ...`，管理 profile 由哪些 bundle 层组成）。registry 的插件管理（安装/启停/卸载）移到独立命令面 `dsh registry`：

| 旧（0805） | 新（0806+） |
|---|---|
| `dsh plugin install` | `dsh registry install` |
| `dsh plugin enable / disable` | `dsh registry enable / disable` |
| `dsh plugin list` | `dsh registry list` |
| `dsh plugin uninstall` | `dsh registry uninstall` |
| `dsh plugin create` | `dsh registry create` |

文档/脚本/README 中的命令引用全部改 `dsh registry`。

## 2. slots 契约：`deferRegistration` → `ctx.slots.inject`

0806 删除了 `@deepseek-ai/dsh-client-ui-slots` 的 `deferRegistration` 助手（全树 0 命中）。**带 client half 的插件注册槽位必须改**：

```diff
- import { deferRegistration, type PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
+ import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
...
- ctx.effect(() => {
-   const bar = deferRegistration(ctx.slots, 'conversation.input.dock', MyComponent, () =>
-     ctx.slots.register({ name: 'conversation.input.dock', id: 'my-plugin', order: 10 }, MyComponent))
-   return () => { bar.dispose() }
- }, 'my-plugin: registration')
+ ctx.slots.inject('conversation.input.dock', () =>
+   ctx.slots.register({ name: 'conversation.input.dock', id: 'my-plugin', order: 10 }, MyComponent))
```

`ctx.slots.inject(name, registerFn)`：等待槽声明、随声明坍缩自动移除、重声明后重跑（0806 官方 settings 插件同款）。**症状**：0806 web 加载旧 bundle 报 `deferRegistration is not a function`（task-status 实例）。

## 3. 挂载与依赖解析

- **registry 服务挂载**：0806 组合由 profile/bundle 层合成（不再有 `web.cordis.yml`）——registry 经 bundle 挂进 profile（`dsh plugin --profile web add <bundle>`），见 [集成到 dsh](cookbook/integrating-into-dsh.md)。
- **依赖解析**：组合内服务（plugin-local/ui-plugin-manager）走 profile 闭包（`healProfilesModuleFallback`）；动态插件走 deps-link（pnpm 公共层）。插件依赖（node-pty/ws 等）需在 app 闭包或公共层可解析。
- **`dsh.plugin.json` 清单本身兼容**：字段（id/version/main/engines/contributes/client）不变，无需迁移。

## 插件作者自查清单

- [ ] 命令引用：文档/脚本/README 无 `dsh plugin install|enable|...`（改为 `dsh registry ...`）
- [ ] client half：无 `deferRegistration`（改 `ctx.slots.inject`）；无其他 0805 slots API
- [ ] 挂载：按 0806 流程（bundle 挂 profile）验证，非 `web.cordis.yml`
- [ ] 依赖：插件 import 的包在 app 闭包/公共层可解析
- [ ] 0806 环境实测：`dsh registry install/enable` + web 刷新无插件加载错误

## 相关

- [集成到 dsh](cookbook/integrating-into-dsh.md)（0806 流程）
- [官方插件增量兼容](official-plugin-incremental-compat.md)（官方格式插件进 registry）
- [清单格式参考](manifest-format.md)（`dsh.plugin.json` 字段，0806 兼容）
- 实例：`examples/task-status`（已迁移到 `ctx.slots.inject`）
