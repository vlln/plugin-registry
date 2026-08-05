# @deepseek-ai/dsh-plugin

English | [中文](README.zh.md)

Local plugin registry and manifest protocol: install, enable, and mount third-party plugins from the local filesystem.

## What it is

One package with four surfaces. **Manifest protocol**: a plugin root ships `dsh.plugin.json` declaring identity (`publisher/name` id), a semver `version`, a relative `main` entry (a Cordis plugin), an `engines.dsh` range, and declared `contributes` (tools and skills). **Registry**: `<dshHome>/plugins` holds one directory per installed plugin plus an `index.json` of install records (`version`, `enabled`, `installedAt`); `installPlugin` / `setEnabled` / `uninstallPlugin` / `listPlugins` operate on it as plain filesystem facts. **Catalog**: `$DSH_HOME/plugins-catalog.json` lists discoverable plugins with a local source directory each — the browse/install data source for the web panel, shaped like Obsidian's community-plugins list so a remote registry can later replace the file without touching the API or UI. **Runtime service**: the `plugin-local` function plugin (`name` / `inject` / `Config` / `apply`, no default export) provides `ctx.plugins` (`PluginLocalService`) and mounts every enabled plugin's `main` entry as a child of one group fiber, so disposal unloads them all.

Installation records a plugin as **disabled**; only an explicit enable (CLI, API, or the web panel) mounts it. Enable and disable are **live**: the service mounts or unmounts the plugin immediately, and the index update persists only after a successful mount. This is the trust boundary of the MVP: code executes only after a human explicitly opts in, and enablement is per-install, never implicit.

## CLI

The `dsh` binary owns the commands; this package owns the operations behind them.

| Command | Effect |
|---|---|
| `dsh plugin install <dir\|tgz>` | validate `dsh.plugin.json` and `engines.dsh` against the running dsh version, copy the directory (or the plugin root inside the tarball, extracted with strict traversal protection) into the registry, record `enabled: false` |
| `dsh plugin create <id>` | scaffold a plugin root (`dsh.plugin.json` + entry + README) in the current directory, pre-validated by the same parser install uses |
| `dsh plugin list` | list installed plugins, sorted by id, with enabled state and description |
| `dsh plugin enable <id>` / `dsh plugin disable <id>` | flip the install record and mount/unmount live |
| `dsh plugin uninstall <id>` | remove the plugin directory and its index record |

## Plugin

`inject: []` — the local registry is read directly from disk; no services are required.

### Config

| Field | Default | Meaning |
|---|---|---|
| `dshHome` | `$DSH_HOME` or `~/.dsh` | Harness home whose `plugins` directory is mounted, resolved by `@deepseek-ai/dsh-paths` |
| `harnessVersion` | `0.0.1` | The running dsh version checked against `engines.dsh` at install; deployments should set it to their real version |

## Service

`ctx.plugins` (`PluginLocalService`) is the runtime registry face used by the web panel and any live harness: `list()` merges catalog and installed state into browse rows; `install(id)` installs a catalog entry disabled; `enable(id)` mounts immediately and persists only on success; `disable(id)` unmounts immediately; `uninstall(id)` unmounts and removes the registry record; `reconcile()` is the load-time sweep of enabled plugins.

## Manifest protocol

A plugin root is a directory with `dsh.plugin.json` plus its entry module:

```json
{
  "id": "acme/cool-tool",
  "version": "0.1.0",
  "main": "./index.mjs",
  "description": "a demo plugin",
  "engines": { "dsh": ">=0.0.1" },
  "contributes": { "tools": ["cool_read"], "skills": [] }
}
```

`main` must default-export or named-export a Cordis plugin (function, class, or object with `apply`); `parseManifest` validates the shape with schemastery, `checkEngine` rejects an unsatisfied `engines.dsh` with the running version in the message, and install fails loud when the entry file is missing. The entry module is loaded with the Loader's `default ?? module` normalization (ESM and CJS both work).

## Model Experience

Indirectly, through the plugins this package mounts: each enabled plugin's registered tools join the request when the composition mounts `plugin-local`.

#### KV Cache effect

Prefix-stable while the mounted set and each plugin's definitions are unchanged; enable/disable changes the mounted set and invalidates reuse from the affected schemas.

## Known Limitations and Deferred Work

- **Local catalog only** — `plugins-catalog.json` entries point at local directories; there is no remote registry, marketplace, or discovery service.
- **No updates** — version is recorded but never re-checked; reinstalling a changed source directory fails with "already installed" until uninstalled, and there is no update command.
- **Web client bundles not distributed** — the panel manages host-side plugins only; a third-party plugin's browser bundle has no `dshClient`/`__DSH_BOOT__` distribution path yet.
- **`contributes.tools` is verified, `contributes.skills` is not** — a mounted plugin that declares a tool it never registers fails the mount with the missing names; the declared skill list is still informational.
- **Trust boundary is human opt-in only** — mounted plugins are in-process code with full service access; the sandbox (`ctx.sandbox`) confines tool calls, not plugins. No signing, publisher identity, or review.
- **Whole-directory copy** — `installPlugin` copies the source tree including `node_modules` and build artifacts; no dependency resolution or pruning.
- **No REAL-composition snapshot yet** — mounting and the web panel are covered by unit/component tests; an assembled-application transcript that boots a leaf with `plugin-local` mounted is deferred.
