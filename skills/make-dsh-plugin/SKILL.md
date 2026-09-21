---
name: make-dsh-plugin
description: >
  当用户要为 DeepSeek Harness 开发官方 bundle 插件或纯 cordis 插件时使用
  本 skill。引导形态选择（纯 skill 包 / MCP server / Node 工具 / 浏览器 UI /
  组合层），然后搭建 npm 包：dsh.bundle + cordis.patch.yml（或纯 Cordis
  entry + insert 行）、可选 dsh.client、安装验证纪律。也覆盖开发规范
  （门禁、决策记录、验证纪律）。不是已移除的旧机制（dsh.plugin.json /
  dsh registry / repository-plugin）。
license: MIT
metadata:
  author: vlln/plugin-registry
  version: "3.2.0"
requires:
  bins:
    - dsh
---

# 创建官方 bundle / cordis 插件

本 skill 构建 **0811 官方形态**的插件：外部插件统一是 npm 包，经 web
profile 安装——声明 `dsh.bundle` 的走层栈（重启生效），纯 Cordis 包走
profile `cordis.patch.yml` insert 行（配置 HMR 实时生效）。**没有**
repository-plugin、`__ModuleLoader__` 之外的旧协议、`dsh registry` CLI——
旧机制已于 2026-08 移除（0811 起 repository-plugins 机制删除）。

**权威契约内嵌在本 skill 的 `references/`**（bundle + entry + skill + MCP 在
`bundle-plugins.md` 与 `entry-contract.md`、验证在 `install-and-verify.md`、
规范在 `dev-conventions.md`、坑在 `gotchas.md`）——开发不需要任何仓库文档。
到达对应阶段时读对应 reference。

## 版本与权威来源

**机制契约的版本权威是官方文档**（随基线更新，优先于本 skill 的复述；发现冲突时以官方为准并回来更新本 skill）：

| 主题 | 官方位置（`deepseek-ai/deepseek-harness` 仓库内） |
|---|---|
| 插件配置 / 打包 / 安装 / 发布 | `docs/user/develop/basic/config.md`、`basic/publish.md`、`basic/tool.md` |
| 插件生命周期（服务 / 事件） | `docs/user/develop/framework/*` |
| 运行时元数据、动态 Cordis | `docs/user/develop/practice/dynamic-cordis.md` |
| 新增包 / 设置卡 | `docs/cookbook/adding-a-package.md`、`adding-a-settings-card.md` |
| 层优先级 / flag / profile 机制 | `apps/cli/reference/README.md` |
| 子系统地图 | `docs/subsystems/*.md`（extensions / skills / web-client / tools …） |

**本 skill 保留两类官方文档不写的内容**：

1. **发布与生态纪律**——发布检查清单、仓库 description/topics 规则、README 读者规则、门禁与决策记录、安装说明纪律（Step 5b / Step 6）；
2. **实测坑与验证纪律**——`references/gotchas.md`（踩出来的领域事实）与 `references/install-and-verify.md`（含"负控"这类方法论）。

**事实带基线**：本 skill 的实测事实标注核实时的 dsh 版本（当前 **0.1.5-rc.2**；带日期的早期条目为 0.1.2-rc.1）。
升级基线时逐条重核——服务名、manifest 字段与安装行为都会变。

**0.1.5 起官方新增的相邻能力**（本 skill 不展开，需要时读官方文档）：bundle 行可自带 CLI
（`inject = ['cmdlineArgs']` + `parseCmdline`，启动器把同一份不可变参数快照交给每个插件）；
`--from-default-profile <template>` 从随附模板建 profile；**extensions 子系统**（agent 定义带版本的
Cordis 包并运行其 host 与浏览器两半，`tool-cordis` 查询运行时元数据）；**dynamic Cordis**（运行时写插件）。

## 何时使用

- 用户想为 dsh 开发新插件（工具、skill 包、MCP server、事件监听、服务、
  命令、prompt、浏览器 UI）。
- 用户要 bundle 插件 / 纯 cordis 插件的脚手架 / 示例 / 模板。
- 插件挂载失败且原因是 entry 契约或安装通道。

## Step 0：选择插件形态

按插件分发什么选官方路径。`dsh` 字段 strict——能力面声明：

| 需求 | 官方路径 | 安装通道 | 起点 |
|---|---|---|---|
| 纯 skill 包（无代码） | skill 走**文件系统发现根**（`dsh.skills` 字段在当前基线无消费方，见 [entry-contract.md](references/entry-contract.md)） | 复制/链接进发现根（`<项目>/.dsh/skills`、`.agents/skills`、`$DSH_HOME/skills`、`~/.agents/skills`） | Step 2（skills） |
| MCP server | **不是包 manifest 字段**：CLI 随附 `@deepseek-ai/dsh-mcp-client` 供 **patch 层**使用，默认禁用（每条服务器命令是 agent 沙箱之外的受信任可执行代码） | patch 层 config | `apps/cli/reference/README.md` |
| Node 工具 / 事件 / 服务 | npm 包 + Cordis entry（`main`） | insert 行（实时） | Step 3 |
| Node + 浏览器 UI | npm 包 + Cordis entry + `dsh.client` | bundle | Step 3 + 4 |
| 带组合层（多行 insert/config/disabled 随包分发） | npm 包 + `dsh.bundle` | bundle 层栈 | 读 `references/bundle-plugins.md` |

**核心判据**（0811 分类）：包是否声明 `dsh.bundle.patch`。声明 = 一层组合
patch（多个 insert/config/disabled 行）→ `dsh plugin --profile web add` 进层栈，
**重启生效**；无声明 = 单个 Cordis 插件 → profile `cordis.patch.yml` insert
行，**配置 HMR 实时生效**。带 UI 的独立插件两类皆可（自渲染 client 在
bundle 里照常工作）——选型看是否需要组合层，而非 UI 形态。

## Step 1：仓库布局

`my-plugin/` 根即 npm 包（bundle 形态包根 = 仓库根）：

```
my-plugin/
├── package.json            # name/version + main/exports + dsh.bundle/dsh.client
├── cordis.patch.yml        # dsh.bundle 声明的组合层（insert 挂载自身）
├── index.mjs               # Node half 入口：完整 Cordis 插件（main/exports["."]）
├── client/  lib/client.js  # client bundle 源码 / 构建产物（dsh.client 通道）
└── scripts/                # 门禁 + 生成器（可选）
```

## Step 2：`package.json` + 能力面

按 `references/bundle-plugins.md` 与 `references/entry-contract.md` 的模板。
关键决策：

- `dsh.bundle.patch` → `cordis.patch.yml`（组合层，含 `- insert: - id: <自身> name: <包名>`）
- `dsh.client` 声明（platform web）+ `exports["./client"]`（有 client half 时）
- `main`/`exports["."]` 指向 Cordis entry（`name`/`inject`/`apply`）
- `dependencies`/`peerDependencies`/`devDependencies` **三处都留空**——官方包由挂载环境注入（理由与本地 link 配方见 [gotchas.md](references/gotchas.md) 1）
- `inject` 声明 `ctx.get` 用到的全部服务（`settings`/`httpServer` 等）——
  **0811 cordis 严格注入**：未声明即抛 `cannot get property without inject`。
  缺 `inject` 不是"某个功能不可用"，而是**启动即崩**（整个 entry 装载失败、profile 起不来），
  而手写 mock ctx 的单测**照不出来**——必须真启动一次 profile 才算验证过（Step 5）
- 服务名字面量（`ctx.get('…')`）以**当前基线**为准逐条核实：官方会跨 rc 改名，
  写错的症状是"boot 干净但调用时报缺服务"（[gotchas.md](references/gotchas.md) 7）

### Skill 包（`dsh.skills`）与 MCP server（`dsh.mcpServers`）

声明写法（`dsh.skills` 相对路径列表 / `dsh.mcpServers` 的 server-id → 启动
配置映射）与 SKILL.md 写法规范（frontmatter / 正文模式 / <500 行，遵循
make-skill）见 `references/entry-contract.md` 对应小节——不要发明竞争格式。

## Step 3：Node half——Cordis entry

`index.mjs` 导出完整 Cordis 插件（`name`/`inject`/`apply`）。用 `defineTool`
注册工具；服务/事件/命令/prompt 是完整 Cordis，无需声明。依赖解析是官方
运行时的职责（`@deepseek-ai/*`、`cordis`——profile pnpm 闭包注入，勿声明）。
在 `ctx.effect()`/`ctx.on()` 内注册，disable 时清理。

**检查点**：entry 可解析；工具已注册；inject 声明完整；**在真实 profile 里启动过一次**
（boot 不报 `plugin tree failed to load`）——缺 `inject`、服务名写错这类问题只有真启动才暴露。

## Step 4：Client half（可选）——自渲染

带 UI 的插件声明 `dsh.client`（platform web）+ `exports["./client"]`，client
bundle 经 `__ModuleLoader__.load({id, factory})` 注册（factory 返回
`{name, apply}`，由 client 内核挂载时调用 `apply(ctx)`）。自渲染 DOM 逻辑
放 `apply` 内——**与填官方 hole 正交**（自渲染跑 bundle 照常，参考实现 `packages/plugin/console`）。

`dsh.client` 的其余现行字段：`inject`（声明消费的其他 client 模块）、**`external`**
（声明本行消费的 client 包，client-modules 用它排模块图顺序；**不得声明自己**——同包自引用会抛
`a row must not declare its own package in dsh.client.external`）。client 包用共享构建形态：
extends `tsconfig.base.client.json` + 共享 tsdown preset（`packages/client/tsdown.client.ts`）。

构建：esbuild/tsdown CJS 输出 + 外层 `window.__ModuleLoader__.load` 包装（对齐
官方 preset 的 banner/footer 模式）。

**填官方设置面板（可选）**：`settings.plugin.item` 是 keyed 槽——`key` =
Node half 注册的设置命名空间，卡片与官方插件卡片同列表渲染。暂存表单 +
快照稳定性 + 动态工具门（保存即生效、无需重启）的完整契约见
`references/settings-panel.md`；实测参考 `vlln/dsh-loop` 的设置卡片。

**检查点**：`__DSH_BOOT__` 含 client 行；`/plugins/<id>/client.js` 200；无
`loaded without registering` 报错。

## Step 5：安装与验证

安装通道（写法细则见 `references/install-and-verify.md` 与
`references/bundle-plugins.md`）：

- **bundle**：`dsh plugin --profile web add <包路径/git 源/npm 包/tarball>`——声明 `dsh.bundle`
  的包；装完**重启 web**（层栈在 boot 合成；`patchReload` 只覆盖**用户 patch 文件**，不含
  bundles 层栈）
- **纯 cordis**：`dsh plugin --profile web add <包>` 装依赖 + profile
  `cordis.patch.yml` insert 行——**配置 HMR 实时挂载，零重启**
- **四条发布渠道**（官方 [publish 文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)）：
  ① 产物入库 + git 源（真一行）② `prepare` 脚本 + 用户为该包放行 `allowBuilds`
  ③ npm 预构建 ④ `pnpm pack` 出的 tarball（`dsh plugin --profile web add ./x-0.1.0.tgz`）。
  ②的授权语义是**允许该包在安装时于用户机器上执行代码**（不在 agent 沙箱内）——安装说明里要写明并建议钉 commit。

**写安装说明时必须给出用户可直接复制的命令**；验证按改动面（哪些需重启
web vs 只刷新）与挂载失败排查见 `references/install-and-verify.md`。

**三条硬规矩**（该文件详述，这里先记住结论）：

1. **boot 干净 ≠ 功能可用**——依赖解析失败、服务名写错在 boot 期看不见（服务惰性读取），
   **必须真调一次工具/命令**；
2. **先做负控**——装一份故意弄坏的副本，确认日志会响亮报错；只有负控响过，"干净日志"
   才算证据；
3. **mock ctx 单测不能替代真实装载**——它不施加严格注入门禁，缺 `inject` 的启动即崩
   照不出来。

**零依赖包的安装说明只给 git 源**：本地目录装的包落在 profile 树外时官方包解析不到，
会拖垮整个 profile 启动（[gotchas.md](references/gotchas.md) 6）；本地目录安装只用于开发自测，
且要先 link SDK。

## Step 5b：发布到 GitHub

npm 包（或 git 源）是分发单元——设置好让用户能找到并安装。

**仓库 description**——**只写"这是什么、能干什么"，一句话让用户在搜索结果里一眼看懂**：

```
<插件做什么>：<用户视角的收益/场景>（DeepSeek Harness 插件）
```

- **不要往里塞安装命令、包名、生态术语堆砌**（`dsh plugin --profile web add github:…`
  这类样板属于 README 的安装节，不属于 description）——搜索列表里只有一行位置，
  塞进去的都是用户读不完、也用不上的字节。用户 2026-09 拍板：
  "description 中应该仅有让用户一眼清晰理解项目的描述"。
- 中文优先（受众主要是中文用户）；双语可选，英文在前利于国际发现——但**别把两句都写进去挤成一段**。
- 例（`dsh-autofork`）：`Agent 忙时自动分叉会话：你新发的指令立刻在新会话里得到响应，旧会话留在后台跑完并把结果回注（DeepSeek Harness 插件）`

**仓库 topics（GitHub 标签）**：打标签便于 `gh`/搜索/发现。两类组合：

**必选 2 个**（生态身份，一个都不能少）：
- `dsh-plugin`——dsh 插件的通用检索词（用户会直接搜它）
- `deepseek-harness`——标明上游宿主

**功能标签 1-3 个**（描述插件实际做什么，是区分度的来源）：
- 能力：`tool` / `skill` / `mcp` / `command` / `ui`（按插件含什么）
- **领域/用途**（关键——让搜索命中「能干什么」）：如 `pet`（宠物）、
  `loop`（定时循环）、`terminal`（终端）、`status`（状态条）、`automation`
  （自动化）、`workflow`（工作流）等——从插件的核心功能提炼 1-2 个具体
  领域词，避免泛词
- 形态：`agent` / `agents`（agentic 上下文，可选）

**原则**：想象用户搜什么词能找到这个插件——`dsh-plugin` 是身份，
`<你的功能词>` 才是区分度。标签总数 3-6 个（必选 2 + 功能 1-3）。

用 `gh repo edit <owner>/<repo> --add-topic dsh-plugin --add-topic deepseek-harness
--add-topic <功能词> ...` 打标签。

**发布检查清单**（分享仓库前）：
- [ ] `package.json#main`/`exports` 指向 entry；`dsh.bundle.patch` → `cordis.patch.yml`；
      `dsh.bundle.patch` 的 insert 行与包名同源；**依赖三字段为空**（[gotchas.md](references/gotchas.md) 1）
- [ ] 门禁通过（`scripts/gates/run.mjs`）——仓库自带门禁，含自证测试
- [ ] README 有安装（`dsh plugin --profile web add` 含具体 ref）、使用、能力表
- [ ] README **只含面向使用者的内容**——工程备忘录（机制/验证证据/踩坑）已移到
      `AGENTS.local.md`、代码注释或 `docs/engineering-notes.md`，README 只留一句指针
- [ ] **安装冒烟含一次真实工具/命令调用**（boot 干净 ≠ 功能可用），且做过负控
      （[install-and-verify.md](references/install-and-verify.md)「三条硬规矩」）
- [ ] 面向用户的安装说明**只给 git 源**（零依赖包的本地目录装有前置条件，见
      [gotchas.md](references/gotchas.md) 6）
- [ ] 仓库 description = 一句话"是什么 + 能干什么"（**无安装命令样板**）
- [ ] 仓库 topics 至少含 `dsh-plugin` 与 `deepseek-harness`，另加 1-3 个功能词
- [ ] **在官方 Discussions 发一条介绍**（见下）——仓库建好不等于有人知道

### 发布后：在官方 Discussions 发一条介绍

官方仓库的 Discussions 有专门的 **`Show Your Plugins!`** 分类（`deepseek-harness`
的 discussion 列表：<https://github.com/deepseek-ai/deepseek-harness/discussions>）。
仓库建好只等于"可以被装"，而用户实际是在那里发现插件的——**发一条介绍是发布流程的
最后一格**，不是可选项。

**发之前先核实分类还在**（分类名会被维护者改，写死中文名会发错板块）：

```sh
gh api graphql -f query='{ repository(owner: "deepseek-ai", name: "deepseek-harness") {
  hasDiscussionsEnabled discussionCategories(first: 20) { nodes { name slug } } } }'
```

**发**（`gh discussion` 是 preview 命令，但非交互用法稳定；`-c` 收分类名或 slug）：

```sh
gh discussion create --repo deepseek-ai/deepseek-harness \
  --category show-your-plugins \
  --title "<插件名>：<一句话价值主张>" \
  --body-file /tmp/plugin-announce.md
```

正文骨架（**一屏读完**，比 README 短得多——这里只是"要不要点进去"的入口）：

    一句话：这是什么、解决什么问题

    安装：dsh plugin --profile web add github:<owner>/<repo>（装完重启 web）

    一张截图，或两三行"用起来是什么样"——有 UI 的插件放图，纯 CLI 放示例输出

    仓库：https://github.com/<owner>/<repo>

**etiquette（这几条比格式重要）**：

- **一个插件一条**：更新插件就**编辑原帖**（`gh discussion` 目前没有 edit 子命令，
  用网页编辑），不要重复发新帖刷屏。
- **先确认仓库已公开**：讨论帖指向的仓库必须已经 push 且 public，否则点进去是 404。
- **一条帖 = 一个动作**：标题别堆关键词（`<名为> <best> <plugin>` 那种），
  与仓库 description 同一条纪律——一句话是什么 + 能干什么。
- **认真回答问题**：有人在帖子里提问就是最常见的反馈来源，回帖比再发一条介绍有用。
- ⚠️ **这是对外可见的动作**（公开仓库的公开帖），发布前要有用户的明确同意；
  本机验证通过不等于可以发帖。

## Step 6：开发规范

可维护的插件遵循 `references/dev-conventions.md` 的纪律：门禁（自证测试）、
每个非平凡改动的决策记录、生成物不手改、首次环境行为沉淀为环境事实。

**README 规范**（make-skill spec + 用户 2026-09 定调）：

**README 的读者是「用这个插件的人」，不是维护者。** 一条内容留不留，就看
"用户拿它做决定"吗（装不装、怎么配、会不会踩坑）——只有"改这个插件的人"才用得
上的，一律移走。README 变成工程备忘录是**最常见的跑偏**：信息都真、都重要，但
读者不对，真正需要的那几句被淹掉（反例：某插件 README 602 行，安装节在第 573 行）。

- **写**：这是什么（一句话方案）；**为什么需要它**（动机——要解决的具体问题、用户
  当前不得不忍受什么、这个方案把什么交给了工具）；怎么装（含"装完要重启"这类生效
  条件）；用起来是什么样（用户可见的行为——界面多了什么、列表里的名字长什么样、
  注入行怎么呈现）；能力面表格；参数与环境变量；**已知限制**（用户会撞上的边界、
  安全注意事项）；`## 插件管理` 固定节；许可。
- **动机要写"用户视角的痛"**，不是设计目标：用"你现在必须怎样、代价是什么"说话，
  并**讲清与相邻方案的区别**（官方能力 / 同类插件，谁发起、用户要做什么）——
  这是使用者判断"要不要装"的主要依据。
- **边界要诚实**：说清它**不解决什么**（例如"某种等待是问题本身的性质"）。只写
  好处的 README 在真实使用里会被立刻发现，代价比少写一段大。
- **不写**（工程备忘录）：内部事件/API 挂钩点、实现范围与机制表、验证证据与测试
  计数、E2E 台怎么跑、设计取舍的来由、踩坑与事故复盘、与官方包内部的契约。
  它们写到**别处**——仓库本地 `AGENTS.local.md`（不入库）、代码注释，或仓库内
  单独的 `docs/engineering-notes.md`；README 只在安装节留**一句**指针。
- **能力面**用表格：每个能力面一个表、每项一行一句话；人扫描表格决定用什么，
  细节留在各项自身文件。
- 自检：README 超过 ~200 行基本已经跑偏，逐段问一遍"这段的读者是谁"。

**标题格式**（强制）：
- `<h1 align="center">插件名</h1>`——**居中**；用仓库/插件名（如
  `whale-girl`、`loop`），**不加 npm 前缀**（不要写 `@vlln/dsh-loop`
  或 `@scope/name` 作为标题）。
- 标题下加 `<p align="center">` 一句话价值主张（是什么 + 主要收益）+ 可选
  徽章（badgen：license/format）。

**图片要求**（若有 UI 或可演示的行为）：README 应含至少一张功能图片——
状态/界面/效果截图或 gif。Agent 在验证环境截取或提示人工截取后放入
`docs/` 并引用；图片路径相对仓库内（如 `docs/preview/*.gif`），md-links
可解析。纯 CLI 工具无 UI 可豁免，但 README 应有可演示的示例输出。

**能力面表格**：

- **Skills**（恒有）：`| Skill | 作用 |`——每个 SKILL.md 一行。
- **MCP servers**（若含 `dsh.mcpServers`）：`| MCP | 说明 |`——每个
  server 一行（名称 + 暴露什么）。
- **Tools**（若注册工具）：`| 工具 | 说明 |`——每个 `defineTool` 注册一行。

适用于任何带 skills/MCP/tools 的仓库。

**推荐管理章节**（README 固定含一节，向用户推荐插件管理方式）：已装插件的
管理，在 README 写一节推荐 plugin-registry 的薄控制台——模板：

```
## 插件管理

已装插件用 plugin-registry 的**薄控制台**管理（浏览器面板）：管理 profile
插件安装态（bundle 层栈 + insert 行 + 启停），无需手改配置。安装：
`dsh plugin --profile web add <plugin-registry>/packages/plugin/console`
```

每个按本 skill 产出的插件 README 都带此节（生态回引——插件由 plugin-registry
skill 产出，README 推荐回 plugin-registry 的管理工具）。

**进入迭代期时读 `references/dev-conventions.md`**。

## 坑（Gotchas）

高频坑（官方包未发布、ESM 缓存重启、严格注入、宿主 CSS 覆盖、entry 契约
失败时机等）见 `references/gotchas.md`（唯一清单家）；**先读它再动手**。

## 参考

- 本 skill 内嵌契约：
  - `references/bundle-plugins.md` — bundle 插件（dsh.bundle/dsh.client）开发
  - `references/entry-contract.md` — Cordis entry、dsh 字段（skills/mcpServers）、自渲染 client
  - `references/settings-panel.md` — 官方设置面板集成（settings.plugin.item keyed 槽 + 动态工具门）
  - `references/install-and-verify.md` — 按改动面验证
  - `references/gotchas.md` — 坑（官方包未发布、严格注入、ESM 缓存、宿主 CSS 覆盖）
  - `references/dev-conventions.md` — 门禁、决策记录
- 参考实现（仓库内可见）：`packages/plugin/console`（bundle + `__ModuleLoader__.load` client 的完整例子）
