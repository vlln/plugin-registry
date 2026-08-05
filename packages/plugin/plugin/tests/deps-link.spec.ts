/**
 * Dependency-link tests: checkout resolution, the shared node_modules link
 * lifecycle (create / keep / rebuild), and the built-form contract — a plugin
 * entry under `<dshHome>/plugins` importing a checkout package resolves with
 * standard Node semantics (a plain-node subprocess, no tsx), which is exactly
 * what the link exists to guarantee.
 *
 * @module @deepseek-ai/dsh-plugin/deps-link tests
 */

import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureDepsLink, resolveCheckout } from '../src/deps-link.ts'
import { installPlugin, pluginsRoot } from '../src/index.ts'

const MANIFEST_FILE_NAME = 'dsh.plugin.json'

let tempDir: string
let dshHome: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'dsh-plugin-deps-'))
  dshHome = join(tempDir, 'home')
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

/** Build a fake checkout with a `packages/` marker and (optionally) node_modules. */
async function makeCheckout(name: string, withNodeModules: boolean): Promise<string> {
  const checkout = join(tempDir, name)
  await mkdir(join(checkout, 'packages'), { recursive: true })
  if (withNodeModules) await mkdir(join(checkout, 'node_modules'), { recursive: true })
  return checkout
}

describe('resolveCheckout', () => {
  it('resolves the checkout from a module inside its tree', async () => {
    const checkout = await makeCheckout('checkout', true)
    const entry = join(checkout, 'node_modules', '@deepseek-ai', 'dsh-plugin', 'lib', 'index.js')
    expect(resolveCheckout(pathToFileURL(entry).href)).toBe(checkout)
  })
})

describe('ensureDepsLink', () => {
  it('creates the shared node_modules link at the registry root', async () => {
    const checkout = await makeCheckout('checkout', true)
    await expect(ensureDepsLink(dshHome, checkout)).resolves.toBe(true)
    const link = join(pluginsRoot(dshHome), 'node_modules')
    expect(realpathSync(link)).toBe(realpathSync(join(checkout, 'node_modules')))
  })

  it('keeps an existing link that already points at the checkout (idempotent)', async () => {
    const checkout = await makeCheckout('checkout', true)
    await ensureDepsLink(dshHome, checkout)
    const link = join(pluginsRoot(dshHome), 'node_modules')
    const before = realpathSync(link)
    await expect(ensureDepsLink(dshHome, checkout)).resolves.toBe(true)
    expect(realpathSync(link)).toBe(before)
  })

  it('rebuilds a stale link after the checkout rotates', async () => {
    const oldCheckout = await makeCheckout('old-checkout', true)
    await ensureDepsLink(dshHome, oldCheckout)
    await rm(oldCheckout, { recursive: true, force: true })
    const newCheckout = await makeCheckout('new-checkout', true)
    await expect(ensureDepsLink(dshHome, newCheckout)).resolves.toBe(true)
    expect(realpathSync(join(pluginsRoot(dshHome), 'node_modules')))
      .toBe(realpathSync(join(newCheckout, 'node_modules')))
  })

  it('reports unavailable when the checkout has no node_modules', async () => {
    const checkout = await makeCheckout('bare-checkout', false)
    await expect(ensureDepsLink(dshHome, checkout)).resolves.toBe(false)
    expect(existsSync(join(pluginsRoot(dshHome), 'node_modules'))).toBe(false)
  })
})

describe('built-form dependency resolution', () => {
  /**
   * A plain-node subprocess import is the built-form contract: no tsx, no
   * paths map — only standard Node bare-specifier resolution. This test's
   * subject is source-path resolution, so the subprocess runs erasable .mjs
   * under plain Node (testing.md subprocess launch modes).
   */
  function probePlugin(pluginEntry: string): string {
    return execFileSync(process.execPath, ['--input-type=module', '-e',
      `import(${JSON.stringify(pathToFileURL(pluginEntry).href)}).then(() => console.log('RESOLVED')).catch(() => console.log('FAILED'))`,
    ], { encoding: 'utf8' }).trim()
  }

  it('resolves a checkout package import only once the link exists', async () => {
    const checkout = await makeCheckout('checkout', true)
    const toolsDir = join(checkout, 'node_modules', '@deepseek-ai', 'dsh-tools')
    await mkdir(toolsDir, { recursive: true })
    await writeFile(join(toolsDir, 'package.json'), JSON.stringify({
      name: '@deepseek-ai/dsh-tools',
      version: '0.0.1',
      type: 'module',
      main: 'index.js',
    }))
    await writeFile(join(toolsDir, 'index.js'), 'export const defineTool = () => ({})\n')

    const pluginDir = join(dshHome, 'plugins', 'acme', 'loop')
    await mkdir(pluginDir, { recursive: true })
    const entry = join(pluginDir, 'index.mjs')
    await writeFile(entry, [
      "import { defineTool } from '@deepseek-ai/dsh-tools'",
      'export default { name: "loop", apply() {} }',
      '',
    ].join('\n'))

    // Without the link, the plain-node import fails (the plugin lives outside
    // the checkout, so upward node_modules walks never reach it).
    expect(probePlugin(entry)).toBe('FAILED')
    await expect(ensureDepsLink(dshHome, checkout)).resolves.toBe(true)
    // With the link, standard Node resolution reaches the checkout package.
    expect(probePlugin(entry)).toBe('RESOLVED')
  })
})

describe('install integration', () => {
  it('creates the dependency link as part of install', async () => {
    const source = join(tempDir, 'source')
    await mkdir(source, { recursive: true })
    await writeFile(join(source, MANIFEST_FILE_NAME), JSON.stringify({
      id: 'acme/cool-tool',
      version: '0.1.0',
      main: './index.mjs',
      engines: { dsh: '>=0.0.1' },
      contributes: { tools: [], skills: [] },
    }))
    await writeFile(join(source, 'index.mjs'), 'export default { apply() {} }\n')

    await installPlugin(source, { dshHome, harnessVersion: '0.2.0' })
    // The test runs inside the harness checkout, so resolveCheckout finds it
    // and the link lands at the registry root.
    expect(existsSync(join(pluginsRoot(dshHome), 'node_modules'))).toBe(true)
  })
})
