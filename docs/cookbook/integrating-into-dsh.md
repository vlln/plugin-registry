# Cookbook：集成到 DeepSeek Harness

目标：把 plugin-registry 集成进 DSH 源码环境，让 `dsh plugin` 命令与 Web 设置页插件面板可用。集成方式与社区其他扩展一致：**复制包 + git apply 补丁 + 组合启用**。

## 前置条件

- DSH 源码环境：官方 0804 快照 `20260804T143803Z` 或兼容布局，pnpm workspace。
- 仓库根目录可 `git apply`（补丁基于官方 0804 快照生成）。

## 1. 放插件

把 `packages/plugin/`、`packages/ui-plugin-manager/` 复制到 DSH monorepo 对应路径：

```sh
cp -r packages/plugin DSH_MONOREPO/packages/
cp -r packages/ui-plugin-manager DSH_MONOREPO/packages/client/
```

## 2. 打接线补丁

```sh
git apply patches/dsh-plugin-registry.patch   # 在 DSH monorepo 根目录执行
```

补丁基于官方 0804 快照生成，改动 33 个文件（CLI 子命令、apiproxy `plugins` 域、client-modules `registerExternal`、tsconfig、组合挂载、测试与 README），验证可干净应用。基线更新导致锚点漂移时，`git apply --3way` 或手动对齐。

**验证点**：`git apply --check` 无输出（干净应用）；`git status` 显示改动文件数符合预期。

## 3. 启用插件

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

**验证点**：`pnpm install` 后 `dsh plugin list` 输出 `no plugins installed`（命令可用）；启动 Web 后设置页出现「插件」面板。

## 4. 冒烟

```sh
dsh plugin create acme/smoke && dsh plugin install ./smoke && dsh plugin enable acme/smoke
dsh plugin list    # enabled acme/smoke@0.1.0
dsh plugin uninstall acme/smoke
```

## 常见问题

- **补丁 apply 失败**：基线快照不一致 → `git apply --3way`，冲突处对照 `packages/plugin/plugin/src/` 手动对齐。
- **`dsh plugin` 未知命令**：补丁未应用或 CLI 未重建 → 检查 args.ts 是否含 `plugin` 子命令。
- **Web 面板不出现**：`web.cordis.yml` 缺 `ui-plugin-manager` 行 → 补上并重启 Web。

## 参考

- 层边界与加载路径：[architecture.md](../architecture.md)
- 面板行为：`packages/ui-plugin-manager` README
