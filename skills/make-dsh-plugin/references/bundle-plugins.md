# Bundle 插件开发详情（dsh.client 包）

0811 官方插件形态之一（repository-plugins 机制已移除）。bundle = 声明 `dsh.bundle.patch` 的 npm 包（带组合层），经 profile 层栈安装；与纯 cordis 插件（insert 行实时挂载）互补。选型见 SKILL.md Step 0 形态表。本文件是 make-dsh-plugin 的自带参考（独立分发不依赖仓库 docs）。

## 形态

bundle 插件是**独立 npm 包**（或包目录），声明 `dsh.bundle`：

```json
{
  "name": "my-bundle",
  "version": "0.1.0",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "exports": { "./client": "./client/index.js" }  // dsh.client 通道（可选）
}
```

- **`dsh.bundle.patch`**：指向组合行声明（`cordis.patch.yml`——定义该 bundle 挂载哪些插件 id）
- **`exports["./client"]`**：`dsh.client` 通道（浏览器端 bundle 进 `__DSH_BOOT__`）——官方静态 client 通道

## cordis.patch.yml（组合行声明）

```yaml
# my-bundle：向组合挂 Node half（命令/工具/路由）
- insert:
    - id: my-bundle
      name: 'my-bundle'
```

插件本体仍是完整 Cordis 插件（`apply(ctx)` + `defineTool` 等）。

## 开发

- **Node half**：标准 Cordis entry（`name`/`inject`/`apply` + `defineTool` 注册工具 + 服务/事件/命令）
- **client**（可选）：`__ModuleLoader__` 契约的浏览器 bundle（经 `exports["./client"]` 进 `__DSH_BOOT__`），或自渲染（`apply(ctx)` 内直接操作 DOM）
- **构建**：`tsdown` 或官方 client preset——Node half 产物 + client bundle 产物

## 依赖解析

- bundle 插件 `dependencies` **声明为空是设计**——`@deepseek-ai/*` 官方包由 profile 的 pnpm 闭包在挂载时注入
- **不要声明官方包**：声明了公共 npm 解析不到反而失败——官方包由 profile 的 pnpm 闭包挂载时注入（`$DSH_HOME/profiles/node_modules` flat fallback）
- 本地装 bundle 需官方 monorepo 构建产物 link 进 profile（见 [gotchas.md](gotchas.md) 1）

## 安装与管理

**安装**：`dsh plugin --profile web add <包路径>`——`<包路径>` 必须是**可解析的 npm 包**：

- **本地目录**：指向**含 `package.json#dsh.bundle` 的 bundle 包目录**（而非仓库根或源码目录），且**构建产物在库**（`lib/` 等 `files` 声明的内容已 build）：
  ```sh
  cd packages/my-bundle && dsh plugin --profile web add .   # 包目录内 add .（dsh 锚定 . 为绝对路径）
  ```
  ❌ 不要写仓库根（`dsh plugin --profile web add ./`）——根不是 npm 包，无 `dsh.bundle`。
- **git 源**：官方经 npm git 依赖语法解析（`github:owner/repo#<commit>&path:/<子目录>`、`git+https://github.com/owner/my-bundle.git#<commit>` 等 pnpm 语法均可用）。bundle 在 monorepo 子目录时用 **`#<commit>&path:/<子目录>`**（注意 `path:` 前缀 + 前导 `/`，实测 plugin-registry 的 console 即 `github:vlln/plugin-registry#main&path:/packages/plugin/console`）。**产物入库是推荐做法**（`lib/` 等构建产物提交进仓库，`files` 声明）——git 源安装不跑构建，产物直接可用，**真一行安装**（`dsh plugin --profile web add "github:owner/repo#ref&path:/packages/my-bundle"`，无额外步骤）。**产物不入库的备选**：带 `prepare` 脚本（如 `"prepare": "tsdown --config tsdown.config.ts"`）让 git 安装时自动构建——但 pnpm ≥10 默认阻止 git 依赖的 prepare，需按 dsh 提示把精确 key（**写入 yaml 时加引号**——含冒号，无引号 YAML 解析失败）加入 profile 的 `pnpm-workspace.yaml` `allowBuilds` 后重跑（多一步交互）。
  ```sh
  dsh plugin --profile web add "github:owner/my-bundle#<commit>&path:/packages/my-bundle"
  ```
  ❌ 不要写未构建且无 prepare 的 git 源（缺产物挂载失败）；`git+file://` 本地可达但不是分发形态（对远端用户不可用），别写进安装说明。

**写安装说明时**（README/skill 输出）：给出**用户能直接复制执行**的命令——本地路径写清 bundle 子目录与构建前提；git 源写清子目录语法（`&path:/`）、prepare 构建与 `allowBuilds` 放行。不要给「指向仓库根」或「臆造协议」的说明。

- **启停/两层归属**：同名 `cordis.patch.yml` 两层（bundle 包内声明 / profile 层用户 insert+启停）别写错层，见 [gotchas.md](gotchas.md) 1b

## 验证

- 挂载后 boot graph 含 bundle id；`/plugins/<id>/client.js` 200（若带 client）
- 改 Node half 源码需 web 重启（ESM 缓存）
- 改 client bundle 重装 + 刷新页面即可

## 参考实现

- `dsh-loop`（`/loop` 命令 + loop 工具 + client 状态条）
- `dsh-task-status`（后台任务状态条）
- 薄控制台 `packages/plugin/console`（本仓库，bundle 形态的官方样例）
