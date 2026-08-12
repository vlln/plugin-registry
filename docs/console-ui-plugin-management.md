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

## 待实现：bundle 实时展开（消除「装 bundle 需重启」的反直觉）

> **状态：设计定稿，未实现（2026-08-11 记录）。** 实现时机见 [ROADMAP](../ROADMAP.md)「下一轮候选」。

### 问题

官方 bundle 安装路径（`dsh plugin --profile web add` / 面板 bundle 区）要求**重启 web**：bundle 的挂载指令在**包内 `cordis.patch.yml`**，层栈列表在 **package.json**——两者都不在配置 HMR 的 watch 名单里（HMR 只 watch profile 级 + home 级两个用户 patch 文件），且层栈是 boot 时一次性合成的。用户侧「装个插件还要重启」非常反直觉。

**这不是技术限制，是官方没接这条线。** 已实测（0811）：写 profile patch 的 insert 行 → 配置 HMR 实时重放 → 插件即时挂载（web 日志 `[HMR-PROBE] applied`，零重启）。实时通道存在。

### 方案：bundle 行「展开」进用户 patch

bundle 包内的 patch 行格式与用户 patch 完全一致（`- id:` / `- insert:`，支持 `!!js`）。安装 bundle 时：

```
pnpm add <bundle包>            ← 装进 node_modules（秒级，无重启）
→ 读包内 cordis.patch.yml 的全部行
→ 展开写入用户 profile patch（被 HMR watch 的那层）
→ 配置 HMR 实时重放 → 整个 bundle 实时生效
```

要点：

- **零重启**：走配置 HMR 实时通道，与 insert 插件一致
- **持久化**：展开写入用户 patch，重启后依然生效
- **语义完整**：包内所有行都展开（不只主插件），不丢 config/disabled/其余 insert
- **可覆盖**：用户已有同名行按 id 合并，用户 patch 内顺序决定覆盖

### 边界与代价

| 场景 | 处理 |
|---|---|
| 小 bundle（一层一行挂自己，如 console） | insert 行完全等效，实时（当前已如此） |
| 中 bundle（挂自己 + 几行 config） | 展开全部行 → 实时 |
| 大 bundle（web-app 40 行） | 展开会撑大用户 patch；但此类属于官方随 profile 装的（base/web-app 走 profile 模板层栈），不经过 console 安装流程，实际碰不到 |
| bundle 更新 | 重新展开（diff 旧行换新行） |
| 用户已有同名行 | 按 id 合并，用户 patch 顺序决定覆盖 |
| 层栈关系 | 可选：不进层栈（纯靠用户 patch 展开）；层栈留给官方模板 bundle（base/web-app） |

### 原理注释

「insert（配置 HMR）是底层原语、bundle 层栈只是 boot 批量应用包内行的封装」的推论：用户侧要「装即用」，console 可以把用户装的 bundle 转成展开的 insert 行，走实时通道；官方层栈保留给 profile 模板组合（稳定优先）。

## 相关

- 迁移记录：[官方 0809 覆盖度](official-0809-coverage.md)（转向决策）、示例迁移（dsh-task-status/dsh-loop/dsh-navbar）
