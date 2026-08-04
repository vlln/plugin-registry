# plugin/ — third-party plugin registry family

English | [中文](README.zh.md)

The local plugin registry MVP: manifest protocol, install/enable management, and runtime mounting of third-party plugins. One **product** package today — the registry is plain filesystem state, so there is no interface/implementation seam to split yet; a marketplace, publisher tooling, and updates are deferred (see [issue #171](https://github.com/dsh2026/issues/issues/171)).

| Package | Role | ctx key |
|---|---|---|
| `plugin/` | `dsh.plugin.json` validation, local registry under `<dshHome>/plugins`, `dsh plugin` operations, runtime mounting of enabled plugins | (none; the `plugin-local` plugin mounts plugins, no service) |

Plugins declare identity, engine range, and contributions in `dsh.plugin.json`; the CLI installs (disabled by default), lists, enables, disables, and uninstalls them; the runtime mounts enabled entries as children of one group fiber. A mounted plugin is in-process code — the trust boundary is explicit human enablement, not sandboxing.
