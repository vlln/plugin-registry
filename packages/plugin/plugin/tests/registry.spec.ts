import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  INDEX_FILE_NAME,
  MANIFEST_FILE_NAME,
  PLUGINS_DIR_NAME,
  indexFile,
  installPlugin,
  listPlugins,
  pluginDir,
  pluginsRoot,
  readIndex,
  requireDirectory,
  setEnabled,
  uninstallPlugin,
  writeIndex,
} from '../src/index.ts'

const MANIFEST = {
  id: 'acme/cool-tool',
  version: '0.1.0',
  main: './index.mjs',
  description: 'a demo plugin',
  engines: { dsh: '>=0.0.1' },
  contributes: { tools: ['cool_read'], skills: [] },
}

let tempDir: string
let dshHome: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'dsh-plugin-registry-'))
  dshHome = join(tempDir, 'home')
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

async function writePluginRoot(root: string): Promise<void> {
  await mkdir(root, { recursive: true })
  await writeFile(join(root, MANIFEST_FILE_NAME), JSON.stringify(MANIFEST))
  await writeFile(join(root, 'index.mjs'), 'export default { apply() {} }\n')
}

describe('registry paths', () => {
  it('resolves the registry root, index, and plugin directory under the harness home', () => {
    expect(pluginsRoot(dshHome)).toBe(join(dshHome, PLUGINS_DIR_NAME))
    expect(indexFile(dshHome)).toBe(join(dshHome, PLUGINS_DIR_NAME, INDEX_FILE_NAME))
    expect(pluginDir(dshHome, 'acme/cool-tool')).toBe(join(dshHome, PLUGINS_DIR_NAME, 'acme/cool-tool'))
  })
})

describe('readIndex / writeIndex', () => {
  it('returns an empty index when no index file exists', async () => {
    await expect(readIndex(dshHome)).resolves.toEqual({})
  })

  it('round-trips a written index', async () => {
    const index = { 'acme/cool-tool': { version: '0.1.0', enabled: true, installedAt: 't0' } }
    await writeIndex(dshHome, index)
    await expect(readIndex(dshHome)).resolves.toEqual(index)
    await expect(readFile(indexFile(dshHome), 'utf8')).resolves.toContain('"acme/cool-tool"')
  })

  it('fails loud on a corrupt index file', async () => {
    await mkdir(pluginsRoot(dshHome), { recursive: true })
    await writeFile(indexFile(dshHome), '{corrupt')
    await expect(readIndex(dshHome)).rejects.toThrow()
  })
})

describe('installPlugin', () => {
  it('installs a plugin as disabled and records it in the index', async () => {
    const source = join(tempDir, 'source')
    await writePluginRoot(source)

    const installed = await installPlugin(source, { dshHome, harnessVersion: '0.2.0' })

    expect(installed.id).toBe('acme/cool-tool')
    expect(installed.record.enabled).toBe(false)
    expect(installed.record.version).toBe('0.1.0')
    const index = await readIndex(dshHome)
    expect(index['acme/cool-tool']).toMatchObject({ version: '0.1.0', enabled: false })
    await expect(readFile(join(pluginDir(dshHome, 'acme/cool-tool'), MANIFEST_FILE_NAME), 'utf8'))
      .resolves.toContain('"id":"acme/cool-tool"')
  })

  it('rejects a plugin whose manifest is missing', async () => {
    const source = join(tempDir, 'empty-source')
    await mkdir(source, { recursive: true })
    await expect(installPlugin(source, { dshHome, harnessVersion: '0.2.0' })).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects an already installed plugin id', async () => {
    const source = join(tempDir, 'source')
    await writePluginRoot(source)
    await installPlugin(source, { dshHome, harnessVersion: '0.2.0' })
    await expect(installPlugin(source, { dshHome, harnessVersion: '0.2.0' })).rejects.toThrow(/already installed/)
  })

  it('rejects a plugin whose declared main entry is missing', async () => {
    const source = join(tempDir, 'source')
    await mkdir(source, { recursive: true })
    await writeFile(join(source, MANIFEST_FILE_NAME), JSON.stringify({ ...MANIFEST, main: './missing.mjs' }))
    await expect(installPlugin(source, { dshHome, harnessVersion: '0.2.0' })).rejects.toThrow(/missing\.mjs.*is missing/)
  })

  it('rejects a plugin whose engine range the harness does not satisfy', async () => {
    const source = join(tempDir, 'source')
    await writePluginRoot(source)
    await writeFile(join(source, MANIFEST_FILE_NAME), JSON.stringify({ ...MANIFEST, engines: { dsh: '>=1.0.0' } }))
    await expect(installPlugin(source, { dshHome, harnessVersion: '0.2.0' })).rejects.toThrow(/requires dsh >=1\.0\.0/)
  })
})

describe('setEnabled', () => {
  it('enables and disables an installed plugin', async () => {
    const source = join(tempDir, 'source')
    await writePluginRoot(source)
    await installPlugin(source, { dshHome, harnessVersion: '0.2.0' })

    await setEnabled(dshHome, 'acme/cool-tool', true)
    await expect(readIndex(dshHome)).resolves.toMatchObject({ 'acme/cool-tool': { enabled: true } })
    await setEnabled(dshHome, 'acme/cool-tool', false)
    await expect(readIndex(dshHome)).resolves.toMatchObject({ 'acme/cool-tool': { enabled: false } })
  })

  it('is idempotent when the state already matches', async () => {
    const source = join(tempDir, 'source')
    await writePluginRoot(source)
    await installPlugin(source, { dshHome, harnessVersion: '0.2.0' })
    await expect(setEnabled(dshHome, 'acme/cool-tool', false)).resolves.toBeUndefined()
  })

  it('rejects an unknown plugin id', async () => {
    await expect(setEnabled(dshHome, 'acme/ghost', true)).rejects.toThrow(/not installed/)
  })
})

describe('listPlugins', () => {
  it('lists installed plugins sorted by id', async () => {
    const sourceA = join(tempDir, 'source-a')
    await writePluginRoot(sourceA)
    await installPlugin(sourceA, { dshHome, harnessVersion: '0.2.0' })
    const sourceB = join(tempDir, 'source-b')
    await mkdir(sourceB, { recursive: true })
    await writeFile(join(sourceB, MANIFEST_FILE_NAME), JSON.stringify({ ...MANIFEST, id: 'zeta/other' }))
    await writeFile(join(sourceB, 'index.mjs'), 'export default { apply() {} }\n')
    await installPlugin(sourceB, { dshHome, harnessVersion: '0.2.0' })

    const listed = await listPlugins(dshHome)
    expect(listed.map(p => p.id)).toEqual(['acme/cool-tool', 'zeta/other'])
    expect(listed[0]!.manifest.description).toBe('a demo plugin')
  })

  it('returns an empty list when nothing is installed', async () => {
    await expect(listPlugins(dshHome)).resolves.toEqual([])
  })
})

describe('uninstallPlugin', () => {
  it('removes the plugin directory and its index record', async () => {
    const source = join(tempDir, 'source')
    await writePluginRoot(source)
    await installPlugin(source, { dshHome, harnessVersion: '0.2.0' })

    await uninstallPlugin(dshHome, 'acme/cool-tool')
    await expect(readIndex(dshHome)).resolves.toEqual({})
    await expect(readFile(join(pluginDir(dshHome, 'acme/cool-tool'), MANIFEST_FILE_NAME), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('removes only the targeted plugin when others remain', async () => {
    const sourceA = join(tempDir, 'source-a')
    await writePluginRoot(sourceA)
    await installPlugin(sourceA, { dshHome, harnessVersion: '0.2.0' })
    const sourceB = join(tempDir, 'source-b')
    await mkdir(sourceB, { recursive: true })
    await writeFile(join(sourceB, MANIFEST_FILE_NAME), JSON.stringify({ ...MANIFEST, id: 'zeta/keep' }))
    await writeFile(join(sourceB, 'index.mjs'), 'export default { apply() {} }\n')
    await installPlugin(sourceB, { dshHome, harnessVersion: '0.2.0' })

    await uninstallPlugin(dshHome, 'acme/cool-tool')
    await expect(readIndex(dshHome)).resolves.toMatchObject({ 'zeta/keep': { enabled: false } })
  })

  it('rejects an unknown plugin id', async () => {
    await expect(uninstallPlugin(dshHome, 'acme/ghost')).rejects.toThrow(/not installed/)
  })
})

describe('requireDirectory', () => {
  it('accepts an existing directory', async () => {
    await mkdir(join(tempDir, 'dir'), { recursive: true })
    await expect(requireDirectory(join(tempDir, 'dir'))).resolves.toBeUndefined()
  })

  it('rejects a file path', async () => {
    const file = join(tempDir, 'file.txt')
    await writeFile(file, 'x')
    await expect(requireDirectory(file)).rejects.toThrow(/expects a plugin directory/)
  })

  it('propagates a missing path', async () => {
    await expect(requireDirectory(join(tempDir, 'missing'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
