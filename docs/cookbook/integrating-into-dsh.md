# Cookbook：集成到 DeepSeek Harness

> **历史文档（2026-08 转向后）**：本文描述 plugin-registry 已移除的独立机制（patch/CLI/`ctx.plugins`），仅作决策依据与演进记录保留；当前形态见 [official-0809-coverage](../official-0809-coverage.md) 与 `packages/plugin/console`。


目标：把 plugin-registry 集成进 DSH 源码环境，让 `dsh registry` 命令与 Web 设置页插件面板可用。集成方式与社区其他扩展一致：**复制包 + git apply 补丁 + profile bundle 挂载**（0806 起官方用 profile/bundle 组合机制，见 [官方 dsh plugin / bundle](../manifest-format.md)）。

两条路径等价：**一键安装**（脚本代劳）或**手动安装**（四步，适合想看清每一步、或基线有差异需对齐时）。

## 前置条件

- **本仓库（两种获取方式，后续所有命令都在本仓库根执行）**：

```sh
# 方式 A：git clone
git clone https://github.com/dsh-external/plugin-registry.git
cd plugin-registry

# 方式 B：GitHub Releases 下载源码包
#   在 https://github.com/dsh-external/plugin-registry/releases 下载
#   最新 release 的 Assets：plugin-registry-<版本>.tar.gz（或 .zip）
tar -xzf plugin-registry-<版本>.tar.gz   # 解压出 plugin-registry-<版本>/ 目录
cd plugin-registry-<版本>
```

  一键 / 手动安装里的 `packages/`、`patches/`、`scripts/` 均相对**本仓库根**（clone 目录或解压出的 `plugin-registry-<版本>/`），非 DSH monorepo。

- **DSH 源码环境**：官方 0808 快照 `20260808T121140Z`（commit `57ffa9de`）或兼容布局的 DSH monorepo 检出（pnpm workspace）。
- 仓库根目录可 `git apply`（补丁基于官方 0808 快照生成）。

## 一键安装

```sh
node scripts/install-into-dsh.mjs <dsh-monorepo路径>
```

自动完成：复制 `packages/` 下全部分发包进 monorepo → `git apply` 接线补丁（先 dry-run）→ `pnpm install`。脚本校验目标必须是 DSH monorepo 根（含 `package.json` + `pnpm-workspace.yaml`），补丁基线不匹配时提示用 `--3way` 手动对齐。

## 手动安装

### 1. 放插件（分发包）

`packages/` 下全部分发包复制到 DSH monorepo 对应路径：

```sh
cp -r packages/plugin DSH_MONOREPO/packages/
cp -r packages/ui-plugin-manager DSH_MONOREPO/packages/client/
# 瘦身后的实现分发包（CLI registry 实现、apiproxy 域、浏览器应用器等）按 packages/ 结构复制
```

### 2. 打接线补丁

```sh
git apply patches/dsh-plugin-registry-0808.patch   # 在 DSH monorepo 根目录执行
```

补丁基于官方 0808 快照生成，**只含必须改官方源码的接线**（约 5 文件：CLI `dsh registry` 注册 + client-modules `registerExternal`/`addRow`/`removeStyles`），不含复制分发包；范围契约见 [patch 瘦身设计](../patch-slimming-design.md)。基线漂移时 `git apply --3way` 或手动对齐。

**验证点**：`git apply --check` 无输出（干净应用）；`git status` 显示改动文件数符合预期。

### 3. 挂载 registry 服务（profile bundle）

0806 起组合由 profile/bundle 层合成，不再有 `web.cordis.yml`。registry 服务以官方 bundle 形态挂进 profile：

```sh
dsh plugin --profile web add <this-repo>/packages/bundle/dsh-plugin-registry
```

该 bundle 的 patch 向组合 insert 两行（plugin-local + ui-plugin-manager），两包是 app（apps/cli）的 workspace 依赖，经 profile 依赖 fallback（`<dshHome>/profiles/node_modules`）解析——bundle 自身不声明依赖。

**验证点**：`dsh --profile web --dump-config | grep plugin-local`（组合含两行）；`dsh registry list` 输出 `no plugins installed`（命令可用）；Web 设置页出现「插件」面板。

**client half 生效边界**：CLI `registry enable` 需重启已运行的 web（client bundle 在 CLI 进程注册）；Web 面板内启用同进程，刷新即可。详见 [creating-a-plugin](creating-a-plugin.md#4-安装启用验证)。

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
（旧机制示例，已移除——当前经 config.yaml 安装，见 creating-a-repository-plugin）
dsh registry list        # enabled acme/greeter@0.2.0
```

启动后浏览器打开日志打印的 URL，设置页出现「插件」面板，插件列表显示已启用插件。

**注意**：用 tsx 源码启动时，确保 `TSX_TSCONFIG_PATH` 指向**这个 monorepo 的 tsconfig.json**（不要残留指向其他 DSH 树的路径），否则 paths 会把 `@deepseek-ai/*` 解析到别的源码树导致服务双注册冲突（如 `service "bashEnv" has been registered`）。

## 常见问题

- **补丁 apply 失败**：基线快照不一致 → `git apply --3way`，冲突处对照 `packages/plugin/plugin/src/` 手动对齐。
- **`dsh registry` 未知命令**：补丁未应用或 CLI 未重建 → 检查 args.ts 是否含 `registry` 子命令。
- **Web 面板不出现**：registry bundle 未加进 profile（`dsh plugin --profile web add ...` 或 `dsh.profile.bundles` 缺它）→ 补上并重启 Web；或 ui-plugin-manager 不在 app 依赖闭包（fallback 解析不到）。

## 参考

- 层边界与加载路径：[architecture.md](../architecture.md)
- 面板行为：`packages/ui-plugin-manager` README
