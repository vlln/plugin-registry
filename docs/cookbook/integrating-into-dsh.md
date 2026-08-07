# Cookbook：集成到 DeepSeek Harness

目标：把 plugin-registry 集成进 DSH 源码环境，让 `dsh plugin` 命令与 Web 设置页插件面板可用。集成方式与社区其他扩展一致：**复制包 + git apply 补丁 + 组合启用**。

两条路径等价：**一键安装**（脚本代劳）或**手动安装**（四步，适合想看清每一步、或基线有差异需对齐时）。

## 前置条件

- DSH 源码环境：官方 0805 快照 `20260805T134133Z` 或兼容布局，pnpm workspace。
- 仓库根目录可 `git apply`（补丁基于官方 0805 快照生成）。

## 一键安装

```sh
node scripts/install-into-dsh.mjs <dsh-monorepo路径>
```

自动完成：复制 `packages/plugin`、`packages/ui-plugin-manager` 进 monorepo → `git apply` 接线补丁（先 dry-run）→ `pnpm install`。脚本校验目标必须是 DSH monorepo 根（含 `package.json` + `pnpm-workspace.yaml`），补丁基线不匹配时提示用 `--3way` 手动对齐。

## 手动安装

### 1. 放插件

把 `packages/plugin/`、`packages/ui-plugin-manager/` 复制到 DSH monorepo 对应路径：

```sh
cp -r packages/plugin DSH_MONOREPO/packages/
cp -r packages/ui-plugin-manager DSH_MONOREPO/packages/client/
```

### 2. 打接线补丁

```sh
git apply patches/dsh-plugin-registry.patch   # 在 DSH monorepo 根目录执行
```

补丁基于官方 0805 快照生成，改动 30 个文件（CLI `dsh plugin` 子命令、apiproxy `plugins` 域、client-modules `registerExternal`、tsconfig、组合挂载、测试与 README——**纯平台接线**，不含示例级数据/渲染缝），验证可干净应用。基线更新导致锚点漂移时，`git apply --3way` 或手动对齐。本补丁只含 plugin-registry 核心机制需要的官方改动；具体插件各自的宿主依赖由各插件仓库自带补丁提供（如 dsh-subagent-tree 的 ui-workspace 会话行 hole 补丁在其仓库 `patches/` 下）。

**验证点**：`git apply --check` 无输出（干净应用）；`git status` 显示改动文件数符合预期。

### 3. 启用插件

```yaml
# base.cordis.yml（或你的组合）
- id: plugin-local
  name: '@deepseek-ai/dsh-plugin'
```

Web 组合再挂载面板：

```yaml
- id: ui-plugin-manager
  name: '@deepseek-ai/dsh-client-ui-plugin-manager'
```

**验证点**：`pnpm install` 后 `dsh registry list` 输出 `no plugins installed`（命令可用）；启动 Web 后设置页出现「插件」面板。

**client half 生效边界**：`dsh registry enable` 是服务端实时（`plugin.list` 立即可见），但 client bundle 在 CLI 进程注册——**已运行的 web 需重启**；Web 面板内启用是同进程，**刷新页面即可**。详见 [creating-a-plugin](creating-a-plugin.md#4-安装启用验证)。

### 4. 冒烟

```sh
dsh registry create acme/smoke && dsh registry install ./smoke && dsh registry enable acme/smoke
dsh registry list    # enabled acme/smoke@0.1.0
dsh registry uninstall acme/smoke
```

## 运行

集成后的树是完整 DSH 检出，按官方推荐方式运行：

```sh
cd <monorepo路径>
npm run build                # 官方：更新检出后先构建（tsc -b + tsdown）
./bin/dsh web                # 官方 launcher，从源码跑（默认 http://127.0.0.1:3080）
```

`./bin/dsh` 是检出自带的 launcher（tsx ESM hook + 本项目 tsconfig paths，见 `scripts/install.sh`），也可把该树设为 `~/.dsh/source/current` 后用 PATH 上的 `dsh web`（官方安装器模式）。**验证 registry 生效**：

```sh
dsh registry list        # 输出 no plugins installed（命令可用）
dsh registry install ./examples/greeter && dsh registry enable acme/greeter
dsh registry list        # enabled acme/greeter@0.2.0
```

启动后浏览器打开日志打印的 URL，设置页出现「插件」面板，插件列表显示已启用插件。

**注意**：用 tsx 源码启动时，确保 `TSX_TSCONFIG_PATH` 指向**这个 monorepo 的 tsconfig.json**（不要残留指向其他 DSH 树的路径），否则 paths 会把 `@deepseek-ai/*` 解析到别的源码树导致服务双注册冲突（如 `service "bashEnv" has been registered`）。

## 常见问题

- **补丁 apply 失败**：基线快照不一致 → `git apply --3way`，冲突处对照 `packages/plugin/plugin/src/` 手动对齐。
- **`dsh plugin` 未知命令**：补丁未应用或 CLI 未重建 → 检查 args.ts 是否含 `plugin` 子命令。
- **Web 面板不出现**：`web.cordis.yml` 缺 `ui-plugin-manager` 行 → 补上并重启 Web。

## 参考

- 层边界与加载路径：[architecture.md](../architecture.md)
- 面板行为：`packages/ui-plugin-manager` README
