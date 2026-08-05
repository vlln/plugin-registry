import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MANIFEST_FILE_NAME, checkEngine, parseManifest, readManifest, type PluginManifest } from '../src/index.ts'

const FULL_MANIFEST: PluginManifest = {
  id: 'acme/cool-tool',
  version: '0.1.0',
  main: './index.mjs',
  description: 'a demo plugin',
  engines: { dsh: '>=0.0.1' },
  contributes: { tools: ['cool_read'], skills: [] },
}

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'dsh-plugin-manifest-'))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('parseManifest', () => {
  it('parses and validates a complete manifest', () => {
    expect(parseManifest(JSON.stringify(FULL_MANIFEST), 'dsh.plugin.json')).toEqual(FULL_MANIFEST)
  })

  it('fills defaults for optional fields', () => {
    const manifest = parseManifest(JSON.stringify({
      id: 'acme/cool-tool',
      version: '0.1.0',
      main: './index.mjs',
    }), 'dsh.plugin.json')
    expect(manifest).toEqual({
      id: 'acme/cool-tool',
      version: '0.1.0',
      main: './index.mjs',
      description: '',
      engines: { dsh: '>=0.0.1' },
      contributes: { tools: [], skills: [] },
    })
  })

  it('fails loud on malformed JSON', () => {
    expect(() => parseManifest('{not json', 'dsh.plugin.json'))
      .toThrow(/invalid JSON in dsh\.plugin\.json/)
  })

  it('fails loud on an invalid id', () => {
    expect(() => parseManifest(JSON.stringify({ ...FULL_MANIFEST, id: 'UPPER/tool' }), 'dsh.plugin.json'))
      .toThrow(/id/)
    expect(() => parseManifest(JSON.stringify({ ...FULL_MANIFEST, id: 'no-slash' }), 'dsh.plugin.json'))
      .toThrow(/id/)
  })

  it('fails loud on a non-object payload', () => {
    expect(() => parseManifest('42', 'dsh.plugin.json')).toThrow()
  })
})

describe('readManifest', () => {
  it('reads and validates a manifest from disk', async () => {
    await writeFile(join(tempDir, MANIFEST_FILE_NAME), JSON.stringify(FULL_MANIFEST))
    await expect(readManifest(tempDir)).resolves.toEqual(FULL_MANIFEST)
  })

  it('propagates a missing manifest file', async () => {
    await expect(readManifest(tempDir)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('checkEngine', () => {
  it('accepts a satisfied engine range', () => {
    expect(() => { checkEngine({ dsh: '>=0.0.1' }, '0.2.0') }).not.toThrow()
  })

  it('rejects an unsatisfied engine range', () => {
    expect(() => { checkEngine({ dsh: '>=1.0.0' }, '0.2.0') })
      .toThrow(/requires dsh >=1\.0\.0, running 0\.2\.0/)
  })
})

describe('manifest schema surfaces', () => {
  it('keeps a manifest root with a nested directory readable', async () => {
    await mkdir(join(tempDir, 'nested'), { recursive: true })
    await writeFile(join(tempDir, 'nested', MANIFEST_FILE_NAME), JSON.stringify(FULL_MANIFEST))
    await expect(readManifest(join(tempDir, 'nested'))).resolves.toEqual(FULL_MANIFEST)
  })
})

describe('parseManifest client block', () => {
  it('parses a full client declaration', () => {
    const manifest = parseManifest(JSON.stringify({
      ...FULL_MANIFEST,
      client: { main: './client.js', inject: ['@deepseek-ai/dsh-client-connection'], immediately: true },
    }), 'dsh.plugin.json')
    expect(manifest.client).toEqual({
      main: './client.js',
      inject: ['@deepseek-ai/dsh-client-connection'],
      immediately: true,
    })
  })

  it('omits the client field entirely when absent', () => {
    const manifest = parseManifest(JSON.stringify(FULL_MANIFEST), 'dsh.plugin.json')
    expect(manifest.client).toBeUndefined()
  })

  it('defaults optional client subfields when absent', () => {
    const manifest = parseManifest(JSON.stringify({
      ...FULL_MANIFEST,
      client: { main: './client.js' },
    }), 'dsh.plugin.json')
    // schemastery fills arrays with their default (`[]`); booleans stay absent.
    expect(manifest.client).toEqual({ main: './client.js', inject: [] })
    expect(manifest.client?.immediately).toBeUndefined()
  })

  it('fails loud on a malformed client declaration', () => {
    expect(() => parseManifest(JSON.stringify({
      ...FULL_MANIFEST,
      client: { main: 42 },
    }), 'dsh.plugin.json')).toThrow(/main/)
    expect(() => parseManifest(JSON.stringify({
      ...FULL_MANIFEST,
      client: { main: './client.js', inject: 'not-an-array' },
    }), 'dsh.plugin.json')).toThrow(/inject/)
  })
})
