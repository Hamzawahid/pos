#!/usr/bin/env node
// Patch-coverage gate: fails if lines added/changed in src/lib/** by this branch
// are not covered by a test. Run from the frontend/ directory AFTER vitest has
// produced coverage/cobertura-coverage.xml. This is what enforces "every new
// piece of logic ships with a test" — a PR adding uncovered src/lib code goes red.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const BASE = process.env.PATCH_COV_BASE || 'origin/staging'
const COVERAGE = 'coverage/cobertura-coverage.xml'
const SCOPE = 'src/lib/'

function gitDiff() {
  // CI compares the PR's committed range (BASE...HEAD); locally we also fall back
  // to working-tree changes (git diff BASE). Return the first NON-EMPTY result.
  for (const range of [`${BASE}...HEAD`, `${BASE}`]) {
    try {
      const out = execSync(`git diff --unified=0 ${range} -- "${SCOPE}"`, { encoding: 'utf8' })
      if (out.trim()) return out
    } catch { /* try next */ }
  }
  return ''
}

// Git prints diff paths relative to the REPO ROOT (e.g. frontend/src/lib/x.js),
// but the cobertura report (run from frontend/) is frontend-relative
// (src/lib/x.js). Strip the cwd prefix so the two align.
let PREFIX = ''
try { PREFIX = execSync('git rev-parse --show-prefix', { encoding: 'utf8' }).trim() } catch { /* repo root */ }

// 1) Collect changed (added) line numbers per file in scope.
const changed = {}
let cur = null
for (const line of gitDiff().split('\n')) {
  const mf = line.match(/^\+\+\+ b\/(.+)$/)
  if (mf) {
    cur = mf[1].replace(/\\/g, '/')
    if (PREFIX && cur.startsWith(PREFIX)) cur = cur.slice(PREFIX.length)
    changed[cur] = changed[cur] || new Set(); continue
  }
  const mh = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
  if (mh && cur) {
    const start = Number(mh[1]); const count = mh[2] === undefined ? 1 : Number(mh[2])
    for (let i = 0; i < count; i++) changed[cur].add(start + i)
  }
}

// 2) Parse cobertura: file -> { lineNo: hits }. Lines absent here are
//    non-executable (comments/blank) and are ignored.
const cov = {}
let xml = ''
try { xml = readFileSync(COVERAGE, 'utf8') } catch { console.error(`No coverage report at ${COVERAGE} — run vitest --coverage first.`); process.exit(2) }
const classRe = /<class[^>]*filename="([^"]+)"[\s\S]*?<\/class>/g
let m
while ((m = classRe.exec(xml))) {
  const file = m[1].replace(/\\/g, '/')
  const map = {}
  const lineRe = /<line number="(\d+)" hits="(\d+)"/g
  let l
  while ((l = lineRe.exec(m[0]))) map[Number(l[1])] = Number(l[2])
  cov[file] = map
}

// 3) Enforce: every executable changed line in scope must have hits > 0.
let total = 0, covered = 0
const misses = []
for (const [file, lines] of Object.entries(changed)) {
  if (!file.startsWith(SCOPE)) continue
  if (!/\.(js|jsx)$/.test(file) || /\.test\.(js|jsx)$/.test(file)) continue
  const fcov = cov[file] || {}
  for (const ln of lines) {
    if (!(ln in fcov)) continue
    total++
    if (fcov[ln] > 0) covered++; else misses.push(`${file}:${ln}`)
  }
}
const pct = total === 0 ? 100 : (covered / total) * 100
console.log(`Patch coverage (src/lib changed lines): ${covered}/${total} = ${pct.toFixed(1)}%`)
// Fail on ANY uncovered changed line — a percentage lets a big covered change mask
// a small untested one. Genuinely untestable lines can be marked /* v8 ignore next */.
if (misses.length) {
  console.log('Uncovered changed lines:\n  ' + misses.join('\n  '))
  console.error(`\n❌ Patch-coverage gate FAILED — every changed src/lib logic line needs a test`)
  console.error(`   (or an explicit /* v8 ignore next */ for genuinely untestable lines).`)
  process.exit(1)
}
console.log('✅ Patch-coverage gate passed.')
