---
name: plugin-registry-create
description: >
  Use this skill when the user wants to develop a new plugin for DeepSeek
  Harness as an official repository-plugin (0809 format). Guides shape
  selection (pure skill pack / MCP server / Node tools / browser UI), then
  scaffolds a `.dsh-plugin/` package: package.json#dsh.entry (or dsh.skills /
  dsh.mcpServers), Cordis entry, optional self-rendering client, prepack, and
  install via $DSH_HOME/config.yaml. Also covers dev conventions (gates,
  decision records, verification). Not the legacy dsh.plugin.json / dsh
  registry mechanism (removed 2026-08).
license: BSD-3-Clause
metadata:
  author: dsh-external/plugin-registry
  version: "2.0.0"
requires:
  bins:
    - dsh
---

# Create an official repository-plugin

This skill builds a **repository-plugin** (0809 official format): a repo (or
subdirectory) that is itself a plugin, installed via `$DSH_HOME/config.yaml`.
There is **no** manifest protocol, no `__ModuleLoader__`, no `dsh registry`
CLI — legacy mechanisms removed 2026-08.

**Authoritative contract**: `docs/cookbook/creating-a-repository-plugin.md` in
this repo. Reference implementation: `whale-girl` (GUI pet plugin). Read the
references below when you reach the relevant stage.

## When to use

- The user wants to build a new plugin for dsh (tool, skill pack, MCP server,
  event listener, service, command, prompt, browser UI).
- The user asks for a scaffold / example / template of a repository-plugin.
- A plugin fails to mount and the cause is the entry contract.

## Step 0: Choose the plugin shape

Pick the official path by what the plugin ships. `dsh` field is strict —
exactly one of these capability faces:

| Need | Official path | `dsh` field | Start at |
|---|---|---|---|
| Pure skill pack (no code) | `.dsh-plugin/skills/` + prepack | `dsh.skills` | Step 2 (skills) |
| MCP server | `.dsh-plugin/mcp/` + declaration | `dsh.mcpServers` | Step 2 (mcp) |
| Node tools / events / services | Cordis entry + `defineTool` | `dsh.entry` | Step 3 |
| Node + browser UI | entry + httpServer route + self-rendering client | `dsh.entry` | Step 4 |

Combine faces when the plugin ships several (e.g. a skill pack + a tool both
fit one `.dsh-plugin`).

## Step 1: Repo layout

`my-plugin/` root keeps docs/decisions/originals (not shipped); all shipped
paths live inside `.dsh-plugin/` (official containment contract):

```
my-plugin/
├── .dsh-plugin/
│   ├── package.json            # name/version + dsh.* + scripts.prepack
│   ├── index.mjs               # Node half entry: full Cordis plugin
│   ├── client/  client.js      # self-rendering client source / built bundle
│   ├── assets/                 # static files served by entry routes
│   └── src/                    # pure logic (zero host deps, unit-testable)
├── docs/  decisions/
└── scripts/                    # gates + generators
```

## Step 2: `package.json` + capability face

Follow the cookbook template. Key decisions:

- `dsh` field: `skills` / `mcpServers` / `entry` (strict, official schema).
  No `contributes` — tools register inside the entry via `defineTool`.
- `scripts.prepack` **must** call `dsh-plugin-prepare` (devDep
  `@deepseek-ai/dsh-repository-plugin`) — never hand-write generated
  `dsh-plugin.mjs` / `dsh-plugin-assets/`.
- **Skill pack**: put `SKILL.md` files under `.dsh-plugin/skills/` and declare
  `dsh.skills` (paths relative to `.dsh-plugin/`).
- **MCP server**: declare `dsh.mcpServers` with the server config.

**Read `references/entry-contract.md`** for the full `dsh.entry` contract when
you reach Step 3/4.

## Step 3: Node half — Cordis entry

`index.mjs` exports a full Cordis plugin (`name`/`inject`/`apply`). Register
tools with `defineTool`; services/events/commands/prompts are full Cordis, no
declaration. Dependency resolution is the official runtime's concern
(`@deepseek-ai/*`, `cordis`). Register within `ctx.effect()`/`ctx.on()` so
disable cleans up.

**Checkpoint**: entry parses; tools are registered; no undeclared deps.

## Step 4: Client half (optional) — self-rendering

No dynamic client-half mechanism exists. A UI plugin:
1. registers an httpServer route for the client script (`GET /my-plugin/ui.js`);
2. the client script is self-executing DOM rendering (no `__ModuleLoader__`);
3. page injection is the plugin's own concern (host-page `<script>` injection
   or a configured injection point).

See `whale-girl` for the complete pattern (ui/state/assets routes, tapIndex
injection).

**Checkpoint**: browser smoke passes — headless Chrome dump-dom shows the
plugin's DOM marker and no "Failed to load plugins".

## Step 5: Install & verify

Install via `$DSH_HOME/config.yaml` `repository-plugins.repositories`
(`github:owner/repo#<ref>&path:/.dsh-plugin`). Distribution = the repo itself
(clone + pnpm prepare + prepack), no publish flow.

**Read `references/install-and-verify.md`** for per-change-surface verification
(which changes need a web restart vs. refresh only) and mount-failure
troubleshooting.

## Step 6: Development conventions

A maintainable plugin follows the discipline in
`references/dev-conventions.md`: gates with self-proof tests, decision records
for every non-trivial change, generated artifacts never hand-edited,
first-time host behaviors recorded as environment facts.

**Read `references/dev-conventions.md`** when the project enters iteration.

## Recommended management

The thin console `packages/plugin/console` manages official repository
plugins via `$DSH_HOME/cordis.patch.yml` — the plugin-management UI for
installed `.dsh-plugin` packages.

## Gotchas

- **Official packages are not on public npm**: `@deepseek-ai/dsh-tools` etc.
  are unpublished — `npm install` fails locally. Distribution resolves them
  in the official environment (github: source); local verification needs
  symlinks to the monorepo build or a mock registry. Don't change deps.
  Bundle plugins (dshClient) have the same constraint but declare no deps —
  the profile's pnpm closure injects them at mount; declaring them fails.
- **Install is separate from enable** — the plugin never executes until it is
  in the config and mounted; don't claim verified until the boot log is clean.
- **Entry contract failures surface at mount**: `dsh.entry` pointing outside
  `.dsh-plugin/`, missing prepack, or undeclared deps fail at install/mount,
  not at authoring time.
- **ESM cache**: editing `index.mjs` of an already-mounted plugin requires a
  web restart to take effect (verified repeatedly on whale-girl).
- **Host overrides injected CSS**: key UI styles must be JS-inline (host
  global CSS can wipe injected `<style>`), not CSS-class-dependent.
- **Shape-first**: pick the capability face before writing code — a pure skill
  pack needs no entry; a UI plugin needs entry + httpServer, not a client-half
  mechanism that no longer exists.

**Read `references/gotchas.md`** for the full list (mount troubleshooting
order, schema-DSL timing, environment facts).

## Reference

- Cookbook (authoritative contract):
  `docs/cookbook/creating-a-repository-plugin.md`
- Official format decision & proof: `docs/official-0809-coverage.md`
- Reference implementation: `whale-girl`
- Console package: `packages/plugin/console`
