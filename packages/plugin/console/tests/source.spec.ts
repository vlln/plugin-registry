/**
 * 安装源规范化 / 已装包名解析单测（0817 修 #19/#4）：
 * normalizeSource 的 URL → github: 速记映射与透传；resolveInstalledName
 * 从 profile 依赖解析真实包名。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSource, resolveInstalledName } from '../src/source.ts'

describe('normalizeSource', () => {
  it('normalizes full GitHub URLs to the github: shorthand', () => {
    assert.equal(normalizeSource('https://github.com/Nagi-ovo/dsh-visualize'), 'github:Nagi-ovo/dsh-visualize')
    assert.equal(normalizeSource('http://github.com/Nagi-ovo/dsh-visualize'), 'github:Nagi-ovo/dsh-visualize')
    assert.equal(normalizeSource('github.com/Nagi-ovo/dsh-visualize'), 'github:Nagi-ovo/dsh-visualize')
    assert.equal(normalizeSource('https://www.github.com/Nagi-ovo/dsh-visualize'), 'github:Nagi-ovo/dsh-visualize')
    assert.equal(normalizeSource('https://github.com/Nagi-ovo/dsh-visualize/'), 'github:Nagi-ovo/dsh-visualize')
  })

  it('strips .git suffix, keeps #ref (incl. &path: subdirectory) and drops query strings', () => {
    assert.equal(normalizeSource('https://github.com/o/r.git'), 'github:o/r')
    assert.equal(normalizeSource('https://github.com/o/r#main'), 'github:o/r#main')
    assert.equal(normalizeSource('https://github.com/o/r#main&path:/packages/plugin/console'), 'github:o/r#main&path:/packages/plugin/console')
    assert.equal(normalizeSource('https://github.com/o/r?tab=readme'), 'github:o/r')
  })

  it('maps /tree/<branch> web paths to #branch and drops other sub-paths', () => {
    assert.equal(normalizeSource('https://github.com/o/r/tree/main'), 'github:o/r#main')
    assert.equal(normalizeSource('https://github.com/o/r/issues/1'), 'github:o/r')
  })

  it('passes npm names, github: shorthand and link: specs through unchanged', () => {
    assert.equal(normalizeSource('@deepseek-ai/dsh-toolkit'), '@deepseek-ai/dsh-toolkit')
    assert.equal(normalizeSource('github:o/r#ref'), 'github:o/r#ref')
    assert.equal(normalizeSource('link:../pkg'), 'link:../pkg')
    assert.equal(normalizeSource('  @deepseek-ai/dsh-toolkit  '), '@deepseek-ai/dsh-toolkit')
  })
})

describe('resolveInstalledName', () => {
  const manifest = { dependencies: { whale: 'github:o/whale', plain: 'plain', scoped: 'npm:@scope/x' } }

  it('matches an exact dependency key', () => {
    assert.equal(resolveInstalledName(manifest, 'plain'), 'plain')
  })

  it('finds the key whose dep value contains the install source (git source)', () => {
    assert.equal(resolveInstalledName(manifest, 'github:o/whale'), 'whale')
  })

  it('matches the normalized URL form against the git dep value', () => {
    assert.equal(resolveInstalledName(manifest, normalizeSource('https://github.com/o/whale')), 'whale')
  })

  it('returns null when nothing matches or the manifest is unavailable', () => {
    assert.equal(resolveInstalledName(manifest, 'nope'), null)
    assert.equal(resolveInstalledName(undefined, 'x'), null)
    assert.equal(resolveInstalledName({}, 'x'), null)
  })
})
