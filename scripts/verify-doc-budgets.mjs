#!/usr/bin/env node
/**
 * Verify doc budgets: every document in scripts/doc-budgets.manifest.json must
 * exist and stay under its whitespace-stripped character ceiling (the budget
 * unit for CJK prose, where word counting is meaningless). Exits non-zero
 * listing over-budget or missing documents.
 */
import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(repoRoot, 'scripts/doc-budgets.manifest.json'), 'utf8'))
const failures = []

for (const [doc, ceiling] of Object.entries(manifest)) {
  const abs = join(repoRoot, doc)
  let text
  try {
    text = readFileSync(abs, 'utf8')
  } catch {
    failures.push(`${doc}: MISSING`)
    continue
  }
  const chars = text.replace(/\s/g, '').length
  if (chars > ceiling) {
    failures.push(`${doc}: ${chars} chars > ceiling ${ceiling}`)
  }
}

if (failures.length > 0) {
  console.error('verify-doc-budgets: failures')
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}
console.log(`verify-doc-budgets: ok (${Object.keys(manifest).length} documents within budget)`)
