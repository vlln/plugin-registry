# dsh 插件注册表（Plugin Registry）

DeepSeek Harness 的本地插件系统实现：清单协议、安装/启停、Web 管理面板、声明校验、脚手架与 tarball 分发。

> 本仓库为**独立插件项目**，版权归作者所有。仅包含本项目的原创代码；不包含 DeepSeek Harness 官方仓库（dsh2026 org）的源码内容。设计对应官方 [issue #171](https://github.com/dsh-external/issues/issues/171)（插件系统暴露标准入口，定义分发与贡献机制）。

## 内容

| 目录 | 说明 |
|---|---|
| `packages/plugin/plugin` | 插件系统核心包（`@deepseek-ai/dsh-plugin`）：`dsh.plugin.json` 清单协议、本地注册表（`$DSH_HOME/plugins`）、`plugins-catalog.json` 本地目录、`ctx.plugins` 运行时服务（实时热挂载）、contributes 声明校验、`dsh plugin` CLI 操作、脚手架与 tarball 安装 |
| `packages/ui-plugin-manager` | Web 设置页插件管理面板（`@deepseek-ai/dsh-client-ui-plugin-manager`）：浏览/搜索/安装/启停/卸载 |

## 展示

Web 设置页「插件」面板：

![插件管理面板 1](screenshots/plugin-panel-1.png)

![插件管理面板 2](screenshots/plugin-panel-2.png)

## 能力一览

- **清单协议**：插件根目录携带 `dsh.plugin.json`，声明身份（publisher/name）、版本、入口、兼容的 harness 版本范围、贡献声明（工具/技能）
- **声明即契约**：清单声明的工具未实际注册时，启用会明确报错并回滚挂载
- **安装/启停**：支持本地目录或 tarball（解压带路径穿越防护）；启用/禁用实时生效
- **Web 面板**：设置页「插件」区，浏览、搜索、安装、启停、卸载
- **信任边界**：安装默认禁用，只有显式启用后插件代码才会执行
- **脚手架**：`dsh plugin create <id>` 一键生成标准插件根

## 集成到 DeepSeek Harness

本项目的两个包设计为在 dsh monorepo（workspace）内编译，依赖 dsh 内部包（`dsh-tools`、`dsh-paths`、`dsh-invariants`、`dsh-host-apiproxy`、`dsh-client-*` 等）与 vendored Cordis。集成步骤：

1. 将 `packages/plugin/`、`packages/ui-plugin-manager/` 拷贝到 dsh 仓库对应位置（`packages/plugin/`、`packages/client/ui-plugin-manager/`）
2. 注册 tsconfig 与依赖（`tsconfig.base.json` / `tsconfig.host.json` / `tsconfig.client.json` 的 paths 与 references、对应 `package.json` 依赖）
3. 在组合配置（`base.cordis.yml`）挂载 `plugin-local`（`@deepseek-ai/dsh-plugin`），Web 组合挂载 `ui-plugin-manager`
4. apiproxy `plugins` 域（`plugin.list/install/enable/disable/uninstall`）暴露 Web wire——host 侧接线参考项目内 `packages/plugin` 的 service 实现与 README

两个包各自的 README（`packages/plugin/plugin/README.md`、`packages/ui-plugin-manager/README.md`，含中文版）描述了完整配置、CLI、服务 API 与已知边界。

## 使用

```sh
dsh plugin create acme/cool-tool   # 脚手架
dsh plugin install ./cool-tool     # 安装（默认禁用）
dsh plugin install demo.tgz        # tarball 安装
dsh plugin enable acme/cool-tool   # 启用（实时挂载）
dsh plugin list                    # 列表
dsh plugin disable acme/cool-tool
dsh plugin uninstall acme/cool-tool
```

## 验证

单元测试 75+ 项、覆盖率 100%（语句/分支/函数/行）；端到端（创建 → 安装 → 启用 → 卸载）跑通；typecheck / lint / 文档与配置门禁全绿。

## 版权

本仓库代码版权归作者所有，供 dsh 内测成员在 dsh-external 组织内使用与协作。未经作者许可请勿公开分发。
