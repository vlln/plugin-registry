<h1 align="center">plugin-registry</h1>

<p align="center">[中文](README.zh.md) | English</p>

<p align="center">
  <strong>DSH plugin ecosystem infrastructure: thin console + official plugin development guide</strong><br/>
  Browser panel managing a profile's plugin install state (bundle layer stack + insert rows + enable/disable), zero patches;
  the `make-dsh-plugin` skill guides developers in writing official-format plugins.
</p>

<p align="center">
  <img src="https://badgen.net/badge/license/MIT/green" alt="license" />
  <img src="https://badgen.net/badge/format/official%20plugin/8257D0" alt="official plugin" />
</p>

---

> **Pivot (2026-08)**: Official 0809 added a repository plugin mechanism (`.dsh-plugin`) covering ~95% of the old mechanism; this repo is now a
> **thin console + plugin development spec and guidance** (old patches/CLI/panel removed). **Since 0811 the repository-plugins mechanism is gone**
> (`vendor/loader/src/repository.ts`); external plugins install via the web profile only: bundles (`dsh.bundle`) join `dsh.profile.bundles`;
> non-bundles (plain cordis packages) mount via insert rows in `cordis.patch.yml` (live via HMR). Full assessment: [official 0809 coverage](docs/official-0809-coverage.md).

## Positioning

DeepSeek Harness's official mechanisms define "what a plugin is and how it runs"; this repository adds two things (panel structure: [console README](packages/plugin/console/README.md); guidance: below):

1. **Thin console** (`packages/plugin/console`) — browser panel managing a profile's plugin install state + 4 agent tools
2. **Development spec and guidance** — `make-dsh-plugin` skill + cookbook for creating official bundle/cordis plugins

## Ecosystem relationships (who can do what)

```
Official DSH (DeepSeek Harness)      plugin runtime + profile bundle mechanism (no repo mechanism since 0811)
   │
   ├── Official plugins (bundle)     loop / task-status / navbar etc. — `dsh plugin --profile web add` install into profile layer stack
   ├── Third-party plugins (bundle/plain)  standalone GitHub repos or npm packages — bundles enter the layer stack; plain plugins use insert rows (live)
   │
   └── This repository (plugin-registry)  ① thin console: browser panel + agent tools for install-state management
                                         ② make-dsh-plugin skill + cookbook: guides third-party plugin development
```

Plugin forms and install paths: [plugin type comparison](docs/plugin-types.md); install examples: [examples](examples/README.md).

## Thin console

![Plugin management panel](screenshots/console-panel.png)

The settings page's "Plugin Management" panel manages a profile's plugin install state: **install area** (single entry — npm package name or GitHub project (`https://github.com/o/r` / `github.com/o/r` / `github:o/r`, URL auto-normalized) — automatic pnpm add; bundles enter the layer stack, non-bundles get insert rows) + **loaded area** (version check/update, `disabled` toggle, bundle uninstall).

## Installation

**Option 1: git source, direct install (recommended, one line)**

```sh
dsh plugin --profile web add "github:vlln/plugin-registry#main&path:/packages/plugin/console"
```

Build artifacts are committed (git source skips the build); one command installs directly (~15 s).

**Option 2: npm source**

```sh
dsh plugin --profile web add @vlln/plugin-console@0.1.0
```

**Option 3: local directory (source available)**

```sh
git clone https://github.com/vlln/plugin-registry
cd plugin-registry/packages/plugin/console
dsh plugin --profile web add .   # artifacts are committed, no build needed; the current dir is the bundle package dir (dsh anchors . to an absolute path)
```

Refresh the web page after mounting — the "Plugin Management" panel appears on the settings page.

## Agent Skills

| Skill | Purpose |
|---|---|
| [make-dsh-plugin](skills/make-dsh-plugin/SKILL.md) | Create official bundle / cordis plugins: pick a form (skill package / MCP / Node tool / with UI) → declare `dsh.bundle` or plain apply → install-and-verify discipline. Details in `references/`; reference implementation: `packages/plugin/console` |

## Before you start developing (pitfalls we've hit)

Key pitfalls (official packages not yet published, Node-half changes need a restart, host CSS overrides, etc.) and the full list: [skill references/gotchas](skills/make-dsh-plugin/references/gotchas.md) — **read before developing**.

## Documentation

- [Plugin type comparison](docs/plugin-types.md) — bundle vs plain cordis plugins: development/distribution/installation/management dimensions + how to choose
- [Official 0809 coverage assessment](docs/official-0809-coverage.md) — official mechanism coverage, pivot decision (0811 repository removal: CHANGELOG)
- [Thin console design](docs/console-ui-plugin-management.md) — design of unified installation-state management
- Historical mechanism docs (archived after the pivot): [architecture (old)](docs/architecture.md), [creating a plugin (old)](docs/cookbook/creating-a-plugin.md), [manifest format (old)](docs/manifest-format.md), [creating a repository-plugin (old)](docs/cookbook/creating-a-repository-plugin.md), etc.
- [Changelog](CHANGELOG.md) / [Roadmap](ROADMAP.md)

## License

MIT License. See [LICENSE](LICENSE).
