# 插件类型对比：repository 插件 vs bundle 插件

官方 0809 有两类插件，走**不同通道**（形态/开发/分发/安装/管理）。选型先读本文。权威契约：repository 见 [cookbook/creating-a-repository-plugin](cookbook/creating-a-repository-plugin.md)；bundle 见 [official-0809-coverage](official-0809-coverage.md)。

## 快速选型

| 你的需求 | 插件类型 |
|---|---|
| Node 工具 / 事件 / 服务 / skill 包 / MCP | **repository 插件**（`.dsh-plugin`） |
| 带浏览器 UI（自渲染） | **repository 插件**（entry + httpServer 自渲染） |
| 官方 dshClient 格式的 UI 组件（`__DSH_BOOT__` 动态进出） | **bundle 插件**（dshClient 包） |
| 随组合分发的产品服务 | **bundle 插件**（profile bundle 层） |

**核心判据**：repository = 用户独立安装的插件（config 驱动）；bundle = 组合里的产品服务（profile 驱动）。带 UI 的**独立插件**首选 repository（entry 自渲染，实测官方链路完整），bundle 的 `registerExternal` 通道已移除——不要为「动态 client half」选 bundle。

## 四维对比

| 维度 | repository 插件（`.dsh-plugin`） | bundle 插件（dshClient 包） |
|---|---|---|
| **形态** | 仓库（子目录）即插件：`.dsh-plugin/` + `package.json#dsh.entry` | 独立 npm 包 + `dsh.bundle`（`patch` 声明组合行） |
| **开发** | Cordis entry（`name`/`inject`/`apply`）+ `defineTool` 注册工具；带 UI 加 httpServer 路由自渲染；`scripts.prepack` 调 `dsh-plugin-prepare` | `dshClient` 声明（`exports["./client"]`）+ client bundle（`__DSH_BOOT__` 动态进出）；Node half 同 Cordis entry |
| **分发** | GitHub 仓库本身（clone + pnpm prepare + prepack），无发布流程 | npm/pnpm 包（bundle 进 profile 的 dependencies） |
| **安装** | `$DSH_HOME/config.yaml` `repository-plugins.repositories` 加 `github:owner/repo#<ref>` 一行 | `dsh plugin --profile web add <dir>`（pnpm 依赖进 `profiles/web/package.json`） |
| **加载** | RepositoryCache（config 驱动，事务性换代） | Loader 树（profile bundle 层栈 → cordis.patch.yml 组合行） |
| **启用/禁用** | 写 `repositories` 列表（增删行） | 写 `<id>: disabled: true/false`（Loader 树 patch 语义） |
| **UI 通道** | 无 client half——entry 经 httpServer 路由 + 浏览器 fetch 自渲染 | 官方 client 通道（`__ModuleLoader__` → `__DSH_BOOT__`） |
| **管理** | 薄控制台 repository 区（home 级 `cordis.patch.yml`） | 薄控制台 UI 插件区（profile 级 patch `disabled` 标记） |

## 管理文件（两层 cordis.patch.yml）

同名 `cordis.patch.yml` 出现在多层，属主不同：

| 层 | 位置 | 属主 | 管什么 |
|---|---|---|---|
| bundle 包内 | `packages/bundle/*/cordis.patch.yml` | 产品开发者 | 定义组合行（bundle 插件声明） |
| profile 层 | `$DSH_HOME/profiles/web/cordis.patch.yml` | 用户 | bundle 启停（`disabled` 标记） |
| home 层 | `$DSH_HOME/cordis.patch.yml` | 机器级用户 | repository 插件 `repositories` 列表 |

**别写错层**：bundle 启停覆盖写 profile 层；repository 列表写 home 层。

## 依赖解析（官方包未发布）

两类插件都依赖 `@deepseek-ai/*`（未发布到公共 npm）：

- **repository**：正式分发由官方环境经 github: 源解析；本地验证需 symlink 至 monorepo 产物或 mock registry。**不要改依赖声明**。
- **bundle**：`dependencies` 声明为空是设计——官方包由 profile 的 pnpm 闭包挂载时注入；声明了反而解析失败。

## 相关

- 薄控制台设计（两类插件管理）：[console-ui-plugin-management](console-ui-plugin-management.md)
- 官方覆盖度评估：[official-0809-coverage](official-0809-coverage.md)
- 开发引导 skill：`skills/make-dsh-plugin/SKILL.md`
