import { performance } from 'node:perf_hooks'

const heapMiB = () => process.memoryUsage().heapUsed / 1024 / 1024
const collect = () => global.gc?.()
collect()
const baseline = heapMiB()
const importStart = performance.now()
const { readingPartsOfSpeech } = await import('../packages/desktop/src/shared/readingPartOfSpeech.ts')
const importMs = performance.now() - importStart
collect()
const moduleHeapMiB = heapMiB() - baseline
const paragraph = 'We enhance material definitions of existing assets by applying effects specified by text prompts such as aging and weathering. Conditioned on a set of renderings, we synthesize the corresponding visuals using a diffusion model. We improve consistency using view-correlated noise and attention biasing.'
const firstStart = performance.now()
readingPartsOfSpeech(paragraph)
const firstParagraphMs = performance.now() - firstStart
const measure = (text, iterations) => {
  for (let index = 0; index < 5; index++) readingPartsOfSpeech(text)
  const durations = []
  for (let index = 0; index < iterations; index++) {
    const start = performance.now()
    readingPartsOfSpeech(text)
    durations.push(performance.now() - start)
  }
  durations.sort((a, b) => a - b)
  return {
    characters: text.length,
    p50Ms: durations[Math.floor(durations.length * 0.5)],
    p95Ms: durations[Math.floor(durations.length * 0.95)]
  }
}
const shortSentence = measure('They record a record.', 200)
const warmParagraph = measure(paragraph, 200)
const longSelection = measure((paragraph + '\n').repeat(100).slice(0, 30000), 20)
collect()
console.log(JSON.stringify({
  runtime: process.version,
  importMs,
  moduleHeapMiB,
  firstParagraphMs,
  shortSentence,
  warmParagraph,
  longSelection,
  retainedHeapMiB: heapMiB() - baseline,
  note: 'Node.js heap deltas include TS loader overhead, exclude ECDICT, and are not Electron RSS measurements.'
}, null, 2))
