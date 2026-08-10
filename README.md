# dsh 插件注册表（Plugin Registry）

> **转向（2026-08）**：官方 0809 推出仓库插件机制（`.dsh-plugin` 格式 + config 声明 + 事务性换代），覆盖了本仓库旧独立机制的 ~95% 能力（打包/安装/分发/启停/HMR），并实证「带 UI 的插件经 entry 自渲染，不需要 client half 机制」——自造一套插件机制已无价值。
>
> **重构结果**：放弃独立插件机制（patch 注入 / `dsh registry` CLI / `ctx.plugins` / 旧面板，已移除），收敛为 **薄控制台 + 插件开发规范和引导**——薄控制台管理官方 repository 插件，skill/cookbook 引导开发者按官方格式写插件。完整评估见 [官方 0809 覆盖度](docs/official-0809-coverage.md)。

## 定位

DeepSeek Harness 官方机制管「插件是什么、怎么跑」；本仓库补两件事：

1. **薄控制台**（`packages/plugin/console`）——管理已装的官方 repository 插件与 UI 插件的浏览器面板（读写作 `$DSH_HOME/cordis.patch.yml`）
2. **开发规范和引导**——`make-dsh-plugin` skill + cookbook，指导创建官方 repository-plugin（0809 格式）

## 生态关系（谁能干什么）

```
官方 DSH（DeepSeek Harness）     插件运行时 + 仓库插件机制（.dsh-plugin 格式 + config 安装）
   │
   ├── 官方插件（bundle）        loop / task-status / navbar 等——随组合分发，`dsh plugin add` 装进 profile
   ├── 第三方插件（repository）  whale-girl 等——独立 GitHub 仓库，`config.yaml` 安装
   │
   └── 本仓库（plugin-registry） ① 薄控制台：管理上述两类插件的浏览器面板
                                ② make-dsh-plugin skill + cookbook：引导开发第三方插件
```

两类插件的完整区别（开发/分发/安装/管理四维 + 选型）见 [插件类型对比](docs/plugin-types.md)；现有插件的安装示例（loop/task-status/whale-girl 等）见 [examples](examples/README.md)。

## 安装薄控制台

```sh
dsh plugin --profile web add <本仓库>/packages/plugin/console
```

挂载后设置页出现「插件」面板：repository 插件区（增删 `repositories` 列表）+ UI 插件区（`disabled` 启停标记）。

## Agent Skills

| Skill | 作用 |
|---|---|
| [make-dsh-plugin](skills/make-dsh-plugin/SKILL.md) | 创建官方 repository-plugin（0809 格式）：先选形态（skill 包 / MCP / Node 工具 / 带 UI）→ 搭建 `.dsh-plugin/` → prepack → config.yaml 安装 → 验证纪律。详情分置 `references/`（entry 契约 / 安装验证 / 开发规范 / 踩坑清单）；完整契约见 [cookbook](docs/cookbook/creating-a-repository-plugin.md)，参考实现 `whale-girl` |

## 开发前须知（踩过的坑）

- **官方包未发布到公共 npm**：`@deepseek-ai/dsh-tools` 等 `npm install` 会失败——正式分发由官方环境经 github: 源解析，本地验证需 symlink 至 monorepo 产物或 mock registry。**不要改依赖声明**。bundle 插件（loop/task-status）同坑但更隐蔽：`dependencies` 为空是设计，依赖由 profile 的 pnpm 闭包挂载时注入。
- **改已挂载插件的 Node half 需重启 web**：ESM 缓存按 URL 永久缓存，disable/enable 不生效，只能重启。
- **宿主可能覆盖注入的 CSS**：关键 UI 样式用 JS 内联，勿依赖 CSS class。

完整坑清单见 [skill references/gotchas](skills/make-dsh-plugin/references/gotchas.md)。

## 旧用户迁移（旧机制插件 → 官方形态）

plugin-registry 旧机制（`dsh.plugin.json` / `dsh registry` / `__ModuleLoader__`）已移除——旧插件需迁移到官方 0809 形态：

| 旧插件现状 | 迁移到 | 方式 |
|---|---|---|
| 已有官方 npm 包 + 增量清单（distill/dsh-vision 等） | **bundle 插件** | 删 `dsh.plugin.json`，声明 `dsh.bundle`，`dsh plugin add` 安装 |
| 纯旧机制（自造 client half） | **repository 插件** | `.dsh-plugin/` + `dsh.entry`，client 改自渲染（whale-girl 范本） |

完整迁移指南（方向判断/分面迁移/执行步骤）见 [cookbook/migrating-legacy-plugins](docs/cookbook/migrating-legacy-plugins.md)。

## 文档

- [创建官方 repository-plugin](docs/cookbook/creating-a-repository-plugin.md) — 0809 格式权威契约：仓库布局 → entry → 自渲染 client → 安装 → 开发规范
- [插件类型对比](docs/plugin-types.md) — repository 插件 vs bundle 插件：开发/分发/安装/管理四维 + 选型
- [官方 0809 覆盖度评估](docs/official-0809-coverage.md) — 官方机制覆盖度、UI 自渲染实证、转向决策
- [薄控制台设计](docs/console-ui-plugin-management.md) — 统一管理两类插件的设计
- [架构](docs/architecture.md) — 两层插件模型的系统地图
- 历史机制文档（已转向，仅存档）：[创建插件（旧）](docs/cookbook/creating-a-plugin.md)、[清单格式（旧）](docs/manifest-format.md)、[0805→0806 迁移](docs/migrating-to-0806.md) 等
- [变更记录](CHANGELOG.md) / [路线图](ROADMAP.md)

## 版权

BSD-3-Clause License，与 DeepSeek Harness 官方一致。见 [LICENSE](LICENSE)。
