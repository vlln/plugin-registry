# 卸载（插件与 registry 自身）

> **历史文档（2026-08 转向后）**：本文描述 plugin-registry 已移除的独立机制（patch/CLI/`ctx.plugins`），仅作决策依据与演进记录保留；当前形态见 [official-0809-coverage](../official-0809-coverage.md) 与 `packages/plugin/console`。


本 cookbook 覆盖两个层次：**卸载已安装的插件**，以及**把 plugin-registry 从 DSH 中移除**（集成反操作）。前置：已按 [集成到 dsh](integrating-into-dsh.md) 接入 registry。

## 卸载插件

CLI：

```sh
dsh registry uninstall <id>          # 如 dsh registry uninstall vlln/navbar
```

Web 面板：设置页「插件」区 → 目标插件 → 卸载。

**行为**：`uninstall` = `unmount`（Node half 卸载、client half `unregisterExternal`）→ 删除 `<dshHome>/plugins/<id>` 目录 → 更新索引。浏览器端 boot graph 的行在**下次页面刷新**后移除（与「启用后刷新生效」一致的跨页面语义）。

**与 `disable` 的区别**：

| | `disable` | `uninstall` |
|---|---|---|
| 目录 | 保留 | **删除** |
| 索引记录 | 保留（enabled=false） | **删除** |
| 再启用 | `enable` 即恢复 | 需重新 `install` |

**卸载后清理**：正常卸载会删净目录。异常中断（进程被杀）可能残留目录或索引不一致——`dsh registry list` 复查，残留目录手动 `rm -rf <dshHome>/plugins/<id>`。

## 卸载 registry 本身（从 DSH 移除）

按集成流程的反向操作（在 DSH monorepo 根目录）：

```sh
# 1. 移除 profile 挂载：从 profile 的 dsh.profile.bundles 去掉 registry bundle
#    （或 dsh plugin --profile web remove @vlln/plugin-console）

# 2. 回滚接线补丁（与 install-into-dsh.mjs 的 git apply 相反）
git apply -R patches/dsh-plugin-registry-0808.patch

# 3. 删除 copy-in 的插件实现包
rm -rf packages/plugin packages/client/ui-plugin-manager

# 4. 还原官方文件（若工作树只有 patch 改动；否则手动还原 patch 涉及文件）
git checkout -- .

# 5. 重新解析依赖（移除了两个 workspace 包）
pnpm install
```

**已安装插件的处理**：registry 卸载**不会**删除 `<dshHome>/plugins/` 下的插件目录与索引——那是插件数据，不是 registry 机制本身。需要一并清理时手动 `rm -rf <dshHome>/plugins/`（含 `index.json` 与 `node_modules` deps-link）。

**验证**：`./bin/dsh web` 启动无 plugin-local 错误；设置页无「插件」面板；`dsh registry` 子命令不存在（回到官方 CLI 面）。

## 常见问题

- **卸载失败 / 索引不一致**：`dsh registry uninstall` 重试；仍失败则检查 `<dshHome>/plugins/index.json` 与目录是否匹配，手动修正。
- **uninstall 后浏览器仍显示插件 UI**：boot graph 变更跨页面生效——刷新页面。
- **目录被占用（Windows）**：先停掉 `dsh web` 再卸载。
- **卸载 registry 后 `dsh web` 报错**：确认 profile 的 bundles 列表已移除 registry bundle、patch 已回滚（`git apply -R` 失败说明基线漂移，按 `--3way` 提示手动对齐）。

## 参考

- [创建插件](creating-a-plugin.md)（安装/启停正向流程）
- [集成到 dsh](integrating-into-dsh.md)（集成正向流程，本页为其反操作）
- [架构](../architecture.md)（`uninstall` 生命周期：unmount + 删目录 + 索引提交）
