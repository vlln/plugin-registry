# Changelog

本仓库（plugin-registry：薄控制台 + 文档 + skill）的变更记录。机制件改动在官方 snapshot 宿主仓库的历史机制分支按提交记录（0809 转向后不再有机制件），本表汇总交付。

## 2026-08（0817 安装源规范化——修 #19 / #4 假成功部分）

`plugin_install` 入参格式统一：完整 GitHub URL 不再 502 / 假成功。新增 `src/source.ts`（工具面与 HTTP 面共用，消除两处行为分叉）：

- ✅ **`normalizeSource`**：`https://github.com/o/r`（含裸 `github.com/o/r`、`www.`、`.git` 后缀、`/tree/<branch>` 网页路径）规范化为 `github:o/r` 速记——与 pnpm 装完的依赖值同形态，`resolveInstalledName` 依赖值匹配不再落空（修 #19：`pnpm add succeeded but ... is not in the profile dependencies` 502）；保留 `#ref`（含 `&path:` 子目录），npm 包名 / `github:o/r` / `link:` 原样透传
- ✅ **工具面失败显式化**（修 #4 假成功部分）：`plugin_install` 在 `bundleInstall` 返回 null（pnpm 失败）时抛错而非继续报成功；并改为从 profile 依赖解析真实包名后再判别 bundle/insert 落点（与 HTTP 面一致，URL 源不再把源串当 canonical 写 lock/insert）
- ✅ **测试**：新增 `source.spec.ts`（normalize 8 例 + resolveInstalledName 4 例）、`tools.spec.ts` 补 URL 归一化 / pnpm 失败抛错 / 依赖解析失败抛错 3 例；全套 50/50 node:test 通过；`lib/` 重建（产物入库）
- 🧹 **清理**：误留的 `packages/bundle/` 构建产物与 `packages/plugin/console/pnpm-workspace.yaml`（pnpm 11 交互提示误写）删除并 .gitignore 忽略；**lockfile 补 `@types/node`**（package.json 已声明但 lockfile 缺失，frozen 安装会失败——早前本地改动实为合法补丁）

## 2026-08（0813 格式统一——发现层读 index.json，source = npm 包名）

官方「正式版」npm 公开发布（`@deepseek-ai/*` 全家族公开，`@deepseek-ai/dsh` latest `0.1.0-rc.6`）后，修掉发现层「格式还是最老」的问题——枚举半拉停在 0811 之前的 git 源格式（`github:owner/repo`），与安装半拉的 npm 格式（`plugin_install` 入参 = npm 包名）不一致。

- ✅ **`enumerate.ts` 重写**：index 源从读 hub `catalog.json`（`repos` 格式）改为读 hub `index.json`（`plugin-sources/index/v1`，`plugins` 格式，`source` = npm 包名）；删 `parseGithubUrl`/`hubRepoToPlugin`/`facesOfDsh`，新映射 `indexEntryToPlugin` 只收 `bundle`（跳过已死的 `repository` kind），`id` 取 `source`（与 `plugin_install`/`plugin_status` 的 canonical 一致）
- ✅ **`tools.ts` 修 issue #2**：`PLUGIN_ITEM` schema 补 `trust`（`official|community|untrusted`），`plugin_search` 描述改 index 格式
- ✅ **hub `generate.mjs`**：index 改 bundle-only（删 `repository` kind，`.dsh-plugin` 已随 0811 移除），修 doc drift（注释曾指向不存在的章节）
- ✅ **测试重写 + 产物重建**：enumerate/tools 测试改 index.json plugins fixture；32/32 node:test 通过；`lib/` 重建（产物入库）
- ⚠️ **发现（另案）**：hub 重生成暴露单组织假设崩溃——大量仓库已迁出原组织（whale-girl/dsh-loop → `vlln/`，deepseek-manners → `Moeblack/` 等），generator 看不到迁出插件 → `index.json` 从 117 bundle 掉到 62。单组织 index 无法表达多 owner 分发，需另按「sources 多源」处理

## 2026-08（0812 基线适配——大规模服务重命名）

官方发布 0812 快照（`snapshot-20260812T172954Z-final-unwatermarked-5fa48343c7`，提交 `40d214ce`，4548 文件大版本）后适配薄控制台。**0812 契约变化：大规模服务重命名**（17 个服务名变更）——`httpServer`→`webServer`、`tasks`→`jobs`、`bash`→`shell`、`compact`→`compaction` 等；`repository.ts` 无回归（0811 删除保持）。

- ✅ **console 适配**：`inject` 的 `httpServer`→`webServer`；`ctx.httpServer`→`ctx.webServer`（`webServer.register` 路由接口不变，仅服务名改）
- ✅ **生态适配**（外部插件仓库同步）：whale-girl + dsh-task-status 改 `webServer`+`jobs`（`onTaskDone`→`onJobDone`）；dsh-loop 改 `webServer`；dsh-navbar 纯 client 无服务依赖不改
- ✅ **端到端验证（纯净 0812 + 构建产物）**：`dsh plugin --profile web add` 挂载 console + 4 插件 → 5 用户插件全激活 → client 全进 `__DSH_BOOT__` → 路由 200 → boot 无 `plugin tree failed to load`
- **构建坑（0812 实证）**：本地仓库 symlink 官方包后 tsdown 会**误内联**依赖（lib 从 242 行膨胀到 7036 行）——Node half 的 tsdown 配置须显式 `external: [/@deepseek-ai\//]`（官方包由 profile 闭包注入，不内联）

## 2026-08（0811 基线适配——repository 机制移除 → profile patch 双通道）

官方发布 0811 快照（`snapshot-20260811T152241Z-da262ec14c`，提交 `62480c41`，3430 文件大版本）后适配薄控制台。**0811 契约断裂**：官方 `vendor/loader/src/repository.ts` 删除（−258 行），`repository-plugins.repositories` 机制整体移除——`plugin_search`/`plugin_install`/`plugin_uninstall`/`plugin_status` 四个工具与面板「repository 插件源」区的官方后端不复存在。

- **新契约确认**：外部插件只有 profile 一条官方路径——bundle 插件（npm 包声明 `dsh.bundle`）经 `dsh plugin --profile web add` 进 `dsh.profile.bundles` 层栈（重启生效）；非 bundle 插件（纯 cordis 插件）经 profile `cordis.patch.yml` 的 insert 行挂载。**0811 保留配置级 HMR**（web-app 禁用模块级 hmr 时 profile-boot 主动挂载 watch-only 实例，`profile-boot.ts:287-301`）——编辑 profile/home `cordis.patch.yml` **实时生效，无需重启**（已实测 insert 行写入即时挂载）
- ✅ **console 重写**：`src/index.ts` 删 repository 机制（repositories 行读写、RepositoryCache 枚举、git ls-remote 更新检查），保留 bundle 管理（pnpm add/update/remove + reconcile 层栈）与 disabled 持久化；**新增 insert 行管理**（`readInsertRows`/`writeInsertRow`/`removeInsertRow`——写 profile patch 触发配置 HMR 实时挂载，移除后恢复 `[]` 模板）
- ✅ **模型工具重写**：`plugin_search` 改搜 hub catalog（index 源）；`plugin_install` 按包是否声明 `dsh.bundle` 分流——bundle → pnpm add + 层栈（重启生效），非 bundle → pnpm add + insert 行（**配置 HMR 实时挂载，零重启**）；`plugin_uninstall` 对称；`plugin_status` 列 insert 行 + TOFU lock
- ✅ **client 面板适配**：删「repository 插件源」区，新增「insert 插件」区（包名输入 → 实时挂载/移除），保留已加载插件启停与 bundle 安装区
- ✅ **发现层简化**：`enumerate.ts` 删 single（github raw 探测）与 manifest 源，仅保留 index（hub catalog）；`store.ts` 源 kind 收紧为 index，lock kind 收紧为 bundle|plugin
- ✅ **端到端验证（纯净 0811 + 构建产物）**：`dsh plugin --profile web add` 挂载 console → 4 工具注册日志 → `/api/plugin-console/inserts` 写行 → web 日志 `[HMR-PROBE] applied`（**实时挂载，无重启**）→ 移除行 → patch 恢复 `[]` 模板 → disabled 启停 runtime+persisted → boot 无 `plugin tree failed to load`
- **注意（0811 实证）**：insert 行 `name:` 必须加引号（YAML `@` 开头是保留指示符，裸写解析失败 HMR 不生效）；移除最后一个 insert 行后必须恢复 `[]` 模板（纯注释文件解析为 null，HMR reload 失败）

## 2026-08（0810 基线适配——dshClient → dsh.client）

官方发布 0810 快照（`snapshot-20260810T155924Z-8ec407cd64`，提交 `5521ff5f`，3947 文件大版本）后适配薄控制台：

- **契约变化**：官方 client 插件声明从 `dshClient` 迁移为 `dsh.client`（**原 `dshClient` 不再识别**）；官方内部另有 `SessionsService` 构造三参、tasks `ScopedLayers` 分层等变化（不触及 console）
- ✅ **console 适配**：`packages/plugin/console/package.json` 的 `dshClient` 声明并入 `dsh.client`；README 与当前契约文档（`docs/plugin-types.md`、`docs/console-ui-plugin-management.md`）术语同步；plugin-types 安装行纠正为 `cordis.patch.yml`（官方 0805 起用户配置层）
- ✅ **端到端验证（纯净 0810 + 构建产物）**：`dsh plugin --profile web add` 挂载 → boot graph 含 `plugin-console/client.js`（`dsh.client` 被官方 client-modules 正确扫描识别）→ `/api/plugin-console/repositories` GET/POST 读写 `$DSH_HOME/cordis.patch.yml` 正常 → boot 日志无 `plugin tree failed to load`
- **机制分支终态**：`feat/plugin-registry-mvp-0808` 冻结退役不再演进（0809 转向起）；旧机制 patch 分发已随转向移除，无 patch 重建动作

## 2026-08（转向薄控制台——阶段 2/3 交付）

官方 0809 覆盖度评估（[official-0809-coverage](docs/official-0809-coverage.md)）结论：官方仓库插件机制（`.dsh-plugin` + config + 事务性换代）覆盖 plugin-registry 独立机制的 ~95%，进入转向期。**当前状态：薄控制台已交付，旧机制已移除。**

- ✅ **薄控制台**（`packages/plugin/console`）：0 patch 管理官方 repository-plugins——bundle 挂载 + Node half 读写 `$DSH_HOME/cordis.patch.yml` + client half 设置页面板。端到端验证（纯净 0809）：挂载 → boot graph 含面板 → 读写路由 → 写后官方消费
- ✅ **spike 实证**：写 config 触发官方换代 0 patch 可行；web 默认无运行中 HMR（官方 TODO），写后提示重启
- ✅ **开发规范引导（skills/cookbook）**：`make-dsh-plugin` skill 重写为官方 repository-plugin 开发引导（废弃旧机制教学）；新增 `docs/cookbook/creating-a-repository-plugin.md` 权威契约（仓库布局/entry/prepack/安装/开发规范）；console README 链接引导——「薄控制台 + 开发规范引导」定位落实
- ✅ **examples 改为安装示例**：删除 4 个旧机制插件示例（greeter/loop/navbar/task-status，`dsh.plugin.json` 已废弃）；`examples/README.md` 重写为「如何安装外部插件」——bundle 路径（`dsh plugin --profile web add`，loop/task-status/navbar）+ repository 路径（`config.yaml`，whale-girl）+ 薄控制台管理；README/AGENTS/活文档 examples 引用清理（历史文档保留）
- ✅ **skill 重命名 make-dsh-plugin + 插件类型对比文档**：`plugin-registry-create` → `make-dsh-plugin`（目录/frontmatter/全部引用同步）；新增 [docs/plugin-types.md](docs/plugin-types.md)——repository 插件 vs bundle 插件四维对比（形态/开发/分发/安装/管理）+ 选型判据 + 依赖解析（官方包未发布）
- ✅ **README 整理 + release 清理**：删除 v0.1.0 release（旧机制 patch 分发，转向后失效）；console 安装命令改指 `packages/plugin/console` 子目录；删「安装其他插件」章节（生态关系段保留 examples 链接）；Agent Skill 段落改表格（make-skill 规范）；skill 补「README 用表格列 skill」约定
- ✅ **旧用户迁移引导**：README 加「旧机制插件迁移」章节（方向判断表 + 链接权威指南）；新增 [cookbook/migrating-legacy-plugins](docs/cookbook/migrating-legacy-plugins.md)——旧插件按现状分两条路径迁移（官方包+增量清单→bundle；纯旧机制→repository，whale-girl 范本），含分面迁移表 + 执行步骤 + 迁移后注意
- ✅ **skill 补 GitHub 发布规范**：make-dsh-plugin 加 Step 5b——仓库 description 写法模板（DSH plugin: <功能>; install via config.yaml <ref>）、仓库标签建议（dsh/dsh-plugin/dsh-repository-plugin/deepseek-harness + 能力/领域标签）、发布检查清单（entry/prepack/门禁/README/安装冒烟）；按规范补齐 whale-girl 与 plugin-registry 的 GitHub description/topics
- ✅ **skill README 规范扩展**：make-dsh-plugin 的 README conventions 从「列 skill」扩展为「列全部能力面用表格」——Skills（`| Skill | 作用 |`）+ MCP servers（`| MCP | 说明 |`，若含 `dsh.mcpServers`）+ Tools（`| 工具 | 说明 |`，若注册工具）
- ✅ **skill 自包含化**：make-dsh-plugin 不再依赖仓库 docs——cookbook 内容并入 references/entry-contract.md（布局/dsh 字段/entry/skills/mcpServers/Cordis/自渲染/安装/开发规范），新增 references/bundle-plugins.md（bundle 插件开发详情：dsh.bundle/dshClient/cordis.patch.yml/依赖解析/安装管理），3 个旧 references 去掉 cookbook 依赖；Step 0 形态表补 bundle 行；用户只装 skill 即可完整开发两类插件
- ✅ **make-dsh-plugin SKILL.md 中文化**：正文散文转中文（专有/特殊名词保留英文：repository-plugin/Cordis/defineTool/dsh.*/prepack/ESM/MCP/frontmatter/references 文件名等）；references 本就是中文（entry-contract 标题同步）。SKILL 265→237 行
- ✅ **旧机制已移除（独立一步，46ac846）**：patch 加载（0808）、`dsh registry` CLI、`ctx.plugins`、`ui-plugin-manager` 旧面板、patches/ 目录全部删除，仅留薄控制台
- 澄清：官方用户配置层为 `$DSH_HOME/cordis.patch.yml`（08-05 取代 `config.yaml`）

## 基线

本仓库已转向 **0 patch 薄控制台**（0809 起，见上方「转向」条目）：不再构建「官方基线 + patch + package」，故原「机制分支基线 / patch 基线」标注随转向退役，仅作历史记录保留：

- **当前基线**：官方 0812 快照（`snapshot-20260812T172954Z-final-unwatermarked-5fa48343c7`，提交 `40d214ce`）——薄控制台 webServer 适配 + 端到端验证通过（见上方 0812 条目）；前基线 0811（`62480c41`）双通道验证通过保留供对照
- **历史机制分支基线**：官方 0808 快照（`20260808T121140Z`，提交 `57ffa9de`）——机制分支 `feat/plugin-registry-mvp-0808` 已冻结退役（0809 转向后不再演进）
- **历史 patch 基线**：`patches/dsh-plugin-registry-0808.patch` 基于官方 0808 快照（49 文件，纯平台接线：CLI `dsh registry` 子命令、apiproxy `plugins` 域、client-modules `registerExternal` + 碰撞守卫、host 帧 `client-graph-changed` 自动刷新（Stage 1 起携带完整 graph）、浏览器端 graph diff 应用器（启停不整页刷新）、tasks/bash 非消耗式 `peek` seam、依赖闭包；不含复制分发包 `packages/plugin`、`packages/client/ui-plugin-manager`）；旧 0807/0806 patch 保留供对应基线追溯。**patch 瘦身（49→5）计划已随 0809 转向废弃**（机制件整体移除，无 patch 可瘦身），设计稿见 [patch 瘦身设计](docs/patch-slimming-design.md)（历史文档）

## 2026-08（patch 瘦身设计定稿：49 → 5 迁移清单 + 文档契约）

审计 0808 patch 的 49 个文件，按「是否必须进官方树」分四类：A 纯新增文件（12，本就不该在 patch）、B 可 0 侵入替代（15，面板自建路由可达同等能力）、C 构建接线（6，随 A/B 外置消失）、D 必须改官方源码（5，CLI 接线 + `registerExternal` 硬核）。定稿迁移清单与能力 0 下降证明：

- **新增**：[patch 瘦身设计](docs/patch-slimming-design.md)（每文件去向、能力对比、验证点）
- **文档契约同步**：distributing-plugins「形态二」patch 范围契约重写（scope 收敛为硬接线 + 指向设计稿）；integrating-into-dsh 复制列表/补丁描述更新；install-into-dsh.mjs 注释与复制结构更新（实现分发包清单占位）；architecture「web 边界」补实现分布说明
- **doc-budgets**：注册新设计稿预算（9000）
- **能力影响**：零（A/B/C 全为内容搬家，D 两条硬接线保留）

## 2026-08（热更新 Stage 1：启停插件不再整页刷新）

registry UI 插件的「近似热更新」升级为**真热更新（增删路径）**：启停/升级 client half 插件时浏览器不再整页 reload。

- **服务端**（apiproxy）：`host/client-graph-changed` 帧从纯信号改为携带完整 entry 表（id/url/rev，`ClientGraphEntryView` + zod schema）；`onGraphChanged` 回调推当前 graph（跨 isolate 读 `clientModuleHost.graph()`）
- **浏览器端**（runtime + modules）：`ClientModuleSystem.addRow`（运行期注册新 graph row；rev 变化 invalidate 旧 bundle——升级场景自动覆盖）；runtime `onHostEnvelope` 转 `client/graph-changed` 事件 → `applyClientGraph` 应用器 diff loader 树（added → addRow + create / re-activate，removed → disabled in place；串行 + 失败 self-heal）；manager 移除 `window.location.reload()`
- **验证**：机制分支 798 既有测试 + 新增（modules addRow、events schema、runtime diff 应用器）；验证站 web 启动无错；浏览器 UI 端到端（面板内启停不刷新）为后续人工/自动化验收
- 设计细节与 spike 证据见 [热更新设计](docs/hot-reload-design.md)

## 2026-08（v0.1.0 release + 一键安装修复）

首次 GitHub Release（tag `v0.1.0`），基线 = 官方 0808 快照（`20260808T121140Z`，commit `57ffa9de`）。

修复一键安装路径的真实缺陷：patch 重建时把复制分发包 `packages/client/ui-plugin-manager`（13 文件）误打进 `patches/dsh-plugin-registry-0808.patch`（0807 同病，0806 正常），而安装流程（install-into-dsh.mjs / 手动集成）都是**先复制 packages 再 git apply**——补丁新增文件与复制文件重叠，`git apply` 报 `already exists in working directory` 直接失败。已按机制分支 `feat/plugin-registry-mvp-0808` 重新生成 patch（41 文件，与旧 patch 其余部分逐字节一致），并补上真实安装顺序的验证点（先复制后 apply）。README「安装 registry」补 git clone 与 release 双路径。

## 2026-08（0808 基线升级）

官方发布 0808 快照（`snapshot-20260808T121140Z-7f25d3e98c`，1248 文件变更）后升级：契约评估（slots 注入 API / HostFrame / ctx 服务名 / profile-bundle 均未变；**web 形状组合变化**——tool 展示从单一 `conversation.chat.toolview` 重构为 `conversation.chat.tool`（whole-call seat）+ `tool.call.toolview`（per-call 子槽）+ `conversation.details.tool`（详情委托），机制分支未触碰这些槽，分发层示例所用 `conversation.chat.turnTail` / `conversation.input.dock` 均保留）→ 0808 验证站 3way 应用 0807 patch（仅 args.ts 冲突，手工并入官方新增 `RunInvocation`）+ CLI registry list / web 插件面板 / 插件 client.js 全验证 → 机制分支重放（`feat/plugin-registry-mvp-0808`，cherry-pick 冲突仅 args.ts 一处；api-proxy session 代理/恢复重构与 plugins 域自动合并共存；125 测试全过）→ 重建 0808 patch（54 文件，纯净基线 `git apply --check` 通过）。

0808 官方新增 `dsh run` 子命令（headless 一次性任务）与 typert 域包；tool 槽重构属 ui-conversation/ui-tool 包内组合变化，不影响 registry 机制契约。

## 2026-08（0807 基线升级）

官方发布 0807 快照（`snapshot-20260807T130646Z-e8a0f1a758`，551 文件变更）后升级：契约评估（slots/HostFrame/profile-bundle/ModuleLoader/manifest 均未变，DOM 锚点保留，tasks/bash 仅 pwsh 格式改动）→ 0807 验证站 3way 应用旧 patch + 127 测试全过 + web 端到端验证 → 机制分支重放（`feat/plugin-registry-mvp-0807`，适配 `ApiProxyDefaults.provider/model → defaultTarget` 闭包）→ 重建 0807 patch（54 文件，纯净基线 `git apply --check` 通过）。

0807 官方已吸收部分机制文档（`services.md` 的 `BashProcess.peekOutput` 行等）；官方新增 `ui-skill` 包（含 locale 路径引用 bug，非机制引入）。

## 2026-08（任务输出 tail 零竞争：tasks.peek）

task-status 实时 tail 与官方 `task_output` 工具的读取竞争问题（`tasks.read` 游标全局 per-task，自动轮询会抢走工具增量）的根治：官方 seam 新增**非消耗式读取**，插件 tail 与工具读取互不干扰：

- **seam（机制分支）**：`TaskService` 抽象 `peek(id, caller?)`（返回保留输出，不推进游标、不标记 reported——终态通知仍由首次消耗式 read/wait 交付）；`TaskHooks` 可选 `peekOutput?()`（缺省回退到与 `read` 一致的终态幂等输出）；`BashProcess.peekOutput()`（bounded 保留窗口非消耗视图，lossy/spill 语义与 `readOutput` 一致），bash-local / pwsh-local 实现，tool-bash 接线
- **示例**：task-status Node half 输出路由改 `ctx.tasks.peek`，client 由「增量追加」改「整段替换」渲染（peek 重复轮询返回同一全文）；展开卡去冗余行/去包裹层，新增双契约回归测试（`task-status.client.spec.ts`：旧增量契约追加累积 + peek 全文契约整段替换）
- **验证**：纯净 0806 基线集成验证——peek 非消耗（重复轮询同文本）、官方 read 在多次 peek 后仍读完整增量、peek 始终显示保留全文


## 2026-08（插件启停自动刷新）

registry enable/disable 通过 `registerExternal`/`unregisterExternal` 改变 client-modules graph；boot manifest 页面加载时固定，故 apiproxy 在 host 流推送纯信号帧 `host/client-graph-changed`，浏览器收到后 `location.reload()` 拾取新 `__DSH_BOOT__`：

- **host 侧**：`events.ts` HostFrame union 加 `{ type: 'host/client-graph-changed' }` + schema；api-proxy 的 events.host disposers 订阅 `clientModuleHost.onGraphChanged`（跨 isolate 走 `ctx.root`，与 plugin service 一致）
- **client 侧**：`manager.ts` 收到该帧 → `window.location.reload()`
- **验证**：WebSocket 连 `/api/events.host`，`plugin.disable/enable`（有 client half 的插件，如 greeter）→ 立即收到 `client-graph-changed` 帧（先于 RPC 响应）；无 client half 的插件（如 loop）不触发（`unregisterExternal` 无行可删，正确行为）


## 2026-08（0806 对齐的架构修复）

架构审查发现的 3 个问题修复：

- **🔴 bundle 安装死路**：registry bundle 不再声明 private 包依赖（@deepseek-ai/dsh-plugin 等未发布，npm 解析必败）；`@deepseek-ai/dsh-client-ui-plugin-manager` 加入 apps/cli 依赖闭包（0806 patch），bundle 的 insert 行经 profile 依赖 fallback（`healProfilesModuleFallback`）解析——`dsh plugin --profile web add <bundle>` 路径跑通
- **🟠 双装互斥扩展**：plugin-local mount 时检查 `<dshHome>/profiles/*` 的 `dsh.profile.bundles`，同一包已作为 bundle 层安装则拒绝（补 registerExternal 的 Loader-entry 守卫覆盖不到的 bundle 层场景）
- **🟠 分发侧同步 0806**：repo 的 ui-plugin-manager 客户端 `deferRegistration → ctx.slots.inject`（0806 slots 契约）；install-into-dsh.mjs、integrating-into-dsh、uninstalling-plugins、distributing-plugins、AGENTS、architecture 全部 0805 → 0806 基线 + bundle 化流程
- **依赖解析分工**（architecture.md 记录）：profile 闭包服务组合内服务，deps-link 只服务动态插件，不重叠

## 2026-08（deps-link 增强：pnpm 虚拟 store 公共层）

`ensureDepsLink` 的目标从「checkout 顶层 node_modules」改为「**pnpm 虚拟 store 公共层优先、顶层回退**」（`deps-link.ts` target 选择，约 6 行）：

- **修复**：pnpm 默认隔离下非提升包（node-pty/ws，仅存于 `.pnpm/` store）与 workspace/vendor 包（顶层本就不可见）现在都能经公共层解析——依赖它们的插件（如 dsh-web-terminal）经 registry 安装后不再 `ERR_MODULE_NOT_FOUND`
- **兼容**：扁平布局（node-linker hoisted）/自定义 hoist/非 pnpm 无公共层 → 存在性检查回退顶层 = 原行为；轮转重建/Windows junction/并发安全/真实目录保护全部继承
- **测试**：`deps-link.spec.ts` 补公共层优先/顶层回退/轮转重建/公共层 only 包解析 4 例
- **文档**：architecture.md 依赖解析段改「公共层优先」机制描述，删除待办表述

## 2026-08（官方插件增量兼容）

官方格式插件（npm/cordis 包）加一个 `dsh.plugin.json` 增量清单即可进 registry——bundle 零重构建、官方通道不受影响（非破坏 + 互斥）：

- **manifest id 放宽**：接受 scoped npm 包名（`@scope/name`，含 `@`/点）与原生 `publisher/name` 并存；保留 `node_modules` 负前瞻、单斜杠、禁 `..`/`?`/`#`/大写（`manifest.ts` + `manifest.spec.ts` 补正/负例）
- **碰撞守卫**：`registerExternal` 拒绝与 Loader entry 同名（防 loader 扫描 delete/重建互踩 + Node half 双挂载），官方插件走 Loader 树，registry 登记失败走 mount 回滚（官方 patch：`client/modules` registerExternal + `node-half.spec.ts` 测试反转）
- **patch 重建**：30 文件，`git apply --check` 在 0805 基线通过
- **文档**：新增 `docs/official-plugin-incremental-compat.md`（设计规范）；architecture/README/registry-client-half-design（id 碰撞不变式改显式守卫）同步

## 2026-08（缝降级：示例级缝退出官方树）

把上一轮打进官方树的**示例驱动缝**回退为插件侧自造缝——官方树只保留平台接线（第二层插件系统本身），示例数据/渲染需求由插件自己实现：

### 官方树（worktree 分支，patch 重建）

- **移除 `useTasks` 数据投影**：tasks `onChanged`/`listOwned`、apiproxy `task/snapshot` 帧 + 基线回放、client runtime task-store 全部退出官方树
- **移除 `ctx.ui.mount` 通用渲染容器**：runtime `ui-mount.ts` 服务退出官方树
- **移除零消费预留缝**：`sidebar.panel` 槽、`conversation.chat.item` chain 槽、`scoped-slots` fallback 注入、`storeInstance` 公开 API
- **patch 重建**：30 文件（26 修改 + 4 新增），`git apply --check` 在 0805 基线通过

### 示例插件（本仓库）

- **`examples/task-status`** 重写为自造缝：Node half `inject ['httpServer','tasks','agents']` 注册只读任务路由（遍历 `agents.list()` 绕过 owner fence），客户端 1s 轮询 + `conversation.input.dock` 官方槽渲染，不再依赖 useTasks/task-snapshot
- **`examples/greeter`** 重写为纯 DOM 自渲染（`createRoot` + `appendChild`），不再依赖 `ctx.ui`
- `examples/navbar` 不变（本就是纯 DOM 自渲染）

### 文档

- `docs/client-ui-extension-model.md`：S2/S3/sidebar.panel/useTasks/ctx.ui 更新为回退后状态（压缩）
- `docs/generic-client-render-container-design.md`：状态改「已回退」
- `docs/architecture.md`、根 README、examples/README：UI 扩展方向与示例描述同步

## 2026-08（plugin-registry 机制件大轮）

### 机制件（官方树，worktree 分支）

- **`sidebar.panel` list 缝**：ui-sidebar 声明侧边栏面板入口区，插件注册条目即出现入口（S5 入口机制）
- **`conversation.view` 视图环 + `ctx.conversation.setView` 通道**：session 作用域多视图切换；F1 修复（setView 写共享 store 实例）
- **`useTasks` 数据投影**：`task/snapshot` 线协议（完整快照姿势 + mux 打开基线）→ client 适配器 → session 作用域钩子（S2 数据通道）
- **`conversation.chat.item` per-item 回退缝**：ChatView 逐 flow item 分发，未命中回退官方渲染（S3 机制件；turn 折叠场景不可行，已记录）
- **`ctx.ui.mount` 通用渲染容器**：runtime `ctx.ui` 服务，overlay/floating 容器 + per-mount 独立 React root + error boundary + fiber 生命周期（统一模型第二轴）
- **官方 0805 基线对齐**：分支基线推进到官方 08-05 快照（含会话缓冲重构等），机制件在新基线验证通过

### 示例插件（本仓库）

- **`examples/navbar`**（S1）：自渲染导航条，纯 DOM 锚点契约，仅对话页显示（`[data-chat-flow=""]` 探针）
- **`examples/task-status`**（S2）：对话页对话框上方任务状态条（`conversation.input.dock` + `useTasks`），官方 token 卡片、仅对话页、完成后自动消失、点击展开详情
- **`examples/greeter`**：client half 迁移到 `ctx.ui.mount`（overlay 浮层替代自渲染）
- **`examples/turn-fold` / `examples/taskboard`**：已移除（S3 turn 折叠区间语义不可行；S5 委派台暂不做——原因记录于设计文档）

### 文档

- `docs/client-ui-extension-model.md`：统一心智模型（一个 slot 体系 + 四种匹配 + 数据投影；两轴 = 缝 + mount）
- `docs/generic-client-render-container-design.md`：通用渲染容器设计（已实现）
- `docs/registry-client-half-design.md`：registry client half 机制（既有）
- `scripts/install-into-dsh.mjs`：一键集成脚本（复制包 + 打补丁 + 装依赖），README 与 integrating-into-dsh 推广
- integrating-into-dsh 补「运行」段：官方方式 `npm run build && ./bin/dsh web`、registry 验证、TSX_TSCONFIG_PATH 指向坑（实测 0805 基线 + 脚本安装后 `./bin/dsh web` 启动成功、插件 API 返回 greeter enabled）
- 文档补 client half 生效边界：CLI `plugin enable` 服务端实时但已运行 web 需重启；面板内启用同进程、刷新页面即可（creating-a-plugin 验证点 + integrating-into-dsh 步骤 3）
