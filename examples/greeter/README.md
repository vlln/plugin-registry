# acme/greeter

示例插件：注册一个 `greet` 工具，演示 registry 插件的完整形态。

## 文件

| 文件 | 作用 |
|---|---|
| `dsh.plugin.json` | 清单：身份、入口、兼容范围、`contributes.tools` 声明 |
| `index.mjs` | Cordis 插件入口：`inject: ['tools']` + `ctx.tools.register(...)` |

## 安装与启用

```sh
dsh plugin install ./examples/greeter   # 安装（默认禁用）
dsh plugin enable acme/greeter          # 启用（实时挂载，注册 greet 工具）
dsh plugin list                         # 看到 enabled acme/greeter@0.1.0
```

## 试一下

启用后，模型即可调用 `greet` 工具（参数 `name`，返回 `hello, <name>`）。

## 契约要点

- `contributes.tools` 声明的 `greet` 与入口注册的工具名**必须一致**，否则启用报错并回滚挂载。
- 能力不限工具：插件还能监听事件、提供服务、注册命令等，`contributes` 只是校验范围（详见仓库根 README「能力面 vs 声明面」）。
