---
name: plugin-registry-create
description: >
  Use this skill when the user wants to develop a new plugin for the
  dsh plugin registry (the third-party plugin layer managed by
  @deepseek-ai/dsh-plugin): scaffold a plugin root, write the Cordis entry,
  keep contributes in sync, add an optional browser client half, then
  install/enable/verify it with the dsh CLI. Also covers converting an
  existing official @deepseek-ai/dsh-client-* package into a registry
  release form. This is the community plugin-registry skill — not the
  official harness cordis toolset — for creating registry plugins that
  live under <dshHome>/plugins.
license: BSD-3-Clause
metadata:
  author: dsh-external/plugin-registry
  version: "0.2.0"
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
- The user wants to convert an existing official `@deepseek-ai/dsh-client-*`
  package into a registry-managed release form.
- The user asks for a scaffold / example / template of a registry plugin.
- The user has a plugin that fails to enable and the cause is a contributes
  mismatch.

## Workflow

### Stage 1: Pick the id

Plugin id is `publisher/name` (must contain a slash; the segment after it is
the directory name). `publisher` is the author's namespace, `name` the plugin.

### Stage 2: Scaffold the root

```sh
dsh plugin create <publisher>/<name>
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
dsh plugin install ./<name>        # installs disabled by default
dsh plugin enable <publisher>/<name>
dsh plugin list                    # expect: enabled <publisher>/<name>@<version>
```

Enable mounts the plugin live into the running harness. If it fails, the
error lists the declared-but-unregistered tools; fix the entry or the
manifest, never both silently.

**Checkpoint:** `dsh plugin list` shows the plugin enabled with the expected
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

### Stage 7: Convert an official client package (optional)

To add a registry release form to an existing `@deepseek-ai/dsh-client-*`
package (dual-face npm package, Loader-tree channel), the registry form needs
a **separate build**: the official bundle's banner id is the package name,
which usually contains `@` and fails the registry `publisher/name` id check.
Workflow (proven on `dsh-subagent-tree`):

1. Pick a registry id (`publisher/name`, no `@`).
2. Write `dsh.plugin.json` with `client.inject` mirroring the package's
   `dshClient.inject` and `main` pointing at a function-plugin Node half
   (empty apply for pure-UI plugins).
3. Build inside a DSH monorepo: staging-copy the package under
   `packages/client/`, override `tsdown.config.ts` with
   `clientBundle('<registry-id>', ['lib/types/index.js', 'lib/types/invariant.js'])`,
   run `tsc -b` (type errors from missing official holes only affect dts),
   then bundle.
4. Assemble the release dir (`client.js` + Node entry + manifest), install,
   enable, and verify against the real web composition.

**Checkpoint:** the registry bundle loads from `/plugins/<id>/client.js`,
exports inject + apply, and requires only platform-table modules.

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
  fails. An official package name with `@` is never a valid registry id.
- **`client.inject` vs bundle `inject`.** The manifest `client.inject` is
  graph metadata; the fiber's actual service waits come from the bundle's own
  exported `inject`. Change deps in the bundle, not the manifest.
- **Registration is an effect.** `ctx.tools.register(...)` returns a
  disposer; prefer `ctx.effect()`/`ctx.on()` for lifecycle-owned
  registrations so disable cleans up.
- **`dsh plugin create` id must contain `/`.** `dsh plugin create my-tool`
  fails; use `publisher/my-tool`.

## Reference

A complete, installable example lives in this repo at `examples/greeter/`
(manifest + Node entry + hand-written client half); `examples/README.md` is
the human-facing from-scratch guide; `examples/greeter/README.md` documents
the client bundle contract. The full client-half mechanics and design live in
`docs/registry-client-half-design.md`; the official-package conversion
workflow is detailed in `docs/cookbook/adding-a-client-half.md`. For registry
mechanics (index, lock, rollback) read `packages/plugin/plugin/src/registry.ts`
and its consistency tests.
