# 设计：插件发现层（AI-native 插件管理）

状态：**设计定稿（2026-08）**，待实现。目的：给 agent 一个发现与安装插件的协议面——官方只定义了**安装态**，没有"有哪些插件可装、元数据在哪"的**发现层**；本协议定义源集合、枚举、缓存与信任，让 `plugin_search` / `plugin_install` 等工具可落地。设计依据来自主流包管理器（apt / Homebrew / Go / npm / cargo / MCP Registry），对照结论见文末。

## 背景与定位

官方基线（0811 起）只定义 web profile 安装态（repository-plugins 机制已移除）：

- **bundle 插件**：profile 层栈，`dsh plugin --profile web add <pkg>`（pnpm forwarder + reconcile），重启生效
- **纯 cordis 插件**：profile `cordis.patch.yml` insert 行，配置 HMR 实时生效

官方 **config-only 决策明确拒绝** install 命令与「注册表/安装数据库/市场/发现索引」。组织 hub 索引（`catalog.json`，241 仓库，2h 自动刷新）是泛仓库列表（含非插件仓库），非官方格式，不宜直接当插件源。

**定位**：发现层是 agent 工具面（`defineTool` 注册的 `plugin_*` 工具）与 console 面板（人操作面）共享同一安装态的**读侧**。安装态始终留在官方位置（`cordis.patch.yml`）；发现层只回答"能装什么、怎么装、可不可信"。

## 存储：`$DSH_HOME/plugin-sources/` 域根

配置与派生数据分离（apt 同构：sources.list 配置 / var/lib/apt/lists 快照）：

```
$DSH_HOME/
├── profiles/web/cordis.patch.yml # 安装态（profile patch 层，发现层不动）
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
    kind: index                          # 读现成索引文件（hub index.json）
    locator: <hub index.json 的 URL>
    trust: official                      # official / community / untrusted
  - id: my-catalog
    kind: index                         # 本地 catalog 文件（hub clone 或手写）
    locator: file://$DSH_HOME/plugin-sources/catalog.json
    trust: community
```

- **index**：hub 即组织默认源（富化层——只做分类/描述；条目 `source` 直接是 npm 包名，bundle 插件，可原样喂给 `plugin_install`）
- 每源带 `trust` 层级——agent 自动安装第三方前的供应链防线（一行字段的成本）
- **0811 起**：外部插件统一是 npm 包（bundle 或纯 cordis），发现层只保留 index——读 hub `index.json`（`plugin-sources/index/v1`，`plugins` 数组，非旧 `catalog.json` 的 `repos` 格式）

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
| `plugin_search` | `query?`, `source?`, `refresh?` | `source` 给定 → 把该源加入源集合（若新）→ 枚举（缓存命中 / refresh 强制刷新）→ 过滤返回 |
| `plugin_install` | `source` | npm 包直装：声明 `dsh.bundle` → pnpm add + 层栈（重启生效）；纯 cordis → pnpm add + insert 行（实时挂载）；TOFU 固化到 lock.yml |
| `plugin_uninstall` | `id` | 删 insert 行（实时）或 bundle 依赖（重启生效）；清单保留，可再装 |
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

## 实现同步（2026-08，落地后补充）

- **已实现**（0811 适配）：4 工具注册（`inject tools` + `ctx.tools.register`）；`src/discovery/{store,enumerate,tools,types}.ts`；web boot 日志 `registered plugin tools` 实证；34 项 node:test
- **0811 适配**（repository 机制移除后重写）：
  - `enumerate.ts` 删 `single`（github raw 探测）/`manifest` 源，仅保留 `index`
  - `store.ts` 源 kind 收紧为 `index`；lock kind 收紧为 `bundle`/`plugin`
  - `plugin_install` 按包是否声明 `dsh.bundle` 分流：bundle → pnpm add + 层栈（重启生效）；纯 cordis → pnpm add + insert 行（配置 HMR 实时挂载，零重启）
  - `index` 源 locator 支持**本地文件**（`file://` 或裸路径）——hub 仓库为私有，匿名 `raw.githubusercontent` 404，本机经 hub clone 的 `index.json` 走本地通道（hub 2h 自动刷新同步）
  - 测试管线用 **node:test + tsx**（vitest 4/vite 8 与 vite 7 的 NodeNext 解析在独立包环境不兼容；`tests/tsconfig.json` paths 把未发布的 `@deepseek-ai/dsh-tools` 映射到 stub）
- **0813 适配**（格式统一）：`enumerate.ts` 从读 hub `catalog.json`（`repos` 格式，`source` = `github:owner/repo`）改为读 hub `index.json`（`plugin-sources/index/v1`，`plugins` 格式，`source` = npm 包名）——`plugin_search` 产出的 `source` 与 `plugin_install` 的入参一致，search→install 闭环打通；`PLUGIN_ITEM` schema 补 `trust`（修复 open issue #2）；hub `generate.mjs` 的 index 改 bundle-only（删死掉的 `repository` kind）
