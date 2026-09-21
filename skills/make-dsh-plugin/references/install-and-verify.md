# 安装与验证详情

0811 起外部插件统一经 web profile 安装，两条通道（本文件是 SKILL.md 的深读材料，开发安装面时读取）。

## Bundle 插件安装（重启生效）

```sh
dsh plugin --profile web add <包路径>
```

`<包路径>` = 含 `package.json#dsh.bundle` 的 npm 包目录/git 源（`dsh plugin add` 转发 pnpm + 按已安装状态把声明 `dsh.bundle` 的依赖加进 profile 层栈）。本地目录 `cd` 到包目录后 `add .`（dsh 锚定 `.` 为绝对路径）；git 源 monorepo 子目录 `#<commit>&path:/<子目录>`（**Windows 注意：`dsh plugin` 经 cmd.exe 转发，`&` 是命令分隔符会拆开命令——给用户的安装说明写不带 `&` 的 `#path:/<子目录>` 形式，取默认分支 HEAD，跨平台；钉分支需绕开 dsh 转发，见 [gotchas.md](gotchas.md) 1c**），**产物入库（推荐）→ 真一行**，不入库则 `prepare` + `allowBuilds` 放行——写法细则与坑见 [bundle-plugins.md](bundle-plugins.md)「安装与管理」与 [gotchas.md](gotchas.md) 1c；bundle 不声明官方包依赖（见 [gotchas.md](gotchas.md) 1）。装完**重启 web**（层栈在 boot 合成）。

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
| `inject` / 服务名字面量 / 依赖形态 | 重启 web + **真调一次工具或命令**（见下「三条硬规矩」；这类改动 boot 期看不出来） |

bundle 插件同此表；额外确认挂载后 `__DSH_BOOT__` 含 client 行、`/plugins/<id>/client.js` 200（若带 client half）、无 `loaded without registering` 报错。

## 验证的三条硬规矩

1. **boot 干净 ≠ 功能可用**。依赖解析失败与服务名写错在 boot 期**看不见**（服务惰性读取，错误只在调用时抛）——插件照样装载、工具照样注册。因此「URL 正常输出 + 日志无 `plugin tree failed to load`」是必要不充分，**必须真调一次工具/命令**看返回。
2. **先做负控（prove the failure mode is loud）**。把一份**故意弄坏**的副本装上（删掉 `inject`、或把包放到 profile 树外），确认日志会响亮报错；只有负控响过，"干净日志"才算证据。
3. **mock ctx 单测不能替代真实装载**。手写 mock 不施加 cordis 的严格注入门禁，所以"`apply()` 里注册了 N 个工具"的测试**照不出**缺 `inject` 的启动即崩。单测证明"逻辑对"，真实 profile 启动证明"装得上、起得来"——两者都要，不能互相代替。

## 随包分发 skill（走文件系统发现根）

skill 是跨 harness 的规范，落位方式是**复制或链接 `skills/<name>/` 进发现根**：项目级 `<项目>/.dsh/skills`、`<项目>/.agents/skills`；用户级 `$DSH_HOME/skills`、`~/.agents/skills`（另有 custom 与 bundled 两类）。`dsh.skills` 声明在当前基线不生效——事实与核实方法见 [entry-contract.md](entry-contract.md)「dsh.skills」。

安装说明要给**可直接复制**的命令，例如（插件已装好的用户级链接）：

```sh
ln -s "$DSH_HOME/profiles/web/node_modules/<pkg>/skills/<name>" "$DSH_HOME/skills/<name>"
```


## 挂载失败排查

`plugin tree failed to load` 的排查顺序与严格注入/引号坑见 [gotchas.md](gotchas.md) 3。

## 参考实现

- 仓库内参考实现：`packages/plugin/console`（bundle + `__ModuleLoader__.load` client 完整例子）
