import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from 'cordis'
import {
  Config,
  MANIFEST_FILE_NAME,
  apply as applyPluginLocal,
  inject,
  installPlugin,
  name,
  normalizePlugin,
  setEnabled,
} from '../src/index.ts'
import { apply as applyInvariant, inject as invariantInject, name as invariantName } from '../src/invariant.ts'

declare module 'cordis' {
  interface Events {
    'plugin/test'(value: string): void
  }
}

const MANIFEST = (id: string): Record<string, unknown> => ({
  id,
  version: '0.1.0',
  main: './index.mjs',
  engines: { dsh: '>=0.0.1' },
  contributes: { tools: [], skills: [] },
})

const ENTRY = `
export default {
  name: 'test-entry',
  apply(ctx) {
    ctx.on('plugin/test', (value) => { globalThis.__dshPluginTest = value })
  },
}
`

let tempDir: string
let dshHome: string
let sequence = 0

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'dsh-plugin-load-'))
  dshHome = join(tempDir, 'home')
  sequence += 1
})

afterEach(async () => {
  delete (globalThis as Record<string, unknown>).__dshPluginTest
  vi.unstubAllEnvs()
  await rm(tempDir, { recursive: true, force: true })
})

async function installEntry(id: string, entryCode: string = ENTRY): Promise<void> {
  const source = join(tempDir, `source-${id}`)
  await mkdir(source, { recursive: true })
  await writeFile(join(source, MANIFEST_FILE_NAME), JSON.stringify(MANIFEST(id)))
  await writeFile(join(source, 'index.mjs'), entryCode)
  await installPlugin(source, { dshHome, harnessVersion: '0.2.0' })
}

describe('normalizePlugin', () => {
  it('accepts a default-exported function', () => {
    const plugin = () => {}
    expect(normalizePlugin({ default: plugin })).toBe(plugin)
  })

  it('accepts a bare function export', () => {
    const plugin = () => {}
    expect(normalizePlugin(plugin)).toBe(plugin)
  })

  it('accepts an object with apply', () => {
    const plugin = { apply: () => {} }
    expect(normalizePlugin({ default: plugin })).toBe(plugin)
  })

  it('rejects a module with no plugin export', () => {
    expect(() => normalizePlugin({ default: 42 })).toThrow(/must default-export or named-export/)
  })
})

describe('plugin-local entry', () => {
  it('exposes the function-plugin contract', () => {
    expect(name).toBe('plugin-local')
    expect(inject).toEqual([])
    expect(Config({})).toEqual({})
    expect(Config({ dshHome: '/x' })).toEqual({ dshHome: '/x' })
  })

  it('mounts enabled plugins and unloads them on dispose', async () => {
    await installEntry(`acme/app-${sequence}`)
    await setEnabled(dshHome, `acme/app-${sequence}`, true)

    const app = new Context()
    const fiber = app.plugin(applyPluginLocal, { dshHome })
    await fiber.await()
    app.emit('plugin/test', 'via-app')
    expect((globalThis as Record<string, unknown>).__dshPluginTest).toBe('via-app')
    await fiber.dispose()
    delete (globalThis as Record<string, unknown>).__dshPluginTest
    app.emit('plugin/test', 'gone')
    expect((globalThis as Record<string, unknown>).__dshPluginTest).toBeUndefined()
  })

  it('mounts from the default harness home when dshHome is omitted', async () => {
    vi.stubEnv('DSH_HOME', dshHome)
    await installEntry(`acme/default-${sequence}`)
    await setEnabled(dshHome, `acme/default-${sequence}`, true)

    const app = new Context()
    const fiber = app.plugin(applyPluginLocal)
    await fiber.await()
    app.emit('plugin/test', 'via-default-home')
    expect((globalThis as Record<string, unknown>).__dshPluginTest).toBe('via-default-home')
    await fiber.dispose()
    vi.unstubAllEnvs()
  })
})

describe('plugin-local invariant', () => {
  it('registers the package under the invariant registry', async () => {
    const register = vi.fn(() => () => {})
    const ctx = { invariants: { register } } as unknown as Context
    const disposer = await applyInvariant(ctx)
    expect(invariantName).toBe('plugin-invariant')
    expect(invariantInject).toEqual(['invariants'])
    expect(register).toHaveBeenCalledWith('@deepseek-ai/dsh-plugin', expect.any(Function))
    disposer()
  })
})
