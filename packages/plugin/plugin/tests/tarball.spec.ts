import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { c as createTarball } from 'tar'
import {
  MANIFEST_FILE_NAME,
  installFromTarball,
  installPlugin,
  isTarball,
  locatePluginRoot,
  readIndex,
} from '../src/index.ts'

let tempDir: string
let dshHome: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'dsh-plugin-tarball-'))
  dshHome = join(tempDir, 'home')
  await mkdir(dshHome, { recursive: true })
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

async function writePluginRoot(root: string, id: string): Promise<void> {
  await mkdir(root, { recursive: true })
  await writeFile(join(root, MANIFEST_FILE_NAME), JSON.stringify({ id, version: '0.1.0', main: './index.mjs' }))
  await writeFile(join(root, 'index.mjs'), 'export default { apply() {} }\n')
}

async function pack(root: string, out: string): Promise<void> {
  await createTarball({ file: out, cwd: join(root, '..'), gzip: true }, [root.split('/').at(-1) ?? ''])
}

describe('isTarball', () => {
  it('recognizes tarball suffixes only', () => {
    expect(isTarball('demo.tgz')).toBe(true)
    expect(isTarball('demo.tar.gz')).toBe(true)
    expect(isTarball('demo.tgz.extra')).toBe(false)
    expect(isTarball('/tmp/demo/')).toBe(false)
  })
})

describe('locatePluginRoot', () => {
  it('accepts a staging root that holds the manifest', async () => {
    await writePluginRoot(tempDir, 'acme/direct')
    await expect(locatePluginRoot(tempDir)).resolves.toBe(tempDir)
  })

  it('finds the single top-level directory that holds the manifest', async () => {
    const nested = join(tempDir, 'pkg')
    await writePluginRoot(nested, 'acme/nested')
    await expect(locatePluginRoot(tempDir)).resolves.toBe(nested)
  })

  it('fails loud when no directory holds a manifest', async () => {
    await mkdir(join(tempDir, 'empty'))
    await expect(locatePluginRoot(tempDir)).rejects.toThrow(/no plugin root/)
  })
})

describe('installFromTarball', () => {
  it('installs a tarball whose archive root is the plugin root', async () => {
    const source = join(tempDir, 'src')
    await writePluginRoot(source, 'acme/rooted')
    const archive = join(tempDir, 'rooted.tgz')
    await pack(source, archive)

    const installed = await installFromTarball(archive, { dshHome, harnessVersion: '0.2.0' })
    expect(installed.id).toBe('acme/rooted')
    expect(installed.record.enabled).toBe(false)
    await expect(readIndex(dshHome)).resolves.toMatchObject({ 'acme/rooted': { enabled: false } })
  })



  it('rejects a path that is not a file', async () => {
    await expect(installFromTarball(dshHome, { dshHome, harnessVersion: '0.2.0' }))
      .rejects.toThrow(/expects a tarball file or plugin directory/)
  })

  it('rejects a tarball with no plugin root inside', async () => {
    const empty = join(tempDir, 'empty-src')
    await mkdir(empty, { recursive: true })
    const archive = join(tempDir, 'empty.tgz')
    await pack(empty, archive)

    await expect(installFromTarball(archive, { dshHome, harnessVersion: '0.2.0' }))
      .rejects.toThrow(/no plugin root/)
  })

  it('keeps the staging directory cleaned up after failure', async () => {
    const empty = join(tempDir, 'empty-src-2')
    await mkdir(empty, { recursive: true })
    const archive = join(tempDir, 'empty2.tgz')
    await pack(empty, archive)
    await expect(installFromTarball(archive, { dshHome, harnessVersion: '0.2.0' })).rejects.toThrow()
    // The registry stays untouched.
    await expect(readIndex(dshHome)).resolves.toEqual({})
  })
})

describe('tarball and directory installs agree', () => {
  it('a tarball install equals a directory install of the same root', async () => {
    const source = join(tempDir, 'src-eq')
    await writePluginRoot(source, 'acme/equal')
    const archive = join(tempDir, 'equal.tgz')
    await pack(source, archive)

    const viaTarball = await installFromTarball(archive, { dshHome, harnessVersion: '0.2.0' })
    // Reinstalling the same id fails either way.
    await expect(installPlugin(source, { dshHome, harnessVersion: '0.2.0' })).rejects.toThrow(/already installed/)
    expect(viaTarball.record.version).toBe('0.1.0')
  })
})
