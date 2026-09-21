# 开发踩过的坑（Gotchas）

领域特定事实，违反合理假设——**先读本文再动手**。每条都是插件开发实测踩过并修复的（决策记录可溯）。本文件是 SKILL.md 的深读材料。

**事实带基线**：条目内标注核实时的 dsh 版本（无标注者已在 **0.1.5-rc.2** 复核；写明 0.1.2-rc.1 等早期版本的条目为当时实测）。机制契约以官方文档为准（见 SKILL.md「版本与权威来源」）；升级基线时逐条重核。

## 1. 官方包在公共 npm 可见，但仍不可单独安装（依赖闭包由挂载环境提供）

`@deepseek-ai/*` 官方包在公共 npm 可见（`latest` = `0.0.1-rc.1`，另有 `next`/`alpha` 与各 rc 线，如 `0.1.2-rc.1`），但**单独安装不成立**：`@deepseek-ai/dsh-tools@0.1.2-rc.1` 自带 9 个 peer（`@deepseek-ai/cordis`、`dsh-agent`、`dsh-code-runtime`、`dsh-invariants`、`dsh-llm`、`dsh-session`、`dsh-scope`、`dsh-system-prompt`、`dsh-user-approval`）——`npm install` 直接 ERESOLVE 失败（`Could not resolve dependency: peer @deepseek-ai/cordis@"^4.0.2" from @deepseek-ai/dsh-agent`）；要装通就得把整条闭包声明进来，等于把插件版本号与官方版本硬耦合，且每次基线升级都要重对齐。

**纪律**：`dependencies` / `peerDependencies` / `devDependencies` **三处都留空**是设计——官方包由挂载环境的 pnpm 闭包提供。本地需要它们（跑测试、构建）时用 link 配方，而不是声明：

```sh
DSH_AI="$(npm root -g)/@deepseek-ai/dsh/node_modules/@deepseek-ai"   # dsh 安装位置
mkdir -p node_modules/@deepseek-ai
ln -s "$DSH_AI/dsh-tools" node_modules/@deepseek-ai/dsh-tools
```

需要 SDK 才能跑的测试要能在它缺席时**优雅跳过**（`test(name, { skip: ... }, fn)`）并写明原因——否则裸 clone 的 `node --test` 直接报解析错，贡献者以为仓库坏了。

- **semver 预发布**：官方版本是 `0.0.1-rc.N` / `0.1.x-rc.N` 形态；声明 `0.0.1`/`^0.0.1` 匹配不到 rc（npm 预发布规则）——真要在 devDeps 里钉，须写 rc 形态（但见上：更该留空）。
- **正式分发**：走 `github:owner/repo#<ref>` 源，依赖由官方发布环境解析——不需要也不该自己发布或改依赖。
- **判断**：本地 `npm i` / `npm test` 的依赖失败不是你的错——不要改依赖声明，改验证方式。

**bundle 插件同此纪律**：bundle（`dsh.client` 包，如 loop/task-status）同样 import `@deepseek-ai/dsh-tools`/`dsh-llm`，依赖一律由 profile 的 pnpm 闭包提供（见上）。本地装 bundle 需要 SDK 落在包的解析路径上——profile 内安装天然满足，从 profile 树外安装见坑 6。

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

另两个 git 安装实测坑：monorepo 子目录语法是 `#<ref>&path:/<子目录>`（`path:` 前缀 + 前导 `/`，漏写或写成 `&path=dir` 都解析失败）；bundle 的 peer **不要声明 `@deepseek-ai/*` 官方包**——git 安装时若有 prepare 构建，`npm install` 会在官方包的 peer 闭包上 ERESOLVE 失败（见 1）。
**Windows 专属坑（#20）**：`dsh plugin` 在 win32 经 cmd.exe 转发参数，`&` 是命令分隔符——`#<ref>&path:/...` 会被拆开而失败（`ERR_PNPM_INVALID_DEPENDENCY_NAME`）。给用户的安装说明用**不带 `&` 的 `#path:/<子目录>` 形式**（pnpm 原生语法，取默认分支 HEAD，跨平台）；钉分支的 `#<commit>&path:/...` 仅 POSIX 可用，Windows 需绕开 dsh 转发（profile 目录内 `pnpm add "github:...#<commit>&path:/..."` 再 `dsh plugin --profile web install`）。

安装说明应写清所选渠道与相应前置条件（见 [bundle-plugins.md](bundle-plugins.md)「安装与管理」与官方 publish 文档）。

**另两条渠道（不需要用户放行构建权限）**：**npm 预构建**（`pnpm publish` 时构建好 `lib/`，用户 `dsh plugin add <pkg>` 拿到的是产物）；**tarball**（`pnpm pack` 出包，用户 `dsh plugin add ./x-0.1.0.tgz`）。

**`allowBuilds` 的安全语义必须写进安装说明**：它是**允许该包在安装时于用户机器上执行代码**，且不在 agent 运行的任何沙箱之内——只对源码可信的包放行，并建议用户钉 commit（`github:you/plugin#<sha>`）让后续推送无法悄悄改变实际运行的内容。

## 1b. bundle 插件的 patch 层语义

同名 `cordis.patch.yml` 出现在**多个层**，属主不同，写错层是 bundle 特有坑。生效顺序（后应用者按行胜出）：

| # | 层 | 位置 | 属主 | 用途 |
|---|---|---|---|---|
| 1 | 各组合包 patch | 各 bundle 包内 `cordis.patch.yml`，按 `dsh.profile.bundles` 列表顺序 | 产品开发者 | 定义组合行（插件声明） |
| 2 | profile 层 | `$DSH_HOME/profiles/<name>/cordis.patch.yml` | 用户 | insert 行（纯插件挂载）+ 启停覆盖（`disabled` 标记） |
| 3 | home 层 | `$DSH_HOME/cordis.patch.yml` | 用户 | 各 profile 共享的机器本地偏好 |
| 4 | `--patch <path>` overlay | 按 argv 顺序 | 用户 | 一次性实验覆盖 |

两条语义容易踩：**patch 按行（`id`）覆盖，且替换该行的整个 `config`——不是深合并各键**，所以覆盖别人的行必须重述它需要的每一个键；**bundle 的启停覆盖写 profile 层**，不要写进 bundle 包内层（产品层不该动）。

**`patchReload` 的作用域**：它管的是**用户 patch 文件**的热重载（web profile 模板默认 `live`），**不含** `dsh.profile.bundles` 层栈——装/删 bundle 后层栈仍在 boot 时合成，需重启 web（见 2）。

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

## 6. 安装位置决定官方包可达性（从 profile 树外装会拖垮整个启动）

官方包的真实解析源是 **`$DSH_HOME/profiles/node_modules/`**（profiles 层扁平 fallback，含 `@deepseek-ai/*`）。Node 的 ESM 解析从包的**真实路径**逐级向上找 `node_modules`，于是同样一份零依赖包：

| 安装形态 | 包的真实路径 | 结果 |
|---|---|---|
| git 源（`dsh plugin --profile web add github:…`） | `<profile>/node_modules/<pkg>`（在 profile 树内） | 向上命中 profiles 层 fallback → **正常装载** |
| 本地目录（`dsh plugin --profile web add /abs/path`，路径在树外） | 树外（如 `/tmp/…`） | 向上永远到不了 fallback → **装载期抛错** |

失败是**响亮**的，不是"插件不可用"而是**整个 profile 起不来**：

```
dsh: plugin tree failed to load: failed to import loader entry <id> (<pkg>):
Cannot find package '@deepseek-ai/dsh-tools' imported from /abs/path/src/index.mjs
（进程退出码 1）
```

**写安装说明**：零依赖包只给 **git 源**（`dsh plugin --profile web add "github:<owner>/<repo>#<ref>"`）。
本地目录安装留给开发自测，并在文档里写清前置条件——先把 SDK link 进该包的 `node_modules`（配方见坑 1），再 `dsh plugin --profile web add "$PWD"`。别把裸的 `add .` / `add <绝对路径>` 写进面向用户的 README。

推论：**"git 源能装"不能反推"本地目录能装"**，反之亦然——两种形态的解析可达性不同，验证要按实际分发形态做。

## 7. 服务名跨 rc 版本漂移 → 静默功能死

官方服务名会随 rc 改名（实测：`workflows` → **`workflowEngine`**，0.1.2-rc.1）。这类错误的症状特别阴：

- **boot 完全干净**、插件正常装载、工具正常注册——因为服务是**惰性读取**（`ctx.get()`），不静态 inject；
- 只有真正**调用**那个工具/命令时才报 `no "<service>" service in this profile`。

**核实方法**（不要照抄旧笔记或旧插件 README）：

```sh
# 谁提供这个服务、名字到底叫什么
grep -rn "workflowEngine" <dsh 安装>/node_modules/@deepseek-ai/*/lib/*.js | head
# 或看官方同族插件的 inject / ctx.get 用法（同基线版本）
```

**纪律**：服务名与 `inject` 声明都以**当前安装的基线**为准，逐条核实；升级基线时把这类字面量当回归点重查（`grep -rn "ctx.get('" src/`）。
