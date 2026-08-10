# 安装与验证详情

`$DSH_HOME/config.yaml` 一行安装。本文件是 SKILL.md 的深读材料，开发安装面时读取。

## 安装

```yaml
repository-plugins:
  repositories:
    - github:owner/my-plugin#<commit>&path:/.dsh-plugin
```

- 分发 = GitHub 仓库本身（clone + pnpm prepare + prepack），无发布流程、无注册表。
- 安装与启用分离——插件进入 config 才会挂载。

## 验证按改动面

| 改动触达 | 验证 |
|---|---|
| client/ 源码或构建 | 重建（`build-client.mjs`）+ 浏览器冒烟（headless Chrome dump-dom 断言 DOM marker 存在、无 "Failed to load plugins"） |
| assets/ | 重装 + 刷新页面即可（路由按请求读磁盘，无需重启 web） |
| index.mjs / src（Node half） | 门禁 + **重启 web**——ESM 缓存按 URL 永久缓存，已挂载插件改源码 disable/enable 不生效（同 URL 二次 import 返回旧模块） |

## 挂载失败排查

- 日志 `plugin tree failed to load` → entry 契约问题（`dsh.entry` 路径 / prepack 缺失 / 依赖解析失败）。
- `dsh.entry` 指向 `.dsh-plugin/` 外 → containment 违规，安装失败。

## 参考实现

验证链路：`/<plugin-id>/ui.js` + `/state` + `/assets/*` 路由、tapIndex 注入、headless 冒烟。
