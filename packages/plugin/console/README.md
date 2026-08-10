# 薄控制台（plugin-console）

0 patch 的浏览器插件管理面板：读/写 `$DSH_HOME/cordis.patch.yml` 的
`repository-plugins` 行，管理官方 repository 插件（`.dsh-plugin` 包）。

- **形态**：官方 bundle（`dsh.bundle` + `dshClient`），经 `dsh plugin --profile web add <dir>` 挂载
- **Node half**：`/api/plugin-console/repositories`（GET 读 / POST 写）
- **client half**：设置页「插件」面板（`settings.section` 插槽）
- **写入目标**：home 级 `$DSH_HOME/cordis.patch.yml`（`homePatchPath()`）——官方 HMR-watched 用户配置层
- **生效**：web 默认无运行中 HMR（官方 TODO），写后提示重启；官方启用 web hmr 后自动换代

背景与转向决策见 `docs/official-0809-coverage.md`。
