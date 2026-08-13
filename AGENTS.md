# AGENTS.md — plugin-registry 项目导览

本文件给 agent 提供仓库定位、构建方式与协作约束，防止把本仓库误当成官方源码仓库或可独立运行的发行版。**文档写作规则见 [docs/AGENTS.md](docs/AGENTS.md)**，本文只说"这是什么、怎么构建、怎么维护"。

## 一句话定位

`vlln/plugin-registry`（2026-08-12 从 dsh-external 转移）已转向：**0 patch 薄控制台**——管理官方 repository 插件（`.dsh-plugin`）的浏览器面板。不再含 patch/官方源码改动；交付物是官方 bundle 格式的独立包。

## 转向背景（2026-08）

官方 0809 提供仓库插件机制（`.dsh-plugin` 格式 + config 声明 + 事务性换代），覆盖 plugin-registry 旧独立机制（patch/CLI/`ctx.plugins`）的 ~95%。评估与决策见 [官方 0809 覆盖度](docs/official-0809-coverage.md)。旧机制（patch 加载、`dsh registry` CLI、`ctx.plugins`、ui-plugin-manager 面板）**已移除**；当前交付物为薄控制台。

## 当前交付物

| 构件 | 内容 | 作用 |
|---|---|---|
| [`packages/plugin/console`](packages/plugin/console/) | 薄控制台 bundle：Node half 读写 `$DSH_HOME/cordis.patch.yml` + client half 设置页面板 | `dsh plugin --profile web add` 挂载，0 patch 管理官方 repository 插件 |

**集成**：`dsh plugin --profile web add <this-repo>/packages/plugin/console`（官方 bundle 机制，无 patch）。

## 仓库结构

| 路径 | 内容 |
|---|---|
| [`docs/`](docs/) | 转向决策（official-0809-coverage）、机制历史（patch-slimming 等，标注历史）、cookbook（文档标准见 [docs/AGENTS.md](docs/AGENTS.md)） |
| [`examples/`](examples/) | 安装示例（如何装外部插件：bundle 与 repository 两种官方路径） |
| [`packages/plugin/console`](packages/plugin/console/) | 薄控制台（当前交付物） |
| [`scripts/`](scripts/) | 校验脚本（md 链接、文档预算） |
| [`skills/`](skills/) | agent skill（make-dsh-plugin） |
| [`CHANGELOG.md`](CHANGELOG.md) / [`ROADMAP.md`](ROADMAP.md) | 交付记录 / 推进路线 |

## Agent 协作约束

- **改机制**：不再有机制分支/patch——薄控制台改动直接在本仓库（console 包），验证在纯净官方快照（0 patch 确认）。
- **改文档**：遵循 [docs/AGENTS.md](docs/AGENTS.md)（中文默认、one home per fact、字数预算）。
- **提交前验证**：`node scripts/verify-md-links.mjs` + `node scripts/verify-doc-budgets.mjs`。
- **转向纪律**：任何「重新引入官方源码改动/patch」的提议需先回看 [官方 0809 覆盖度](docs/official-0809-coverage.md) 论证必要性。

## 相关仓库

- `vlln/plugin-registry`：本仓库（薄控制台交付物，2026-08-12 从 dsh-external 转移并公开）。
- 历史机制：`dsh2026/test-vlln` 的 `feat/plugin-registry-mvp-0808` 分支（冻结保留，不再演进）。
