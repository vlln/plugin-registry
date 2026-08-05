# plugin/ — 第三方插件注册表家族

English | [中文](README.md)

本地插件注册表 MVP：清单协议、安装/启用管理，以及第三方插件的运行时挂载。目前是单个 **product** 包 —— 注册表是纯文件系统状态，尚无接口/实现 seam 可拆；市场、发布者工具链与更新延后（见 [issue #171](https://github.com/dsh2026/issues/issues/171)）。

| Package | Role | ctx key |
|---|---|---|
| `plugin/` | `dsh.plugin.json` 校验、`<dshHome>/plugins` 下的本地注册表、`dsh plugin` 操作、已启用插件的运行时挂载 | （无；`plugin-local` 插件负责挂载，不提供服务） |

插件在 `dsh.plugin.json` 中声明身份、引擎范围与贡献；CLI 负责安装（默认禁用）、列出、启用、禁用与卸载；运行时把已启用入口挂为一个组 fiber 的子项。被挂载插件是进程内代码 —— 信任边界是显式的人工启用，而非沙箱。
