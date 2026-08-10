# 评估：官方 0809 覆盖度 vs plugin-registry

状态：**决策依据**（待拍板转向/归档）。目的：以官方 0809 快照（`snapshot-20260809T140917Z-a6bb5a95ba`）的插件机制为基准，逐能力评估 plugin-registry 是否还有存在必要，作为路线转向/归档的依据。本文只讨论 plugin-registry 与官方的关系；dsh-mygo 等第三方方案不在范围内。

## 背景：官方 0809 引入了仓库插件格式

官方 0809 新增 **repository-plugin（仓库插件）** 格式与安装通道，是官方对「插件打包/安装/分发」的正式回答：

- **打包**：`.dsh-plugin/` 目录 + `package.json#dsh.skills/mcpServers/entry` + `scripts.prepack`（必须调用 `dsh-plugin-prepare`）→ prepack 生成固定 `dsh-plugin.mjs` wrapper + `dsh-plugin-assets/`。`dsh.entry` 是完整 Cordis 插件（官方明确保留 `name`/`inject`/`Config`/注册/启动失败/effect 清理的完整语义）
- **安装**：`$DSH_HOME/config.yaml` 的 `repository-plugins.repositories` 列表，`github:owner/repo#<ref>` 精确 ref 锁定，可 `&path:` 选子目录
- **分发**：GitHub 仓库即插件（克隆 + pnpm 准备 + prepack），无发布流程
- **生命周期**：`RepositoryCache`（bundled pnpm 原子准备，不可变 generation）+ `loadPreparedRepository` 挂载 + 事务性换代（HMR watcher 盯 config.yaml，失败保留旧代）
- **官方明确拒绝**：install 命令、注册表/安装数据库、市场/发现索引（config-only-repository-plugins 的 Alternatives 原文：`Add a dsh plugin install command and installation database. Rejected`）

官方 0809 的 `dsh plugin` 命令仍是 **profile/bundle 组合管理**（pnpm forwarder + `dsh.profile.bundles` 层栈），与仓库插件通道并存：通道 1（config.yaml）服务「独立用户装仓库插件」，通道 2（bundle）服务「组合里的产品服务」。

## 覆盖度评估（逐能力）

| plugin-registry 能力 | 官方 0809 对应 | 覆盖？ |
|---|---|---|
| 打包格式（`dsh.plugin.json`） | `.dsh-plugin` 格式（含 skill/mcp/code） | ✅ 官方已定标准，registry 自造格式冗余 |
| 安装（`dsh registry install <dir/tarball>`） | config.yaml 声明式 + pnpm 准备 | ✅ 官方可替代（且官方更干净） |
| 分发（tarball/目录 + deps-link） | GitHub ref + pnpm 依赖解析 | ✅ 官方可替代 |
| 启停/装卸（CLI + 面板） | config.yaml 增删 repositories 行 | ✅ 语义等价（官方无「保留安装但停用」中间态，但增删行覆盖用例） |
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
| 启停/装卸 | ✅ config.yaml | CLI/面板 | 无（让给官方） |
| HMR | ✅ 事务性换代 | 浏览器 diff | 无（让给官方） |
| 管理控制台 | ❌ 官方空白 | 设置页面板 | **窄**（官方无 UI） |
| 动态 client half 补充 | ⚠️ 官方静态可替代 | `registerExternal` | **可选**（非必需） |

**结论**：plugin-registry 作为「独立插件机制」的 ~95% 能力被官方 0809 覆盖，剩余价值收敛为「管理 .dsh-plugin 包的控制台」+「可选动态 client half 补充缝」——不支撑一个完整独立机制。

## 转向/归档建议

1. **打包/安装/分发**：全面靠拢官方 `.dsh-plugin` + config.yaml，registry 不再自造格式与命令
2. **管理面**：保留一个「浏览/启停已装 .dsh-plugin 包」的控制台（且其自身应为官方 dshClient 格式的普通插件）
3. **client half**：`registerExternal` 降级为可选补充缝（官方静态通道可替代，不优先投入）
4. **patch 瘦身**：既有 49→26 瘦身自然收尾，不再投入新机制
5. **归档候选**：若控制台价值不成立（官方后续补 UI），整个仓库转为归档状态

## 待决策项

- [ ] 控制台是否值得保留（官方 config 无 UI，但用户是否真的需要插件管理 UI）
- [ ] `registerExternal` 是保留为可选缝还是移除（取决于是否有官方 dshClient 动态需求）
- [ ] 转向后 patch 与分发包的处置（继续维护 0808/0809 patch，还是随归档冻结）

## 相关

- 官方机制：`.agents/notes/implemented/feature/2026-07-30-config-only-repository-plugins.md`（config 安装）、`2026-08-08-trusted-repository-package-code.md`（dsh.entry 可信代码）、`2026-07-30-static-repository-plugin-format.md`（打包格式）
- 实测：`/tmp/dsh-0809-pure/verify-ui-repo-plugin.ts`（UI 自渲染实证）
- 本仓库：[patch 瘦身设计](patch-slimming-design.md)（转向前的机制收敛）
