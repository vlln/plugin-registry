# @deepseek-ai/dsh-client-ui-plugin-manager

English | [中文](README.md)

管理本地插件注册表的 web 设置面板：浏览、搜索、安装、启用/禁用与卸载。

## 它是什么

一个浏览器端设置插件（`dshClient` 声明 + `exports["./client"]`）。它在设置外壳注册一个 `settings.section` 行（`id: 'plugins'`）并渲染插件面板：搜索框按 id 或描述过滤浏览行，每行显示安装/启用状态与对应操作按钮，所有操作都经 host 的 `plugins` API（`plugin.list/install/enable/disable/uninstall`）。启用/禁用会在 host 上实时挂载/卸载插件；面板在每次操作后刷新列表。

本包除空 `apply`（让它在 Loader 名册上）外无 host 端行为；node half 与 browser half 是标准的 dshClient 双面形态。

## Model Experience

None, as the browser-only panel manages the local plugin registry through the host plugins API and registers no model surface.

#### KV Cache effect

None: the panel neither composes prompts nor alters tool schemas.

## 已知限制与延后工作

- **仅 host 端插件** —— 面板管理 `ctx.plugins` 条目；第三方 web client bundle 尚无 `dshClient`/`__DSH_BOOT__` 分发路径。
- **静态文案** —— 面板文案是静态中文；locale 接线（语言切换时重注册）延后。
- **无远程目录** —— 浏览列表来自本地 `plugins-catalog.json`；带搜索/下载的市场延后。
