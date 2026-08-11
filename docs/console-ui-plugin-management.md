# 薄控制台扩展：统一管理 UI 插件（dsh.client 包）

状态：**已实现**（0809→0810 交付，面板分三区管理两类插件，0810 验证站端到端通过）。本文为设计记录：薄控制台让「插件管理 = 薄控制台」职责完整。面板结构与三类插件对比见 [console README](../packages/plugin/console/README.md) 与 [插件类型对比](plugin-types.md)。

## 设计要点

两类插件写不同层：repository 操作 home 级 `$DSH_HOME/cordis.patch.yml` 的 `repositories` 列表（增删行 = 装/卸），UI（bundle）插件启停写 **profile 级** `$DSH_HOME/profiles/web/cordis.patch.yml` 的 `disabled` 标记（官方 `vendor/include` 支持 `disabled?: boolean`）。

扩展动机：薄控制台最初只管理 repository 插件；UI 插件经 `dsh plugin --profile web add` 装进 profile 后无面板管理入口——扩展后面板分三区（已加载插件 / repository 插件源 / 安装 bundle 插件）统一管理。

## Node half

`/api/plugin-console` 路由（与面板写同一安装态）：
- `GET/POST /repositories`：读/写 home 级 repository 源列表（结构化行：解析 + 插件名 + 版本 + 挂载态）
- `GET /installed` + `POST /installed/<id>`：已加载插件（loader 树 + repository 合并枚举）/ bundle 启停
- `GET /updates` + `POST /updates`：repository 远端 commit 检查 / 固定 ref
- `GET /versions` + `POST /versions/refresh`：bundle npm 版本检查（缓存）
- `POST /bundles`：bundle 安装 / 更新 / 移除

## 实施记录

1. Node half：上述路由（`GET /installed` 合并 repository 插件、`GET /repositories` 结构化）
2. client half：面板三区（统一行渲染 + 源行 + 安装表单）
3. 验证：0810 验证站挂载 console → 面板显示已加载插件（含 repository 行）→ boot graph 含 `plugin-console/client.js` → 读写路由正常

## 相关

- 迁移记录：[官方 0809 覆盖度](official-0809-coverage.md)（转向决策）、示例迁移（dsh-task-status/dsh-loop/dsh-navbar）
