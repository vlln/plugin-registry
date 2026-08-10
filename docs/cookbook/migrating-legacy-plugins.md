# Cookbook：旧机制插件迁移到官方形态

把 plugin-registry 旧机制插件（`dsh.plugin.json` + `dsh registry` + `__ModuleLoader__`，已移除）迁移到官方 0809 形态。**先判断形态再迁**：多数旧插件已有官方 npm 包（只加过增量清单）→ 删清单走 bundle；自造 client half 的纯旧插件 → 迁 repository（whale-girl 范本）。

## 迁移方向判断

| 旧插件现状 | 迁移目标 | 依据 |
|---|---|---|
| 已有官方 npm/cordis 包 + 增量 `dsh.plugin.json`（如 distill/dsh-vision/chat-width） | **bundle 插件**（`dsh.bundle` + patch） | 删除增量清单，走官方 bundle 通道——包本身没变，只去掉 registry 专属物 |
| 纯旧机制插件（自造 `__ModuleLoader__` client half，如旧 loop/navbar/task-status） | **repository 插件**（`.dsh-plugin` + `dsh.entry`） | Node half 已是 Cordis，client 改自渲染——whale-girl 迁移范本 |
| 不确定 | 看官方 0809 覆盖度评估（[official-0809-coverage](../official-0809-coverage.md)） | 覆盖度表按能力对照 |

## 方向一：bundle 插件（已有官方包）

1. **删增量清单**：移除 `dsh.plugin.json`（`id`/`contributes` 声明面在官方格式不存在——工具由 entry 内 `defineTool` 注册）
2. **声明 bundle**：`package.json#dsh.bundle`（`patch` 指向组合行 `cordis.patch.yml`），`dshClient` 声明 `exports["./client"]`
3. **安装**：`dsh plugin --profile web add <包路径>`（bundle 进 profile 的 pnpm 闭包）
4. **管理**：薄控制台 UI 插件区（profile 层 `disabled` 标记）

## 方向二：repository 插件（纯旧机制）

完整范本：whale-girl 的迁移决策（`decisions/implemented/simplification/2026-08-10-migrate-to-official-repository-plugin.md`）。分面迁移：

| 面 | 旧 | 新 | 成本 |
|---|---|---|---|
| **Node half** | `index.mjs`（Cordis）+ `dsh.plugin.json`（contributes 声明） | 移入 `.dsh-plugin/`，`entry.mjs` re-export；删 `dsh.plugin.json`/contributes（工具由 entry 内 `defineTool` 注册） | 低（几乎零改动） |
| **client** | `__ModuleLoader__.load({id, factory})` 挂载 | **自执行 DOM 渲染**：去掉 load 契约，entry 注册 httpServer 路由（`GET /<id>/ui.js`）+ assets 路由 | 中（最大迁移点） |
| **页面注入** | registry patch 注入 | entry 自造（httpServer 向宿主页注入 `<script>` 或配置 hole） | 低（唯一不确定面，0809 已实证） |
| **安装** | `dsh registry install/enable` | `$DSH_HOME/config.yaml` `repository-plugins.repositories` 一行 | 低 |
| **收尾** | `dsh.plugin.json`/`index.json`/`verify-contributes` 门禁 | 全删；门禁/单测/冒烟回归 | 低 |

### 执行步骤（每步可独立验证）

1. **骨架**：`.dsh-plugin/` 子目录 + `package.json`（`dsh.entry` + prepack）+ `entry.mjs`
2. **Node half**：entry 移入，删 `dsh.plugin.json`/contributes；`dsh` headless 挂载 + 工具调用验证
3. **client 自渲染**：`__ModuleLoader__` 改自执行 DOM；entry 注册 UI/assets 路由
4. **页面注入**：entry 向宿主页注入 `<script src="/<id>/ui.js">`（tapIndex 或配置 hole）
5. **收尾**：删 registry 专属物 → 决策记录 → 门禁/单测/冒烟回归

## 迁移后注意

- **官方包未发布到公共 npm**：`@deepseek-ai/dsh-tools` 等本地 `npm i` 失败正常——正式分发由官方环境解析（bundle 走 profile pnpm 闭包、repository 走 github: 源）；本地验证需 symlink/mock registry
- **ESM 缓存**：改已挂载插件的 Node half 需 web 重启
- **依赖声明**：repository 插件声明官方包（官方环境解析）；bundle 插件**不声明**（profile 闭包注入）

## 相关

- whale-girl 迁移决策（repository 范本）：`decisions/implemented/simplification/2026-08-10-migrate-to-official-repository-plugin.md`
- 插件类型对比（两类官方形态）：[plugin-types](../plugin-types.md)
- 开发引导 skill：`skills/make-dsh-plugin/SKILL.md`
