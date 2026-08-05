# Cookbook：给插件加 client half（浏览器端 UI）

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
dsh plugin install ./my-plugin        # 安装（默认禁用；client.main 缺失会在此时报错）
dsh plugin enable acme/greeter        # 启用：挂载 Node 侧 + 登记 client half
dsh plugin list                       # enabled acme/greeter@0.1.0
```

**验证点**：启用后 Web 刷新页面，bundle 经 `/plugins/acme/greeter/client.js` 进入 `__DSH_BOOT__`，浏览器出现插件 UI；`dsh plugin disable` 后刷新，UI 消失。

## 契约要点

- **id 必须一致**：bundle 里 `load` 的 id 必须等于插件 id（`acme/greeter`），否则浏览器侧 `arrive()` 校验失败。
- **安装时校验**：`client.main` 文件缺失 / 空 `client` 块 → 安装报错（不等到 web 启动才炸）。
- **信任边界不变**：只有 enable 才登记；禁用的插件不进 boot graph、浏览器拿不到其 bundle。
- **`client.inject` vs bundle `inject`**：前者只是图元数据，后者才是 fiber 实际等待的服务——改依赖改 bundle，不是改 manifest。

## 从官方 client 包转 registry 形态

已有官方 client 插件（`@deepseek-ai/dsh-client-*` 双面包，Loader 树通道）想额外提供 registry 发布形态时，用本节流程。已实测实例：`dsh-subagent-tree` 的 `registry/` 目录（[仓库](https://github.com/dsh-external/dsh-subagent-tree)）。

### 官方 cordis 标准包形态与核心冲突

官方 client 包是**双面 npm 包**：Node half（包 `main`，常为空 `apply`，让包出现在 cordis.yml）+ Client half（`exports["./client"]` + `dshClient` 声明，浏览器 bundle）。构建用 `clientBundle(包名, libEntry)`，**banner id = 包名**。

**核心冲突**：registry 插件 id 必须匹配 `publisher/name`（小写字母数字+连字符，无 `@`）；官方包名含 `@`（如 `@deepseek-ai/dsh-client-ui-subagent-tree`）过不了校验。所以 registry 形态必须**单独构建**——把 `clientBundle` 的 id 换成 registry 插件 id。

### 假设 workflow（以 subagent-tree 为实例）

1. **定 registry id**：`<publisher>/<name>`，如 `vlln/subagent-tree`。
2. **建 `dsh.plugin.json`**：
   ```json
   {
     "id": "vlln/subagent-tree",
     "version": "0.1.0",
     "main": "./index.mjs",
     "client": {
       "main": "./client.js",
       "inject": ["@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-ui-primitives", "@deepseek-ai/dsh-client-ui-slots"]
     }
   }
   ```
   - `client.inject` 平移原 `dshClient.inject`（图元数据）；`main` 指向 Node half 的 registry 版（纯 UI 插件用空 `apply` 的函数插件）。
3. **在 DSH monorepo 内构建 registry 版 bundle**（官方工具链 workspace 解析依赖）：staging 复制包进 `packages/client/`（如 `ui-subagent-tree-registry`），保留原 `tsconfig.json`（references 路径仍有效）；覆盖 `tsdown.config.ts` 为 `clientBundle('vlln/subagent-tree', ['lib/types/index.js', 'lib/types/invariant.js'])`；`npx tsc -b` 产 `lib/types`（hole 类型错误只影响 dts，bundle 照常产出）→ `pnpm --filter <包名> run bundle`。
4. **组装发布目录**：`client.js`（+`.map`）+ `index.mjs`（函数插件 Node half）+ `dsh.plugin.json`。
5. **验证**（真实 web 组合）：`dsh plugin install ./registry && dsh plugin enable vlln/subagent-tree`；检查 `__DSH_BOOT__` 含该行、`/plugins/vlln/subagent-tree/client.js` 200、bundle 导出 `inject` + `apply`、所需模块全在平台模块表（`slots`/`runtime`/`primitives`/`react`）；disable 后行移除。

### 与「从零写 client half」的差异

| | 从零写（greeter） | 转官方包（subagent-tree） |
|---|---|---|
| bundle 来源 | 手写或新建构建 | **复用官方 tsdown 构建，只换 id** |
| 依赖面 | 尽量少 | 官方包原有依赖（peerDeps / inject）全部继承 |
| 构建环境 | 可独立 | **必须在 monorepo 内**（`@deepseek-ai/*` workspace 解析） |
| 风险 | 低 | 官方 hole/peer 依赖决定功能是否生效（如 `ui-workspace` 的 `sessionRow` hole） |

### 注意事项

- **react 被 require 正常**：官方 client 包 bundle 同样 require `react`/`react/jsx-runtime`——react 是平台模块表成员，非 registry 化问题。
- **官方通道不动**：转换是「新增发布形态」，原 `dsh-client-*` 包与 Loader 树通道保持原样，两种形态并存。
- **功能依赖不变**：registry 化只改安装/管理形态；组件注册仍需宿主提供官方扩展 hole（原 peerDeps 依赖的 slot 服务）。
