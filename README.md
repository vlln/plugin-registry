# dsh 插件注册表（Plugin Registry）

DeepSeek Harness 的本地插件系统实现：清单协议、安装/启停、Web 管理面板、声明校验、脚手架与 tarball 分发。

> 本仓库为**独立插件项目**，版权归作者所有。仅包含本项目的原创代码；不包含 DeepSeek Harness 官方仓库（dsh2026 org）的源码内容。设计对应官方 [issue #171](https://github.com/dsh-external/issues/issues/171)（插件系统暴露标准入口，定义分发与贡献机制）。

## 内容

| 目录 | 说明 |
|---|---|
| `packages/plugin/plugin` | 插件系统核心包（`@deepseek-ai/dsh-plugin`）：`dsh.plugin.json` 清单协议、本地注册表（`$DSH_HOME/plugins`）、`plugins-catalog.json` 本地目录、`ctx.plugins` 运行时服务（实时热挂载）、contributes 声明校验、`dsh plugin` CLI 操作、脚手架与 tarball 安装 |
| `packages/ui-plugin-manager` | Web 设置页插件管理面板（`@deepseek-ai/dsh-client-ui-plugin-manager`）：浏览/搜索/安装/启停/卸载 |

## 展示

Web 设置页「插件」面板：

![插件管理面板 1](screenshots/plugin-panel-1.png)

插件列表：搜索框、插件状态徽章（已启用/已禁用/未安装）、版本与描述、操作按钮（安装/启用/禁用/卸载）。

![插件管理面板 2](screenshots/plugin-panel-2.png)

插件操作后状态：启用实时生效（徽章变绿胶囊）、禁用与卸载的反馈。

## 与 cordis.yml 插件的关系（层次与边界）

dsh 里有两层插件，机制相同（都是 Cordis 插件：函数/类/带 apply 的对象 + inject/effect），**管理权不同**，本仓库只管第二层：

| 层次 | 定义 | 加载 | 管理 |
|---|---|---|---|
| **cordis.yml 官方插件** | dsh 产品随发布固定的组合（agent-loop、llm、tools、fs、skill-local、ui-* 等） | Loader 按配置树启动时静态加载 | 产品结构，随版本发布 |
| **第三方插件（本仓库）** | 用户安装的带 `dsh.plugin.json` 的插件（`dsh plugin install`） | `plugin-local` 扫描 `<dshHome>/plugins` 索引，运行时动态挂载到 group fiber | 用户通过 `dsh plugin` / Web 面板安装、启停、卸载 |

边界：

边界：

- 本仓库**不管理、不替换** cordis.yml 官方插件树——那是产品声明式组合，保持 Loader 静态加载
- registry 挂载的插件与官方插件**互相可见**：第三方插件可以 `inject` cordis.yml 里的服务（`tools`、`skills`、`commands`…）
- 有意不做的"统一管理"（registry 也管官方插件）：版本/更新语义、组合顺序、跨 surface 差异都属于产品层，纳入统一管理会混淆产品结构与生态层，且与在线市场路线重叠——如未来需要，另行设计

### 加载路径：registry 插件不在 Loader 配置树里

两条完全独立的加载路径：

| | cordis.yml 官方树（静态） | registry 插件（动态） |
|---|---|---|
| 来源 | cordis.yml entry | `<dshHome>/plugins` + `index.json` |
| 加载者 | Loader（配置驱动，启动时） | `plugin-local`（索引驱动，运行时） |
| 生命周期 | 随启动/配置 | `enable`/`disable`/`uninstall`（registry 控制） |
| 是否进 Loader 树 | 是（组合树成员） | 否（`ctx.plugin()` 动态挂载，组合树看不见） |

后果：registry 插件**不出现在** `cordis.yml` / dump-config 的组合输出里；`modules` 的 dshClient 扫描只看 Loader 树，因此 registry 插件的浏览器 bundle 不会进入 `__DSH_BOOT__`（client 插件应走独立 dshClient 包通道）。但两者**同进程同 context**：registry 插件可 inject 官方树服务，官方插件可见它提供的服务。

### 能力面 vs 声明面（contributes）

`contributes` 字段目前只有 `tools` / `skills`（且只对 `tools` 做挂载时校验）——这是**清单协议的校验范围**，不是**插件能力上限**。registry 挂载的插件是完整 Cordis 插件，可注册：

- `ctx.tools` 工具、`ctx.skills` 技能提供者
- `ctx.on()` / `ctx.waterfall()` 事件监听（拦截、权限、审计）
- `ctx.provide()` / `Service` 子类提供**新服务** `ctx.xxx`（其他插件可 inject）
- `ctx.commands` 命令、`ctx.systemPrompt` 提示词 section、`ctx.settings` 配置命名空间、`ctx.tui` TUI 覆盖层…

示例：插件可注册 3 个工具 + 监听 `agent/request` + 提供新服务 + 注册 `/hello` 命令；`contributes` 只需声明 `{ "tools": [...] }`，其余能力"无声明但可用"。

### 服务的关系：registry 管插件，插件用服务

`ctx.tasks`（后台任务注册表）、`ctx.workflows`（工作流引擎）等是 **cordis.yml 官方树提供的服务**，本身不是 registry 管理的对象。registry 插件作为消费者使用它们：`inject: ['tasks']` 在 apply 里登记自己的后台任务、`inject: ['workflows']` 调用引擎。这些任务/运行由 tasks/workflows 管理，与 registry 无关。

### 新服务 vs 内置服务

- ✅ registry 可管理"**提供新 `ctx.xxx` 服务**"的第三方插件（新增服务，其他插件可 inject；enable 挂载、disable 卸载即服务出现/消失）
- ❌ registry 不能管理/替换 dsh **内置**的 `ctx.xxx`（`tools`/`tasks`/`workflows`/`sessions`…）：它们由官方树启动时提供，registry 插件对同名服务 `provide` 会注册冲突（cordis 拒绝重复提供）——内置服务属产品层，见上表边界

## 能力一览

- **清单协议**：插件根目录携带 `dsh.plugin.json`，声明身份（publisher/name）、版本、入口、兼容的 harness 版本范围、贡献声明（工具/技能）
- **声明即契约**：清单声明的工具未实际注册时，启用会明确报错并回滚挂载
- **安装/启停**：支持本地目录或 tarball（解压带路径穿越防护）；启用/禁用实时生效
- **Web 面板**：设置页「插件」区，浏览、搜索、安装、启停、卸载
- **信任边界**：安装默认禁用，只有显式启用后插件代码才会执行
- **脚手架**：`dsh plugin create <id>` 一键生成标准插件根

## 集成到 DeepSeek Harness

前置条件：**DSH 源码环境**（官方 0804 快照 `20260804T143803Z` 或兼容布局，pnpm workspace）。集成方式与社区其他扩展一致：**复制包 + git apply 补丁 + 组合启用**。

### 1. 放插件

把 `packages/plugin/`、`packages/ui-plugin-manager/` 整个目录复制到你的 DSH monorepo 对应路径（`packages/plugin/`、`packages/client/ui-plugin-manager/`）。

### 2. 打接线补丁

```sh
git apply patches/dsh-plugin-registry.patch   # 在 DSH monorepo 根目录执行
```

补丁基于官方 0804 快照生成，改动 30 个文件（CLI plugin 子命令、apiproxy `plugins` 域、tsconfig paths/references、base/web 组合挂载、测试 fake 与 README），验证过可干净应用。若你的基线更新导致锚点漂移，可 `git apply --3way` 或手动对齐。

### 3. 启用插件

```yaml
# base.cordis.yml（或你的组合）
- id: plugin-local
  name: '@deepseek-ai/dsh-plugin'
```

Web 组合再挂载面板：

```yaml
- id: ui-plugin-manager
  name: '@deepseek-ai/dsh-client-ui-plugin-manager'
```

`pnpm install` 后即可使用 `dsh plugin` 命令与 Web 设置页插件面板。

## 使用

```sh
dsh plugin create acme/cool-tool   # 脚手架
dsh plugin install ./cool-tool     # 安装（默认禁用）
dsh plugin install demo.tgz        # tarball 安装
dsh plugin enable acme/cool-tool   # 启用（实时挂载）
dsh plugin list                    # 列表
dsh plugin disable acme/cool-tool
dsh plugin uninstall acme/cool-tool
```

## 验证

单元测试 75+ 项、覆盖率 100%（语句/分支/函数/行）；端到端（创建 → 安装 → 启用 → 卸载）跑通；typecheck / lint / 文档与配置门禁全绿。

## 版权

本仓库代码版权归作者所有，供 dsh 内测成员在 dsh-external 组织内使用与协作；官方不保证公开发布后该组织仍然存在，请自行保留副本。未经作者许可请勿公开分发。
