# 设计：官方插件增量兼容（incremental compatibility for official plugins）

状态：**已实现**。目的：让**官方格式插件**（标准 npm/cordis 包：`package.json` 的 `dshClient` 声明 + `exports["./client"]`，client bundle 的 `__ModuleLoader__` id = npm 包名）以最小增量接入 plugin-registry 的管理面，同时**官方通道完全不受影响**。

## 设计原则

registry **不追求原生兼容**官方插件（不要求零改动自动推导），而是提供**非破坏 + 互斥的增量**：

- **非破坏**：官方插件加一个 `dsh.plugin.json` 增量文件即可被 registry 安装；`package.json`、`lib/`、client bundle **一律不动**，官方 Loader 树 + `config.yaml` 通道照常可用。
- **互斥**：增量文件只被 registry 读取（官方 loader 不读它）；同一插件**两种安装方式强制二选一**（碰撞守卫拒绝 registry 登记与 Loader entry 同名者），不会双挂载。
- **显式优于隐式**：registry 需要的元数据（id、入口、client bundle、engines、contributes）由插件作者显式声明，不做 `exports["./client"]` 之类的自动推导。

## 增量清单规范

官方插件仓库新增 `dsh.plugin.json`（其余文件不动）：

```json
{
  "id": "@dsh-external/dsh-web-terminal",
  "version": "0.1.0",
  "main": "./lib/index.js",
  "client": { "main": "./lib/client.js", "inject": ["@deepseek-ai/dsh-client-runtime"] },
  "engines": { "dsh": ">=0.0.1" },
  "contributes": { "tools": [], "skills": [] }
}
```

字段规则：

| 字段 | 规则 |
|---|---|
| `id` | **npm 包名**（可 `@scope/name`，含 `@`/点）或原 `publisher/name`（向后兼容）；见 [id 规则](#id-规则) |
| `version` | **必填**（`manifest.ts` 校验），与 `package.json` 的 version 一致 |
| `main` | Node half 入口（构建产物），如 `./lib/index.js` |
| `client.main` | client bundle 路径（`__ModuleLoader__` 格式），如 `./lib/client.js` |
| `client.inject` | 建议显式写 `["@deepseek-ai/dsh-client-runtime"]`（bundle 自身 `exports.inject` 决定浏览器 fiber 注入，此字段只影响展示/预检） |
| `engines` / `contributes` | 同原生插件；`contributes` 必须抄真实注册面（单向校验：声明了但未注册才失败） |

## 核心机制：id 三合一

增量清单的 `id` = npm 包名 = **bundle 内 `__ModuleLoader__.load({ id })` 的值**：

```
增量清单 id（@scope/name）
   = bundle 内 ModuleLoader id（原样，零重构建）
   = registry 插件 id（registerExternal 的 graph row id）
```

浏览器 `arrive()` 校验要求「graph row id === bundle 手递 id」（`client/system.ts`），三者相等使校验**天然成立**——**client bundle 零重构建**，这是本设计相对「改 id 重构建」路线的核心收益。

双轨共存：同一个 bundle 同时满足官方 Loader 树（entry 名 = 包名）与 registry（外部行 id = 包名），官方格式与 registry 格式**互不干扰**（碰撞守卫保证部署级二选一，见下）。

## id 规则

`manifest.ts` 的 id 校验放宽为 npm 包名超集（与原生 `publisher/name` 并存）：

```
/^(?!node_modules\/)(?:@[a-z0-9][a-z0-9-.]*\/[a-z0-9][a-z0-9-.]*|[a-z0-9][a-z0-9-.]*\/[a-z0-9][a-z0-9-.]*)$/
```

必须保留的安全约束：

- `(?!node_modules\/)` 负前瞻——防写入 deps-link 符号链接（`<dshHome>/plugins/node_modules` 指向 checkout）
- 严格两段（单斜杠）：`a/b/c`、`@a/b/c`（多斜杠）拒绝
- 段内禁大写、禁整段 `.`/`..`、禁 `?`/`#`/`%`/控制符（url 契约与目录路径安全）
- 首段首字符必须字母数字（`@` 只允许作为 scoped 前缀的第一个字符）

`@scope/name` 在安装链路的安全核对（已逐点验证）：

- 插件目录：`join(pluginsRoot, id)` 生成嵌套目录，POSIX/Windows 均成立
- `/plugins/<id>/client.js` 路由：`pathname.slice` 对含一个斜杠的 id 精确切分
- `graphRow` 直拼 URL：`@`/`.` 是 URL 合法字符
- `split('/')` 各用法（`at(-1)`、`lastIndexOf`）对 scoped id 正确

## 双轨边界与碰撞守卫

打破「registry id 不含 `@`/点 ⇒ 与官方 loader entry 名不可能碰撞」不变式（`registry-client-half-design.md`）后，**必须显式守卫**。真实风险不是「compose 同 id 两行」（compose 基于 Map，浏览器对重复 id 抛错），而是**两通道抢同一行**：

- `processOne` 对不合格 entry 执行 `table.delete(entryName)`——外部行若与 loader entry 同名，任何一次「该 entry 不合格」的 flush 都会误删它
- 反向：外部行被 `unregisterExternal` 删除后，下一次合格 flush 会从 npm 包路径重建——「禁用后 client half 复活」
- 更严重：同一插件同时在 Loader 树与 registry 时，**Node half 被挂两次**（loader fiber + plugin-local fiber），`registerUpgrade` 等服务重复注册

**守卫位置：registry 侧（`registerExternal`）**。`registerExternal` 拒绝与 `ctx.loader.entries()` 中存在的名字相同的 id（enable 失败走既有 mount 回滚路径）。理由：loader 扫描对 loader-entry id 拥有 delete/重建权，外部登记在扫描面前不稳定；官方插件的 client half 本来就由官方通道管理，registry 再登记一份只有冲突没有增量价值。

**部署语义**：官方插件请走官方通道（Loader 树 + config.yaml）或 registry 通道（增量清单 + `dsh registry install`），**二选一**；registry 对已在官方树的插件报错并提示。

## 向后兼容

- 原生 `publisher/name` id（`vlln/navbar`、`acme/greeter` 等）**完全保留**——新 regex 是严格超集，安装/挂载/CLI/路由/浏览器校验零影响
- `dsh registry create` 仍生成 `publisher/name` 模板
- 现有 manifest 负例（大写、无斜杠、`node_modules/` 前缀、多斜杠、路径穿越）全部保留

## 实现清单

registry 仓库内：

- `packages/plugin/plugin/src/manifest.ts:52`——id regex 放宽（见 [id 规则](#id-规则)）
- `packages/plugin/plugin/tests/manifest.spec.ts`——补 scoped id 正例（`@scope/name`、`@scope/foo.bar`）与负例（`@a/b/c`、`@/name`、`@scope/`、大写、`..` 段）
- 其余（registry.ts、service.ts、catalog、scaffold、CLI）零改动

官方 patch（`patches/dsh-plugin-registry-0806.patch`）：

- `packages/client/modules/src/index.ts` `registerExternal`——id regex 同步放宽 + 碰撞守卫（拒绝 `ctx.loader.entries()` 同名）
- `packages/client/modules/tests/node-half.spec.ts`——`'@scope/name'` 从 bad 组移入 good 组（保持 `'a/b/c'`、`'../escape'`、`'acme/../up'` 在 bad 组）

## 已知边界

- `engines` 无实际约束力（`harnessVersion` 默认 `'0.0.1'`）——增量清单可写但当前不拦
- `cp` 整目录复制：官方包连同 package.json 复制进 `<dshHome>/plugins/`，副本是安装时快照（双轨下与官方通道更新不同步——但二选一语义下无此问题）
- 依赖闭包：registry 通道的副本从 checkout node_modules 解析依赖（deps-link），官方包依赖需在官方树闭包内（如 node-pty/ws 已在）
- 官方格式插件的「enable 即登记」不变式对 loader-entry id 失效——碰撞守卫使该场景不可达，无实际影响
