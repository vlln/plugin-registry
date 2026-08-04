---
name: plugin-registry-create
description: >
  Use this skill when the user wants to develop a new plugin for the
  dsh plugin registry (the third-party plugin layer managed by
  @deepseek-ai/dsh-plugin): scaffold a plugin root, write the Cordis entry,
  keep contributes in sync, then install/enable/verify it with the dsh CLI.
  This is the community plugin-registry skill — not the official harness
  cordis toolset — for creating registry plugins that live under
  <dshHome>/plugins.
license: BSD-3-Clause
metadata:
  author: dsh-external/plugin-registry
  version: "0.1.0"
requires:
  bins:
    - dsh
---

# Create a plugin-registry plugin

This skill covers creating a **registry plugin**: a directory with
`dsh.plugin.json` + a Cordis entry, installed under `<dshHome>/plugins` and
managed by `dsh plugin` / the Web plugin panel. It is the third-party layer
above the official cordis.yml Loader tree — do not confuse it with the
harness's own plugins.

## When to use

- The user wants to build a new plugin for dsh (tool, event listener, service,
  command, prompt, TUI overlay).
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

## Gotchas

- **Install is disabled by default.** A plugin never executes until the user
  explicitly enables it — that is the trust boundary, don't tell users to
  install-and-run in one step.
- **contributes is a validation scope, not a capability ceiling.** Only
  `tools`/`skills` are declared; events, services, commands, prompts work
  without a declaration. Do not invent extra manifest fields.
- **Registry plugins are not in the Loader tree.** They never appear in
  cordis.yml / dump-config output. A plugin that must run in the browser
  (client plugin) is a separate standalone `dsh-client-*` package, not a
  registry plugin.
- **Registration is an effect.** `ctx.tools.register(...)` returns a
  disposer; prefer `ctx.effect()`/`ctx.on()` for lifecycle-owned
  registrations so disable cleans up.
- **`dsh plugin create` id must contain `/`.** `dsh plugin create my-tool`
  fails; use `publisher/my-tool`.

## Reference

A complete, installable example lives in this repo at `examples/greeter/`
(manifest + entry + README); `examples/README.md` is the human-facing
from-scratch guide. For registry mechanics (index, lock, rollback) read
`packages/plugin/plugin/src/registry.ts` and its consistency tests.
