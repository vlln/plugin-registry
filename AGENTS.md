# AGENTS.md — plugin-registry 项目导览

本文件给 agent 提供仓库定位、构建方式与协作约束，防止把本仓库误当成官方源码仓库或可独立运行的发行版。**文档写作规则见 [docs/AGENTS.md](docs/AGENTS.md)**，本文只说"这是什么、怎么构建、怎么维护"。

## 一句话定位

`dsh-external/plugin-registry` 是**构建在官方基线之上的插件管理基础设施**：用 **patch + package 方式**把插件机制接入 DeepSeek Harness。本仓库不含官方源码，也不独立运行。

## 构建式仓库：patch + package

| 构件 | 内容 | 作用 |
|---|---|---|
| 官方基线 | 官方上游发布的 baseline snapshot（快照提交） | 被构建的底座 |
| [`patches/dsh-plugin-registry-0808.patch`](patches/dsh-plugin-registry-0808.patch) | 机制打进官方源码的补丁（CLI `dsh registry` 子命令、apiproxy `plugins` 域、client-modules `registerExternal`、host 帧 `client-graph-changed` 自动刷新、tsconfig、依赖闭包） | `git apply` 后官方树具备 registry 机制 |
| [`packages/`](packages/) | 插件实现包（`plugin` 核心、`ui-plugin-manager` 管理面板、`bundle/` registry bundle） | 复制进目标 monorepo，随 patch 一起交付；bundle 经官方 profile 机制挂载 |
| [`examples/`](examples/) | 可运行示例插件（greeter / navbar / task-status / loop） | 验证机制 + 学习模板 |

**集成步骤**（详见 [集成到 dsh](docs/cookbook/integrating-into-dsh.md)）：复制 `packages/` 进 monorepo → `git apply patches/dsh-plugin-registry-0808.patch` → 把 registry bundle 加进 profile（`dsh plugin --profile web add packages/bundle/dsh-plugin-registry`）。

## 双仓库格局（防止混淆）

- **机制件的家**：官方 snapshot 宿主仓库的机制分支（社区所有）。平台机制改动直接改官方源码（snapshot checkout）并提交到该分支（当前纪律：示例的数据/渲染需求由插件自造缝承担，不打进官方树）。
- **本仓库 = 验证与分发层**：示例验证机制、文档记录契约、patch/package 把机制交给外部构建者。
- **机制迭代顺序**：机制分支落地 → 本仓库示例/文档同步 → **重新生成 patch**（见下）。

## patch 维护（关键约束）

- patch 基于**官方快照**生成，基线推进后锚点漂移，需重新生成；生成命令见 [分发插件](docs/cookbook/distributing-plugins.md)。
- **基线状态**：机制分支已对齐官方 0808 快照；`patches/` 已基于官方 0808 快照重建（41 文件，纯平台接线，见 [CHANGELOG](CHANGELOG.md)「基线」段）。
- patch 只含 plugin-registry **核心机制**需要的官方改动；**具体插件的宿主依赖**（如某插件的 ui-workspace hole）由该插件仓库自带补丁提供，不入本补丁。

## 仓库结构

| 路径 | 内容 |
|---|---|
| [`docs/`](docs/) | 架构、统一模型、cookbook（[文档标准](docs/AGENTS.md)） |
| [`examples/`](examples/) | 可运行示例插件（S1 navbar / S2 task-status / greeter / loop） |
| [`packages/`](packages/) | 插件实现包（plugin 核心 + ui-plugin-manager） |
| [`patches/`](patches/) | 官方机制补丁（patch+package 构建的 patch 侧） |
| [`scripts/`](scripts/) | 校验脚本（md 链接、文档预算） |
| [`skills/`](skills/) | agent skill（plugin-registry-create） |
| [`CHANGELOG.md`](CHANGELOG.md) / [`ROADMAP.md`](ROADMAP.md) | 交付记录（含基线标注）/ 推进路线 |

## Agent 协作约束

- **改机制**：先在机制分支提交，再同步本仓库（示例 + 文档 + patch），不要只改本仓库。
- **改文档**：遵循 [docs/AGENTS.md](docs/AGENTS.md)（中文默认、one home per fact、字数预算）。
- **提交前验证**：`node scripts/verify-md-links.mjs` + `node scripts/verify-doc-budgets.mjs`。
- **CHANGELOG 记交付时标明基线**：机制分支基线（官方快照 ref）与 patch 基线分开写，避免"何时更新"误判。

## 相关仓库

- `dsh-external/plugin-registry`：本仓库（patch+package 构建式基础设施）。
- 同模式插件仓库：如 dsh-subagent-tree（自带 `patches/` 提供宿主 hole 补丁，不入本补丁）。
