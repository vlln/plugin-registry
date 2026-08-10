# 评估：官方 0809 覆盖度 vs plugin-registry

状态：**决策依据**（待拍板转向/归档）。目的：以官方 0809 快照（`snapshot-20260809T140917Z-a6bb5a95ba`）的插件机制为基准，逐能力评估 plugin-registry 是否还有存在必要，作为路线转向/归档的依据。本文只讨论 plugin-registry 与官方的关系；dsh-mygo 等第三方方案不在范围内。

## 背景：官方 0809 引入了仓库插件格式

官方 0809 新增 **repository-plugin（仓库插件）** 格式与安装通道，是官方对「插件打包/安装/分发」的正式回答：

- **打包**：`.dsh-plugin/` 目录 + `package.json#dsh.skills/mcpServers/entry` + `scripts.prepack`（必须调用 `dsh-plugin-prepare`）→ prepack 生成固定 `dsh-plugin.mjs` wrapper + `dsh-plugin-assets/`。`dsh.entry` 是完整 Cordis 插件（官方明确保留 `name`/`inject`/`Config`/注册/启动失败/effect 清理的完整语义）
- **安装**：`$DSH_HOME/cordis.patch.yml`（home 级用户 patch 层）的 `repository-plugins` 行 `repositories` 列表，`github:owner/repo#<ref>` 精确 ref 锁定，可 `&path:` 选子目录
- **分发**：GitHub 仓库即插件（克隆 + pnpm 准备 + prepack），无发布流程
- **生命周期**：`RepositoryCache`（bundled pnpm 原子准备，不可变 generation）+ `loadPreparedRepository` 挂载 + 事务性换代（HMR watcher 盯 patch 文件，失败保留旧代）
- **官方明确拒绝**：install 命令、注册表/安装数据库、市场/发现索引（config-only-repository-plugins 的 Alternatives 原文：`Add a dsh plugin install command and installation database. Rejected`）

官方 0809 的 `dsh plugin` 命令仍是 **profile/bundle 组合管理**（pnpm forwarder + `dsh.profile.bundles` 层栈），与仓库插件通道并存：通道 1（`$DSH_HOME/cordis.patch.yml`）服务「独立用户装仓库插件」，通道 2（bundle）服务「组合里的产品服务」。

### 用户配置层：config.yaml → cordis.patch.yml（官方演进）

官方 0805 的 profile-plugin-bundles 架构决策**弃用 `$DSH_HOME/config.yaml`**（原文：`$DSH_HOME/config.yaml is simply no longer read`），个人 overlay 机制从 `loadPersonalPatches` + `config.yaml` 改为 `loadOptionalPatches` + `watchUserPatches` 读取 `cordis.patch.yml` 两层：

| 层 | 文件 | 属主 | 用途 |
|---|---|---|---|
| bundle 层 | `packages/bundle/*/cordis.patch.yml` | 产品开发者（bundle 包内） | 定义组合行 |
| profile 层 | `$DSH_HOME/profiles/<name>/cordis.patch.yml` | 用户（每 profile） | 覆盖该 profile |
| **home 层** | **`$DSH_HOME/cordis.patch.yml`** | **用户（机器级）** | **跨 profile 个人偏好——repository 插件装这里（`homePatchPath()`）** |

同名 `cordis.patch.yml` 出现在三个层，属主不同；薄控制台的读/写目标是 **home 层**（机器级用户配置），不是 profile 层（只覆盖单 profile），更不是 bundle 包内层（产品层，不该动）。07-30 的 config-only 决策笔记仍写 `config.yaml` 是过时表述，以 08-05 的 profile-plugin-bundles 为准。

## 覆盖度评估（逐能力）

| plugin-registry 能力 | 官方 0809 对应 | 覆盖？ |
|---|---|---|
| 打包格式（`dsh.plugin.json`） | `.dsh-plugin` 格式（含 skill/mcp/code） | ✅ 官方已定标准，registry 自造格式冗余 |
| 安装（`dsh registry install <dir/tarball>`） | `cordis.patch.yml` 声明式 + pnpm 准备 | ✅ 官方可替代（且官方更干净） |
| 分发（tarball/目录 + deps-link） | GitHub ref + pnpm 依赖解析 | ✅ 官方可替代 |
| 启停/装卸（CLI + 面板） | `cordis.patch.yml` 增删 repositories 行 | ✅ 语义等价（官方无「保留安装但停用」中间态，但增删行覆盖用例） |
| HMR 热更新（浏览器 UI 启停不刷新） | 官方事务性换代 + HMR watcher | ✅ 官方更强（事务性失败回滚） |
| 管理控制台（设置页「插件」面板） | 官方无（config 文件无 UI） | ❌ 官方空白——registry 剩余价值之一 |
| **UI 插件（client half）动态进出浏览器** | 见下「实证」 | ⚠️ **已被推翻**——UI 不依赖 client half |

## 实证：UI 插件不需要 client half 机制

早期假设「官方 repository-plugin 不支持 client half，所以带 UI 的插件 registry 才有价值」——**实测推翻**：

- 带 UI 的 `.dsh-plugin` 包用 `dsh.entry` 注入 `httpServer` 注册路由，浏览器 fetch 渲染——**完整官方链路，无任何 client-half 机制**
- 实测（纯净 0809 worktree，`/tmp/dsh-0809-pure`）：tsdown 编译 entry → `dsh-plugin-prepare` 生成 wrapper → `RepositoryCache` 安装 → `loadPreparedRepository` 挂载 → entry 激活（fiber ACTIVE）→ 注册 `/api/ui-verify` 路由 → 真实 HTTP GET 返回 `200 {"ok":true,"source":"repository-plugin-entry","ui":"<div data-ui-verify>..."}`
- 结论：**支持浏览器 UI ≠ 需要 client half**。UI 插件可经官方 entry 自渲染（路径：httpServer 路由 + 浏览器 fetch/iframe/DOM），或经官方 `dshClient` 包 + Loader 树静态加载。registry 的 `registerExternal`（client half 动态登记）只对「坚持官方 dshClient 格式 + 想运行时动态进出官方 `__DSH_BOOT__`」的窄场景有价值——官方静态通道可替代

## 剩余价值评估

| 能力 | 官方 0809 | plugin-registry | 剩余价值 |
|---|---|---|---|
| Node 插件（工具/skill/MCP） | ✅ `.dsh-plugin` | 自造格式 | 无（让给官方） |
| 带 UI 插件 | ✅ entry 自渲染（实证） | client half | 无（让给官方） |
| 启停/装卸 | ✅ `cordis.patch.yml` | CLI/面板 | 无（让给官方） |
| HMR | ✅ 事务性换代 | 浏览器 diff | 无（让给官方） |
| 管理控制台 | ❌ 官方空白 | 设置页面板 | **窄**（官方无 UI） |
| 动态 client half 补充 | ⚠️ 官方静态可替代 | `registerExternal` | **可选**（非必需） |

**结论**：plugin-registry 作为「独立插件机制」的 ~95% 能力被官方 0809 覆盖，剩余价值收敛为「管理 .dsh-plugin 包的控制台」+「可选动态 client half 补充缝」——不支撑一个完整独立机制。

## 转向/归档建议

1. **打包/安装/分发**：全面靠拢官方 `.dsh-plugin` + `cordis.patch.yml`，registry 不再自造格式与命令
2. **管理面**：保留一个「浏览/启停已装 .dsh-plugin 包」的控制台（且其自身应为官方 dshClient 格式的普通插件）
3. **client half**：`registerExternal` 降级为可选补充缝（官方静态通道可替代，不优先投入）
4. **patch 瘦身**：既有 49→26 瘦身自然收尾，不再投入新机制
5. **归档候选**：若控制台价值不成立（官方后续补 UI），整个仓库转为归档状态

## 决策（2026-08-10 拍板，转向「薄控制台」）

- ✅ **控制台保留，形态 = 写 config 触发重载**：薄控制台读官方 `$DSH_HOME/cordis.patch.yml` 的 `repository-plugins.repositories`，写操作直接编辑该列表 → 官方 HMR watcher 事务性换代生效。控制台需要写文件能力（经官方 entry 注入 httpServer 的自建路由，或官方配置写入面）
- ✅ **`registerExternal` 完全移除**：依赖官方静态 dshClient 通道，不保留可选缝
- ✅ **patch 倾向删除**：转向后不再维护 0808/0809 patch，机制件冻结或删除

## 转向「薄控制台」——spike 验证（2026-08-10）

纯净 0809 快照实测（`/tmp/dsh-0809-spike`）：

| 验证点 | 结果 |
|---|---|
| entry 经 httpServer 自渲染 UI | ✅ 真实 HTTP 200 返回 UI 数据（`/tmp/dsh-0809-pure` 实证） |
| 写 `$DSH_HOME/cordis.patch.yml` → 官方消费 repository 行 | ✅ 启动加载 → 官方 repository-plugin git 准备插件（web4/web6 实证） |
| 运行中写 config → 即时 HMR 换代 | ❌ **0809 web 默认 hmr disabled**（web-app bundle 显式 `hmr: disabled: true`，官方 TODO「Re-enable shared HMR for Web after its reload lifecycle is tested」）——watcher 未注册 |
| 0 patch 可行性 | ✅ 全部官方机制（config 文件 + repository-plugin + dshClient 面板） |

**关键发现（影响形态）**：
- **写入目标 = `$DSH_HOME/cordis.patch.yml`**（home 级用户 patch 层，`homePatchPath()`）——07-30 决策笔记所称 `config.yaml` 已被 08-05 的 profile-plugin-bundles 取代，官方实现只读 `cordis.patch.yml`（web4/web6 实证）
- **web 默认无运行中换代**：薄控制台写 config 后需**提示重启**（或触发整站 reload）；官方若启用 web hmr（TODO），运行中换代自动成立——控制台设计应兼容两种

## 转向规划（4 阶段）

| 阶段 | 内容 | 验证标准 |
|---|---|---|
| 1 冻结 | patch 瘦身收尾；CLI/`ctx.plugins`/`registerExternal` 标 deprecated，不再投入 | CHANGELOG 标注 |
| 2 spike | 薄控制台最小原型（读/写 cordis.patch.yml + dshClient 面板） | 0 patch；能列出/启停 .dsh-plugin 包 |
| 3 转型 | 新建薄控制台包替代 ui-plugin-manager；移除机制分发包与 patch | 旧机制可整体移除不影响控制台 |
| 4 发布 | 控制台独立发版；旧 v0.1.0 标 legacy | 发布流程验证 |

## 相关

- 官方机制：`.agents/notes/implemented/feature/2026-07-30-config-only-repository-plugins.md`（config 安装）、`2026-08-08-trusted-repository-package-code.md`（dsh.entry 可信代码）、`2026-07-30-static-repository-plugin-format.md`（打包格式）
- 实测：`/tmp/dsh-0809-pure/verify-ui-repo-plugin.ts`（UI 自渲染实证）
- 本仓库：[patch 瘦身设计](patch-slimming-design.md)（转向前的机制收敛）
