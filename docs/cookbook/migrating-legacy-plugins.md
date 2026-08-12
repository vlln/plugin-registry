# Cookbook：旧机制插件迁移到官方形态

把 plugin-registry 旧机制插件（`dsh.plugin.json` + `dsh registry` + `__ModuleLoader__`，已移除）迁移到官方形态。**0811 起官方移除 repository-plugins 机制**（`vendor/loader/src/repository.ts` 删除），迁移唯一目标是 **bundle 插件**（`dsh.bundle`）或**纯 cordis 插件**（无声明，insert 行挂载）。旧 repository 形态（`.dsh-plugin` + `dsh.entry`）已不可用——原 repository 范本 `whale-girl` 已迁移为官方 bundle（自渲染 client 照常工作）。

## 迁移方向判断

| 旧插件现状 | 迁移目标 | 依据 |
|---|---|---|
| 已有官方 npm/cordis 包 + 增量 `dsh.plugin.json`（如 distill/dsh-vision/chat-width） | **bundle 插件**（`dsh.bundle` + patch） | 删除增量清单，走官方 bundle 通道——包本身没变，只去掉 registry 专属物 |
| 纯旧机制插件（自造 `__ModuleLoader__` client half，如旧 loop/navbar/task-status） | **bundle 插件**（`dsh.bundle` + `dsh.client`） | Node half 已是 Cordis；client 转 `__ModuleLoader__.load` 标准 bundle（whale-girl 迁移范本） |
| 不确定 | 看当前插件形态（[插件类型对比](../plugin-types.md)） | bundle vs 纯 cordis 判据 = 是否带组合层 |

## 迁移步骤（bundle 唯一路径）

1. **删增量清单**：移除 `dsh.plugin.json`（`id`/`contributes` 声明面在官方格式不存在——工具由 entry 内 `defineTool` 注册）
2. **声明 bundle**：`package.json#dsh.bundle`（`patch` 指向组合行 `cordis.patch.yml`，含 insert 挂载自身）；`dsh.client` 声明 + `exports["./client"]`（有 client half 时）
3. **client 转标准 bundle**：`__ModuleLoader__.load({id, factory})`，factory 返回 `{name, apply}`（`exports["./client"]` 指向构建产物）；自渲染 DOM 逻辑保留在 `apply` 内——whale-girl 实证自渲染与 bundle 兼容
4. **Node half**：entry 保持 Cordis（`name`/`inject`/`apply`），`main`/`exports["."]` 指向；`inject` 声明所用服务（0811 cordis 严格注入，未声明即抛错）
5. **安装**：`dsh plugin --profile web add <包路径>`（bundle 进 `dsh.profile.bundles` 层栈）
6. **管理**：薄控制台（bundle 区 + 已加载区启停）

## 迁移后注意

- **官方包未发布到公共 npm**：`@deepseek-ai/dsh-tools` 等本地 `npm i` 失败正常——正式分发由 profile 的 pnpm 闭包挂载时注入（`$DSH_HOME/profiles/node_modules` flat fallback）；本地验证需 symlink/mock registry
- **依赖声明**：bundle 插件**不声明**官方包（profile 闭包注入）；声明了反而解析失败
- **ESM 缓存**：改已挂载插件的 Node half 需 web 重启
- **严格注入**：`inject` 声明 `ctx.get` 用到的全部服务（`settings`/`httpServer` 等），否则 apply 抛 `cannot get property without inject` 致 effect 不注册
