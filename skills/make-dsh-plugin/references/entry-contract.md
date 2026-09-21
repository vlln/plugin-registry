# Entry 契约详情（Cordis entry + skill + MCP）

本文件是 make-dsh-plugin 的**自带权威契约**（skill 独立分发，不依赖仓库文档）。bundle 形态完整契约见 [bundle-plugins.md](bundle-plugins.md)；本文件聚焦 Node half（Cordis entry）与 skill/MCP 声明。

## 仓库布局

插件是 npm 包，**包根 = 仓库根**（bundle 形态，0811 起无 `.dsh-plugin` 子目录要求）：

```
my-plugin/
├── package.json            # name/version + main/exports + dsh.*
├── cordis.patch.yml        # dsh.bundle.patch 指向的组合层（insert 挂载自身）
├── index.mjs               # Node half 入口：完整 Cordis 插件（main/exports["."]）
├── client/  lib/client.js  # client bundle 源码 / 构建产物（dsh.client 通道）
├── skills/                 # agent skills（SKILL.md 文件树，可选）
├── mcp/                    # MCP server 逻辑（stdio，可选）
└── scripts/                # 门禁与生成器（可选）
```

## package.json——dsh 字段契约

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "./index.mjs",
  "exports": {
    ".": "./index.mjs",
    "./client": "./lib/client.js",
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web" }
  }
}
```

- **`dsh.bundle.patch`**：指向 `cordis.patch.yml`（组合层，含 `- insert: - id: <自身> name: <包名>`）——声明即 bundle，进 profile 层栈
- **`dsh.client`**：`platform: web`——client-modules 只扫描声明它的包（0811 起无声明不进 `__DSH_BOOT__`）。其余现行字段：`inject`（消费的其他 client 模块）、`external`（本行消费的 client 包，用于排模块图顺序；**不得声明自己**）。client 包 extends `tsconfig.base.client.json` 并用共享 tsdown preset（`packages/client/tsdown.client.ts`）
- **`exports["./client"]`**：client bundle 路径（`__ModuleLoader__.load` 注册的构建产物）
- **`main`/`exports["."]`**：指向 Cordis entry（`name`/`inject`/`apply`）
- **`inject` 声明 `ctx.get` 用到的全部服务**（`settings`/`httpServer` 等）——0811 cordis 严格注入，未声明即抛错
- 纯 cordis 插件（无 `dsh.bundle`）可省 `cordis.patch.yml`——经 profile insert 行挂载

### dsh.skills（skill 包）

`SKILL.md` 文件放 `skills/<name>/`，在 `dsh.skills` 声明（相对包根路径）：

```json
"dsh": { "skills": ["./skills/foo/SKILL.md", "./skills/bar/SKILL.md"] }
```

**实测事实（0.1.2-rc.1 与 0.1.5-rc.2 两版均核实）**：`dsh.skills` **没有任何消费方**——声明它不会注册 skill。skill 的实际发现路径是**文件系统根**（`<项目>/.dsh/skills`、`<项目>/.agents/skills`、`$DSH_HOME/skills`、`~/.agents/skills`，外加 custom 与 bundled 两类）。核实某基线是否已支持，用一次全量搜（零命中 = 未支持）：

```sh
grep -rln "dsh\.skills" <dsh 安装>/node_modules/@deepseek-ai/ | head
```

**分发动作**：随包分发靠**复制或链接 `skills/<name>/` 进发现根**（命令见 [install-and-verify.md](install-and-verify.md)「随包分发 skill」）；`dsh.skills` 声明可保留作前向声明（不做严格校验，无害），但安装说明**不能**只靠它。

**SKILL.md 写法**（make-skill 规范）：frontmatter（`name` 1-64 小写连字符、`description` 祈使句「Use this skill when...」、可选 `metadata`/`requires`）+ 正文结构（Tool Wrapper / Generator / Reviewer / Inversion / Pipeline 模式），<500 行，细节 progressive disclosure 到 `references/`。仓库 README 用表格列 skill。

### MCP server

**MCP 不是包 manifest 字段**——不存在 `dsh.mcpServers`（0.1.5-rc.2 全仓 `ts`/`json`/`md` 零命中）。现行可用形态：CLI 随附 **`@deepseek-ai/dsh-mcp-client`**，由 **patch 层的行**逐台配置服务器，把外部 MCP 工具桥接进 `ctx.tools`（名称形如 `mcp__<server>__<tool>`）；**默认不启用任何服务器**，且只桥接工具（资源与提示词不支持）。每条服务器命令都是 agent 沙箱之外的受信任可执行代码，因此由用户显式开启。

另注：Session／SDK 层确有 `mcpServers` 参数，但**非空值未实现**（会话桥以"扩大 workspace scope"为由拒绝）。配置字段以 `packages/mcp/mcp-client/README.md` 与 CLI 行为参考为准。

## Node half——Cordis entry

```js
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'my-plugin'
export const inject = ['httpServer', 'tools']
export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'my_tool',
    description: 'What it does.',
    parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' } },
    execute: async () => 'result',
  }))
}
```

- 能力上限是完整 Cordis——事件（`ctx.on`）、服务（`ctx.provide`）、命令、system prompt、TUI，无需声明。
- **依赖解析**：entry 可 import 官方包（`@deepseek-ai/*`、`cordis`），官方运行时经 profile pnpm 闭包注入（`$DSH_HOME/profiles/node_modules` 扁平 fallback）；**`dependencies`/`peerDependencies`/`devDependencies` 三处都留空**——官方包虽在公共 npm 可见，但自带整条 peer 闭包，单独安装一定失败（细节与本地 link 配方见 [gotchas.md](gotchas.md) 1）。解析可达性依赖安装位置（profile 树内可达），见 [gotchas.md](gotchas.md) 6。
- **注册是 effect**：`ctx.tools.register` 返回 disposer，用 `ctx.effect()`/`ctx.on()` 持有生命周期，disable 时清理。

## client half（可选）——自渲染

带 UI 的插件声明 `dsh.client` + `exports["./client"]`，client bundle 经 `__ModuleLoader__.load({id, factory})` 注册（factory 返回 `{name, apply}`，由 client 内核挂载时调用 `apply(ctx)`）。自渲染 DOM 逻辑放 `apply` 内——**与填官方 hole 正交**（自渲染跑 bundle 照常，参考实现 `packages/plugin/console`）。

构建：esbuild CJS 输出 + 外层 `window.__ModuleLoader__.load` 包装（对齐 `packages/plugin/console` 的 tsdown banner/footer 模式）。

## 安装与验证

见 [install-and-verify.md](install-and-verify.md)（双通道：bundle 层栈重启生效 / 纯 cordis insert 行实时生效）与 [bundle-plugins.md](bundle-plugins.md)。

## 开发规范

- **门禁**：机械检查 + 自证测试（每个门禁有非法样例测试证明会拒绝）；门禁清单在 `scripts/gates/run.mjs`，按改动面跑最窄证据
- **决策记录**：每个非平凡改动随附决策记录（`decisions/implemented/...`）——problem → decision → alternatives → consequences
- **生成物勿手改**：`client.js` 由构建生成（`--check` 守卫新鲜度）
- **首次环境行为即沉淀**：宿主覆盖注入 CSS、严格注入等环境事实，第一次踩坑就写 bug-fix 决策记录标注「环境事实」
