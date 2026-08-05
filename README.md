# dsh 插件注册表（Plugin Registry）

DeepSeek Harness 的本地插件系统：清单协议、安装/启停、Web 管理面板、声明校验、脚手架与 tarball 分发。

## 文档

| 文档 | 内容 |
|---|---|
| [架构](docs/architecture.md) | 两层插件模型、加载路径、能力面 vs 声明面、服务关系、信任边界、web 边界、与 pi-mono 对比 |
| [创建插件](docs/cookbook/creating-a-plugin.md) | 从零开发：脚手架 → 入口 → contributes 同步 → 安装启用 |
| [集成到 dsh](docs/cookbook/integrating-into-dsh.md) | 复制包 + 补丁 + 组合启用，接入 DSH 源码环境 |
| [分发插件](docs/cookbook/distributing-plugins.md) | tarball 分发与社区目录模式 |
| [文档标准](docs/AGENTS.md) | 文档分层、写作规则、字数预算 |

## 内容

| 目录 | 说明 |
|---|---|
| `packages/plugin/plugin` | 核心包 `@deepseek-ai/dsh-plugin`：清单协议、本地注册表、运行时服务、校验、脚手架、tarball 安装 |
| `packages/ui-plugin-manager` | Web 设置页插件面板：浏览 / 搜索 / 安装 / 启停 / 卸载 |
| `examples/greeter` | 可直接安装的示例插件（清单 + Cordis 入口），从零开发见 [`examples/README.md`](examples/README.md) |
| `skills/plugin-registry-create` | Agent Skill：指导快速创建 registry 插件（脚手架 → 写入口 → 安装启用） |
| `patches/dsh-plugin-registry.patch` | 基于官方 0804 快照的接线补丁（30 个文件） |

## 展示

Web 设置页「插件」面板：

![插件管理面板 1](screenshots/plugin-panel-1.png)

插件列表：搜索框、状态徽章（已启用/已禁用/未安装）、版本与描述、操作按钮。

![插件管理面板 2](screenshots/plugin-panel-2.png)

操作后状态：启用实时生效（徽章变绿胶囊）、禁用与卸载的反馈。

## 快速上手

```sh
dsh plugin create acme/cool-tool   # 脚手架：生成 dsh.plugin.json + index.mjs + README
cd cool-tool
# 编辑 index.mjs 写插件逻辑；编辑 dsh.plugin.json 把 contributes.tools 声明成入口实际注册的工具
dsh plugin install .               # 安装（默认禁用）
dsh plugin enable acme/cool-tool   # 启用（实时挂载；声明未注册会报错回滚）
dsh plugin list                    # 列表
```

不想从空脚手架开始？复制示例：`cp -r examples/greeter ./my-tool`，改 `id` 与工具注册即可。完整指南见 [创建插件](docs/cookbook/creating-a-plugin.md)。

## Agent Skill

仓库自带 `plugin-registry-create` Skill（`skills/plugin-registry-create/SKILL.md`），指导 agent 快速创建 registry 插件：选 id → 脚手架 → 写 Cordis 入口 → 同步 `contributes` → 安装启用验证，含常见坑（默认禁用、声明面 vs 能力面、Loader 树边界等）。与官方 harness 的 `dsh-*` skills / `cordis` 工具集命名区分，避免混淆。

## 能力一览

- **清单协议**：`dsh.plugin.json` 声明身份、版本、入口、兼容范围、贡献
- **声明即契约**：声明的工具未注册 → 启用报错并回滚挂载
- **安装/启停**：目录或 tarball（解压防路径穿越）；启停实时生效
- **Web 面板**：设置页「插件」区，浏览、搜索、安装、启停、卸载
- **信任边界**：安装默认禁用，显式启用才执行
- **脚手架**：`dsh plugin create <id>` 一键生成标准插件根

## 版权

本仓库代码版权归作者所有，供 dsh 内测成员在 dsh-external 组织内使用与协作。未经作者许可请勿公开分发。
