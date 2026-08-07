---
name: plugin-registry-create
description: >
  Use this skill when the user wants to develop a new plugin for the
  the dsh plugin registry (the third-party plugin layer managed by
  @deepseek-ai/dsh-plugin): scaffold a plugin root, write the Cordis entry,
  keep contributes in sync, add an optional browser client half, then
  install/enable/verify it with the dsh CLI. Also covers converting an
  existing official npm/cordis plugin into a registry release form via the
  incremental-compat manifest (one dsh.plugin.json, no rebuild). This is the
  community plugin-registry skill — not the official harness cordis toolset —
  for creating registry plugins that live under <dshHome>/plugins.
license: BSD-3-Clause
metadata:
  author: dsh-external/plugin-registry
  version: "0.3.0"
requires:
  bins:
    - dsh
---

# Create a plugin-registry plugin

This skill covers creating a **registry plugin**: a directory with
`dsh.plugin.json` + a Cordis entry, installed under `<dshHome>/plugins` and
managed by `dsh plugin` / the Web plugin panel. It is the third-party layer
above the official cordis.yml Loader tree — do not confuse it with the
harness's own plugins. A registry plugin is Node-only by default and may
additionally ship a browser client half (see Stage 6).

## When to use

- The user wants to build a new plugin for dsh (tool, event listener, service,
  command, prompt, TUI overlay).
- The user wants a plugin with browser UI / client-side behavior (client half).
- The user wants to convert an existing official npm/cordis plugin into a
  registry-managed release form (incremental compat, no rebuild).
- The user asks for a scaffold / example / template of a registry plugin.
- The user has a plugin that fails to enable and the cause is a contributes
  mismatch.

## Workflow

### Stage 1: Pick the id

Plugin id is either `publisher/name` (native form) or a scoped npm package
name `@scope/name` (incremental-compat form for official plugins whose bundle
id is their package name). Both are exactly two slash-separated segments of
lowercase alphanumerics plus `-`/`.`, never `.`/`..` or `?`/`#`/`%`. The
segment after the slash is the directory name under `<dshHome>/plugins`.

### Stage 2: Scaffold the root

```sh
dsh registry create <publisher>/<name>
```

Creates `./<name>/` with `dsh.plugin.json` (validated manifest), `index.mjs`
(empty Cordis entry), and `README.md`. The scaffolded manifest already passes
install-time validation, so a fresh root is guaranteed installable.

**Checkpoint:** the directory exists with all three files; `dsh.plugin.json`
has `id`, `version`, `main`, `engines.dsh`, `contributes`.

### Stage 3: Write the entry

`index.mjs` exports a Cordis plugin: a function, a class, or an object with
`apply(ctx)`. Register capabilities through ctx services:

```js
import { defineTool } from '@deepseek-ai/dsh-tools'

export default {
  name: 'my-tool',
  inject: ['tools'],               // wait for the official-tree tools service
  apply(ctx) {
    ctx.tools.register(defineTool({
      name: 'my_tool',
      description: 'What it does.',
      parameters: { /* JSON Schema */ },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      execute: async (args) => 'result',
    }))
  },
}
```

Other surfaces: `ctx.on()` events, `ctx.provide()` services, `ctx.commands`,
`ctx.systemPrompt`, `ctx.settings`, `ctx.tui` overlay. A plugin that registers
tools must declare `inject: ['tools']` (or whatever services it uses) so
Cordis waits for them.

### Stage 4: Sync contributes

Every tool registered by the entry must be listed in
`contributes.tools` in `dsh.plugin.json`, and every listed tool must be
registered. This is the manifest contract — enable fails loud and rolls the
mount back on mismatch.

**Checkpoint:** the sets match exactly; re-read both files and compare names
character-for-character.

### Stage 5: Install, enable, verify

```sh
dsh registry install ./<name>        # installs disabled by default
dsh registry enable <publisher>/<name>
dsh registry list                    # expect: enabled <publisher>/<name>@<version>
```

Enable mounts the plugin live into the running harness. If it fails, the
error lists the declared-but-unregistered tools; fix the entry or the
manifest, never both silently.

**Checkpoint:** `dsh registry list` shows the plugin enabled with the expected
version.

### Stage 6: Add a browser client half (optional)

A registry plugin may ship a browser bundle that enters `window.__DSH_BOOT__`
at enable. Three pieces:

1. **Manifest**: add a `client` object to `dsh.plugin.json`:
   ```json
   { "client": { "main": "./client.js", "inject": ["@deepseek-ai/dsh-client-connection"] } }
   ```
   `main` (required, validated at install) is the bundle path; `inject` is
   graph metadata only.
2. **Bundle**: a script calling `window.__ModuleLoader__.load({ id, factory })`
   where `id` **must equal the plugin id** and `factory(require)` returns a
   Cordis plugin export (inject + apply). External deps must be platform
   modules (`connection`/`runtime`/`ui-slots`/`react`…); everything else
   inlines. Build with the tsdown client preset or any bundler following the
   contract.
3. **Verify**: enable, then check the bundle is served under
   `/plugins/<id>/client.js` and appears in `__DSH_BOOT__` after a page
   refresh. Only enabled plugins register; disable removes the row.

**Checkpoint:** after enable, `curl /plugins/<id>/client.js` returns 200 and
the boot graph contains the id.

### Stage 7: Convert an official plugin (incremental compat, optional)

An existing official plugin (npm/cordis package with `dshClient` +
`exports["./client"]`, Loader-tree channel) gains a registry release form by
adding **one `dsh.plugin.json` — no rebuild**: the manifest id is the package
name (`@scope/name`), which equals the bundle's ModuleLoader id, so the
browser `arrive()` check holds and the same artifacts serve both channels
(spec: `docs/official-plugin-incremental-compat.md`; proven on
`dsh-web-terminal`).

1. Write `dsh.plugin.json`: `id` = package name, `version` copied from
   `package.json`, `main` pointing at the existing Node half build,
   `client.main` at the existing client bundle, `client.inject` mirroring
   `dshClient.inject`.
2. If the plugin's install relies on an npm `postinstall` side effect (e.g.
   fixing a native binary's executable bit, like node-pty's macOS
   `spawn-helper`), registry installs do not run postinstall — add a small
   entry module that performs the fix then re-exports the plugin body, and
   point `main` at it (see `dsh-web-terminal`'s `registry.mjs`).
3. Install, enable, verify against the real web composition.

**Checkpoint:** the boot graph contains the package-name id and
`/plugins/<id>/client.js` serves the **original** bundle (no rebuild).

**Boundary:** the two channels are mutually exclusive — if the plugin is
already enabled via the Loader tree, the registry enable is rejected by the
`registerExternal` collision guard; pick one channel per deployment.

## Gotchas

- **Install is disabled by default.** A plugin never executes until the user
  explicitly enables it — that is the trust boundary, don't tell users to
  install-and-run in one step.
- **contributes is a validation scope, not a capability ceiling.** Only
  `tools`/`skills` are declared; events, services, commands, prompts work
  without a declaration. Do not invent extra manifest fields.
- **Registry plugins are not in the Loader tree.** They never appear in
  cordis.yml / dump-config output. Their client half is registered at runtime
  via `registerExternal`, not through the Loader scan — a client plugin that
  must ship with the product itself stays a standalone `dsh-client-*` package;
  a client plugin installed by the user is a registry plugin with a `client`
  field.
- **bundle id must equal the plugin id.** `window.__ModuleLoader__.load` id
  and the manifest `id` must match, or the browser-side `arrive()` check
  fails. Under incremental compat the plugin id **is** the package name
  (`@scope/name`), so an official bundle works as-is.
- **Official plugins and registry are mutually exclusive per deployment.**
  `registerExternal` rejects an id that collides with a Loader entry — a
  plugin already enabled via the Loader tree cannot also be registry-enabled
  (the Node half would mount twice). Pick one channel.
- **`client.inject` vs bundle `inject`.** The manifest `client.inject` is
  graph metadata; the fiber's actual service waits come from the bundle's own
  exported `inject`. Change deps in the bundle, not the manifest.
- **Registration is an effect.** `ctx.tools.register(...)` returns a
  disposer; prefer `ctx.effect()`/`ctx.on()` for lifecycle-owned
  registrations so disable cleans up.
- **`dsh registry create` id must contain `/`.** `dsh registry create my-tool`
  fails; use `publisher/my-tool`.

## Reference

A complete, installable example lives in this repo at `examples/greeter/`
(manifest + Node entry + hand-written client half); `examples/README.md` is
the human-facing from-scratch guide; `examples/greeter/README.md` documents
the client bundle contract. The full client-half mechanics and design live in
`docs/registry-client-half-design.md`; the official-package conversion is
covered by `docs/official-plugin-incremental-compat.md` (spec) and
`docs/cookbook/adding-a-client-half.md` (workflow). For registry
mechanics (index, lock, rollback) read `packages/plugin/plugin/src/registry.ts`
and its consistency tests.
