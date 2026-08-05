import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from 'cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { ToolRegistry } from '@deepseek-ai/dsh-tools'
import {
  MANIFEST_FILE_NAME,
  PluginLocalService,
  catalogFile,
  installPlugin,
  readIndex,
  setEnabled,
  writeIndex,
} from '../src/index.ts'

declare module 'cordis' {
  interface Events {
    'plugin/service-test'(value: string): void
  }
}

let tempDir: string
let dshHome: string
let sequence = 0

beforeEach(async () => {
  // The install home lives inside this package so installed plugin entries
  // resolve package names (e.g. @deepseek-ai/dsh-tools) through the package's
  // node_modules links, as they would in a real deployment.
  tempDir = await mkdtemp(join(process.cwd(), 'packages/plugin/plugin/tests/.tmp-home-'))
  dshHome = join(tempDir, 'home')
  await mkdir(dshHome, { recursive: true })
  sequence += 1
})

afterEach(async () => {
  delete (globalThis as Record<string, unknown>).__dshPluginServiceTest
  await rm(tempDir, { recursive: true, force: true })
})

const ENTRY = `
export default {
  name: 'test-entry',
  apply(ctx) {
    ctx.on('plugin/service-test', (value) => { globalThis.__dshPluginServiceTest = value })
  },
}
`

async function writePluginRoot(root: string, id: string, entryCode = ENTRY): Promise<void> {
  await mkdir(root, { recursive: true })
  await writeFile(join(root, MANIFEST_FILE_NAME), JSON.stringify({ id, version: '0.1.0', main: './index.mjs' }))
  await writeFile(join(root, 'index.mjs'), entryCode)
}

async function installEntry(id: string): Promise<void> {
  const source = join(tempDir, `source-${id}`)
  await writePluginRoot(source, id)
  await installPlugin(source, { dshHome, harnessVersion: '0.2.0' })
}

/**
 * Plugin entry that registers one tool. The entry lives in a temp install
 * directory with no node_modules, so it imports the tools package by absolute
 * file URL into the built lib (the same artifact Node resolves in any real
 * deployment).
 */
const TOOL_ENTRY = `
import { defineTool } from '@deepseek-ai/dsh-tools'
export default {
  name: 'tool-entry',
  inject: ['tools'],
  apply(ctx) {
    ctx.tools.register(defineTool({
      name: 'echo',
      description: 'test tool',
      parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      execute() { return Promise.resolve('ok') },
    }))
  },
}
`

async function installEntryWithContributes(
  id: string,
  contributes: { tools: string[]; skills: string[] },
  entryCode: string,
): Promise<void> {
  const source = join(tempDir, `source-${id}`)
  await mkdir(source, { recursive: true })
  await writeFile(join(source, MANIFEST_FILE_NAME), JSON.stringify({ id, version: '0.1.0', main: './index.mjs', contributes }))
  await writeFile(join(source, 'index.mjs'), entryCode)
  await installPlugin(source, { dshHome, harnessVersion: '0.2.0' })
}

describe('contributes verification', () => {
  it('accepts a plugin that registers every declared tool', async () => {
    const id = `acme/declared-${sequence}`
    await installEntryWithContributes(id, { tools: ['echo'], skills: [] }, TOOL_ENTRY)

    const app = new Context()
    await app.plugin(SystemPrompt, { persona: '' })
    await app.plugin(ToolRegistry)
    const service = new PluginLocalService(app, dshHome, '0.2.0')
    try {
      await expect(service.mount(id)).resolves.toBeUndefined()
    } finally {
      await service.dispose()
    }
  })

  it('rejects a plugin that declares a tool it never registers and unwinds the mount', async () => {
    const id = `acme/ghost-${sequence}`
    await installEntryWithContributes(id, { tools: ['echo', 'ghost-tool'], skills: [] }, TOOL_ENTRY)

    const app = new Context()
    await app.plugin(SystemPrompt, { persona: '' })
    await app.plugin(ToolRegistry)
    const service = new PluginLocalService(app, dshHome, '0.2.0')
    try {
      await expect(service.mount(id)).rejects.toThrow(/declares tools \[ghost-tool\]/)
      // The failed mount left no fiber behind: a second attempt retries cleanly
      // instead of short-circuiting on a stale mounts entry.
      await expect(service.mount(id)).rejects.toThrow(/declares tools \[ghost-tool\]/)
      // Unmounting the never-mounted plugin is a no-op, not an error.
      await expect(service.unmount(id)).resolves.toBeUndefined()
    } finally {
      await service.dispose()
    }
  })

  it('does not persist enablement when verification fails', async () => {
    const id = `acme/never-${sequence}`
    await installEntryWithContributes(id, { tools: ['echo', 'ghost-tool'], skills: [] }, TOOL_ENTRY)

    const app = new Context()
    await app.plugin(SystemPrompt, { persona: '' })
    await app.plugin(ToolRegistry)
    const service = new PluginLocalService(app, dshHome, '0.2.0')
    try {
      await expect(service.enable(id)).rejects.toThrow(/declares tools \[ghost-tool\]/)
      await expect(readIndex(dshHome)).resolves.toMatchObject({ [id]: { enabled: false } })
    } finally {
      await service.dispose()
    }
  })

  it('skips verification when no tools service is mounted', async () => {
    const id = `acme/notools-${sequence}`
    await installEntryWithContributes(id, { tools: ['echo', 'ghost-tool'], skills: [] }, TOOL_ENTRY)

    const app = new Context()
    const service = new PluginLocalService(app, dshHome, '0.2.0')
    try {
      await expect(service.mount(id)).resolves.toBeUndefined()
    } finally {
      await service.dispose()
    }
  })
})

describe('PluginLocalService mount lifecycle', () => {
  it('provides ctx.plugins and reconciles enabled plugins at load', async () => {
    const id = `acme/load-${sequence}`
    await installEntry(id)
    const app = new Context()
    const service = new PluginLocalService(app, dshHome, '0.2.0')
    try {
      // ctx.plugins registration is proven by behavior below (mount/unmount
      // through the service); the cordis service proxy resists identity asserts.
      // disabled plugins are not mounted by reconcile
      await service.reconcile()
      app.emit('plugin/service-test', 'x')
      expect((globalThis as Record<string, unknown>).__dshPluginServiceTest).toBeUndefined()
      await service.enable(id)
      app.emit('plugin/service-test', 'hello')
      expect((globalThis as Record<string, unknown>).__dshPluginServiceTest).toBe('hello')
    } finally {
      await service.dispose()
    }
  })

  it('reconciles multiple enabled plugins in id order', async () => {
    const first = `acme/first-${sequence}`
    const second = `zeta/second-${sequence}`
    await installEntry(first)
    await installEntry(second)
    await setEnabled(dshHome, first, true)
    await setEnabled(dshHome, second, true)

    const app = new Context()
    const service = new PluginLocalService(app, dshHome, '0.2.0')
    try {
      await service.reconcile()
      app.emit('plugin/service-test', 'both')
      expect((globalThis as Record<string, unknown>).__dshPluginServiceTest).toBe('both')
    } finally {
      await service.dispose()
    }
  })

  it('mounts and unmounts a plugin live', async () => {
    const id = `acme/live-${sequence}`
    await installEntry(id)
    const app = new Context()
    const service = new PluginLocalService(app, dshHome, '0.2.0')
    try {
      await service.mount(id)
      app.emit('plugin/service-test', 'mounted')
      expect((globalThis as Record<string, unknown>).__dshPluginServiceTest).toBe('mounted')

      await service.unmount(id)
      delete (globalThis as Record<string, unknown>).__dshPluginServiceTest
      app.emit('plugin/service-test', 'gone')
      expect((globalThis as Record<string, unknown>).__dshPluginServiceTest).toBeUndefined()

      // unmounting again is a no-op
      await expect(service.unmount(id)).resolves.toBeUndefined()
      // mounting again is a no-op while mounted
      await service.mount(id)
      await service.mount(id)
    } finally {
      await service.dispose()
    }
  })

  it('fails loud when a mounted entry is not a plugin', async () => {
    const id = `acme/bad-${sequence}`
    const source = join(tempDir, `source-${id}`)
    await writePluginRoot(source, id, 'export default 42\n')
    await installPlugin(source, { dshHome, harnessVersion: '0.2.0' })
    const app = new Context()
    const service = new PluginLocalService(app, dshHome, '0.2.0')
    try {
      await expect(service.mount(id)).rejects.toThrow(/must default-export or named-export/)
    } finally {
      await service.dispose()
    }
  })

  it('dispose unloads every mounted plugin', async () => {
    const id = `acme/done-${sequence}`
    await installEntry(id)
    const app = new Context()
    const service = new PluginLocalService(app, dshHome, '0.2.0')
    await service.mount(id)
    await service.dispose()
    app.emit('plugin/service-test', 'after-dispose')
    expect((globalThis as Record<string, unknown>).__dshPluginServiceTest).toBeUndefined()
  })
})

describe('PluginLocalService registry operations', () => {
  it('enable persists only after a successful mount', async () => {
    const id = `acme/ok-${sequence}`
    const badId = `acme/broken-${sequence}`
    await installEntry(id)
    const source = join(tempDir, `source-${badId}`)
    await writePluginRoot(source, badId, 'export default 42\n')

    const app = new Context()
    const service = new PluginLocalService(app, dshHome, '0.2.0')
    try {
      await service.enable(id)
      await expect(readIndex(dshHome)).resolves.toMatchObject({ [id]: { enabled: true } })

      await installPlugin(source, { dshHome, harnessVersion: '0.2.0' })
      await expect(service.enable(badId)).rejects.toThrow(/must default-export or named-export/)
      await expect(readIndex(dshHome)).resolves.toMatchObject({ [badId]: { enabled: false } })
    } finally {
      await service.dispose()
    }
  })

  it('rejects enabling or disabling an unknown plugin', async () => {
    const app = new Context()
    const service = new PluginLocalService(app, dshHome, '0.2.0')
    try {
      await expect(service.enable('acme/ghost')).rejects.toThrow(/not installed/)
      await expect(service.disable('acme/ghost')).rejects.toThrow(/not installed/)
    } finally {
      await service.dispose()
    }
  })

  it('disable unmounts and persists', async () => {
    const id = `acme/off-${sequence}`
    await installEntry(id)
    const app = new Context()
    const service = new PluginLocalService(app, dshHome, '0.2.0')
    try {
      await service.enable(id)
      await service.disable(id)
      await expect(readIndex(dshHome)).resolves.toMatchObject({ [id]: { enabled: false } })
      app.emit('plugin/service-test', 'off')
      expect((globalThis as Record<string, unknown>).__dshPluginServiceTest).toBeUndefined()
    } finally {
      await service.dispose()
    }
  })

  it('uninstall removes the registry record and the mounted fiber', async () => {
    const id = `acme/remove-${sequence}`
    await installEntry(id)
    const app = new Context()
    const service = new PluginLocalService(app, dshHome, '0.2.0')
    try {
      await service.enable(id)
      await service.uninstall(id)
      await expect(readIndex(dshHome)).resolves.toEqual({})
      app.emit('plugin/service-test', 'removed')
      expect((globalThis as Record<string, unknown>).__dshPluginServiceTest).toBeUndefined()
    } finally {
      await service.dispose()
    }
  })
})

describe('PluginLocalService list', () => {
  it('merges catalog and installed state, sorted by id', async () => {
    const id = `acme/listed-${sequence}`
    const source = join(tempDir, `source-${id}`)
    await writePluginRoot(source, id)
    await writeFile(catalogFile(dshHome), JSON.stringify([
      { id: `zeta/avail-${sequence}`, version: '0.9.0', description: 'available only', source: join(tempDir, 'missing') },
      { id, version: '0.1.0', description: 'catalog description', source },
      { id: 'alpha/both', version: '0.1.0', description: 'catalog-only desc', source: join(tempDir, 'alpha-src') },
    ]))

    const app = new Context()
    const service = new PluginLocalService(app, dshHome, '0.2.0')
    try {
      await service.install(id)
      await service.enable(id)
      const rows = await service.list()
      expect(rows).toEqual([
        // 'acme/' sorts before 'alpha/' (c < l); installed rows show the
        // manifest description (empty here), not the catalog copy.
        { id, version: '0.1.0', description: '', installed: true, enabled: true },
        { id: 'alpha/both', version: '0.1.0', description: 'catalog-only desc', installed: false, enabled: false },
        { id: `zeta/avail-${sequence}`, version: '0.9.0', description: 'available only', installed: false, enabled: false },
      ])
    } finally {
      await service.dispose()
    }
  })

  it('lists installed plugins absent from the catalog', async () => {
    const id = `acme/only-${sequence}`
    await installEntry(id)
    const app = new Context()
    const service = new PluginLocalService(app, dshHome, '0.2.0')
    try {
      const rows = await service.list()
      expect(rows).toEqual([
        { id, version: '0.1.0', description: '', installed: true, enabled: false },
      ])
    } finally {
      await service.dispose()
    }
  })

  it('returns an empty list with no catalog and no installs', async () => {
    const app = new Context()
    const service = new PluginLocalService(app, dshHome, '0.2.0')
    try {
      await expect(service.list()).resolves.toEqual([])
    } finally {
      await service.dispose()
    }
  })
})

describe('client half registration', () => {
  /** Install a plugin root that declares a client half with a real bundle file. */
  async function installClientEntry(id: string): Promise<string> {
    const source = join(tempDir, `client-source-${id}`)
    await mkdir(source, { recursive: true })
    await writeFile(join(source, MANIFEST_FILE_NAME), JSON.stringify({
      id, version: '0.1.0', main: './index.mjs', client: { main: './client.js' },
    }))
    await writeFile(join(source, 'index.mjs'), ENTRY)
    await writeFile(join(source, 'client.js'), 'window.__ModuleLoader__.load({ id: "x", factory: () => ({}) })\n')
    await installPlugin(source, { dshHome, harnessVersion: '0.2.0' })
    return join(dshHome, 'plugins', ...id.split('/'))
  }

  it('registers the client half on mount and unregisters on unmount when the host is present', async () => {
    const id = `acme/client-${sequence}`
    await installClientEntry(id)
    const app = new Context()
    const registerExternal = vi.fn<(id: string, options: { clientPath: string }) => string>(() => 'rev123')
    const unregisterExternal = vi.fn<(id: string) => void>()
    app.provide('clientModuleHost', { registerExternal, unregisterExternal })
    const service = new PluginLocalService(app, dshHome, '0.2.0')
    try {
      await service.mount(id)
      expect(registerExternal).toHaveBeenCalledTimes(1)
      const [calledId, options] = registerExternal.mock.calls[0] ?? []
      expect(calledId).toBe(id)
      expect(options?.clientPath).toContain('client.js')
      expect(unregisterExternal).not.toHaveBeenCalled()

      await service.unmount(id)
      expect(unregisterExternal).toHaveBeenCalledTimes(1)
      expect(unregisterExternal).toHaveBeenCalledWith(id)
    } finally {
      await service.dispose()
    }
  })

  it('skips client registration when the plugin declares no client half', async () => {
    const id = `acme/plain-${sequence}`
    await installEntry(id)
    const app = new Context()
    const registerExternal = vi.fn<(id: string, options: { clientPath: string }) => string>()
    const unregisterExternal = vi.fn<(id: string) => void>()
    app.provide('clientModuleHost', { registerExternal, unregisterExternal })
    const service = new PluginLocalService(app, dshHome, '0.2.0')
    try {
      await service.mount(id)
      expect(registerExternal).not.toHaveBeenCalled()
    } finally {
      await service.dispose()
    }
  })

  it('mounts fine without a clientModuleHost (CLI/headless compositions)', async () => {
    const id = `acme/cli-${sequence}`
    await installClientEntry(id)
    const app = new Context()
    const service = new PluginLocalService(app, dshHome, '0.2.0')
    try {
      // No host on the root: mount must not throw and must not register.
      await expect(service.mount(id)).resolves.toBeUndefined()
    } finally {
      await service.dispose()
    }
  })

  it('rejects a client main that escapes the plugin root', async () => {
    const id = `acme/escape-${sequence}`
    // installPlugin already rejects a client.main escaping the source root, so
    // construct the installed state directly to reach the mount-time guard.
    const installedDir = join(dshHome, 'plugins', ...id.split('/'))
    await mkdir(installedDir, { recursive: true })
    await writeFile(join(installedDir, MANIFEST_FILE_NAME), JSON.stringify({
      id, version: '0.1.0', main: './index.mjs', client: { main: '../outside.js' },
    }))
    await writeFile(join(installedDir, 'index.mjs'), ENTRY)
    const index = await readIndex(dshHome)
    index[id] = { version: '0.1.0', enabled: false, installedAt: new Date().toISOString() }
    await writeIndex(dshHome, index)

    const app = new Context()
    app.provide('clientModuleHost', {
      registerExternal: vi.fn<(id: string, options: { clientPath: string }) => string>(),
      unregisterExternal: vi.fn<(id: string) => void>(),
    })
    const service = new PluginLocalService(app, dshHome, '0.2.0')
    try {
      await expect(service.mount(id)).rejects.toThrow(/escapes the plugin root/)
    } finally {
      await service.dispose()
    }
  })
})
