# 安装与验证详情

0811 起外部插件统一经 web profile 安装，两条通道（本文件是 SKILL.md 的深读材料，开发安装面时读取）。

## Bundle 插件安装（重启生效）

```sh
dsh plugin --profile web add <包路径>
```

`<包路径>` = 含 `package.json#dsh.bundle` 的 npm 包目录/git 源（`dsh plugin add` 转发 pnpm + 按已安装状态把声明 `dsh.bundle` 的依赖加进 profile 层栈）。本地目录 `cd` 到包目录后 `add .`（dsh 锚定 `.` 为绝对路径）；git 源 monorepo 子目录 `#<commit>&path:/<子目录>`，**产物入库（推荐）→ 真一行**，不入库则 `prepare` + `allowBuilds` 放行——写法细则与坑见 [bundle-plugins.md](bundle-plugins.md)「安装与管理」与 [gotchas.md](gotchas.md) 1c；bundle 不声明官方包依赖（见 [gotchas.md](gotchas.md) 1）。装完**重启 web**（层栈在 boot 合成）。

## 纯 cordis 插件安装（实时生效）

```sh
dsh plugin --profile web add <包>       # 装依赖（进 profile node_modules）
```

然后 profile `cordis.patch.yml` 写 insert 行（**配置 HMR 实时挂载，零重启**）：

```yaml
- insert:
    - id: my-plugin
      name: 'my-plugin'                 # 必须加引号（YAML @ 开头是保留指示符）
```

## 验证按改动面

| 改动触达 | 验证 |
|---|---|
| client/ 源码或构建 | 重建（`build-client.mjs`）+ 浏览器冒烟（headless Chrome dump-dom 断言 DOM marker 存在、无 "Failed to load plugins"） |
| assets/ | 重装 + 刷新页面即可（路由按请求读磁盘，无需重启 web） |
| index.mjs / src（Node half） | 门禁 + **重启 web**（ESM 缓存，见 [gotchas.md](gotchas.md) 2） |

bundle 插件同此表；额外确认挂载后 `__DSH_BOOT__` 含 client 行、`/plugins/<id>/client.js` 200（若带 client half）、无 `loaded without registering` 报错。

## 挂载失败排查

`plugin tree failed to load` 的排查顺序与严格注入/引号坑见 [gotchas.md](gotchas.md) 3。

## 参考实现

- 仓库内参考实现：`packages/plugin/console`（bundle + `__ModuleLoader__.load` client 完整例子）
