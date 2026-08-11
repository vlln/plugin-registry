# 开发踩过的坑（Gotchas）

领域特定事实，违反合理假设——**先读本文再动手**。每条都是插件开发实测踩过并修复的（决策记录可溯）。本文件是 SKILL.md 的深读材料。

## 1. 官方包未发布到公共 npm

`@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-repository-plugin`、`schemastery` 等依赖**在公共 npm 不存在**（官方包未发布）。`npm install` 直接失败。

**现状（2026-08-11 实测）**：官方 `@deepseek-ai` **私有 rc 库**已发布（`0.0.1-rc.1`，NPM_TOKEN 访问，`.npmrc` 配 `//registry.npmjs.org/:_authToken=${NPM_TOKEN}`）——`@deepseek-ai/dsh`、`@deepseek-ai/dsh-tools` 等可见；**`@deepseek-ai/dsh-repository-plugin` 仍缺失（私有库 404）**。两个衍生坑：

- **semver 预发布**：私有库版本是 `0.0.1-rc.N`（预发布），依赖声明 `0.0.1`/`^0.0.1` **匹配不到 rc 版本**（npm 预发布规则）——声明官方包须用 `0.0.1-rc.*`（或 `>=0.0.1-0`）形态。
- **token 不入库**：`.npmrc` 用 `${NPM_TOKEN}` 变量引用（不要写真实令牌、不提交）。

- **正式分发**：走 `github:owner/repo#<ref>` 源，依赖由**官方发布环境解析**——不需要也不应该自己发布或改依赖。
- **本地验证**：symlink 至官方 monorepo 构建产物（`@deepseek-ai/dsh-tools` → 0809 monorepo 产物）或 mock npm registry（21 包闭包）——预置缓存是本地验证手段，非分发形态。
- **判断**：本地 `npm i` 失败不是你的错——不要改依赖声明，确认分发走 github: 源。

**bundle 插件同坑、更隐蔽**：bundle（dsh.client 包，如 loop/task-status）同样 import `@deepseek-ai/dsh-tools`/`dsh-llm`，但 **`dependencies` 声明为空**——官方包由 profile 的 pnpm 闭包（`dsh plugin --profile web add` 挂载环境）注入。**插件不该自己声明这些依赖**：声明了公共 npm 解析不到反而失败；依赖由挂载环境提供是设计。本地装 bundle 同样需官方 monorepo 构建产物 link 进 profile。

### 1a. repository 插件分发期断点：安装 404（dsh-repository-plugin 未发布）

repository 插件（`.dsh-plugin`）的 `devDependencies` 必含 `@deepseek-ai/dsh-repository-plugin`（`dsh-plugin-prepare` 提供者，官方 `installedPackageSchema` 硬校验：prepack 必须调 `dsh-plugin-prepare` + devDep 必须声明）——而该包**公共 npm 与私有 rc 库均不存在（404）**，RepositoryCache 安装时在 `.dsh-plugin/` 跑 `pnpm install` 直接 404。**声明必须、安装必败**，不能通过移除 devDep 绕过（loader 拒绝加载）。这是分发期断点：任何按官方格式开发的第三方插件在真实环境都装不上（官方 e2e 用本地 registry 模拟发布，真实用户撞 404；NPM_TOKEN 内测用户同样撞 404）。

**过渡方案（实测链路，whale-girl 范本）**：预填充 RepositoryCache 让 loader 跳过 `pnpm install`：

1. **wrapper 入库**：本地在可用官方包的环境跑 `dsh-plugin-prepare` 生成 `dsh-plugin.mjs` + `dsh-plugin-assets/`，提交入库（官方默认 prepack 生成，产物入库后 git 安装免构建直接可用；`files` 已声明则只需取消 gitignore）。
2. **预填充 cache**（whale-girl 的 `scripts/prepare-cache.mjs` 可复刻）：cache 目录 = `$DSH_HOME/cache/repository-plugins/<sha256(specifier)>`（specifier = `github:owner/repo#<ref>&path:/.dsh-plugin` 全文）；拷贝 `.dsh-plugin` 到 `node_modules/repository/`；**临时摘除 devDependencies** 后 `npm install`（只装 runtime 依赖，避开官方包 404），**恢复原始 package.json**（loader metadata 校验需要 prepack/devDep 声明）；写 `.repository-cache.json` = `{"specifier": "<完整 specifier>"}`（loader `readCached` 精确匹配）。
3. loader 命中缓存后跳过 `pnpm install`、校验 metadata、加载 wrapper。

**废弃条件**：`@deepseek-ai/dsh-repository-plugin` 在私有库可见（`npm view` 非 404）后正常安装即可，移除桥脚本与入库 wrapper。

## 1c. git 源装 bundle：pnpm ≥10 阻止 prepare 脚本（allowBuilds）

`dsh plugin --profile web add github:owner/repo#<ref>&path:/<子目录>`（或 `git+https://...`）安装 git 依赖时，pnpm ≥10 默认**阻止其 prepare（build）脚本执行**——dsh 的 `plugin` 命令失败时会提示把 pnpm 打印的 key 加入 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds` 后重跑。两条出路：

- **产物入库（推荐，真一行）**：`lib/` 提交进仓库、无 prepare——git 源安装不触发构建，`dsh plugin --profile web add "github:...#&path:/..."` 一行直接装（console 已按此改造，实测 14s 装 + 挂载通过）。
- **prepare 现场构建（备选，产物不入库时）**：bundle 的 `package.json` 带 `prepare` 脚本（如 `"prepare": "tsdown --config tsdown.config.ts"`，**别用 `pnpm run build`**——pnpm 在 npm 装的目录会触发 deps status check 循环失败），pnpm ≥10 阻止时按 dsh 提示在 `$DSH_HOME/profiles/<name>/pnpm-workspace.yaml` 的 `allowBuilds` 白名单加入该依赖后重跑。**allowBuilds 的 key 含冒号，写入 yaml 必须加引号**（无引号 YAML 解析失败）。
- **构建产物已入库**（`lib/` 提交进仓库，无 prepare 或 prepare 非必需）——不受影响，git 源直接可用。

另两个 git 安装实测坑：monorepo 子目录语法是 `#<ref>&path:/<子目录>`（`path:` 前缀 + 前导 `/`，漏写或写成 `&path=dir` 都解析失败）；bundle 的 peer **不要声明 `@deepseek-ai/*` 官方包**——git 安装时 prepare 的 `npm install` 会解析 peer 404 失败（见 1）。

安装说明应写清子目录语法与 allowBuilds 步骤（见 [bundle-plugins.md](bundle-plugins.md)「安装与管理」）。

## 1b. bundle 插件的 patch 层语义

同名 `cordis.patch.yml` 出现在**三个层**，属主不同，写错层是 bundle 特有坑：

| 层 | 位置 | 属主 | 用途 |
|---|---|---|---|
| bundle 包内 | `packages/bundle/*/cordis.patch.yml` | 产品开发者 | 定义组合行（插件声明） |
| profile 层 | `$DSH_HOME/profiles/web/cordis.patch.yml` | 用户 | 启停覆盖（`disabled` 标记） |
| home 层 | `$DSH_HOME/cordis.patch.yml` | 机器级用户 | repository 插件 repositories 列表 |

bundle 插件的**启停覆盖写 profile 层**，不要写进 bundle 包内层（产品层不该动）或 home 层（repository 用）。薄控制台读写的 repository 列表在 home 层。

## 1d. npm 版 dsh 兼容性（2026-08-11 实测，0.0.1-rc.1）

官方私有 npm 库是未来主流分发（`npx -p @deepseek-ai/dsh@0.0.1-rc.1 dsh web`，lib 生产模式）。实测与源码版（0810 快照）的差异：

- **bundle 生态兼容** ✓：console（`dsh plugin --profile web add` 安装、`/installed` 合并枚举、启停）在 npm 版全功能正常。
- **repository 插件不可用** ❌：npm 版私有库（181 包）无 `@deepseek-ai/dsh-repository-plugin`，base 组合行也无 repository-plugins 插件——**运行时缺失**（不是安装 404，是加载都不尝试）。过渡桥（prepare-cache）在 npm 版下无效。repository 插件生态（含 whale-girl 参考实现 + 本 skill 主路径）需源码版 dsh 或等官方发布。
- **"路由 200"不可作挂载判据**：npm 版 httpServer 对未匹配路由返回 200 SPA fallback 主页（`__DSH_BOOT__` HTML）；源码版返回 404。验证挂载看响应体（JSON/HTML）而非状态码。
- **代理坑**：npm/pnpm 下载走环境代理会超时卡死——装 npm 包用 `env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u all_proxy` 直连（实测 519 包 2 分钟 vs 代理 10 分钟+超时）。
- **token 展开坑**：pnpm 项目级 `.npmrc` **不展开** `${NPM_TOKEN}`（安全策略，凭据须在用户级 `~/.npmrc` 或 `pnpm config set`）；npm 支持项目级 `${VAR}` 展开。

## 2. 已挂载插件改源码需 web 重启（ESM 缓存）

`index.mjs`/src 改动后，disable/enable/CLI 重装**都不生效**——ESM 模块缓存按 URL 永久缓存，`mount()` 的 `import(entryUrl)` 无 query bust，同 URL 二次 import 返回旧模块。**只能 web 重启**。

- 例外：进程内**从未 import 过**的插件（禁用态启动后首次面板 enable）首次 import 即新代码，无需重启。
- 重启后日志须无 `plugin tree failed to load`。

## 3. 挂载失败排查顺序

日志 `plugin tree failed to load` 时按序查：

1. `dsh.entry` 路径指向 `.dsh-plugin/` **外** → containment 违规，安装失败
2. `scripts.prepack` 缺失/未调用 `dsh-plugin-prepare` → wrapper 未生成
3. 依赖解析失败（见坑 1）——本地验证环境缺 symlink/mock registry
4. `dsh` 字段用了 `skills`/`mcpServers`/`entry` 之外的值 → strict schema 拒绝

## 4. 宿主环境覆盖注入的 CSS

宿主全局 CSS 可能覆盖插件注入的 `<style>`（清理 style 标签或更高优先级类）。插件 UI 关键样式**用 JS 内联**（内联优先级最高，宿主无法覆盖），不要依赖 CSS class 注入。

- 实例：插件状态卡/菜单按钮曾裸文字（宿主覆盖 class），改 JS 内联修复。
- 第一次踩到就写 bug-fix 决策记录标注「环境事实」，不等第二次。

## 5. 其他已实证的环境事实

- **页面注入是插件自己的事**：官方无「第三方插件自动悬浮」机制——entry 自造注入点（httpServer 注入 `<script>` 或配置 hole）。
- **工具 schema DSL 违规在挂载时暴露**：CLI enable 只校验名称，`defineTool` value-schema 违规在 web boot/面板 enable（reconcile）时暴露——发现后重启 web 确认日志。
