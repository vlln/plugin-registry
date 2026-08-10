# 薄控制台（plugin-console）

0 patch 的浏览器插件管理面板，管理两类插件：

| 管理区 | 插件类型 | 操作 | 写入文件 |
|---|---|---|---|
| **repository 插件** | `.dsh-plugin` 包（skill/mcp/tool） | `repositories` 列表增删（装/卸） | home 级 `$DSH_HOME/cordis.patch.yml`（`homePatchPath()`） |
| **UI 插件** | bundle 插件（dshClient 包，如 dsh-loop/navbar/task-status） | Loader 树行 `disabled` 标记（停/启） | profile 级 `$DSH_HOME/profiles/web/cordis.patch.yml`（`profilePatchPath()`） |

- **形态**：官方 bundle（`dsh.bundle` + `dshClient`），经 `dsh plugin --profile web add <dir>` 挂载
- **Node half**：`/api/plugin-console/repositories`（repository 插件）+ `/api/plugin-console/ui-plugins`（UI 插件）——GET 读 / POST 写
- **client half**：设置页「插件」面板（`settings.section` 插槽），两个管理区
- **生效**：web 默认无运行中 HMR（官方 TODO），写后提示重启；官方启用 web hmr 后自动换代

两类插件的写入目标不同：repository 插件配置在 home 级（跨 profile 的用户配置层），UI 插件的启停覆盖在 profile 级（针对当前 profile 的 Loader 树行）。背景与转向决策见 `docs/official-0809-coverage.md`。

## 开发插件（引导）

创建官方 repository-plugin 的完整契约见 [cookbook/creating-a-repository-plugin](../../../docs/cookbook/creating-a-repository-plugin.md)；agent 工作流引导见 [skills/plugin-registry-create](../../../skills/plugin-registry-create/SKILL.md)。参考实现：`whale-girl`。
