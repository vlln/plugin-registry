# @deepseek-ai/dsh-client-ui-plugin-manager

English | [中文](README.zh.md)

The web Settings section that manages the local plugin registry: browse, search, install, enable/disable, and uninstall.

## What it is

A browser-half settings plugin (`dshClient` declaration, `exports["./client"]`). It registers a `settings.section` row (`id: 'plugins'`) in the settings shell and renders the plugin panel: a search box filters the browse rows (id or description), each row shows install/enable state and the matching action buttons, and every action goes through the host `plugins` API (`plugin.list/install/enable/disable/uninstall`). Enable/disable mount/unmount the plugin live on the host; the panel refreshes its list after each action.

The package has no host-side behavior beyond the empty `apply` that puts it on the Loader roster; the node half and browser half are the standard dshClient dual-face shape.

## Model Experience

None, as the browser-only panel manages the local plugin registry through the host plugins API and registers no model surface.

#### KV Cache effect

None: the panel neither composes prompts nor alters tool schemas.

## Known Limitations and Deferred Work

- **Host-side plugins only** — the panel manages `ctx.plugins` entries; third-party web client bundles have no `dshClient`/`__DSH_BOOT__` distribution path yet.
- **Static copy** — the panel labels are static Chinese strings; locale wiring (re-register on language change) is deferred.
- **No remote catalog** — the browse list comes from the local `plugins-catalog.json`; a marketplace with search/download is deferred.
