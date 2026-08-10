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

**git 源直接安装（推荐）**：

```sh
dsh plugin --profile web add "github:dsh-external/plugin-registry#main&path:/packages/plugin/console"
```

pnpm ≥10 会阻止安装时的构建脚本（prepare）：按 dsh 提示把 `allowBuilds` 的精确 key（**加引号**）写入 `$DSH_HOME/profiles/web/pnpm-workspace.yaml`，然后重跑。

**本地目录安装**（无 pnpm ≥10 阻碍）：

```sh
git clone https://github.com/dsh-external/plugin-registry.git
cd plugin-registry/packages/plugin/console
pnpm install && pnpm run build   # 构建 lib/（产物不入库）
dsh plugin --profile web add .   # 当前目录即 bundle 包子目录（dsh 锚定 . 为绝对路径）
```

挂载后刷新 Web 页面，设置页出现「插件」面板（`settings.section` 插槽）。

## 使用

- **repository 插件区**：增删 `repositories` 源列表行（`github:owner/repo#<ref>&path:/.dsh-plugin`），
  每行可「检查更新」——固定到远端最新 commit（写配置，换代在下次启动/HMR）
- **UI 插件区**：已加载 bundle 列表（用户 + 内置），行内「停用/启用」切换 Loader 树 `disabled` 标记；
  「安装 bundle 插件」经 `pnpm add` 把新 bundle 加进 profile 层栈

## AI 插件管理工具（agent 面）

面板之外，Node half 注册 4 个 agent 工具（`defineTool`，与面板写同一安装态）：

| 工具 | 参数 | 行为 |
|---|---|---|
| `plugin_search` | `query?`, `source?`, `refresh?` | 搜源集合（缓存枚举）；`source` 给定新源（`github:owner/repo#ref`、索引 JSON 文件/URL、npm bundle）→ 懒加载探测并记住 |
| `plugin_install` | `source` | 官方格式源直装；已装则更新 ref；repository 走 `repositories` 行（禁裸分支，需精确 ref），bundle 走 `pnpm add` |
| `plugin_uninstall` | `id` | 删安装态行（短 id 或 `owner/repo` 均可；清单保留可再装） |
| `plugin_status` | `id?` | 无参 list 已装；有参单查（含 TOFU resolved ref） |

发现层存储（协议见 [plugin-discovery-design](../../../docs/plugin-discovery-design.md)）：

```
$DSH_HOME/plugin-sources/
├── sources.yml      # 源集合（用户可编辑；index/manifest/single 三类型 + trust 层级）
├── lock.yml         # TOFU：canonical → resolved commit + 内容哈希
└── cache/<源id>/    # 每源枚举快照（TTL 6h；single 探测 1h，防 GitHub 限流）
```

index 源支持本地文件（`file://…/plugins.json`）——私有 hub 仓库匿名 raw 不可达时读本地 clone。
web 面板刷新即见 agent 写入结果（同文件，不实时推送）。

## 生效方式

web 默认无运行中 HMR（官方 TODO），面板写配置后**重启 web 生效**；官方启用 web HMR 后自动事务性换代。
Node half 改动需重启 web（ESM 缓存）；client 面板改动重装 + 刷新页面即可。

## 开发插件（引导）

创建官方 repository-plugin 的完整契约见
[cookbook/creating-a-repository-plugin](../../../docs/cookbook/creating-a-repository-plugin.md)；
agent 工作流引导见 [make-dsh-plugin skill](../../../skills/make-dsh-plugin/SKILL.md)。
参考实现：`whale-girl`。
