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

`<包路径>` = 含 `package.json#dsh.bundle` 的 npm 包目录/git 源（`dsh plugin add` 转发 pnpm + 按已安装状态把声明 `dsh.bundle` 的依赖加进 profile 层栈）。本地目录 `cd` 到包目录后 `add .`（dsh 锚定 `.` 为绝对路径）；git 源 monorepo 子目录 `#<commit>&path:/<子目录>`，**产物入库（推荐）→ 真一行**，不入库则 `prepare` + `allowBuilds` 放行——写法细则与坑见 [bundle-plugins.md](bundle-plugins.md)「安装与管理」与 [gotchas.md](gotchas.md) 1c；bundle 不声明官方包依赖（见 [gotchas.md](gotchas.md) 1）。

## 验证按改动面

| 改动触达 | 验证 |
|---|---|
| client/ 源码或构建 | 重建（`build-client.mjs`）+ 浏览器冒烟（headless Chrome dump-dom 断言 DOM marker 存在、无 "Failed to load plugins"） |
| assets/ | 重装 + 刷新页面即可（路由按请求读磁盘，无需重启 web） |
| index.mjs / src（Node half） | 门禁 + **重启 web**（ESM 缓存，见 [gotchas.md](gotchas.md) 2） |

bundle 插件同此表；额外确认挂载后 boot graph 含 bundle id、`/plugins/<id>/client.js` 200（若带 client half）。

## 挂载失败排查

`plugin tree failed to load` 的排查顺序与 containment 违规见 [gotchas.md](gotchas.md) 3。

## 参考实现

验证链路：`/<plugin-id>/ui.js` + `/state` + `/assets/*` 路由、tapIndex 注入、headless 冒烟。
