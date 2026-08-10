# 设计：插件发现层（AI-native 插件管理）

状态：**设计定稿（2026-08）**，待实现。目的：给 agent 一个发现与安装插件的协议面——官方只定义了**安装态**，没有"有哪些插件可装、元数据在哪"的**发现层**；本协议定义源集合、枚举、缓存与信任，让 `plugin_search` / `plugin_install` 等工具可落地。设计依据来自主流包管理器（apt / Homebrew / Go / npm / cargo / MCP Registry），对照结论见文末。

## 背景与定位

官方基线（0809 起）只定义安装态：

- **repository 插件**：`$DSH_HOME/cordis.patch.yml` 的 `repository-plugins.repositories` 行，源格式 `github:owner/repo#<精确ref>&path:/.dsh-plugin`，官方 RepositoryCache clone + prepare + 事务性换代
- **bundle 插件**：profile 层栈，`dsh plugin --profile web add <pkg>`（pnpm forwarder + reconcile）

官方 **config-only 决策明确拒绝** install 命令与「注册表/安装数据库/市场/发现索引」。组织 hub 索引（`plugins.json`，204 仓库，2h 自动刷新）是泛仓库列表（含非插件仓库），非官方格式，不宜直接当插件源。

**定位**：发现层是 agent 工具面（`defineTool` 注册的 `plugin_*` 工具）与 console 面板（人操作面）共享同一安装态的**读侧**。安装态始终留在官方位置（`cordis.patch.yml`）；发现层只回答"能装什么、怎么装、可不可信"。

## 存储：`$DSH_HOME/plugin-sources/` 域根

配置与派生数据分离（apt 同构：sources.list 配置 / var/lib/apt/lists 快照）：

```
$DSH_HOME/
├── cordis.patch.yml              # 安装态（官方位置，发现层不动）
├── cache/repository-plugins/     # 官方 RepositoryCache（不动）
└── plugin-sources/               # 发现层域根（本协议拥有）
    ├── sources.yml               # 源集合（用户可编辑的唯一配置入口）
    ├── lock.yml                  # TOFU：canonical-source → resolved-commit + content-hash
    └── cache/<source-id>/        # 每源枚举快照（entries + etag + fetchedAt，机器产物）
```

- 命名 `plugin-sources/` 而非 `plugins/`：后者与旧 registry 的 `~/.dsh/plugins/` 安装目录同名易混
- 一个目录一个域：备份/迁移/重置（删目录即清发现层）不影响安装态

## 源集合与源类型

`sources.yml` 每条目：

```yaml
sources:
  - id: hub
    kind: index                          # 读现成索引文件（hub plugins.json / 任何 catalog）
    locator: https://raw.githubusercontent.com/dsh-external/hub/main/plugins.json
    trust: official                      # official / community / untrusted
  - id: my-plugins
    kind: manifest                       # 用户手写清单
    locator: file://$DSH_HOME/plugin-sources/my.yml
  - id: whale-girl
    kind: single                         # 单仓库直引
    locator: github:dsh-external/whale-girl#<ref>&path:/.dsh-plugin
    trust: official
```

- **index**：hub 即组织默认源（富化层——只做分类/描述，`dsh.*` 字段仍是身份与安装语义的权威）
- **manifest**：个人源（几个仓库的手写清单）
- **single**：单仓库直引，探测单插件元数据
- 每源带 `trust` 层级——agent 自动安装第三方前的供应链防线（一行字段的成本）

## 枚举与缓存

| 对象 | 频率 | 策略 |
|---|---|---|
| 索引枚举（插件列表） | 低频 | 每源 TTL 6h + ETag 条件刷新（与 hub 2h 自刷新对齐）；快照按源分目录 |
| 单插件探测（元数据） | 触发式 | **懒加载**：用户/agent 指定新源才探测；1h 缓存 + 按仓库去重 |

懒加载探测是硬约束：GitHub 匿名 API 限流 60 次/h/IP——一轮搜索 10 个插件即打满配额。离线时过期快照仍可枚举，`plugin_search` 结果标注 stale。

## 信任模型

1. **官方源格式 + 禁裸分支**：只允许 commit SHA 或 tag；install 时把解析出的 commit **固化**进 lock.yml（TOFU 语义，Go go.sum / Nix flake.lock 同构）
2. **内容哈希**：lock.yml 记录 canonical-source → resolved-commit + content-hash（cargo cksum 式），防"同一 ref 内容漂移"
3. **trust 层级**：安装前可见来源层级（official/community/untrusted）
4. **多源 = first-index**：安装源即身份；按 canonical owner/repo 去重；不同来源的同名插件**并列**展示、以用户指定源为准——**禁止跨源合并候选池**（pip `--extra-index-url` 是 dependency confusion 根源，见 PEP 766）
5. **不做**：GPG 签名与透明日志（官方源无信任事故前不加；Maven 镜像承接信任的教训是此类机制对无中心生态性价比极低）

## 工具语义（4 个，注册进 console Node half）

| 工具 | 参数 | 行为 |
|---|---|---|
| `plugin_search` | `query?`, `source?`, `refresh?` | `source` 给定 → 把该源加入源集合（若新）→ 枚举（懒加载探测 / 缓存命中 / refresh 强制刷新）→ 过滤返回 |
| `plugin_install` | `source` | 官方格式源直装；已装则更新 ref；解析并固化 resolved commit 到 lock.yml；装过的源自动入 sources.yml |
| `plugin_uninstall` | `id` | 删安装态行（清单保留，可再装） |
| `plugin_status` | `id?` | 无参 = list 安装态；有参 = 单插件状态 |

## 设计依据（包管理器对照摘要）

| 模式 | 来源 | 落点 |
|---|---|---|
| 源集合 + 优先级/信任层 | apt sources.list + pinning、PEP 766 | sources.yml 多源 + trust |
| 配置/快照分离 | apt（sources.list vs /var/lib/apt/lists） | sources.yml vs cache/ |
| 包自描述为权威，中心只富化 | npm packument、Homebrew formula | `dsh.*` 字段权威，hub 富化 |
| 枚举与详情分离 | cargo sparse index、npm 精简 packument | 缓存存精简态，详情走探测 |
| TOFU + 双记录 | go.sum + sumdb、cargo cksum + lock | lock.yml resolved + hash |
| 精确身份 = 内容寻址锁定 | GitHub Actions SHA pinning、Nix flake.lock | 禁裸分支 + resolved commit |
| 元数据注册表与代码分发分离 | MCP Registry、Open VSX | hub = 元数据注册表（富化层） |
| 多源防混淆 | pip dependency confusion 教训 | first-index，不合并候选池 |
| 探测缓存防限流 | GitHub REST rate limits | 懒加载 + 1h 缓存 + 按仓库去重 |

## 决策记录

- 形态：**tool 方式**（4 个 `plugin_*` 工具），不引入 skill（skill 是工作流编排层，工具是原子能力）
- 宿主：console Node half（复用 `writeRepositories` / `reconcileBundles` 已验证逻辑）
- 存储：单层 `sources.yml`（不做内置 + 用户两层合并）+ `lock.yml` + `cache/` 派生数据
- 不追求实时反映 UI（面板刷新即可见，agent 写入与面板写同一文件天然一致）
- 发现层不做：诊断/推荐工具（保持精简）、GPG 签名/透明日志
