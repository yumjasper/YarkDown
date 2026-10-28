// Standalone micro-benchmark for the "show only matching lines" filter hot
// path used by source-search (CodeMirror) mode. Models the differential
// applyLineFilter(): match index→line mapping via a shared offset walk, then
// a per-line diff that only toggles lines whose visibility changed.
// Run: node scripts/bench-only-matches.mjs
import { performance } from 'node:perf_hooks'

function buildDoc(lines, everyNth, word) {
  const parts = []
  for (let i = 0; i < lines; i++)
    parts.push(i % everyNth === 0 ? `${word} ${i}` : `filler line ${i} with some padding text`)
  return parts.join('\n')
}

// The differential filter hot path under test. `prevHidden` simulates the
// persistent handle set carried between keystrokes; line numbers double as
// handles here, exactly like the unit-test fixture. Mirrors sourceSearch.ts:
// the caret line is always kept visible (Notepad3 rule), modeled here as
// line 0.
function applyLineFilter(text, matches, prevHidden) {
  const lineCount = text.split('\n').length
  const matched = new Set([0])
  let lastLine = 0
  let lastOffset = 0
  const lineOf = (index) => {
    if (index < lastOffset) {
      lastLine = 0
      lastOffset = 0
    }
    for (;;) {
      const nextBreak = text.indexOf('\n', lastOffset)
      if (nextBreak === -1 || nextBreak >= index) break
      lastLine++
      lastOffset = nextBreak + 1
    }
    return lastLine
  }
  for (const m of matches) {
    const from = lineOf(m.start)
    const to = lineOf(m.end)
    for (let line = from; line <= to; line++) matched.add(line)
  }
  const hidden = new Set()
  let toggles = 0
  const prev = new Set(prevHidden)
  for (let line = 0; line < lineCount; line++) {
    if (matched.has(line)) {
      if (prev.delete(line)) toggles++
    } else if (!prev.has(line)) {
      hidden.add(line)
      toggles++
    } else {
      prev.delete(line)
      hidden.add(line)
    }
  }
  toggles += prev.size
  return { hidden, toggles }
}

function findMatches(text, word) {
  const matches = []
  let idx = text.indexOf(word)
  while (idx !== -1) {
    matches.push({ start: idx, end: idx + word.length })
    idx = text.indexOf(word, idx + word.length)
  }
  return matches
}

const scenarios = [
  { label: 'first apply', lines: 10_000, everyNth: 4, prev: false },
  { label: 're-run, query unchanged (per-keystroke worst case)', lines: 10_000, everyNth: 4, prev: true },
  { label: 'first apply', lines: 50_000, everyNth: 4, prev: false },
  { label: 're-run, query unchanged (per-keystroke worst case)', lines: 50_000, everyNth: 4, prev: true },
]

console.log('onlyMatches filter micro-benchmark — differential algorithm')
console.log('='.repeat(72))
for (const s of scenarios) {
  const text = buildDoc(s.lines, s.everyNth, 'needle')
  const matches = findMatches(text, 'needle')
  const prior = s.prev
    ? applyLineFilter(text, matches, []).hidden
    : new Set()

  // Warmup
  applyLineFilter(text, matches, prior)

  const runs = 5
  let total = 0
  let toggles = 0
  let hidden = 0
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now()
    const result = applyLineFilter(text, matches, prior)
    total += performance.now() - t0
    toggles = result.toggles
    hidden = result.hidden.size
  }
  const avg = total / runs
  console.log(
    `${String(s.lines).padStart(6)} lines | ${s.label.padEnd(46)} | ` +
    `hidden ${String(hidden).padStart(6)} | DOM ops ${String(toggles).padStart(6)} | avg ${avg.toFixed(2)}ms`,
  )
}
