<h1 align="center">plugin-console</h1>

<p align="center">
  <strong>薄控制台——DSH Web 设置页内的插件管理面板</strong><br/>
  0 patch 管理官方 repository 插件与 UI 插件：浏览器面板增删/启停，
  读写 `$DSH_HOME/cordis.patch.yml`，无需手改配置、不引入任何补丁。
</p>

<p align="center">
  <img src="https://badgen.net/badge/license/BSD-3-Clause/blue" alt="license" />
  <img src="https://badgen.net/badge/format/official%20bundle/8257D0" alt="official bundle" />
</p>

---

## 这是什么

官方 **bundle 插件**（`dsh.bundle` + `dsh.client` 声明）：Node half 注册
`/api/plugin-console` 路由，client half 在设置页注册「插件」面板。面板管理两类插件：

| 管理区 | 插件类型 | 操作 | 写入文件 |
|---|---|---|---|
| **repository 插件** | `.dsh-plugin` 包（skill/mcp/tool） | `repositories` 列表增删（装/卸）+ 检查更新 | home 级 `$DSH_HOME/cordis.patch.yml`（跨 profile 用户配置层） |
| **UI 插件** | bundle 插件（`dsh.client` 包，如 dsh-loop/navbar/task-status） | Loader 树行 `disabled` 标记（停/启） | profile 级 `$DSH_HOME/profiles/web/cordis.patch.yml`（当前 profile） |

两类插件写入目标不同：repository 配置在 home 级，UI 插件启停覆盖在 profile 级。背景与转向决策见
[官方 0809 覆盖度](../../../docs/official-0809-coverage.md)。

![插件面板](../../../screenshots/console-panel.png)

## 安装

本地目录安装（构建产物需在库——先 `pnpm exec tsdown` 产出 `lib/`）：

```sh
dsh plugin --profile web add <plugin-registry 仓库>/packages/plugin/console
```

挂载后刷新 Web 页面，设置页出现「插件」面板（`settings.section` 插槽）。

## 使用

- **repository 插件区**：增删 `repositories` 源列表行（`github:owner/repo#<ref>&path:/.dsh-plugin`），
  每行可「检查更新」——固定到远端最新 commit（写配置，换代在下次启动/HMR）
- **UI 插件区**：已加载 bundle 列表（用户 + 内置），行内「停用/启用」切换 Loader 树 `disabled` 标记；
  「安装 bundle 插件」经 `pnpm add` 把新 bundle 加进 profile 层栈

## 生效方式

web 默认无运行中 HMR（官方 TODO），面板写配置后**重启 web 生效**；官方启用 web HMR 后自动事务性换代。
Node half 改动需重启 web（ESM 缓存）；client 面板改动重装 + 刷新页面即可。

## 开发插件（引导）

创建官方 repository-plugin 的完整契约见
[cookbook/creating-a-repository-plugin](../../../docs/cookbook/creating-a-repository-plugin.md)；
agent 工作流引导见 [make-dsh-plugin skill](../../../skills/make-dsh-plugin/SKILL.md)。
参考实现：`whale-girl`。
