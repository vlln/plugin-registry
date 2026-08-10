---
name: make-dsh-plugin
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

**Authoritative contracts are self-contained in this skill's `references/`**
(entry + skill + MCP in `entry-contract.md`, bundle in `bundle-plugins.md`,
verification in `install-and-verify.md`, conventions in `dev-conventions.md`,
gotchas in `gotchas.md`) — no repo docs needed to develop. Reference
implementation: `whale-girl` (GUI pet plugin). Read the references below when
you reach the relevant stage.

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
| Bundle (product service, dshClient UI) | npm package + `dsh.bundle` | `dsh.bundle` | read `references/bundle-plugins.md` |

Combine faces when the plugin ships several (e.g. a skill pack + a tool both
fit one `.dsh-plugin`). The first four rows are **repository plugins** (user
installs via config.yaml, this skill's main path — Steps 1-6 below); the last
row is a **bundle plugin** (ships with a profile, different install/manage —
see `references/bundle-plugins.md`).

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

Follow the template in `references/entry-contract.md`. Key decisions:

- `dsh` field: `skills` / `mcpServers` / `entry` (strict, official schema).
  No `contributes` — tools register inside the entry via `defineTool`.
- `scripts.prepack` **must** call `dsh-plugin-prepare` (devDep
  `@deepseek-ai/dsh-repository-plugin`) — never hand-write generated
  `dsh-plugin.mjs` / `dsh-plugin-assets/`.

### Skill pack (`dsh.skills`)

Put `SKILL.md` files under `.dsh-plugin/skills/<name>/` and declare the list
in `dsh.skills` (paths relative to `.dsh-plugin/`):

```json
"dsh": { "skills": ["./skills/foo/SKILL.md", "./skills/bar/SKILL.md"] }
```

**Writing the SKILL.md** — follow the make-skill spec (authoritative
template): frontmatter (`name` 1-64 lowercase-hyphen, `description` imperative
"Use this skill when...", optional `metadata`/`requires`) + body structure
(Tool Wrapper / Generator / Reviewer / Inversion / Pipeline patterns), keep
under 500 lines, progressive disclosure to `references/` for detail. Each
skill has one `SKILL.md`; the repo README lists them in a table (Step 6).
`make-skill` is the reference for how to author agent skills — do not invent
a competing format.

### MCP server (`dsh.mcpServers`)

Declare MCP servers in `dsh.mcpServers` (official schema). The standard MCP
shape is a map of server id → launch config:

```json
"dsh": { "mcpServers": {
  "my-server": { "command": "node", "args": ["./mcp/my-server.js"], "env": {} }
} }
```

The server is a stdio MCP server (JSON-RPC over stdin/stdout). Exact schema
fields (`command`/`args`/`env`, allowed transports) are official-format
details — verify against the current official spec before shipping; the
server-side logic lives in `.dsh-plugin/mcp/`. The repo README lists MCP
servers in a table (Step 6).

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

## Step 5b: Publish to GitHub

The repo itself is the distribution unit — set it up so users can find and
install it.

**Repo description** (one line, what it is + how to install): a concrete
template:

```
DSH 插件：<一句话功能>。官方 repository-plugin（.dsh-plugin 格式），config.yaml 安装：github:owner/repo#<ref>&path:/.dsh-plugin
```

Follow the shape "DSH plugin: <what it does>; official repository-plugin
format, install via config.yaml `<repo-ref>`". Bilingual optional (English
first helps international discovery).

**Repo topics (GitHub tags)**: tag the repo so `gh`/search/discovery works.
Suggested set (apply all that fit):

- `dsh` / `dsh-plugin` / `dsh-repository-plugin` — ecosystem discovery
- `deepseek-harness` — the host product
- capability tags: `plugin`, `skill`, `mcp` (or a domain tag like `pet`,
  `tool`)
- `agent` / `agents` — agentic context

Apply with: `gh repo edit <owner>/<repo> --add-topic dsh --add-topic
dsh-plugin ...`

**Publish checklist** (before sharing the repo):
- [ ] `package.json#dsh.entry` points inside `.dsh-plugin/`; prepack runs
  `dsh-plugin-prepare`
- [ ] Gates pass (`scripts/gates/run.mjs`) — the repo ships its own gates
- [ ] README has install (config.yaml line with a concrete ref), usage, and
  the skill table (Step 6 convention)
- [ ] Repo description + topics set (above)
- [ ] Install smoke: fresh `config.yaml` line → mount → boot log clean

No release assets needed — the repo is the plugin (clone + prepare +
prepack). If a versioned ref is desired, tag commits and point the README
config line at the tag's commit hash.

## Step 6: Development conventions

A maintainable plugin follows the discipline in
`references/dev-conventions.md`: gates with self-proof tests, decision records
for every non-trivial change, generated artifacts never hand-edited,
first-time host behaviors recorded as environment facts.

**README conventions** (make-skill spec): the repo README lists its
capability surfaces in tables — one table per surface, one row per item with
a one-line description; human readers scan the tables to decide what to use;
details stay in each item's own file.

- **Skills** (always): `| Skill | 作用 |` — one row per SKILL.md.
- **MCP servers** (if the plugin ships `dsh.mcpServers`):
  `| MCP | 说明 |` — one row per server (name + what it exposes).
- **Tools** (if the plugin registers tools): `| 工具 | 说明 |` — one row
  per `defineTool` registration.

Apply this to any repo that ships skills/MCP/tools.

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

- Self-contained contracts in this skill:
  - `references/entry-contract.md` — repository plugin: layout, dsh field
    (entry/skills/mcpServers), Cordis entry, self-rendering client, install,
    dev conventions
  - `references/bundle-plugins.md` — bundle plugin (dshClient) development
  - `references/install-and-verify.md` — per-change-surface verification
  - `references/gotchas.md` — pitfalls (unpublished official packages, ESM
    cache, host CSS override)
  - `references/dev-conventions.md` — gates, decision records
- Reference implementation: `whale-girl` (repository plugin with UI)
- Bundle references: `dsh-loop`, `dsh-task-status`, `packages/plugin/console`
