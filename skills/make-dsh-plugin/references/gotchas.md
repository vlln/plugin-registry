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

### 1a. repository 插件已随 0811 机制移除（历史断点）

repository 插件（`.dsh-plugin` + `dsh-repository-plugin` devDep）的安装断点
（官方包 404、prepare-cache 桥）**已随 0811 repository-plugins 机制移除而失效**——
该通道不复存在，勿再使用。原 repository 参考实现 `whale-girl` 已迁移为官方
bundle（见 whale-girl 仓库决策记录）。

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
| profile 层 | `$DSH_HOME/profiles/web/cordis.patch.yml` | 用户 | insert 行（纯插件挂载）+ 启停覆盖（`disabled` 标记），配置 HMR watched |

bundle 插件的**启停覆盖写 profile 层**，不要写进 bundle 包内层（产品层不该动）。0811 起无 home 层 repository 列表。

## 1d. npm 版 dsh 兼容性（2026-08-11 实测，0.0.1-rc.1）

官方私有 npm 库是未来主流分发（`npx -p @deepseek-ai/dsh@0.0.1-rc.1 dsh web`，lib 生产模式）。实测与源码版（0810 快照）的差异：

- **bundle 生态兼容** ✓：console（`dsh plugin --profile web add` 安装、`/installed` 合并枚举、启停）在 npm 版全功能正常。
- **0811 起 repository 插件不可用** ❌：repository-plugins 机制删除（`vendor/loader/src/repository.ts` 移除），外部插件统一是 npm 包（bundle / 纯 cordis）。
- **"路由 200"不可作挂载判据**：npm 版 httpServer 对未匹配路由返回 200 SPA fallback 主页（`__DSH_BOOT__` HTML）；源码版返回 404。验证挂载看响应体（JSON/HTML）而非状态码。
- **代理坑**：npm/pnpm 下载走环境代理会超时卡死——装 npm 包用 `env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u all_proxy` 直连（实测 519 包 2 分钟 vs 代理 10 分钟+超时）。
- **token 展开坑**：pnpm 项目级 `.npmrc` **不展开** `${NPM_TOKEN}`（安全策略，凭据须在用户级 `~/.npmrc` 或 `pnpm config set`）；npm 支持项目级 `${VAR}` 展开。

## 2. 已挂载插件改源码需 web 重启（ESM 缓存）

`index.mjs`/src 改动后，disable/enable/CLI 重装**都不生效**——ESM 模块缓存按 URL 永久缓存，`mount()` 的 `import(entryUrl)` 无 query bust，同 URL 二次 import 返回旧模块。**只能 web 重启**。

- 例外：进程内**从未 import 过**的插件（禁用态启动后首次面板 enable）首次 import 即新代码，无需重启。
- 重启后日志须无 `plugin tree failed to load`。

## 3. 挂载失败排查顺序

日志 `plugin tree failed to load` 时按序查：

1. `exports["."]`/`main` 指向不存在/无法解析的入口 → 包入口错误
2. `inject` 未声明 `ctx.get` 用到的服务（`settings`/`httpServer` 等）→ 0811 严格注入抛错
3. 依赖解析失败（见坑 1）——本地验证环境缺官方包闭包
4. insert 行 `name:` 未加引号（YAML `@` 开头是保留指示符）→ 解析失败

## 4. 宿主环境覆盖注入的 CSS

宿主全局 CSS 可能覆盖插件注入的 `<style>`（清理 style 标签或更高优先级类）。插件 UI 关键样式**用 JS 内联**（内联优先级最高，宿主无法覆盖），不要依赖 CSS class 注入。

- 实例：插件状态卡/菜单按钮曾裸文字（宿主覆盖 class），改 JS 内联修复。
- 第一次踩到就写 bug-fix 决策记录标注「环境事实」，不等第二次。

## 5. 其他已实证的环境事实

- **client 经 `__ModuleLoader__.load` 注册**：0811 client-modules 只扫描声明 `dsh.client` 的包，client bundle 必须 `__ModuleLoader__.load({id, factory})`——否则报 `loaded without registering`。
- **严格注入**：`ctx.get` 未在 `inject` 声明的服务 → `cannot get property without inject`，apply 开头即抛、整个 effect 不注册（路由全 fallback 成 SPA 主页）。
- **工具 schema DSL 违规在挂载时暴露**：CLI enable 只校验名称，`defineTool` value-schema 违规在 web boot/面板 enable（reconcile）时暴露——发现后重启 web 确认日志。
