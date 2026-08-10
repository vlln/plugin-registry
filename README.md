# dsh 插件注册表（Plugin Registry）

> **转向（2026-08）**：官方 0809 推出仓库插件机制（`.dsh-plugin` 格式 + config 声明 + 事务性换代），覆盖了本仓库旧独立机制的 ~95% 能力（打包/安装/分发/启停/HMR），并实证「带 UI 的插件经 entry 自渲染，不需要 client half 机制」——自造一套插件机制已无价值。
>
> **重构结果**：放弃独立插件机制（patch 注入 / `dsh registry` CLI / `ctx.plugins` / 旧面板，已移除），收敛为 **薄控制台 + 插件开发规范和引导**——薄控制台管理官方 repository 插件，skill/cookbook 引导开发者按官方格式写插件。完整评估见 [官方 0809 覆盖度](docs/official-0809-coverage.md)。

## 定位

DeepSeek Harness 官方机制管「插件是什么、怎么跑」；本仓库补两件事：

1. **薄控制台**（`packages/plugin/console`）——管理已装的官方 repository 插件与 UI 插件的浏览器面板（读写作 `$DSH_HOME/cordis.patch.yml`）
2. **开发规范和引导**——`plugin-registry-create` skill + cookbook，指导创建官方 repository-plugin（0809 格式）

## 安装薄控制台

```sh
dsh plugin --profile web add <本仓库>/packages/plugin/console
```

挂载后设置页出现「插件」面板：repository 插件区（增删 `repositories` 列表）+ UI 插件区（`disabled` 启停标记）。

## 安装其他插件

本仓库不含插件代码——插件是独立仓库/包。安装示例（loop/task-status/whale-girl 等，两种官方路径）见 [examples](examples/README.md)。

## Agent Skill

仓库自带 `plugin-registry-create` Skill（`skills/plugin-registry-create/SKILL.md`），指导 agent 创建官方 repository-plugin（0809 格式）：**先选形态**（skill 包 / MCP / Node 工具 / 带 UI）→ 按对应路径搭建 `.dsh-plugin/` → prepack → `config.yaml` 安装 → 验证纪律。详情分置 `references/`（entry 契约 / 安装验证 / 开发规范）；完整契约见 [cookbook](docs/cookbook/creating-a-repository-plugin.md)，参考实现 `whale-girl`。

## 文档

- [创建官方 repository-plugin](docs/cookbook/creating-a-repository-plugin.md) — 0809 格式权威契约：仓库布局 → entry → 自渲染 client → 安装 → 开发规范
- [官方 0809 覆盖度评估](docs/official-0809-coverage.md) — 官方机制覆盖度、UI 自渲染实证、转向决策
- [薄控制台设计](docs/console-ui-plugin-management.md) — 统一管理两类插件的设计
- [架构](docs/architecture.md) — 两层插件模型的系统地图
- 历史机制文档（已转向，仅存档）：[创建插件（旧）](docs/cookbook/creating-a-plugin.md)、[清单格式（旧）](docs/manifest-format.md)、[0805→0806 迁移](docs/migrating-to-0806.md) 等
- [变更记录](CHANGELOG.md) / [路线图](ROADMAP.md)

## 版权

BSD-3-Clause License，与 DeepSeek Harness 官方一致。见 [LICENSE](LICENSE)。
