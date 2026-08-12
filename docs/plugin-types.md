# 插件类型对比：bundle 插件 vs 纯 cordis 插件

**0811 起官方移除 repository-plugins 机制**（`vendor/loader/src/repository.ts` 删除），外部插件只有 web profile 一条官方路径。按包是否声明 `dsh.bundle` 分两类，走不同安装通道。选型先读本文；权威契约见 [官方 0809 覆盖度](official-0809-coverage.md)（历史 repository 机制）与 `packages/plugin/console/README.md`。

## 快速选型

| 你的需求 | 插件类型 |
|---|---|
| 带组合层（多个 insert/config/disabled 行、随包分发） | **bundle 插件**（`dsh.bundle.patch`） |
| 单个 Cordis 插件（Node 工具 / 服务 / 带自渲染 UI） | **纯 cordis 插件**（无 `dsh.bundle`） |
| 官方 dsh.client 格式的 UI 组件 | **bundle 插件**（`dsh.client` 声明） |

**核心判据**：包是否自带 `dsh.bundle.patch`（组合层）。`dsh.bundle` 声明 = 一层 patch（可含多个 insert/config/disabled 行）→ 进 profile bundle 层栈，**重启生效**；无声明 = 单个 apply → profile `cordis.patch.yml` insert 行挂载，**配置 HMR 实时生效**。

**自渲染 UI 与类型无关**：whale-girl（自渲染 client）转 bundle 后照常工作——「带 UI 的独立插件」选 bundle 或纯 cordis 取决于是否需要组合层，而非 UI 形态。0810 前"自渲染独立插件选 repository"的结论随 repository 机制移除作废。

## 两通道对比

| 维度 | bundle 插件（`dsh.bundle`） | 纯 cordis 插件（无声明） |
|---|---|---|
| **形态** | 独立 npm 包 + `dsh.bundle.patch`（包内 `cordis.patch.yml`） | 独立 npm 包，`main` 指向 Cordis entry（`name`/`inject`/`apply`） |
| **开发** | Node half 同 Cordis entry；带 client 加 `dsh.client` 声明（`exports["./client"]` + `__ModuleLoader__.load` bundle） | 只有 Node half（或自渲染 client 经 httpServer 路由） |
| **分发** | npm/pnpm 包（git 源一行或本地目录） | 同左 |
| **安装** | `dsh plugin --profile web add`（进 `dsh.profile.bundles` 层栈），**重启生效** | `dsh plugin --profile web add`（装依赖）+ insert 行 → **配置 HMR 实时生效** |
| **加载** | Loader 树（profile bundle 层栈 boot 合成） | Loader 树（profile `cordis.patch.yml` insert 行，HMR 实时重放） |
| **启用/禁用** | `<id>: disabled: true/false`（patch 语义） | 同左 |
| **管理** | 薄控制台：bundle 区（层栈 reconcile）+ 已加载区（启停持久化） | 薄控制台：insert 区（实时挂载/移除） |

## 管理文件（profile patch 层）

0811 起外部插件安装态 = web profile 目录（`$DSH_HOME/profiles/web/`）：

| 文件 | 属主 | 管什么 |
|---|---|---|
| `package.json` 的 `dsh.profile.bundles` | 用户 | bundle 层栈（`dsh plugin --profile web add` 维护） |
| `cordis.patch.yml` | 用户 | insert 行（纯插件挂载）+ disabled 标记（启停），**配置 HMR watched，实时生效** |

## 依赖解析（官方包未发布）

两类插件都依赖 `@deepseek-ai/*`（未发布到公共 npm）：`dependencies` 声明为空是设计——官方包由 profile 的 pnpm 闭包挂载时注入（`$DSH_HOME/profiles/node_modules` flat fallback）；声明了反而解析失败。

## 相关

- 薄控制台设计（双通道管理）：[console-ui-plugin-management](console-ui-plugin-management.md)
- 历史 repository 机制（已移除）：[official-0809-coverage](official-0809-coverage.md)、[创建 repository-plugin（历史）](cookbook/creating-a-repository-plugin.md)
- 开发引导 skill：`skills/make-dsh-plugin/SKILL.md`
