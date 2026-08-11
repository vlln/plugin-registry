# 安装与验证详情

两类插件各一条安装通道：repository 走 `$DSH_HOME/cordis.patch.yml`（config 行），bundle 走 `dsh plugin --profile web add`（pnpm 依赖）。本文件是 SKILL.md 的深读材料，开发安装面时读取。

## Repository 插件安装

```yaml
repository-plugins:
  repositories:
    - github:owner/my-plugin#<commit>&path:/.dsh-plugin
```

- 分发 = GitHub 仓库本身（clone + pnpm prepare + prepack），无发布流程、无注册表。
- 安装与启用分离——插件进入 config 才会挂载。

## Bundle 插件安装

```sh
dsh plugin --profile web add <包路径>
```

`<包路径>` 必须是**可解析的 npm 包**（`dsh plugin add` 把参数转发给 pnpm，再按已安装状态把声明 `dsh.bundle` 的依赖加进 profile 的 bundle 层栈）：

- **本地目录**：指向含 `package.json#dsh.bundle` 的 bundle 包目录（非仓库根），且构建产物在库（`lib/` 等已 build）——`cd` 到目录后 `dsh plugin --profile web add .`（dsh 锚定 `.` 为绝对路径）
- **git 源**：`github:owner/repo#<commit>&path:/<子目录>`（monorepo 子目录需 `&path:/`，注意 `path:` 前缀 + 前导 `/`）或 `git+https://github.com/owner/my-bundle.git#<commit>`。**产物入库（推荐）→ 真一行安装**；产物不入库则需 `prepare` 脚本（git 安装时自动构建）+ pnpm ≥10 的 `allowBuilds` 放行（按 dsh 提示把精确 key——**加引号**——加入 profile 的 `pnpm-workspace.yaml` 后重跑）

写法细则与坑见 [bundle-plugins.md](bundle-plugins.md)；bundle 插件的 `dependencies` 声明为空是设计（官方包由 profile 的 pnpm 闭包注入，见 [gotchas.md](gotchas.md) 1）。

## 验证按改动面

| 改动触达 | 验证 |
|---|---|
| client/ 源码或构建 | 重建（`build-client.mjs`）+ 浏览器冒烟（headless Chrome dump-dom 断言 DOM marker 存在、无 "Failed to load plugins"） |
| assets/ | 重装 + 刷新页面即可（路由按请求读磁盘，无需重启 web） |
| index.mjs / src（Node half） | 门禁 + **重启 web**——ESM 缓存按 URL 永久缓存，已挂载插件改源码 disable/enable 不生效（同 URL 二次 import 返回旧模块） |

bundle 插件同此表；额外确认挂载后 boot graph 含 bundle id、`/plugins/<id>/client.js` 200（若带 client half）。

## 挂载失败排查

- 日志 `plugin tree failed to load` → entry 契约问题（`dsh.entry` 路径 / prepack 缺失 / 依赖解析失败）。
- `dsh.entry` 指向 `.dsh-plugin/` 外 → containment 违规，安装失败。

## 参考实现

验证链路：`/<plugin-id>/ui.js` + `/state` + `/assets/*` 路由、tapIndex 注入、headless 冒烟。
