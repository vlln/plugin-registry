# 清单格式参考（`dsh.plugin.json`）

> **历史文档（2026-08 转向后）**：本文描述 plugin-registry 已移除的独立机制（patch/CLI/`ctx.plugins`），仅作决策依据与演进记录保留；当前形态见 [official-0809-coverage](official-0809-coverage.md) 与 `packages/plugin/console`。


registry 插件的定义：**清单 + Cordis 入口**——`dsh.plugin.json` 声明身份与贡献，`main` 指向的 Cordis 插件提供实现（`apply(ctx)`）。两种清单形态：**原生插件**（`publisher/name` + 自建 bundle）与**官方插件增量**（npm 包名 + 复用官方构建产物，见 [官方插件增量兼容](official-plugin-incremental-compat.md)）。校验实现：`packages/plugin/plugin/src/manifest.ts`。

## 字段参考

| 字段 | 必填 | 默认 | 语义 |
|---|---|---|---|
| `id` | ✅ | — | 插件身份。原生：`publisher/name`；增量：npm 包名（`@scope/name`）。校验：严格两段（单斜杠）、首段非 `node_modules`、段内小写字母数字 + `-`/`.`、禁整段 `.`/`..`、禁 `?`/`#`/`%`/控制符/大写 |
| `version` | ✅ | — | 版本号，与 `package.json` 的 version 一致（增量形态） |
| `main` | ✅ | — | Node half 入口（构建产物或手写 `.mjs`），安装时校验存在 |
| `description` | — | `''` | 一句话说明（Web 面板展示） |
| `engines` | — | `{ dsh: '>=0.0.1' }` | 兼容范围；当前 `harnessVersion` 默认 `0.0.1`，实际无约束力 |
| `contributes` | — | `{ tools: [], skills: [] }` | 声明注册面（当前仅 tools/skills）。**声明即契约**：声明了但入口未注册 → 启用报错回滚 |
| `client` | — | 省略 | 浏览器 half：`main`（bundle 路径，安装时校验存在）、`inject`（图元数据，展示/预检用）、`immediately`（预取标记）。浏览器 fiber 的注入由 **bundle 自身导出**决定 |

## 最小清单（原生）

```json
{
  "id": "acme/cool-tool",
  "version": "0.1.0",
  "main": "./index.mjs",
  "engines": { "dsh": ">=0.0.1" },
  "contributes": { "tools": ["cool_read"], "skills": [] }
}
```

## 增量清单（官方插件）

官方格式插件（npm/cordis 包）加增量清单即可进 registry，`package.json`/`lib/` 不动：

```json
{
  "id": "@dsh-external/dsh-web-terminal",
  "version": "0.1.0",
  "main": "./registry.mjs",
  "engines": { "dsh": ">=0.0.1" },
  "contributes": { "tools": [], "skills": [] },
  "client": { "main": "./lib/client.js", "inject": ["@deepseek-ai/dsh-client-runtime"] }
}
```

关键约束（详见 [官方插件增量兼容](official-plugin-incremental-compat.md)）：

- `id` = npm 包名 = bundle 内 `__ModuleLoader__` id——三者一致使 client bundle **零重构建**
- `client.main` 指向现有 bundle；`client.inject` 平移 `package.json` 的 `dshClient.inject`
- 与官方 Loader 树通道**互斥**：插件已在 `config.yaml` 启用时，registry `enable` 被碰撞守卫拒绝

## 形态对比

| | 原生插件 | 官方插件增量 |
|---|---|---|
| id | `publisher/name` | npm 包名（`@scope/name`） |
| bundle | 自建（ModuleLoader id = 插件 id） | 复用官方构建（id = 包名） |
| 依赖 | 宿主依赖闭包（deps-link） | 同左 |
| 官方通道 | 不适用 | 保留（两种安装方式二选一） |

## 相关

- [创建插件](cookbook/creating-a-plugin.md)（操作流程）
- [官方插件增量兼容](official-plugin-incremental-compat.md)（增量形态规范）
- [架构](architecture.md)（两层模型与加载路径）
- 校验源码：`packages/plugin/plugin/src/manifest.ts`
