import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MANIFEST_FILE_NAME, readManifest, scaffoldPlugin } from '../src/index.ts'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'dsh-plugin-scaffold-'))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('scaffoldPlugin', () => {
  it('creates a manifest, entry, and README that pass install-time validation', async () => {
    const dir = join(tempDir, 'cool-tool')
    await scaffoldPlugin({ id: 'acme/cool-tool', dir })

    const manifest = await readManifest(dir)
    expect(manifest).toEqual({
      id: 'acme/cool-tool',
      version: '0.1.0',
      main: './index.mjs',
      description: 'cool-tool plugin',
      engines: { dsh: '>=0.0.1' },
      contributes: { tools: [], skills: [] },
    })
    const entry = await readFile(join(dir, 'index.mjs'), 'utf8')
    expect(entry).toContain('export default')
    expect(entry).toContain('apply(ctx)')
    const readme = await readFile(join(dir, 'README.md'), 'utf8')
    expect(readme).toContain('acme/cool-tool')
    expect(readme).toContain('dsh plugin install .')
    // The scaffolded root is directly installable: its manifest file parses.
    await expect(readFile(join(dir, MANIFEST_FILE_NAME), 'utf8')).resolves.toContain('"id": "acme/cool-tool"')
  })

  it('honors explicit version and description', async () => {
    const dir = join(tempDir, 'tool')
    await scaffoldPlugin({ id: 'acme/tool', dir, version: '0.2.0', description: 'a custom summary' })
    const manifest = await readManifest(dir)
    expect(manifest.version).toBe('0.2.0')
    expect(manifest.description).toBe('a custom summary')
  })

  it('fails loud on an invalid id before writing any file', async () => {
    const dir = join(tempDir, 'bad')
    await expect(scaffoldPlugin({ id: 'No-Slash', dir })).rejects.toThrow(/id/)
    await expect(readFile(join(dir, MANIFEST_FILE_NAME), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
