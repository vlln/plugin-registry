# @deepseek-ai/dsh-plugin

English | [中文](README.zh.md)

本地插件注册表与清单协议：从本地文件系统安装、启用并挂载第三方插件。

## 它是什么

一个包，四个面。**清单协议**：插件根目录携带 `dsh.plugin.json`，声明身份（`publisher/name` 形式的 id）、语义化 `version`、相对路径 `main` 入口（一个 Cordis 插件）、`engines.dsh` 兼容范围，以及声明的 `contributes`（tools 与 skills）。**注册表**：`<dshHome>/plugins` 下每个已安装插件一个目录，外加 `index.json` 记录安装状态（`version`、`enabled`、`installedAt`）；`installPlugin` / `setEnabled` / `uninstallPlugin` / `listPlugins` 以纯文件系统事实的方式操作它。**目录**：`$DSH_HOME/plugins-catalog.json` 列出可发现的插件，每项带一个本地源目录——web 面板的浏览/安装数据源，形状对齐 Obsidian 的社区插件列表，将来远程注册中心可替换该文件而无需改动 API 或 UI。**运行时服务**：`plugin-local` 函数插件（`name` / `inject` / `Config` / `apply`，无默认导出）提供 `ctx.plugins`（`PluginLocalService`），并把每个已启用插件的 `main` 入口挂为一个组 fiber 的子项，dispose 时统一卸载。

安装后插件记录为**已禁用**；只有显式启用（CLI、API 或 web 面板）后才会挂载它。启用与禁用是**实时的**：服务立即挂载或卸载插件，且只有挂载成功后索引更新才会持久化。这是 MVP 的信任边界：代码只在人类显式选择后才执行，启用是逐插件、永不隐式的。

## CLI

命令由 `dsh` 二进制持有；本包提供背后的操作。

| 命令 | 效果 |
|---|---|
| `dsh plugin install <dir\|tgz>` | 校验 `dsh.plugin.json` 与 `engines.dsh` 是否满足当前 dsh 版本，把目录（或 tarball 内的插件根，解压带严格路径穿越防护）拷入注册表，记录 `enabled: false` |
| `dsh plugin create <id>` | 在当前目录生成插件根（`dsh.plugin.json` + 入口 + README），经安装同款解析器预校验 |
| `dsh plugin list` | 按 id 排序列出已安装插件，含启用状态与描述 |
| `dsh plugin enable <id>` / `dsh plugin disable <id>` | 翻转安装记录并实时挂载/卸载 |
| `dsh plugin uninstall <id>` | 删除插件目录与索引记录 |

## Plugin

`inject: []` —— 本地注册表直接从磁盘读取；不依赖任何服务。

### Config

| 字段 | 默认 | 含义 |
|---|---|---|
| `dshHome` | `$DSH_HOME` 或 `~/.dsh` | 要挂载其 `plugins` 目录的 Harness home，由 [`@deepseek-ai/dsh-paths`](../../util/paths/README.md) 解析 |
| `harnessVersion` | `0.0.1` | 安装时对照 `engines.dsh` 校验的当前 dsh 版本；部署时应设为真实版本 |

## Service

`ctx.plugins`（`PluginLocalService`）是运行时注册表接口，供 web 面板与任何存活 harness 使用：`list()` 合并目录与已安装状态为浏览行；`install(id)` 以禁用态安装目录条目；`enable(id)` 立即挂载且仅成功后才持久化；`disable(id)` 立即卸载；`uninstall(id)` 卸载并移除注册表记录；`reconcile()` 是启动时的已启用插件全量挂载。

## 清单协议

插件根目录是一个包含 `dsh.plugin.json` 与入口模块的目录：

```json
{
  "id": "acme/cool-tool",
  "version": "0.1.0",
  "main": "./index.mjs",
  "description": "a demo plugin",
  "engines": { "dsh": ">=0.0.1" },
  "contributes": { "tools": ["cool_read"], "skills": [] }
}
```

`main` 必须默认导出或具名导出一个 Cordis 插件（函数、类、或带 `apply` 的对象）；`parseManifest` 用 schemastery 校验形状，`checkEngine` 在 `engines.dsh` 不满足时以当前版本报错，入口文件缺失时安装失败并给出明确信息。入口模块按 Loader 的 `default ?? module` 归一化加载（ESM 与 CJS 均可用）。

## Model Experience

Indirectly, through the plugins this package mounts: each enabled plugin's registered tools join the request when the composition mounts `plugin-local`.

#### KV Cache effect

Prefix-stable while the mounted set and each plugin's definitions are unchanged; enable/disable changes the mounted set and invalidates reuse from the affected schemas.

## 已知限制与延后工作

- **仅本地目录** —— `plugins-catalog.json` 的条目指向本地目录；没有远程注册中心、市场或发现服务。
- **无更新** —— version 被记录但从不复查；重新安装变更过的源目录会在卸载前报 "already installed"，也没有更新命令。
- **不分发 web client bundle** —— 面板只管理 host 端插件；第三方插件的浏览器 bundle 尚无 `dshClient`/`__DSH_BOOT__` 分发路径。
- **`contributes.tools` 已校验、`contributes.skills` 未校验** —— 声明了工具却未注册的插件会在挂载时失败并列出缺失名；技能声明仍仅供参考。
- **信任边界仅为人工 opt-in** —— 被挂载插件是进程内代码，拥有完整服务访问权；沙箱（`ctx.sandbox`）只约束工具调用，不约束插件。没有签名、发布者身份或审核。
- **整目录拷贝** —— `installPlugin` 拷贝整个源树，包括 `node_modules` 与构建产物；没有依赖解析或裁剪。
- **尚无 REAL-composition 快照** —— 挂载与 web 面板由单元/组件测试覆盖；装配了 `plugin-local` 的 leaf 的整应用转录延后。
