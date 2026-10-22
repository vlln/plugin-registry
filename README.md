<h1 align="center">vlln's DSH plugins</h1>

<p align="center">
  <strong>Plugins I build for DeepSeek Harness (dsh), published as a plugin market index.</strong><br/>
  English | <a href="README.zh.md">中文</a>
</p>

The index is one JSON file in **format 1** — the format `dsh` reads itself — so any dsh 0.2.1+ can browse and
install from it without a middle layer.

## Use it as an index source

1. **Plugins → Discover → Manage index sources**
2. Add:

   ```
   https://raw.githubusercontent.com/vlln/plugin-registry/main/index.json
   ```

3. Search, pick a version, install.

Or install by hand with the same specs the index lists:

```sh
dsh plugin --profile web add github:vlln/dsh-share-link
```

## What's inside

| Plugin | What it does | Install |
|---|---|---|
| [**Share Link**](https://github.com/vlln/dsh-share-link) `@vlln/dsh-share-link` | Publish a conversation or an artifact as a read-only public link; revoke anytime. | `github:vlln/dsh-share-link` |
| [**Video to Text**](https://github.com/vlln/dsh-video2text) `dsh-video2text` | Video link → script: sidebar player, transcript, export; bundles the `video2text` skill. | `github:vlln/dsh-video2text` |
| [**Pancha**](https://github.com/vlln/dsh-pancha) `dsh-pancha` | A directory as a board you can audit, annotate and act on — the agent labels, you decide. | `github:vlln/dsh-pancha` |
| [**Loop**](https://github.com/vlln/dsh-loop) `@vlln/dsh-loop` | Scheduled loops: `/loop` command, `loop` tool and a live activity bar. | `@vlln/dsh-loop` |
| [**Auto Fork**](https://github.com/vlln/dsh-autofork) `@vlln/dsh-autofork` | When the agent is busy, fork the session: the new instruction runs now, the old turn reports back later. | `github:vlln/dsh-autofork` |
| [**Whale Girl**](https://github.com/vlln/whale-girl) `whale-girl` | A desktop pet for the DSH Web GUI. | `whale-girl` |
| [**Evolution Engineering**](https://github.com/vlln/evo-engineering) `@vlln/evo-engineering` | Improve any artifact in rounds: standard, iterate, independent review, rollback. | `github:vlln/evo-engineering` |
| [**PR Inbox**](https://github.com/omdsh-dev/dsh-pr-inbox) `dsh-pr-inbox` | A sidebar panel for the GitHub PRs that concern you: opened, to review, merged — over your local `gh` login. | `github:omdsh-dev/dsh-pr-inbox` |
| [**Preset Inspector**](https://github.com/omdsh-dev/dsh-preset-inspector) `dsh-preset-inspector` | See where every line of an agent preset comes from: patch layer, package, config. | `github:omdsh-dev/dsh-preset-inspector` |

Two older plugins are archived and therefore **not** in the index (they are still installable by name, just not
maintained): [`@vlln/dsh-navbar`](https://github.com/vlln/dsh-navbar), [`@vlln/dsh-task-status`](https://github.com/vlln/dsh-task-status).

## How this repo works

| Path | Role |
|---|---|
| `plugins/*.json` | Hand-written display facts only: title, description, category, keywords, icon |
| `scripts/build-index.mjs` | Probes the real facts (npm versions + publish times, or the default-branch HEAD commit and its manifest), merges, validates with `@deepseek-ai/dsh-plugin-market-index`, writes `index.json` |
| `index.json` | The generated index — the only file a client reads |
| `.github/workflows/index.yml` | Daily rebuild; commits only when `index.json` actually changed |

Versions are what is actually published: npm-published plugins list their npm versions, git-only plugins list the
default-branch HEAD commit. When a repo is ahead of npm, the index keeps the published version — install from git if
you want the bleeding edge.

## History

Until 2026-10-03 this repo hosted a **thin console** (a browser panel managing a profile's plugin install state) and a
copy of the `make-dsh-plugin` skill. DSH's own Plugins page took over the console's job, the skill moved to
[vlln/dsh-skills](https://github.com/vlln/dsh-skills), and on 2026-10-21 the repo became this index.

## License

MIT
