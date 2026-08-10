---
name: plugin-registry-create
description: >
  Use this skill when the user wants to develop a new plugin for DeepSeek
  Harness as an official repository-plugin (0809 format): scaffold a
  `.dsh-plugin/` package, write the Cordis entry (Node half), add an optional
  self-rendering browser client (client half via httpServer routes), declare
  `package.json#dsh.entry`, run `dsh-plugin-prepare` prepack, then install
  via `$DSH_HOME/config.yaml` `repository-plugins.repositories`. Also covers
  the development conventions (gates, decision records, verification
  discipline) that make a plugin maintainable. This is the community
  registry skill for the official repository-plugin format — not the legacy
  `dsh.plugin.json`/`dsh registry` mechanism (removed 2026-08).
license: BSD-3-Clause
metadata:
  author: dsh-external/plugin-registry
  version: "1.0.0"
requires:
  bins:
    - dsh
---

# Create an official repository-plugin

This skill covers building a **repository-plugin** (0809 official format): a
repo (or repo subdirectory) that is itself a plugin, installed by
`$DSH_HOME/config.yaml`. A plugin is a full Cordis plugin (Node half) that may
ship a self-rendering browser client (client half). There is **no** manifest
protocol, no `__ModuleLoader__`, no `dsh registry` CLI — those legacy
mechanisms were removed.

**Authoritative contract**: `docs/cookbook/creating-a-repository-plugin.md` in
this repo (repo layout, `package.json#dsh.entry` schema, prepack, install,
dev conventions). Complete reference implementation: `whale-girl` (GUI pet
plugin). This skill is the workflow guide — read the cookbook for the facts.

## When to use

- The user wants to build a new plugin for dsh (tool, event listener, service,
  command, prompt, browser UI).
- The user wants a plugin with browser UI / client-side behavior.
- The user asks for a scaffold / example / template of a repository-plugin.
- The user has a plugin that fails to mount and the cause is the entry
  contract (`dsh.entry` / prepack / dependencies).

## Workflow

### Stage 1: Scaffold the repo layout

Create `.dsh-plugin/` with `package.json` + `index.mjs` + optional
`client/`/`assets/`/`src/` (see cookbook for the tree). All shipped paths stay
inside `.dsh-plugin/` (official containment contract).

### Stage 2: `package.json` — the entry contract

Follow the cookbook's template exactly. Key decisions:

- `dsh` field is strict: only `skills` / `mcpServers` / `entry`. No
  `contributes` — tools are registered inside the entry via `defineTool`.
- `scripts.prepack` **must** call `dsh-plugin-prepare` (devDep
  `@deepseek-ai/dsh-repository-plugin`) — never hand-write the generated
  `dsh-plugin.mjs` / `dsh-plugin-assets/`.

### Stage 3: Node half — the Cordis entry

`index.mjs` exports a full Cordis plugin (`name`/`inject`/`apply`). Register
tools with `defineTool`; services/events/commands/prompts are full Cordis, no
declaration needed. Dependency resolution is the official runtime's concern
(`@deepseek-ai/*`, `cordis`). Register within `ctx.effect()`/`ctx.on()` so
disable cleans up.

### Stage 4: Client half (optional) — self-rendering

There is **no** dynamic client-half mechanism. A UI plugin:
1. registers an httpServer route for the client script (`GET /my-plugin/ui.js`);
2. the client script is self-executing DOM rendering (no `__ModuleLoader__`);
3. page injection is the plugin's own concern (host-page `<script>` injection
   or a configured injection point).

See `whale-girl` for the complete working pattern (ui/state/assets routes,
tapIndex injection).

### Stage 5: Install & verify

Install via `$DSH_HOME/config.yaml` `repository-plugins.repositories`
(`github:owner/repo#<ref>&path:/.dsh-plugin`). Distribution = the repo itself
(clone + pnpm prepare + prepack), no publish flow.

**Verify**: after mount, the boot log has no `plugin tree failed to load`.
Node half changes to an already-mounted plugin need a web restart (ESM cache
is per-URL and unbusted); assets/client-bundle changes need only reinstall +
refresh (routes read disk per request).

### Stage 6: Development conventions

A maintainable plugin follows `whale-girl`'s discipline:
- **Gates** with self-proof tests (`scripts/gates/run.mjs`); run the narrowest
  evidence for your change surface.
- **Decision records** for every non-trivial change
  (`decisions/implemented/...`): problem → decision → alternatives →
  consequences.
- **Generated artifacts are never hand-edited** (`client.js` built, `--check`
  guards freshness).
- **First-time host behaviors get recorded**: if the host environment
  overrides injected CSS or surprises you, write a bug-fix decision noting the
  environment fact on first encounter — not on the Nth.

## Gotchas

- **Install is separate from enable** — the plugin never executes until it is
  in the config and mounted; don't claim verified until the boot log is clean.
- **Entry contract failures surface at mount**: `dsh.entry` pointing outside
  `.dsh-plugin/`, missing prepack, or undeclared deps fail at install/mount,
  not at authoring time.
- **ESM cache**: editing `index.mjs` of an already-mounted plugin requires a
  web restart to take effect (verified repeatedly on whale-girl).

## Reference

- Cookbook (authoritative contract):
  `docs/cookbook/creating-a-repository-plugin.md`
- Official format decision & proof: `docs/official-0809-coverage.md`
- Reference implementation: `whale-girl`
  (official repository-plugin format, gates, decision records, asset
  contract, client self-rendering)
- Console package: `packages/plugin/console` (thin console managing official
  repository plugins via `$DSH_HOME/cordis.patch.yml`)
