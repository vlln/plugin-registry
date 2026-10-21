/**
 * 生成 index.json：把 plugins/*.json 的手写事实 + 探测到的真实发布事实，
 * 合并成插件市场索引 format 1，然后用官方校验器自检，最后写盘。
 *
 * 事实来源（权威，不手填）：
 * - git 源：GitHub 默认分支 HEAD 的 commit + 该 commit 上的 package.json（version / engines.dsh）
 * - npm 源：registry 的 dist-tags + 每个版本的发布时间与 engines.dsh
 *
 * 手填的只有展示层：title / description / category / keywords / icon。
 * 环境变量：GITHUB_TOKEN（CI 里给，避免 60 次/小时的匿名限流）
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX_URL = process.env.INDEX_URL ?? 'https://raw.githubusercontent.com/vlln/plugin-registry/main/index.json'
const GITHUB_TOKEN = (process.env.GITHUB_TOKEN ?? '').trim()

const TITLE = { en: "vlln's DSH plugins", zh: 'vlln 的 dsh 插件' }
const DESCRIPTION = {
  en: 'DeepSeek Harness plugins by vlln. Add this file as an index source under Plugins → Discover.',
  zh: 'vlln 开发的 DeepSeek Harness 插件。把本文件加成 Plugins → Discover 里的索引源即可浏览。',
}

/** 分类 id → 标题。插件只能引用这里声明过的 id。 */
const CATEGORIES = {
  content: { title: { en: 'Content', zh: '内容' } },
  conversation: { title: { en: 'Conversation', zh: '会话' } },
  workspace: { title: { en: 'Workspace', zh: '工作区' } },
  workflow: { title: { en: 'Workflow', zh: '工作流' } },
  interface: { title: { en: 'Interface', zh: '界面' } },
}

const headers = {
  accept: 'application/vnd.github+json',
  ...(GITHUB_TOKEN === '' ? {} : { authorization: `Bearer ${GITHUB_TOKEN}` }),
}

/** @param {string} url @param {Record<string, string>} [init] */
async function getJson(url, init) {
  let response
  try {
    response = await fetch(url, { headers: { ...headers, ...init } })
  } catch (error) {
    throw new Error(`fetch ${url} failed: ${error?.cause?.message ?? error?.message ?? String(error)}`)
  }
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`)
  return response.json()
}

/** GitHub 默认分支 HEAD：commit sha + committer 时间（秒）。 */
async function headOf(repo) {
  const commits = await getJson(`https://api.github.com/repos/${repo}/commits?per_page=1`)
  const head = Array.isArray(commits) ? commits[0] : undefined
  if (head === undefined) throw new Error(`${repo}: no commits`)
  return {
    sha: head.sha,
    timestamp: Math.floor(Date.parse(head.commit.committer.date) / 1000),
  }
}

/**
 * 某个 commit 上的 package.json。走 api.github.com（raw.githubusercontent.com 在
 * 部分网络下会单个 15 分钟级超时，见 AGENTS.local.md），用 raw 媒体类型取正文。
 */
async function manifestAt(repo, sha) {
  const url = `https://api.github.com/repos/${repo}/contents/package.json?ref=${sha}`
  let response
  try {
    response = await fetch(url, { headers: { ...headers, accept: 'application/vnd.github.raw+json' } })
  } catch (error) {
    throw new Error(`fetch ${url} failed: ${error?.cause?.message ?? error?.message ?? String(error)}`)
  }
  if (!response.ok) throw new Error(`${repo}@${sha.slice(0, 7)} package.json → HTTP ${response.status}`)
  return response.json()
}

/** npm 上全部版本（新→旧），带发布时间与 engines.dsh。 */
async function npmVersions(name) {
  const encoded = name.replace('/', '%2F')
  const registry = await getJson(`https://registry.npmjs.org/${encoded}`)
  const versions = Object.keys(registry.versions ?? {})
    .filter(version => registry.time?.[version] !== undefined)
    .map(version => ({
      version,
      publishTimestamp: Math.floor(Date.parse(registry.time[version]) / 1000),
      engines: registry.versions[version].engines ?? {},
    }))
  if (versions.length === 0) throw new Error(`${name}: npm has no version with a publish time`)
  return versions.sort((left, right) => (left.version === right.version ? 0 : left.version < right.version ? 1 : -1))
}

/** @param {Record<string, unknown>} entry */
async function buildPlugin(entry) {
  const plugin = {
    name: entry.name,
    ...(entry.title === undefined ? {} : { title: entry.title }),
    ...(entry.description === undefined ? {} : { description: entry.description }),
    ...(entry.icon === undefined ? {} : { icon: entry.icon }),
    ...(entry.author === undefined ? {} : { author: entry.author }),
    ...(entry.homepage === undefined ? {} : { homepage: entry.homepage }),
    repository: { url: `https://github.com/${entry.repo}` },
    metadata: {
      category: entry.category,
      keywords: entry.keywords ?? [],
      labels: [],
      sortKeys: {},
    },
  }

  if (entry.source === 'npm') {
    const versions = await npmVersions(entry.name)
    plugin.versions = versions.map(({ version, publishTimestamp, engines }) => ({
      version,
      publishTimestamp,
      source: { type: 'npm' },
      ...(typeof engines.dsh === 'string' ? { engines: { dsh: engines.dsh } } : {}),
    }))
    return plugin
  }

  const head = await headOf(entry.repo)
  const manifest = await manifestAt(entry.repo, head.sha)
  const dshRange = manifest.engines?.dsh
  plugin.versions = [
    {
      version: manifest.version,
      publishTimestamp: head.timestamp,
      source: { type: 'git', url: `https://github.com/${entry.repo}`, commit: head.sha },
      ...(typeof dshRange === 'string' ? { engines: { dsh: dshRange } } : {}),
    },
  ]
  return plugin
}

const files = (await readdir(join(ROOT, 'plugins'))).filter(file => file.endsWith('.json')).sort()
const entries = []
for (const file of files) {
  const entry = JSON.parse(await readFile(join(ROOT, 'plugins', file), 'utf8'))
  if (entry.category !== undefined && !Object.hasOwn(CATEGORIES, entry.category)) {
    throw new Error(`${file}: category ${JSON.stringify(entry.category)} is not declared in CATEGORIES`)
  }
  entries.push({ file, entry })
}

const document = {
  format: 1,
  title: TITLE,
  description: DESCRIPTION,
  metadata: { categories: CATEGORIES, labels: {}, sortKeys: {} },
  plugins: [],
}

for (const { file, entry } of entries) {
  try {
    document.plugins.push(await buildPlugin(entry))
  } catch (error) {
    throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// 官方校验器是唯一裁判：任何一条规则不过就抛（带 JSON 路径），绝不写盘。
const validated = parseMarketIndex(document, INDEX_URL)

await writeFile(join(ROOT, 'index.json'), `${JSON.stringify(document, null, 2)}\n`)

const lines = validated.plugins.map(plugin => {
  const versions = plugin.versions.map(version => version.version).join(', ')
  return `  ${plugin.name.padEnd(26)} ${versions}`
})
console.log(`index.json: ${validated.plugins.length} plugins, ${validated.plugins.reduce((sum, plugin) => sum + plugin.versions.length, 0)} versions`)
console.log(lines.join('\n'))
