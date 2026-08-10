# Cookbook：给插件加 client half（浏览器端 UI）

> **历史文档（2026-08 转向后）**：本文描述 plugin-registry 已移除的独立机制（patch/CLI/`ctx.plugins`），仅作决策依据与演进记录保留；当前形态见 [official-0809-coverage](../official-0809-coverage.md) 与 `packages/plugin/console`。


目标：让 registry 插件带浏览器端 bundle——启用后进入 `__DSH_BOOT__`，在 Web 端呈现/运行（工具之外的 UI、DOM 操作、client 服务协作）。前置：DSH 源码环境已集成 plugin-registry（见 [集成到 dsh](integrating-into-dsh.md)），插件已按 [创建插件](creating-a-plugin.md) 走通 Node 侧。

## 1. 声明 client 字段

`dsh.plugin.json` 增加 `client` 对象：

```json
{
  "id": "acme/greeter",
  "client": {
    "main": "./client.js",
    "inject": ["@deepseek-ai/dsh-client-connection"],
    "immediately": false
  }
}
```

| 字段 | 必填 | 含义 |
|---|---|---|
| `main` | ✅ | 浏览器 bundle 相对路径（相对插件根）；**安装时校验文件存在** |
| `inject` | 可选 | 图元数据（进 `__DSH_BOOT__` 行）；浏览器 fiber 的实际 inject 由 bundle 自身导出决定 |
| `immediately` | 可选 | stage-one 预取；缺省懒加载 |

## 2. 写 bundle（模块表面契约）

bundle 是浏览器侧会变成 loader entry 的脚本，**默认导出必须是 Cordis 插件**（函数 / 类 / 带 `apply(ctx)` 的对象），否则 entry 无法激活、boot 报 failed：

```js
// 构建产物形态（tsdown client preset 生成；id 必须等于插件 id）
window.__ModuleLoader__.load({
  id: 'acme/greeter',
  factory: (require) => {
    // 返回 Cordis 插件导出面
    return {
      name: 'greeter-client',
      inject: ['@deepseek-ai/dsh-client-connection'],  // fiber 级服务等待
      apply(ctx) { /* 浏览器端逻辑 */ },
    }
  },
})
```

## 3. 构建产物

两个途径：

1. **在 dsh 源码环境内**：插件目录放 `tsdown.config.ts`，引用 dsh 的 client preset 或等价配置，产出 `client.js` 随插件分发。
2. **任意 bundler**：按契约手工产出（外部依赖只能是平台模块 `connection`/`runtime` 等，其余内联；跨插件值导入是运行时 loud 错误，协作走 cordis 服务）。

完整契约见 [registry client half 设计稿](../registry-client-half-design.md#构建契约bundle-格式--模块表面)；可安装示例：`examples/greeter`（含手写 `client.js` 与源码）。

## 4. 安装、启用、验证

```sh
dsh registry install ./my-plugin        # 安装（默认禁用；client.main 缺失会在此时报错）
dsh registry enable acme/greeter        # 启用：挂载 Node 侧 + 登记 client half
dsh registry list                       # enabled acme/greeter@0.1.0
```

**验证点**：启用后 Web 刷新页面，bundle 经 `/plugins/acme/greeter/client.js` 进入 `__DSH_BOOT__`，浏览器出现插件 UI；`dsh registry disable` 后刷新，UI 消失。

## 3.5 client half 的 UI 自由度

client half 是浏览器端**完整 Cordis 插件**（`apply(ctx)` 在浏览器执行），UI 能力三层：

| 方式 | 机制 | 需官方 hole？ | 适用 |
|---|---|---|---|
| **填官方 hole** | `ctx.slots.register` 进 `SlotMap` 扩展点（如 `sidebar.workspaces.*`） | ✅ | 深度集成官方 UI |
| **自渲染** | 直接操作 DOM（`createElement`+`appendChild` 或 React portal） | ❌ | 浮层、标记、面板——`examples/greeter` 即此形态 |
| **无 UI 行为** | `ctx.commands` / `ctx.on` / `ctx.provide` | ❌ | 命令、监听、后台行为 |

**关键认知**：client half **不局限于填 hole**——`examples/greeter` 零 slot 依赖，`body.appendChild` 画标记。「改官方 UI 结构」（往官方组件树内部插入）才受限于官方预留的 hole——所有 client 插件（官方包同样）的通用边界；「新增自己的 UI/行为」完全自由。选型：嵌入官方树内部 → 填 hole；只要自己的可见表面 → 自渲染。

**hole 缺失时**：`ctx.slots.register` 类型与运行时都要求 hole 存在。官方树未声明期望的 hole（如 ui-workspace 至今无 `sidebar.workspaces.sessionRow`）时，填 hole 的组件不注册——两个补救：由依赖该 hole 的**插件项目自带补丁**补声明（如 dsh-subagent-tree 仓库 `patches/`；plugin-registry 补丁不含插件特定改动），或改用自渲染。

## 契约要点

- **id 必须一致**：bundle 里 `load` 的 id 必须等于插件 id（`acme/greeter`），否则浏览器侧 `arrive()` 校验失败。
- **安装时校验**：`client.main` 文件缺失 / 空 `client` 块 → 安装报错（不等到 web 启动才炸）。
- **信任边界不变**：只有 enable 才登记；禁用的插件不进 boot graph、浏览器拿不到其 bundle。
- **`client.inject` vs bundle `inject`**：前者只是图元数据，后者才是 fiber 实际等待的服务——改依赖改 bundle，不是改 manifest。

## 从官方 client 包转 registry 形态

已有官方 client 插件（`@deepseek-ai/dsh-client-*` 双面包，Loader 树通道）想额外提供 registry 发布形态时，用**增量兼容**：加一个 `dsh.plugin.json` 增量清单即可，**bundle 零重构建**（规范见 [官方插件增量兼容](../official-plugin-incremental-compat.md)）。已实测实例：`dsh-subagent-tree` 的 `registry/` 目录（[仓库](https://github.com/dsh-external/dsh-subagent-tree)）。

### 增量清单

```json
{
  "id": "@deepseek-ai/dsh-subagent-tree",
  "version": "0.1.0",
  "main": "./lib/index.js",
  "client": {
    "main": "./lib/client.js",
    "inject": ["@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-ui-primitives", "@deepseek-ai/dsh-client-ui-slots"]
  }
}
```

- **id 用 npm 包名**（含 `@`）：registry 现在接受 scoped 包名 id，`bundle 内 ModuleLoader id === 增量清单 id === registry 插件 id` 三者合一，`arrive()` 校验天然成立——**官方构建的 bundle 原样可用，不需要单独构建**。
- `version` 必填，抄 `package.json`；`main` 指向 Node half 构建产物；`client.inject` 平移原 `dshClient.inject`。
- **互斥边界**：同一插件两种安装方式强制二选一——若插件已在官方 Loader 树（`config.yaml` 启用），registry `enable` 会被碰撞守卫拒绝（`registerExternal` 拒绝与 Loader entry 同名），请走官方通道；反之亦然。

### 组装发布目录

`client.js`（官方构建产物，原样）+ `lib/index.js`（Node half）+ `dsh.plugin.json`（增量清单）+ `package.json`（原样，官方通道仍需）。

### 验证（真实 web 组合）

`dsh registry install ./registry && dsh registry enable @deepseek-ai/dsh-subagent-tree`（**前提：该插件未在官方 Loader 树启用**）；检查 `__DSH_BOOT__` 含该行、`/plugins/@deepseek-ai/dsh-subagent-tree/client.js` 200、bundle 导出 `inject`+`apply`、所需模块全在平台模块表；disable 后行移除。

### 注意事项

- **官方通道不动**：转换是「新增发布形态」，原 `dsh-client-*` 包与 Loader 树通道保持原样；两种形态的 bundle 是同一份产物（增量清单不改 bundle）。
- **功能依赖不变**：registry 化只改安装/管理形态；组件注册仍需宿主提供官方扩展 hole（如 `sessionRow`）——该 hole 由**插件项目自带补丁**提供（如 dsh-subagent-tree `patches/`），不属于 plugin-registry 补丁。
- **依赖闭包**：registry 通道的副本从 checkout node_modules 解析依赖（deps-link），官方包依赖需在官方树闭包内。
