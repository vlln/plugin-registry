#!/usr/bin/env node
/**
 * Verify markdown links: every relative link target in every .md file must
 * resolve to an existing file (or an existing file + heading anchor). External
 * URLs and fragment-only links are skipped. Exits non-zero on the first broken
 * link, listing every file that failed.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { globSync } from 'node:fs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mdFiles = globSync('**/*.md', { cwd: repoRoot, ignore: ['node_modules/**', '**/lib/**'] })
const failures = []

for (const file of mdFiles) {
  const raw = readFileSync(join(repoRoot, file), 'utf8')
  // 先跳过**围栏代码块**：里面的"链接"是示例文本，不是真链接。文档模板里常有一行
  // 就是 `<占位符>` 的写法，它会被下面的 autolink 规则误吞（本脚本曾经因此直接抛
  // TypeError 而不是报错——坏的不是文档，是匹配）。
  const text = raw.replace(/^(?:```|~~~)[\s\S]*?^(?:```|~~~)/gm, '')
  // Markdown link destinations: [text](dest) and bare <dest> in link position.
  // The bare form excludes HTML tags (<p …>, </div>, <br>): a tag name is a
  // letter run followed by whitespace or '>', which a URL/relative path never
  // has (protocols carry ':', paths carry '/').
  const linkRe = /\[[^\]]*\]\(([^)]+)\)|^<(?!\/?[a-zA-Z]+[\s>])[^>]+>$/gm
  let match
  while ((match = linkRe.exec(text)) !== null) {
    // 裸形式 `^<dest>$` 整段都在 match[0] 里（没有捕获组）——旧写法只读 match[1]/[2]，
    // 命中裸形式时两者都是 undefined，于是 .trim() 抛 TypeError。
    const dest = (match[1] ?? match[2] ?? match[0].replace(/^</, '').replace(/>$/, '')).trim()
    if (dest === '' || dest.startsWith('#')) continue
    if (/^[a-z]+:/i.test(dest)) continue // external URL or mailto
    const [pathPart, anchor] = dest.split('#')
    const target = resolve(dirname(join(repoRoot, file)), pathPart)
    if (!existsSync(target)) {
      failures.push(`${file}: missing link target "${dest}" -> ${target}`)
      continue
    }
    if (anchor !== undefined && !fileHasAnchor(target, anchor)) {
      failures.push(`${file}: missing anchor "#${anchor}" in ${pathPart}`)
    }
  }
}

function fileHasAnchor(file, anchor) {
  const text = readFileSync(file, 'utf8')
  // GitHub slug rule: lowercase, strip punctuation, spaces to hyphens. Match a
  // heading whose slugged text equals the link's anchor.
  const slug = (s) => s.toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').replace(/ /g, '-')
  for (const line of text.split('\n')) {
    const m = line.match(/^#{1,6}\s+(.+)$/)
    if (m && slug(m[1]) === anchor) return true
  }
  return false
}

if (failures.length > 0) {
  console.error(`verify-md-links: ${failures.length} broken link(s)`)
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}
console.log(`verify-md-links: ok (${mdFiles.length} files, all links resolve)`)
