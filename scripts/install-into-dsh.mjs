#!/usr/bin/env node
/**
 * Install plugin-registry into a DSH source tree in one command.
 *
 * Usage:
 *   node scripts/install-into-dsh.mjs <dsh-monorepo-path>
 *
 * What it does (mirrors docs/cookbook/integrating-into-dsh.md):
 *   1. copies packages/plugin  -> <repo>/packages/plugin
 *   2. copies packages/ui-plugin-manager -> <repo>/packages/client/ui-plugin-manager
 *   3. applies patches/dsh-plugin-registry.patch (dry-run first)
 *   4. runs `pnpm install` so the copied packages' deps resolve
 *
 * The patch is generated against the official 0805 snapshot
 * (20260805T134133Z, commit 9e785ce). On a different baseline use
 * `git apply --3way` per docs/cookbook/integrating-into-dsh.md.
 */
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = resolve(fileURLToPath(import.meta.url), '..', '..')
const patch = join(here, 'patches', 'dsh-plugin-registry.patch')
const target = resolve(process.argv[2] ?? '')
const step = (s) => console.log(`\n==> ${s}`)

if (target === '') {
  console.error('usage: node scripts/install-into-dsh.mjs <dsh-monorepo-path>')
  process.exit(1)
}
if (!existsSync(join(target, 'package.json')) || !existsSync(join(target, 'pnpm-workspace.yaml'))) {
  console.error(`error: ${target} is not a DSH monorepo root (no package.json + pnpm-workspace.yaml)`)
  process.exit(1)
}
if (!existsSync(patch)) {
  console.error(`error: patch not found: ${patch}`)
  process.exit(1)
}

// 1. copy packages (registry is a copy-in + patch-on-top distribution)
step(`copying packages/plugin -> ${target}/packages/plugin`)
cpSync(join(here, 'packages/plugin'), join(target, 'packages/plugin'), { recursive: true })
step(`copying packages/ui-plugin-manager -> ${target}/packages/client/ui-plugin-manager`)
mkdirSync(join(target, 'packages/client'), { recursive: true })
cpSync(join(here, 'packages/ui-plugin-manager'), join(target, 'packages/client/ui-plugin-manager'), { recursive: true })

// 2. apply the wiring patch (dry-run first so a bad baseline fails cleanly)
step('applying patches/dsh-plugin-registry.patch')
const check = spawnSync('git', ['apply', '--check', patch], { cwd: target, encoding: 'utf8' })
if (check.status !== 0) {
  console.error('patch dry-run failed — baseline drift. Try `git apply --3way ' + patch + '` and align conflicts manually.')
  console.error(check.stderr)
  process.exit(1)
}
const apply = spawnSync('git', ['apply', patch], { cwd: target, encoding: 'utf8' })
if (apply.status !== 0) {
  console.error('git apply failed unexpectedly after --check passed:')
  console.error(apply.stderr)
  process.exit(1)
}

// 3. install deps so the copied packages' node_modules resolve
step('running pnpm install')
const install = spawnSync('pnpm', ['install'], { cwd: target, stdio: 'inherit', encoding: 'utf8' })
if (install.status !== 0) {
  console.error('pnpm install failed (exit ' + install.status + ')')
  process.exit(1)
}

console.log('\nDone. Registry is wired into ' + target)
console.log('Next: start the web app (e.g. `pnpm --filter dsh-cli run dev:web`), open Settings → 插件 panel.')
console.log('To verify the CLI surface: `dsh plugin list` should print "no plugins installed".')
