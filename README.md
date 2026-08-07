# dsh 插件注册表（Plugin Registry）

DeepSeek Harness 的本地插件系统：清单协议、安装/启停、Web 管理面板、声明校验、脚手架与 tarball 分发，兼容官方格式插件（增量清单，bundle 零重构建）。

## 快速上手

### 使用 registry

```sh
dsh registry create acme/cool-tool   # 脚手架：生成 dsh.plugin.json + index.mjs + README
cd cool-tool
# 编辑 index.mjs 写插件逻辑；编辑 dsh.plugin.json 把 contributes.tools 声明成入口实际注册的工具
dsh registry install .               # 安装（默认禁用）
dsh registry enable acme/cool-tool   # 启用（实时挂载；声明未注册会报错回滚）
dsh registry list                    # 列表
dsh registry uninstall acme/cool-tool # 卸载（删目录 + 索引；disable 则保留）
```

不想从空脚手架开始？复制示例：`cp -r examples/greeter ./my-tool`，改 `id` 与工具注册即可。完整指南见 [创建插件](docs/cookbook/creating-a-plugin.md)。

**命令名说明**：registry 命令是 `dsh registry`，不是 `dsh plugin`——官方 0806 起 `dsh plugin` 是 **profile 的 pnpm 依赖管理**（`dsh plugin --profile <p> add ...`，管理 profile 由哪些 bundle 层组成），与 registry 的**运行时插件管理**（安装/启停/卸载）语义不同；独立命令面避免混淆。从旧版迁移：

| 旧（0805） | 新（0806+） |
|---|---|
| `dsh plugin install` | `dsh registry install` |
| `dsh plugin enable / disable` | `dsh registry enable / disable` |
| `dsh plugin list` | `dsh registry list` |
| `dsh plugin uninstall` | `dsh registry uninstall` |

要定时循环能力（轮询部署、照看 PR、build-fix-test 循环）？安装 `examples/loop`：`dsh registry install ./examples/loop && dsh registry enable acme/loop`，然后 `/loop 5m check the deploy`。

### 安装 registry

```sh
node scripts/install-into-dsh.mjs <dsh-monorepo路径>
```

一键完成：复制插件包 + 打接线补丁 + 装依赖。之后 `npm run build && ./bin/dsh web` 按官方方式启动（设置页出现「插件」面板）。完整步骤见 [集成到 dsh](docs/cookbook/integrating-into-dsh.md)。

## 展示

Web 设置页「插件」面板：

![插件管理面板 1](screenshots/plugin-panel-1.png)

插件列表：搜索框、状态徽章（已启用/已禁用/未安装）、版本与描述、操作按钮。

![插件管理面板 2](screenshots/plugin-panel-2.png)

操作后状态：启用实时生效（徽章变绿胶囊）、禁用与卸载的反馈。

## 能力一览

- **清单协议**：`dsh.plugin.json` 声明身份、版本、入口、兼容范围、贡献
- **声明即契约**：声明的工具未注册 → 启用报错并回滚挂载
- **安装/启停**：目录或 tarball（解压防路径穿越）；启停实时生效
- **Web 面板**：设置页「插件」区，浏览、搜索、安装、启停、卸载
- **client half**：插件可带浏览器端 bundle，启用后进入 `__DSH_BOOT__` 在 Web 端运行（`client` 声明 + 运行时登记）
- **官方插件增量兼容**：官方格式插件（npm/cordis 包）加一个 `dsh.plugin.json` 增量清单即可进 registry——bundle 零重构建、官方通道不受影响（非破坏 + 互斥，见 [设计](docs/official-plugin-incremental-compat.md)）
- **UI 扩展机制件**（官方树提供，示例验证）：`conversation.view` 视图环 + `setView`、`conversation.input.dock` 等官方既有槽、DOM 锚点自渲染契约——统一模型见 [client UI 扩展心智模型](docs/client-ui-extension-model.md)。**注**：早期曾把 `useTasks`/`task/snapshot`、`ctx.ui.mount`、`sidebar.panel`、`conversation.chat.item` 等示例级缝打进官方树，已在缝降级中移除（见 [CHANGELOG](CHANGELOG.md)），示例插件改为插件侧自造缝
- **信任边界**：安装默认禁用，显式启用才执行
- **脚手架**：`dsh registry create <id>` 一键生成标准插件根

## 示例插件

| 示例 | 说明 |
|---|---|
| [`examples/greeter`](examples/greeter/README.md) | Node 侧 greet 工具 + 浏览器端 client half（纯 DOM 自渲染浮层） |
| [`examples/navbar`](examples/navbar/README.md) | S1 自渲染导航条：对话流 user 消息导航，仅对话页显示（DOM 锚点契约） |
| [`examples/task-status`](examples/task-status/README.md) | S2 后台任务状态条：对话框上方显示该会话后台任务（官方槽 + Node 轮询路由，仅对话页、完成后消失、点击展开详情） |
| [`examples/loop`](examples/loop/README.md) | `/loop` 命令 + `loop` 工具，按间隔向当前 agent 重复投递 prompt（对齐 Claude Code `/loop`） |

## Agent Skill

仓库自带 `plugin-registry-create` Skill（`skills/plugin-registry-create/SKILL.md`），指导 agent 快速创建 registry 插件：选 id → 脚手架 → 写 Cordis 入口 → 同步 `contributes` → 安装启用验证，含常见坑（默认禁用、声明面 vs 能力面、Loader 树边界等）。与官方 harness 的 `dsh-*` skills / `cordis` 工具集命名区分，避免混淆。

## 文档

- [创建插件](docs/cookbook/creating-a-plugin.md) — 从零开发：脚手架 → 入口 → contributes 同步 → 安装启用
- [清单格式参考](docs/manifest-format.md) — `dsh.plugin.json` 完整字段定义（原生 + 增量两种形态）
- [加 client half](docs/cookbook/adding-a-client-half.md) — 给插件带浏览器端 UI：client 声明 → bundle 契约 → 构建 → 验证
- [官方插件增量兼容](docs/official-plugin-incremental-compat.md) — 官方格式插件加增量清单进 registry（设计规范）
- [0805→0806 迁移](docs/migrating-to-0806.md) — 命令/slots/挂载三处契约变化的插件迁移指南
- [集成到 dsh](docs/cookbook/integrating-into-dsh.md) — 复制包 + 补丁 + 组合启用，接入 DSH 源码环境
- [卸载](docs/cookbook/uninstalling-plugins.md) — 卸载插件，或把 registry 从 DSH 移除（集成反操作）
- [分发插件](docs/cookbook/distributing-plugins.md) — tarball 分发与社区目录模式
- [架构](docs/architecture.md) — 两层插件模型的系统地图（好奇者阅读）
- [变更记录](CHANGELOG.md) — 机制件交付与示例增删汇总
- [路线图](ROADMAP.md) — 剩余推进项的执行状态

## 版权

BSD-3-Clause License，与 DeepSeek Harness 官方一致。见 [LICENSE](LICENSE)。
