# 安装示例（Installation examples）

本目录不含插件代码——插件是独立仓库/包，本页示例**如何安装**它们。两种官方安装路径 + 管理面板，覆盖 [loop](https://github.com/dsh-external/dsh-loop)、[task-status](https://github.com/dsh-external/dsh-task-status)、[whale-girl](https://github.com/dsh-external/whale-girl) 等现有插件。

## 路径一：bundle 插件（dsh.client 包）

loop / task-status / navbar 等 UI 插件是 bundle 形态（`dsh.bundle` + `dsh.client`），经官方 profile 管理：

```sh
dsh plugin --profile web add <插件仓库或包路径>   # 挂载进当前 profile 的 bundle 层
```

示例：安装 `task-status`（后台任务状态条）：

```sh
cd <dsh checkout>
dsh plugin --profile web add ~/Project/dsh-plugins/dsh-task-status
dsh web    # 重启后设置页/对话页出现插件效果
```

## 路径二：repository 插件（.dsh-plugin）

whale-girl 等无 UI 或自渲染 UI 的插件是 repository 形态，经 `$DSH_HOME/cordis.patch.yml` 安装：

```yaml
repository-plugins:
  repositories:
    - github:dsh-external/whale-girl#<commit>&path:/.dsh-plugin
```

配置即安装——官方 watcher 检测到列表变化即事务性换代（或下次启动挂载）。

## 管理面板：薄控制台

已装插件用薄控制台（`packages/plugin/console`）管理——浏览器面板增删/启停（读写作 `$DSH_HOME/cordis.patch.yml`）。安装命令见 [根 README「安装」](../README.md)。

## 开发新插件

创建官方 repository-plugin 的契约与引导见 [cookbook/creating-a-repository-plugin](../docs/cookbook/creating-a-repository-plugin.md) 与 [skills/make-dsh-plugin](../skills/make-dsh-plugin/SKILL.md)。
