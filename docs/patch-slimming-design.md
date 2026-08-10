# 设计：patch 瘦身（49 → 5）

状态：**实施中**（A 类试点 + B 类面板路由已完成，见「实施进度」；剩余：apiproxy 域移除、重建 patch、验证站端到端）。目的：把 plugin-registry 打进官方树的改动收敛到「能力结构性必需」的最小集，其余机制件转分发包（复制进 monorepo 的 `packages/`），使基线升级重放成本从 49 文件降到 ~5 文件。**能力零下降**：每处外置都保留原能力（A 类为「实现文件搬家 + import 改向」，B 类为「面板调用架构重写」，详见各类成本），只有「必须改官方源码的接线」留在 patch。

## 实施进度

- ✅ **A 类试点**（registry.ts 外置）：机制分支 cd7e19e4——CLI 实现移入 `packages/plugin/plugin/src/cli.ts`（含 `RegistryInvocation` 类型下沉），`apps/cli` 只留 args.ts re-export + bin.ts 动态导入改 `@deepseek-ai/dsh-plugin`；CLI 全生命周期验证通过
- ✅ **B 类面板路由**（管理面 host 化）：机制分支 86e720cd——plugin 包新增 `panel-route.ts`（`/api/plugin-registry` 前缀路由，`ctx.inject(['httpServer'])` 挂载）；ui-plugin-manager client 改 fetch 自建路由（去 connection/apiproxy 依赖）；web 端到端（list/enable/disable/install 语义/错误回报）验证通过
- ✅ **apiproxy plugins 域移除**：机制分支 731215dd——域实现/schema/rpc-map/fetch/index 全删（-391 行），connection fixture/fake-api 清 mock；apiproxy+plugin+connection 500 测试全过；瘦身验证站（/tmp/dsh-0808-slim，机制分支 worktree）端到端：CLI + 面板自建路由 + 热更新帧全通
- ✅ **瘦身 patch 阶段产物**：`patches/dsh-plugin-registry-0808-slim.patch`（26 文件，相对 49 收敛 47%）——纯净 0808 基线 `git apply --check` 通过 + 真实安装顺序（先复制 packages 再 apply）无重叠；正式 0808 patch 保留未动
- ⏳ 剩余：bash/tasks peek 外置（插件作者面，7 文件）、热更新帧链路评估（4 文件，独立于 plugins 域）、正式 patch 替换（收敛到 ~10 文件内）、文档基线标注同步

## 审计结论

0808 patch（`patches/dsh-plugin-registry-0808.patch`，49 文件）按「是否必须进官方树」分四类：

| 类 | 判定 | 文件数 | 去向 |
|---|---|---|---|
| A | 官方树不存在的**纯新增文件**（实现或测试），本不该在 patch 里 | 12 | 转分发包 `packages/` |
| B | 改官方行为，但**可 0 侵入替代**（面板自建路由可达同等能力） | 15 | 转分发包 `packages/` |
| C | 构建/依赖接线（tsconfig/package.json/.gitignore） | 6 | 随 A/B 外置大部分消失 |
| D | **必须改官方源码**（无 0 侵入等价物） | 5 | **留在 patch** |

分类依据：`git cat-file -e 57ffa9de:<path>` 判 A 类（0808 官方不存在）；其余按「改动是否触碰官方未开放能力」判 B/C/D。

## A 类：纯新增文件 → 转分发包（12 文件）

0808 官方快照中**不存在**，patch 里的 `+N/-0` 全新文件。git apply 直接创建，官方树无对应物——本质是「复制分发包误入 patch」的同类问题（0807/0808 曾修 ui-plugin-manager，此处为未清完的存量）。

| 文件 | 说明 |
|---|---|
| `apps/cli/src/registry.ts` | CLI `dsh registry` 的实现（94 行） |
| `packages/host/apiproxy/src/api/plugins.ts` | apiproxy plugins 域实现 |
| `packages/host/apiproxy/src/api/plugins.schema.ts` | plugins 域 zod schema |
| `packages/host/apiproxy/tests/api-proxy-plugins.spec.ts` | 插件域测试 |
| `packages/host/apiproxy/tests/events-schema.spec.ts` | 帧 schema 测试 |
| `packages/client/runtime/tests/apply-graph.spec.ts` | 浏览器 diff 应用器测试 |
| `packages/client/runtime/tests/fake-api.ts` | runtime 测试 fake |
| `packages/client/connection/tests/fake-api.ts` | connection 测试 fake |
| `packages/client/modules/tests/node-half.spec.ts`（新增行 117） | modules 测试 |
| `packages/client/modules/tests/loader.spec.ts`（新增行 23） | modules 测试 |
| `packages/bash/*/tests/*.spec.ts`（4 个） | bash peek 测试 |

**去处**：A 类中与 registry 核心机制强耦合的实现文件（registry.ts、plugins.ts、plugins.schema.ts）进 `packages/`（作为分发包源）；测试文件随各自包迁移。验证点：`git apply --check` 对瘦身后的 patch 通过，且瘦身前后的安装树 diff 仅差「文件来源」（patch 创建 vs 复制），`git diff` 无内容差异。

### A 类外置的前置条件（import 耦合）

「纯新增文件」≠「可独立外置」——A 类实现文件与官方文件存在 import 耦合，外置前必须解耦：

| 文件 | 耦合 | 解耦方案 |
|---|---|---|
| `apps/cli/src/registry.ts` | `import type { RegistryInvocation } from './args.ts'`（D1 官方文件） | 把 `RegistryInvocation` 类型**下沉到分发包**（如 `@deepseek-ai/dsh-plugin/cli`），`args.ts` 改为从分发包 re-export——类型定义随文件走，官方 `args.ts` 只留 `import type` 一行 |
| `packages/host/apiproxy/src/api/plugins.ts` | `import type { RpcRequest, RpcResponse } from './rpc.ts'`（apiproxy 内部类型） | 分发包内定义最小 RPC 类型面（或从 apiproxy 导出类型；因 plugins 域整体外置，走面板自建路由后不再有该依赖） |

**CLI 动态导入（外置可行性的关键）**：`apps/cli/src/bin.ts` 用 `await import('./registry.ts')` 动态导入 `runRegistry`——外置只需把该路径改为 `await import('@deepseek-ai/dsh-plugin/cli')`（D 类接线的一部分），registry.ts 即可整体移入分发包。类型下沉 + import 改向均为机械改造（不改行为）。

**结论**：A 类外置实际包含「类型下沉 + 官方文件改 import 源」两个动作，仍属机械性改造（不改行为），但**不是纯文件复制**——实施时机制分支要先做类型下沉提交，再移文件。

## B 类：可 0 侵入替代 → 转分发包（15 文件）

改官方 apiproxy/connection 行为，但**面板所需能力可经官方开放面自建**：

| 文件 | 现改动 | 0 侵入替代 |
|---|---|---|
| `packages/host/apiproxy/src/api-proxy.ts`（+95） | plugins 域挂进官方 ApiProxy | 面板 `ctx.pluginManager` + `ctx.httpServer.register` 自建 `/api` 路由 |
| `packages/host/apiproxy/src/api/events.ts`（+18） | `host/client-graph-changed` 帧 | 面板自建 WebSocket/SSE 推变化（不走官方 events 域） |
| `packages/host/apiproxy/src/api/events.schema.ts`（+4） | 帧 schema | 随上消失 |
| `packages/host/apiproxy/src/api/index.ts`（+4） | ApiProxy 接口加 plugins 域 | 随上消失 |
| `packages/host/apiproxy/src/api/rpc-map.ts`（+6） | RPC 方法表加 plugin.* | 随上消失 |
| `packages/host/apiproxy/src/fetch/client.ts`（+21） | 客户端 RPC 通道加 plugin.* | 面板直连自建路由 |
| `packages/host/apiproxy/src/fetch/handler.ts`（+6） | 路由表加 plugin.* | 随上消失 |
| `packages/host/apiproxy/src/index.ts`（+2） | ApiProxyService 加 plugins 字段 | 随上消失 |
| `packages/client/connection/src/client/api.ts`/`index.ts`（+1/+1） | ClientGraphEntryView 导出 | 随上消失 |
| `packages/client/connection/src/client/fixture.ts`（+12） | plugins fixture | 随上消失 |

**关键论证**：apiproxy `plugins` 域提供的增量 = 「面板走官方 RPC 通道」这一**内部实现选择**，不是能力。面板要的「web 进程内管理插件」完全可由 `ctx.pluginManager`（官方开放服务注入）+ `ctx.httpServer.register`（官方开放路由）自建——mygo 已用同款机制证明（`/api/mygo` 前缀路由 + `settings.section` 面板）。CLI 侧（registry.ts）本就走独立进程直读 JSON，不经 apiproxy。故 plugins 域 + 帧 = 能力可完全外置。

**B 类外置的真实成本（非纯搬家）**：`ui-plugin-manager` 当前是纯 client 面板（Node half 空 apply），其 `api.plugins.*` RPC 走官方 apiproxy 通道（`connection.api`）。外置 = **重写面板调用架构**：

1. 面板 **Node half 新建**：`ctx.httpServer.register` 自建 `/api/plugin-registry` 前缀路由，直调 `ctx.pluginManager`（官方开放服务注入）+ 直读 `<dshHome>/plugins` 索引
2. 面板 **client half 改造**：从 `connection.api.plugins.*`（官方 RPC）改为 fetch 自有 `/api/plugin-registry/*`
3. 浏览器变化推送：自建 WebSocket/SSE（`host/client-graph-changed` 帧不再依赖官方 events 域）

这是独立的面板改造工程（新 Node half + client 调用面重写），不是文件移动。能力面不变（启停/装卸/列表/UI 插件登记全保留），但实施量需单列。

**浏览器 diff 应用器**（`client/runtime/src/client/index.ts` +72、`manager.ts` +7）：现为官方 runtime 内实现，但它读的是 `ctx.get('loader')`/`ctx.get('modules')`（官方 client 服务），**可以在面板 client half（分发包）里实现同逻辑**——面板有自己的 client context，可挂 `settings.section` 并自订阅变化。随 B 类外置。

## C 类：构建接线（6 文件）

`apps/cli/package.json`（+2）、`apps/cli/tsconfig.json`（+6）、`tsconfig.base.json`（+1）、`tsconfig.client.json`（+1）、`.gitignore`（+2）、`apiproxy/tsconfig.json`（+4）——为让新增包进入 monorepo 构建。A/B 类外置后，新包**自带 tsconfig 与依赖声明**（分发包规范），C 类大部分消失；残留仅为 CLI 入口对 registry 实现的引用（随 D 类 CLI 接线保留）。

## D 类：必须进官方树（5 文件，patch 保留）

### D1. CLI 接线（2 文件）

| 文件 | 改动 | 为什么必须 |
|---|---|---|
| `apps/cli/src/args.ts` | `program.command('registry')` + `RegistryInvocation`（+26/-1） | 官方 CLI 的 Commander 子命令树是**静态源码**，无「外部命令注册」扩展点（已核实：官方子命令 run/web/plugin/dump-config 均为 `program.command(...)` 硬编码）。要让 `dsh registry` 存在，注册行必须出现在官方 `args.ts`。 |
| `apps/cli/src/bin.ts` | `case 'registry'` dispatch（+5） | 同上，dispatch 树静态。 |

**前提**：`dsh registry` 这个**命令名**是能力契约。若接受独立命令（`dsh-registry`），D1 也可外置——但命令面进 `dsh` help/补全/集成是 registry 的差异价值，保留。

### D2. 运行时 client 登记（3 文件）

| 文件 | 改动 | 为什么必须 |
|---|---|---|
| `packages/client/modules/src/index.ts` | `registerExternal`/`unregisterExternal` + 碰撞守卫（+76） | 官方 client-modules 只认 Loader 树 + boot 时扫描；「运行期新增一个 client 行」这个动词在官方源码里不存在。`registerExternal` 是补上的第二来源——它必须写在官方包内，因为它是官方扫描器 `processOne` 读取的 table 的操作者。 |
| `packages/client/modules/src/client/manifest.ts` | `ClientModuleLoader` 接口加 `addRow`/`removeStyles`（+15） | 同上，浏览器侧 loader 的运行期增删入口。 |
| `packages/client/modules/src/client/system.ts` | `ClientModuleSystem` 实现（+19） | 同上。 |

**为什么不可 0 侵入**：mygo 的投影桥（生成 bridge 包走 Loader 扫描）可以**绕**（静态进图），但绕的代价是「禁用驻留 / 等 boot」——与「实时进出 + 真移除」不等价。`registerExternal` 是「UI 插件实时进出浏览器」在官方源码里的唯一落点。

## 瘦身后 patch 构成（预期）

```
apps/cli/src/args.ts                     (+26/-1)   D1
apps/cli/src/bin.ts                      (+5)       D1
packages/client/modules/src/index.ts     (+76)      D2
packages/client/modules/src/client/manifest.ts (+15) D2
packages/client/modules/src/client/system.ts   (+19) D2
```

≈ 5 文件 / +141 行。C 类残留（CLI 对 registry 实现的引用）并入 D1 文件计数。

## 能力对比（0 下降证明）

| 能力 | 现在 | 瘦身后 | 差异 |
|---|---|---|---|
| `dsh registry` 子命令 | patch D1 | patch D1 | 无 |
| 面板管理（启停/装卸/列表） | apiproxy plugins 域 | 面板自建路由 + `ctx.pluginManager` | 无（内部通道不同，能力相同） |
| UI 插件实时进出 + 真移除 | `registerExternal`（patch D2） | 同左 | 无 |
| 浏览器 diff 应用器 | 官方 runtime | 面板 client half | 无（同逻辑换宿主） |
| 安装默认禁用 + 校验回滚 | 应用层 | 应用层 | 无 |
| 碰撞守卫 | patch D2 | patch D2 | 无 |
| 官方插件增量兼容 | 依赖 registerExternal | 同左 | 无 |
| 安装流程 | 复制 plugin+ui-plugin-manager + apply patch | 复制 plugin+ui-plugin-manager+新分发包 + apply 小 patch | 复制列表变长，patch 变小 |

## 实施步骤

1. **机制分支**（`feat/plugin-registry-mvp-0808`）：把 A 类实现文件从官方树目录移到 `packages/` 分发包；B 类从官方树目录移入面板分发包；D 类保留原地。
2. **重建 patch**：`git diff <snapshot>..HEAD` 文件范围按新结构收敛到 D1+D2（+C 残留）。
3. **纯净基线验证**：`git apply --check` 通过；按真实安装顺序（先复制全部分发包再 apply）验证不重叠。
4. **分发仓库同步**：install-into-dsh.mjs 复制列表扩容；integrating-into-dsh / distributing-plugins 的 patch 范围重写；CHANGELOG 记录。
5. **验证站**：新基线站（0809）应用瘦身后 patch + 复制全部分发包 → CLI / 面板 / 热更新端到端验证。

## 验证点清单

- [ ] 瘦身后 patch `git apply --check` 纯净通过
- [ ] 真实安装顺序（先复制全部 packages 再 apply）无重叠冲突
- [ ] `dsh registry list` 可用
- [ ] Web 面板启停/装卸/列表可用
- [ ] UI 插件启用后实时进 boot graph、禁用真移除（registerExternal 行为不变）
- [ ] 瘦身前后的能力测试（mechanism 分支既有测试）全过
- [ ] 文档门禁（verify-md-links / verify-doc-budgets / git diff --check）通过

## 相关

- patch 范围契约：[distributing-plugins.md](cookbook/distributing-plugins.md)「形态二」
- 安装流程：[integrating-into-dsh.md](cookbook/integrating-into-dsh.md)、`scripts/install-into-dsh.mjs`
- client half 机制：[registry-client-half-design.md](registry-client-half-design.md)（registerExternal 保留）
- 热更新：[hot-reload-design.md](hot-reload-design.md)（应用器外置，设计不变）
