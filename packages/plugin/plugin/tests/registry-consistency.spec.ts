/**
 * Registry consistency tests (hewzhew's Windows fault-injection findings):
 * atomic index commits, per-home serialization of mutations, install rollback
 * on a failed index write, retryable uninstall, and leftover-directory
 * cleanup. Failures are injected by spying on `node:fs/promises.writeFile`
 * (the atomic staging write), leaving production code untouched.
 */

import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MANIFEST_FILE_NAME,
  indexFile,
  installPlugin,
  readIndex,
  setEnabled,
  uninstallPlugin,
  writeIndex,
} from '../src/index.ts'

let tempDir: string
let dshHome: string
let sequence = 0

beforeEach(async () => {
  tempDir = await mkdtemp(join(process.cwd(), 'packages/plugin/plugin/tests/.tmp-consistency-'))
  dshHome = join(tempDir, 'home')
  await mkdir(dshHome, { recursive: true })
  sequence += 1
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

async function writeSource(root: string, id: string): Promise<void> {
  await mkdir(root, { recursive: true })
  await writeFile(join(root, MANIFEST_FILE_NAME), JSON.stringify({ id, version: '0.1.0', main: './index.mjs' }))
  await writeFile(join(root, 'index.mjs'), 'export default { apply() {} }\n')
}

/** Make the index staging path a directory, so the staging write fails with
 * EISDIR — a real filesystem failure with no mocks. */
async function failIndexWrites(): Promise<void> {
  await mkdir(`${indexFile(dshHome)}.tmp`, { recursive: true })
}

describe('atomic index commits', () => {
  it('leaves no staging file behind after a write', async () => {
    await writeIndex(dshHome, { 'acme/a': { version: '0.1.0', enabled: true, installedAt: 't' } })
    const entries = await readdir(join(dshHome, 'plugins'))
    expect(entries).toEqual(['index.json'])
    await expect(readIndex(dshHome)).resolves.toMatchObject({ 'acme/a': { enabled: true } })
  })

  it('keeps the previous index when the staging write fails', async () => {
    await writeIndex(dshHome, { 'acme/a': { version: '0.1.0', enabled: true, installedAt: 't' } })
    await failIndexWrites()
    await expect(writeIndex(dshHome, { 'acme/b': { version: '0.2.0', enabled: false, installedAt: 't' } })).rejects.toMatchObject({ code: 'EISDIR' })
    // The old index is intact — the reader never saw a truncated or partial file.
    await expect(readIndex(dshHome)).resolves.toMatchObject({ 'acme/a': { enabled: true } })
    const entries = await readdir(join(dshHome, 'plugins'))
    expect(entries).toEqual(['index.json', 'index.json.tmp'])
  })
})

describe('mutation serialization', () => {
  it('never drops updates under concurrent enablement', async () => {
    const ids: string[] = []
    for (let i = 0; i < 24; i += 1) {
      const id = `acme/c${sequence}-${String(i).padStart(2, '0')}`
      ids.push(id)
      const source = join(tempDir, `src-${id}`)
      await writeSource(source, id)
      await installPlugin(source, { dshHome, harnessVersion: '0.2.0' })
    }

    await Promise.all(ids.map(id => setEnabled(dshHome, id, true)))

    const index = await readIndex(dshHome)
    const enabled = ids.filter(id => index[id]?.enabled === true)
    expect(enabled).toHaveLength(24)
  })

  it('lets later mutations run after one fails', async () => {
    await writeSource(join(tempDir, 'src-a'), 'acme/a')
    await installPlugin(join(tempDir, 'src-a'), { dshHome, harnessVersion: '0.2.0' })
    await failIndexWrites()
    await expect(setEnabled(dshHome, 'acme/a', true)).rejects.toMatchObject({ code: 'EISDIR' })
    await expect(setEnabled(dshHome, 'acme/a', true)).rejects.toMatchObject({ code: 'EISDIR' })
    await rm(`${indexFile(dshHome)}.tmp`, { recursive: true, force: true })
    await expect(setEnabled(dshHome, 'acme/a', true)).resolves.toBeUndefined()
    await expect(readIndex(dshHome)).resolves.toMatchObject({ 'acme/a': { enabled: true } })
  })
})

describe('install rollback', () => {
  it('rolls the copied directory back when the index write fails, and retries cleanly', async () => {
    const source = join(tempDir, 'src')
    await writeSource(source, 'acme/rollback')
    await failIndexWrites()

    await expect(installPlugin(source, { dshHome, harnessVersion: '0.2.0' })).rejects.toMatchObject({ code: 'EISDIR' })
    // The registry is back to the pre-install state: no directory, no record.
    await expect(readIndex(dshHome)).resolves.toEqual({})
    await expect(import('node:fs/promises').then(fs => fs.stat(join(dshHome, 'plugins/acme/rollback'))))
      .rejects.toMatchObject({ code: 'ENOENT' })

    await rm(`${indexFile(dshHome)}.tmp`, { recursive: true, force: true })
    const installed = await installPlugin(source, { dshHome, harnessVersion: '0.2.0' })
    expect(installed.id).toBe('acme/rollback')
  })

  it('cleans up a leftover directory without an index record before installing', async () => {
    await mkdir(join(dshHome, 'plugins/acme/leftover'), { recursive: true })
    const source = join(tempDir, 'src')
    await writeSource(source, 'acme/leftover')

    const installed = await installPlugin(source, { dshHome, harnessVersion: '0.2.0' })
    expect(installed.id).toBe('acme/leftover')
    await expect(readIndex(dshHome)).resolves.toMatchObject({ 'acme/leftover': { enabled: false } })
  })
})

describe('uninstall retry', () => {
  it('leaves a retryable state when the index write fails', async () => {
    const source = join(tempDir, 'src')
    await writeSource(source, 'acme/retry')
    await installPlugin(source, { dshHome, harnessVersion: '0.2.0' })

    await failIndexWrites()
    await expect(uninstallPlugin(dshHome, 'acme/retry')).rejects.toMatchObject({ code: 'EISDIR' })
    // The directory is gone; the index record remains (retryable — the removal is idempotent).
    await expect(import('node:fs/promises').then(fs => fs.stat(join(dshHome, 'plugins/acme/retry'))))
      .rejects.toMatchObject({ code: 'ENOENT' })

    await rm(`${indexFile(dshHome)}.tmp`, { recursive: true, force: true })
    await expect(uninstallPlugin(dshHome, 'acme/retry')).resolves.toBeUndefined()
    await expect(readIndex(dshHome)).resolves.toEqual({})
  })
})
