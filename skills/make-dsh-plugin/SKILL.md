---
name: make-dsh-plugin
description: >
  当用户要为 DeepSeek Harness 开发官方 repository-plugin（0809 格式）插件时
  使用本 skill。引导形态选择（纯 skill 包 / MCP server / Node 工具 / 浏览器
  UI），然后搭建 `.dsh-plugin/` 包：package.json#dsh.entry（或 dsh.skills /
  dsh.mcpServers）、Cordis entry、可选自渲染 client、prepack、cordis.patch.yml
  安装。也覆盖开发规范（门禁、决策记录、验证纪律）。不是已移除的旧机制
  （dsh.plugin.json / dsh registry）。
license: BSD-3-Clause
metadata:
  author: dsh-external/plugin-registry
  version: "2.0.0"
requires:
  bins:
    - dsh
---

# 创建官方 repository-plugin

本 skill 构建 **repository-plugin**（0809 官方格式）：一个仓库（或子目录）
本身即插件，经 `$DSH_HOME/cordis.patch.yml` 安装。**没有** manifest 协议、没有
`__ModuleLoader__`、没有 `dsh registry` CLI——旧机制已于 2026-08 移除。

**权威契约内嵌在本 skill 的 `references/`**（entry + skill + MCP 在
`entry-contract.md`、bundle 在 `bundle-plugins.md`、验证在
`install-and-verify.md`、规范在 `dev-conventions.md`、坑在
`gotchas.md`）——开发不需要任何仓库文档。到达对应阶段时读对应 reference。

## 何时使用

- 用户想为 dsh 开发新插件（工具、skill 包、MCP server、事件监听、服务、
  命令、prompt、浏览器 UI）。
- 用户要 repository-plugin 的脚手架 / 示例 / 模板。
- 插件挂载失败且原因是 entry 契约。

## Step 0：选择插件形态

按插件分发什么选官方路径。`dsh` 字段 strict——能力面二选一：

| 需求 | 官方路径 | `dsh` 字段 | 起点 |
|---|---|---|---|
| 纯 skill 包（无代码） | `.dsh-plugin/skills/` + prepack | `dsh.skills` | Step 2（skills） |
| MCP server | `.dsh-plugin/mcp/` + 声明 | `dsh.mcpServers` | Step 2（mcp） |
| Node 工具 / 事件 / 服务 | Cordis entry + `defineTool` | `dsh.entry` | Step 3 |
| Node + 浏览器 UI | entry + httpServer 路由 + 自渲染 client | `dsh.entry` | Step 4 |
| Bundle（产品服务、dsh.client UI） | npm 包 + `dsh.bundle` | `dsh.bundle` | 读 `references/bundle-plugins.md` |

插件可组合多面（如一个 skill 包 + 一个工具共存于一个 `.dsh-plugin`）。前四行是
**repository 插件**（用户经 cordis.patch.yml 安装，本 skill 主路径——下方 Step 1-6）；
最后一行是 **bundle 插件**（随 profile 分发，安装/管理不同——见
`references/bundle-plugins.md`）。

## Step 1：仓库布局

`my-plugin/` 根保留元资产（文档/决策等，不分发）；分发路径全部在
`.dsh-plugin/` 内（官方 containment 契约）：

```
my-plugin/
├── .dsh-plugin/
│   ├── package.json            # name/version + dsh.* + scripts.prepack
│   ├── index.mjs               # Node half 入口：完整 Cordis 插件
│   ├── client/  client.js      # 自渲染 client 源码 / 构建产物
│   ├── assets/                 # entry 路由静态服务的文件
│   └── src/                    # 纯逻辑（零宿主依赖，可单测）
└── scripts/                    # 门禁 + 生成器（可选）
```

## Step 2：`package.json` + 能力面

按 `references/entry-contract.md` 的模板。关键决策：

- `dsh` 字段：`skills` / `mcpServers` / `entry`（strict，官方 schema）。无
  `contributes`——工具在 entry 内经 `defineTool` 注册。
- `scripts.prepack` **必须**调用 `dsh-plugin-prepare`（devDep
  `@deepseek-ai/dsh-repository-plugin`）——不要手写生成的
  `dsh-plugin.mjs` / `dsh-plugin-assets/`。

### Skill 包（`dsh.skills`）

`SKILL.md` 放 `.dsh-plugin/skills/<name>/`，在 `dsh.skills` 声明列表（相对
`.dsh-plugin/` 路径）：

```json
"dsh": { "skills": ["./skills/foo/SKILL.md", "./skills/bar/SKILL.md"] }
```

**SKILL.md 写法**——遵循 make-skill 规范（权威模板）：frontmatter（`name`
1-64 小写连字符、`description` 祈使句「Use this skill when...」、可选
`metadata`/`requires`）+ 正文结构（Tool Wrapper / Generator / Reviewer /
Inversion / Pipeline 模式），<500 行，细节 progressive disclosure 到
`references/`。每个 skill 一个 `SKILL.md`；仓库 README 用表格列（Step 6）。
`make-skill` 是编写 agent skill 的参考——不要发明竞争格式。

### MCP server（`dsh.mcpServers`）

在 `dsh.mcpServers` 声明 MCP server（官方 schema）。标准 MCP 形态是
server id → 启动配置的映射：

```json
"dsh": { "mcpServers": {
  "my-server": { "command": "node", "args": ["./mcp/my-server.js"], "env": {} }
} }
```

server 是 stdio MCP server（stdin/stdout 上的 JSON-RPC）。确切 schema 字段
（`command`/`args`/`env`、允许的 transport）是官方格式细节——发布前对照
当前官方 spec 验证；server 侧逻辑在 `.dsh-plugin/mcp/`。仓库 README 用表格
列 MCP server（Step 6）。

**到达 Step 3/4 时读 `references/entry-contract.md`** 获取完整 `dsh.entry`
契约。

## Step 3：Node half——Cordis entry

`index.mjs` 导出完整 Cordis 插件（`name`/`inject`/`apply`）。用 `defineTool`
注册工具；服务/事件/命令/prompt 是完整 Cordis，无需声明。依赖解析是官方
运行时的职责（`@deepseek-ai/*`、`cordis`）。在 `ctx.effect()`/`ctx.on()` 内
注册，disable 时清理。

**检查点**：entry 可解析；工具已注册；无未声明依赖。

## Step 4：Client half（可选）——自渲染

无动态 client-half 机制。带 UI 的插件：
1. entry 注册 httpServer 路由服务 client 脚本（`GET /my-plugin/ui.js`）；
2. client 脚本自执行 DOM 渲染（无 `__ModuleLoader__`）；
3. 页面注入是插件自己的事（宿主页 `<script>` 注入或配置注入点）。

完整模式：entry 注册 `ui.js`/`state`/`assets` 路由，宿主页注入 `<script>`（tapIndex 注入）。

**检查点**：浏览器冒烟通过——headless Chrome dump-dom 显示插件的 DOM
marker 且无 "Failed to load plugins"。

## Step 5：安装与验证

经 `$DSH_HOME/cordis.patch.yml` 的 `repository-plugins.repositories` 安装
（`github:owner/repo#<ref>&path:/.dsh-plugin`）。分发 = 仓库本身（clone +
pnpm prepare + prepack），无发布流程。

**写安装说明时必须给出用户可直接复制的命令**：
- repository 插件：`cordis.patch.yml` 的 `repositories` 行（`github:owner/repo#<ref>&path:/.dsh-plugin`）——**这是唯一安装方式**；不要写 `dsh plugin add`（那是 bundle 通道）、`dsh registry`（已移除）或「复制目录」等不可用形式。
- bundle 插件：`dsh plugin --profile web add <bundle 包路径>`——`<包路径>` 必须是**含 `dsh.bundle`** 的 npm 包目录/git 源，见 `references/bundle-plugins.md`；git 源 monorepo 子目录用 `#<commit>&path:/<子目录>`，产物不入库需 `prepare` 脚本自动构建（pnpm ≥10 默认阻止，dsh 提示 `allowBuilds` 放行）；不要指向仓库根或源码目录，不要写 `git+file://`（本地可达但非分发形态）。

**读 `references/install-and-verify.md`** 获取按改动面的验证（哪些改动需
重启 web vs 只刷新）与挂载失败排查。

## Step 5b：发布到 GitHub

仓库本身就是分发单元——设置好让用户能找到并安装。

**仓库 description**（一行：是什么 + 怎么装），具体模板：

```
DSH 插件：<一句话功能>。官方 repository-plugin（.dsh-plugin 格式），cordis.patch.yml 安装：github:owner/repo#<ref>&path:/.dsh-plugin
```

遵循形态 "DSH plugin: <what it does>; official repository-plugin format,
install via cordis.patch.yml `<repo-ref>`"。双语可选（英文在前利于国际发现）。

**仓库 topics（GitHub 标签）**：打标签便于 `gh`/搜索/发现。**标签要描述插件实际做什么，而非只贴生态通用词**。两类组合：

**生态标签**（固定少量，标识 dsh 生态身份）：
- `dsh` / `dsh-repository-plugin`（bundle 用 `dsh-bundle`）
- `deepseek-harness`

**功能标签**（有意义——描述插件能力/领域，按插件实际内容定）：
- 能力：`tool` / `skill` / `mcp` / `command` / `ui`（按插件含什么）
- **领域/用途**（关键——让搜索命中「能干什么」）：如 `pet`（宠物）、
  `loop`（定时循环）、`terminal`（终端）、`status`（状态条）、`automation`
  （自动化）、`workflow`（工作流）等——从插件的核心功能提炼 1-2 个具体
  领域词，避免泛词
- 形态：`agent` / `agents`（agentic 上下文，可选）

**原则**：想象用户搜什么词能找到这个插件——`dsh-plugin` 人人都有，
`<你的功能词>` 才是区分度。标签总数 3-6 个（生态 2-3 + 功能 2-3）。

用 `gh repo edit <owner>/<repo> --add-topic dsh --add-topic <功能词> ...`
打标签。

**发布检查清单**（分享仓库前）：
- [ ] `package.json#dsh.entry` 指向 `.dsh-plugin/` 内；prepack 运行
  `dsh-plugin-prepare`
- [ ] 门禁通过（`scripts/gates/run.mjs`）——仓库自带门禁
- [ ] README 有安装（cordis.patch.yml 行含具体 ref）、使用、skill 表（Step 6
  规范）
- [ ] 仓库 description + topics 已设置（见上）
- [ ] 安装冒烟：新 `cordis.patch.yml` 行 → 挂载 → boot log 干净

无需 release 资产——仓库即插件（clone + prepare + prepack）。若要版本化
ref，给提交打 tag 并把 README 的 config 行指向该 tag 的 commit 哈希。

## Step 6：开发规范

可维护的插件遵循 `references/dev-conventions.md` 的纪律：门禁（自证测试）、
每个非平凡改动的决策记录、生成物不手改、首次环境行为沉淀为环境事实。

**README 规范**（make-skill spec）：仓库 README 用表格列能力面——每个能力
面一个表、每项一行一句话描述；人读扫描表格决定用什么；细节留在各项自身
文件。

**标题格式**（强制）：
- `<h1 align="center">插件名</h1>`——**居中**；用仓库/插件名（如
  `whale-girl`、`loop`），**不加 npm 前缀**（不要写 `@dsh-external/dsh-loop`
  或 `@scope/name` 作为标题）。
- 标题下加 `<p align="center">` 一句话价值主张（是什么 + 主要收益）+ 可选
  徽章（badgen：license/format）。

**图片要求**（若有 UI 或可演示的行为）：README 应含至少一张功能图片——
状态/界面/效果截图或 gif。Agent 在验证环境截取或提示人工截取后放入
`docs/` 并引用；图片路径相对仓库内（如 `docs/preview/*.gif`），md-links
可解析。纯 CLI 工具无 UI 可豁免，但 README 应有可演示的示例输出。

**截取方式**（按需要选）：
- **方式一：静态示意**（快、视觉近似）——手工构造 mock HTML（样式从插件
  源码复制 token/圆角/间距），headless Chrome 截图：
  ```sh
  "/Applications/Google Chrome.app/.../Google Chrome" --headless \
    --screenshot=out.png --window-size=980,280 file:///tmp/mock.html
  ```
  适用：布局/样式示意；**局限**：不运行 React 组件/官方槽，布局易错（缺
  锚点会错位——用像素检查确认）。
- **方式二：真实运行截图**（真、成本高）——官方 dsh web 真实运行，CDP
  驱动 + 数据桩，官方槽渲染真实插件组件后截图。关键链路：
  1. **会话显示**：workspace 与启动 cwd 绑定——用匹配 cwd 重启 web，侧栏
     出现会话；
  2. **对话页**：前端路由 `#/c/<id>` 导航 + CDP 点击侧栏会话 → 真实
     chatFlow；
  3. **数据**：CDP 注入 fetch 桩（`Runtime.evaluate` 包装 `window.fetch`
     拦截 `/plugins/<id>/...` 返回演示数据）→ 官方组件轮询拿到数据 → 真实
     渲染；
  4. **精确截图**：`Page.captureScreenshot { clip: 元素 rect }`。
  适用：README 主图/效果展示；**唯一桩**是插件数据（真实任务需模型在 GUI
  运行，headless 无法驱动）。成本高（环境逆向 + CDP 脚本），README 主图
  值得，示意足够时用方式一。

**能力面表格**：

- **Skills**（恒有）：`| Skill | 作用 |`——每个 SKILL.md 一行。
- **MCP servers**（若含 `dsh.mcpServers`）：`| MCP | 说明 |`——每个
  server 一行（名称 + 暴露什么）。
- **Tools**（若注册工具）：`| 工具 | 说明 |`——每个 `defineTool` 注册一行。

适用于任何带 skills/MCP/tools 的仓库。

**推荐管理章节**（README 固定含一节，向用户推荐插件管理方式）：已装插件的
管理，在 README 写一节推荐 plugin-registry 的薄控制台（官方 config 的
浏览器管理面板）——模板：

```
## 插件管理

已装插件用 plugin-registry 的**薄控制台**管理（官方 config 的浏览器面板）：
读写作 `$DSH_HOME/cordis.patch.yml`，增删/启停 repository 与 UI 插件，无需
手改配置。安装：`dsh plugin --profile web add <plugin-registry>/packages/plugin/console`
```

每个按本 skill 产出的插件 README 都带此节（生态回引——插件由 plugin-registry
skill 产出，README 推荐回 plugin-registry 的管理工具）。管理也可直接编辑
`$DSH_HOME/cordis.patch.yml`（官方原生方式），控制台是其可选 UI。

**进入迭代期时读 `references/dev-conventions.md`**。

## 推荐管理

薄控制台 `packages/plugin/console` 经 `$DSH_HOME/cordis.patch.yml` 管理官方
repository 插件——已装 `.dsh-plugin` 包的插件管理 UI（README 模板的「插件
管理」章节推荐它，见 Step 6）。

## 坑（Gotchas）

- **官方包未发布到公共 npm**：`@deepseek-ai/dsh-tools` 等未发布——本地
  `npm install` 失败。分发由官方环境解析（github: 源）；本地验证需
  symlink 至 monorepo 构建产物或 mock registry。不要改依赖。bundle 插件
  （dsh.client）同坑但**不声明依赖**——profile 的 pnpm 闭包挂载时注入；
  声明了反而失败。
- **安装与启用分离**——插件进入 config 并挂载才执行；boot log 干净才算
  验证。
- **entry 契约失败在挂载时暴露**：`dsh.entry` 指向 `.dsh-plugin/` 外、
  缺 prepack、未声明依赖——在安装/挂载失败，而非编写时。
- **ESM 缓存**：改已挂载插件的 `index.mjs` 需重启 web 才生效。
- **宿主覆盖注入的 CSS**：关键 UI 样式必须 JS 内联（宿主全局 CSS 可能清掉
  注入的 `<style>`），勿依赖 CSS class。
- **先选形态**：写代码前先定能力面——纯 skill 包无需 entry；UI 插件需要
  entry + httpServer，而不是已不存在的 client-half 机制。

**读 `references/gotchas.md`** 获取完整清单（挂载排查顺序、schema-DSL
时机、环境事实）。

## 参考

- 本 skill 内嵌契约：
  - `references/entry-contract.md` — repository 插件：布局、dsh 字段
    （entry/skills/mcpServers）、Cordis entry、自渲染 client、安装、开发规范
  - `references/bundle-plugins.md` — bundle 插件（dsh.client）开发
  - `references/install-and-verify.md` — 按改动面验证
  - `references/gotchas.md` — 坑（官方包未发布、ESM 缓存、宿主 CSS 覆盖）
  - `references/dev-conventions.md` — 门禁、决策记录
- 参考实现：任一已发布的 repository 插件（带 UI 的自渲染模式）
- Bundle 参考：`dsh-loop`、`dsh-task-status`、`packages/plugin/console`
