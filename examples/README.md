# 安装示例（Installation examples）

本目录不含插件代码——插件是独立仓库/包，本页示例**如何安装**它们。**0811 起官方移除 repository-plugins 机制**（`vendor/loader/src/repository.ts` 删除），外部插件统一经 web profile 安装，两条官方路径 + 管理面板：

## 路径一：bundle 插件（dsh.bundle 包）

loop / task-status / navbar 等 UI 插件是 bundle 形态（`dsh.bundle`，可带 `dsh.client`），经官方 profile 管理：

```sh
dsh plugin --profile web add "github:vlln/dsh-task-status#main"   # 推荐：git 源一行（产物已入库）
# 或本地目录：dsh plugin --profile web add <dsh-task-status 本地路径>
```

装完 **重启 web**（bundle 层在启动时合成），设置页/对话页出现插件效果。

### 已收录插件

| 插件 | 功能 | 安装 |
| --- | --- | --- |
| [dsh-task-status](https://github.com/vlln/dsh-task-status) | 对话页任务状态条 | `dsh plugin --profile web add "github:vlln/dsh-task-status#main"` |
| [dsh-remote](https://github.com/Blank-not-black/dsh-Remote) | 移动远程控制台（插件+内置网关+手机 App 一体）：DSH 原生侧边栏入口+右侧抽屉管理页；插件内置网关随 DSH 自动启停，抽屉直显令牌与设备监控，配 Android App 远程操控会话/后台工作/审批/提问/子代理/goal（monorepo 子目录包） | `dsh plugin --profile web add "github:Blank-not-black/dsh-Remote#main&path:/packages/plugin"` |

## 路径二：非 bundle 插件（profile patch insert 行）

纯 cordis 插件（无 `dsh.bundle` 声明）经 profile `cordis.patch.yml` 的 insert 行挂载。先让包在 profile 可解析（`dsh plugin --profile web add <包>` 或 pnpm add），再写行：

```yaml
- insert:
    - id: my-plugin
      name: 'my-plugin-package'   # 必须加引号（YAML @ 开头是保留指示符）
```

**0811 保留配置级 HMR**——写行/删行**实时挂载/卸载，无需重启**（薄控制台面板与 `plugin_install` 工具即走此通道）。

## 管理面板：薄控制台

已装插件用薄控制台（`packages/plugin/console`）管理——浏览器面板管理 insert 行（实时）+ bundle 安装/启停（读写作 profile 安装态）。安装命令见 [根 README「安装」](../README.md)。

## 开发新插件

创建官方 bundle 插件 / 纯 cordis 插件的契约与引导见 [skills/make-dsh-plugin](../skills/make-dsh-plugin/SKILL.md)。
