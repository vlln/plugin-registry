import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CATALOG_FILE_NAME,
  catalogFile,
  findCatalogEntry,
  installFromCatalog,
  readCatalog,
} from '../src/index.ts'
import { MANIFEST_FILE_NAME } from '../src/index.ts'

let tempDir: string
let dshHome: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'dsh-plugin-catalog-'))
  dshHome = join(tempDir, 'home')
  await mkdir(dshHome, { recursive: true })
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

function catalog(): Array<Record<string, string>> {
  return [
    { id: 'acme/cool-tool', version: '0.1.0', description: 'a demo plugin', source: join(tempDir, 'src-a') },
    { id: 'zeta/other', version: '0.2.0', description: 'another plugin', source: join(tempDir, 'src-b') },
  ]
}

async function writeSource(root: string, id: string): Promise<void> {
  await mkdir(root, { recursive: true })
  await writeFile(join(root, MANIFEST_FILE_NAME), JSON.stringify({ id, version: '0.1.0', main: './index.mjs' }))
  await writeFile(join(root, 'index.mjs'), 'export default { apply() {} }\n')
}

describe('catalogFile', () => {
  it('resolves the catalog path under the harness home', () => {
    expect(catalogFile(dshHome)).toBe(join(dshHome, CATALOG_FILE_NAME))
  })
})

describe('readCatalog', () => {
  it('returns an empty list when no catalog file exists', async () => {
    await expect(readCatalog(dshHome)).resolves.toEqual([])
  })

  it('parses the catalog with defaults for missing descriptions', async () => {
    await writeFile(catalogFile(dshHome), JSON.stringify([
      { id: 'acme/cool-tool', version: '0.1.0', source: '/x' },
    ]))
    await expect(readCatalog(dshHome)).resolves.toEqual([
      { id: 'acme/cool-tool', version: '0.1.0', description: '', source: '/x' },
    ])
  })

  it('fails loud on a corrupt catalog file', async () => {
    await writeFile(catalogFile(dshHome), '{corrupt')
    await expect(readCatalog(dshHome)).rejects.toThrow()
  })

  it('propagates a non-ENOENT read failure', async () => {
    await mkdir(catalogFile(dshHome))
    await expect(readCatalog(dshHome)).rejects.toMatchObject({ code: 'EISDIR' })
  })

  it('fails loud on a malformed entry', async () => {
    await writeFile(catalogFile(dshHome), JSON.stringify([{ id: 42 }]))
    await expect(readCatalog(dshHome)).rejects.toThrow()
  })
})

describe('findCatalogEntry', () => {
  it('finds an entry by id and returns undefined for an unknown id', async () => {
    await writeFile(catalogFile(dshHome), JSON.stringify(catalog()))
    await expect(findCatalogEntry(dshHome, 'acme/cool-tool')).resolves.toMatchObject({ id: 'acme/cool-tool' })
    await expect(findCatalogEntry(dshHome, 'acme/ghost')).resolves.toBeUndefined()
  })
})

describe('installFromCatalog', () => {
  it('installs a catalog entry from its source directory', async () => {
    await writeFile(catalogFile(dshHome), JSON.stringify(catalog()))
    await writeSource(join(tempDir, 'src-a'), 'acme/cool-tool')

    const installed = await installFromCatalog(dshHome, 'acme/cool-tool', { dshHome, harnessVersion: '0.2.0' })
    expect(installed.id).toBe('acme/cool-tool')
    expect(installed.record.enabled).toBe(false)
  })

  it('rejects an id absent from the catalog', async () => {
    await writeFile(catalogFile(dshHome), JSON.stringify(catalog()))
    await expect(installFromCatalog(dshHome, 'acme/ghost', { dshHome, harnessVersion: '0.2.0' }))
      .rejects.toThrow(/not in the catalog/)
  })
})
