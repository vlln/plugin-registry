/**
 * 版本检查语义测试：原生 fetch 查询 registry——
 * 200 返回最新版 / 404 视为非 registry 包（null 无 error）/
 * 非 404 HTTP 错误与网络错误返回 error（UI 可显示「检查失败」）。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { npmViewLatest, registryPackagePath, registryRoot } from '../src/versions.ts'

/** 假 fetch：返回固定状态码/体的 Response 形状，并记录调用 URL。 */
function fakeFetch(status: number, body?: unknown): { fetch: typeof fetch; calls: string[] } {
  const calls: string[] = []
  const fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    const ok = status >= 200 && status < 300
    return { status, ok, json: async () => body } as unknown as Response
  }) as typeof fetch
  return { fetch, calls }
}

describe('npmViewLatest', () => {
  it('200 → latest 版本，无 error', async () => {
    const { fetch, calls } = fakeFetch(200, { version: '0.1.1' })
    const result = await npmViewLatest('dsh-monitor', fetch)
    assert.equal(result.latest, '0.1.1')
    assert.equal(result.error, null)
    assert.ok(calls[0]!.endsWith('/dsh-monitor/latest'))
  })

  it('scoped 包名把 / 编码为 %2f', async () => {
    const { fetch, calls } = fakeFetch(200, { version: '1.2.3' })
    await npmViewLatest('@linxin666/dsh-skins', fetch)
    assert.ok(calls[0]!.includes('/@linxin666%2fdsh-skins/latest'))
  })

  it('404 → null 无 error（非 registry 包：git/link 依赖）', async () => {
    const { fetch } = fakeFetch(404)
    const result = await npmViewLatest('some-git-dep', fetch)
    assert.deepEqual(result, { latest: null, error: null })
  })

  it('非 404 HTTP 错误 → error', async () => {
    const { fetch } = fakeFetch(503)
    const result = await npmViewLatest('dsh-monitor', fetch)
    assert.equal(result.latest, null)
    assert.equal(result.error, 'registry 503')
  })

  it('网络错误 → error 且不抛出', async () => {
    const broken = (async () => { throw new Error('fetch failed') }) as typeof fetch
    const result = await npmViewLatest('dsh-monitor', broken)
    assert.equal(result.latest, null)
    assert.match(result.error ?? '', /fetch failed/)
  })

  it('registry 走 npm_config_registry 镜像源', async (t) => {
    const old = process.env.npm_config_registry
    process.env.npm_config_registry = 'https://registry.npmmirror.com/'
    t.after(() => {
      if (old === undefined) delete process.env.npm_config_registry
      else process.env.npm_config_registry = old
    })
    assert.equal(registryRoot(), 'https://registry.npmmirror.com')
    const { fetch, calls } = fakeFetch(200, { version: '0.1.1' })
    await npmViewLatest('dsh-monitor', fetch)
    assert.ok(calls[0]!.startsWith('https://registry.npmmirror.com/dsh-monitor/latest'))
  })

  it('registryPackagePath 编码', () => {
    assert.equal(registryPackagePath('dsh-monitor'), 'dsh-monitor')
    assert.equal(registryPackagePath('@a/b'), '@a%2fb')
  })
})
