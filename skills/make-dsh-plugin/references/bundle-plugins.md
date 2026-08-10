# Bundle 插件开发详情（dshClient 包）

官方两类插件之一。bundle = 随组合分发的产品服务（profile 驱动），与 repository 插件（用户独立安装，config 驱动）互补。选型与完整对比见 SKILL.md Step 0 形态表。本文件是 make-dsh-plugin 的自带参考（独立分发不依赖仓库 docs）。

## 形态

bundle 插件是**独立 npm 包**（或包目录），声明 `dsh.bundle`：

```json
{
  "name": "my-bundle",
  "version": "0.1.0",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "exports": { "./client": "./client/index.js" }  // dshClient 通道（可选）
}
```

- **`dsh.bundle.patch`**：指向组合行声明（`cordis.patch.yml`——定义该 bundle 挂载哪些插件 id）
- **`exports["./client"]`**：dshClient 通道（浏览器端 bundle 进 `__DSH_BOOT__`）——官方静态 client 通道

## cordis.patch.yml（组合行声明）

```yaml
# my-bundle：向组合挂 Node half（命令/工具/路由）
- insert:
    - id: my-bundle
      name: 'my-bundle'
```

插件本体仍是完整 Cordis 插件（`apply(ctx)` + `defineTool` 等，与 repository 的 entry 相同语义）。

## 开发

- **Node half**：同 repository 的 entry（Cordis 插件 + `defineTool` 注册工具 + 服务/事件/命令）
- **client**（可选）：`__ModuleLoader__` 契约的浏览器 bundle（经 `exports["./client"]` 进 `__DSH_BOOT__`），或自渲染（同 repository）
- **构建**：`tsdown` 或官方 client preset——Node half 产物 + client bundle 产物

## 依赖解析（与 repository 不同）

- bundle 插件 `dependencies` **声明为空是设计**——`@deepseek-ai/*` 官方包由 profile 的 pnpm 闭包在挂载时注入
- **不要声明官方包**：声明了公共 npm 解析不到反而失败（repository 插件则声明、由官方环境解析——两类相反）
- 本地装 bundle 需官方 monorepo 构建产物 link 进 profile

## 安装与管理

**安装**：`dsh plugin --profile web add <包路径>`——`<包路径>` 必须是**可解析的 npm 包**：

- **本地目录**：指向**含 `package.json#dsh.bundle` 的 bundle 包目录**（而非仓库根或源码目录），且**构建产物在库**（`lib/` 等 `files` 声明的内容已 build）：
  ```sh
  dsh plugin --profile web add ./packages/my-bundle   # bundle 包子目录，已构建
  ```
  ❌ 不要写仓库根（`dsh plugin --profile web add ./`）——根不是 npm 包，无 `dsh.bundle`。
- **git 源**：官方经 npm git 依赖语法解析，**必须满足**：① 仓库内是完整 npm 包（`package.json#dsh.bundle` 在包根）；② **构建产物已入库**（git 源不跑 build，`lib/` 必须提交）——否则挂载时缺产物失败。
  ```sh
  dsh plugin --profile web add git+https://github.com/owner/my-bundle.git#<commit>
  ```
  ❌ 不要写 `git+file://`（本地 file 协议非分发形态）或未构建的 git 源。

**写安装说明时**（README/skill 输出）：给出**用户能直接复制执行**的命令——本地路径写清 bundle 子目录与构建前提；git 源写清需构建产物入库。不要给「指向仓库根」或「臆造协议」的说明。

- **启停**：写 profile 层 `$DSH_HOME/profiles/web/cordis.patch.yml` 的 `<id>: disabled: true/false`（Loader 树 patch 语义）
- **管理**：薄控制台 UI 插件区（profile 层）
- 同名 `cordis.patch.yml` 三层归属（bundle 包内声明 / profile 层启停 / home 层 repository）——**别写错层**

## 验证

- 挂载后 boot graph 含 bundle id；`/plugins/<id>/client.js` 200（若带 client）
- 改 Node half 源码需 web 重启（ESM 缓存）
- 改 client bundle 重装 + 刷新页面即可

## 参考实现

- `dsh-loop`（`/loop` 命令 + loop 工具 + client 状态条）
- `dsh-task-status`（后台任务状态条）
- 薄控制台 `packages/plugin/console`（本仓库，bundle 形态的官方样例）
