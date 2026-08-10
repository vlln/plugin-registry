# 设计：薄控制台扩展——统一管理 UI 插件（dshClient 包）

状态：**设计稿（暂未实现）**。目的：薄控制台当前只管理 repository 插件（`.dsh-plugin`，config repositories），不管理 dshClient UI 插件（bundle）。本文设计扩展：让薄控制台同时管理两类插件，职责归位「插件管理 = 薄控制台」。

## 背景：两类插件的管理机制不同

官方 0809 有两类插件，管理机制分属两个通道：

| 维度 | repository 插件（`.dsh-plugin`） | dshClient UI 插件（bundle） |
|---|---|---|
| 形态 | 仓库目录 + `dsh.entry`（Node） | 独立 npm 包 + `dshClient` 声明（`exports["./client"]`） |
| 安装 | config `repositories` 加 GitHub 源 | `dsh plugin --profile add <bundle>`（pnpm 依赖） |
| 加载 | RepositoryCache（config 驱动，事务性换代） | Loader 树（client-modules 扫描 → `__DSH_BOOT__`） |
| **启用/禁用** | **写 `repositories` 列表（增删行）** | **写 `<id>: disabled: true/false`（官方 Loader 树 patch 语义）** |
| UI 通道 | 无（Node entry + skill/mcp） | 官方 client 通道（`__ModuleLoader__`） |

**关键**：两类插件都经 `$DSH_HOME/cordis.patch.yml` 管理，但操作不同字段——repository 操作 `repositories` 列表，UI 插件操作 `disabled` 标记（官方 `vendor/include` 支持 `disabled?: boolean`，`- id: hmr / disabled: true` 即官方禁用组合行的语法）。

## 现状：薄控制台只管理 repository 插件

`packages/plugin/console` 当前：
- 读写 `$DSH_HOME/cordis.patch.yml` 的 `repository-plugins.repositories`（增删行 = 装/卸 repository 插件）
- 不管理 dshClient UI 插件（它们经 `dsh plugin add` 装进 profile，薄控制台无 UI 管理入口）

## 设计：薄控制台统一管理两类插件

### 管理面（面板分两区）

```
薄控制台（读/写 $DSH_HOME/cordis.patch.yml）
├── Repository 插件区（已有）：repositories 列表（增删 = 装/卸）
└── UI 插件区（新增）：profile bundles 的 disabled 标记（true/false = 停/启）
```

### UI 插件区的数据源

- **已安装 UI 插件**：读 profile 的 `dsh.profile.bundles`（`$DSH_HOME/profiles/<name>/package.json`）——列出当前挂载的 bundle
- **启停操作**：写 `$DSH_HOME/cordis.patch.yml`（或 profile patch）加 `<id>: disabled: true/false`
- **生效**：web 默认无运行中 HMR（官方 TODO），重启生效；官方启用 web hmr 后自动换代

### Node half 扩展

`/api/plugin-console` 增加：
- `GET /ui-plugins`：读 profile bundles（已安装 UI 插件 + 当前 disabled 状态）
- `POST /ui-plugins/<id>/enable|disable`：写 disabled 标记

### client half 扩展

面板加「UI 插件」区：列出 bundles，启停按钮（写 disabled），与 Repository 区并列。

## 已迁移的示例（dshClient 通道，供 UI 插件区管理）

三个示例已迁为独立 dshClient 插件包（`dsh-external/dsh-{task-status,loop,navbar}`）：
- bundle 形态（`dsh.bundle.patch` + `dshClient` 双声明），`dsh plugin add` 挂载
- client half 走官方 `__ModuleLoader__` 通道（boot graph 自动含）
- 端到端验证：boot graph 含 client + `/plugins/<id>/client.js` 200 + Node 数据路由工作

它们装进 profile 后即出现在薄控制台的 UI 插件区（读 `dsh.profile.bundles`），启停经 disabled 标记。

## 职责归位

- **插件提供能力**：repository 插件提供 Node 能力（skill/mcp/tool），UI 插件提供浏览器 UI——各自官方通道
- **薄控制台管理**：统一管理两类插件的启停（写 cordis.patch.yml 不同字段）——「插件管理 = 薄控制台」职责完整

## 实施（待拍板）

1. Node half：`/api/plugin-console` 加 ui-plugins 域（读 profile bundles + 写 disabled）
2. client half：面板加「UI 插件」区
3. 验证：纯净 0809 + 挂载 task-status/loop/navbar → 面板列出 → disable 一个 → 重启 → client 不再进 boot graph

## 相关

- 官方机制：`vendor/include` 的 `disabled` 语义（entry 级）、`dsh plugin` 的 `dsh.profile.bundles`
- 迁移记录：[官方 0809 覆盖度](official-0809-coverage.md)（转向决策）、示例迁移（dsh-task-status/dsh-loop/dsh-navbar）
