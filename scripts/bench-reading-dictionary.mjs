import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = path.join(root, 'packages/desktop/static/reading-dictionary')
const variantIndex = process.argv.indexOf('--variant')
if (variantIndex < 0) {
  for (const variant of ['original', 'bundle']) {
    const child = spawnSync(process.execPath, [...process.execArgv, '--expose-gc', fileURLToPath(import.meta.url), '--variant', variant, ...process.argv.slice(2)], { cwd: root, encoding: 'utf8' })
    process.stdout.write(child.stdout || '')
    process.stderr.write(child.stderr || '')
    if (child.status !== 0) process.exit(child.status || 1)
  }
} else {
  const variant = process.argv[variantIndex + 1]
  const baselineIndex = process.argv.indexOf('--baseline')
  const modulePath = variant === 'original' && baselineIndex >= 0
    ? path.resolve(root, process.argv[baselineIndex + 1])
    : path.join(root, 'packages/desktop/src/shared/readingVocabulary.ts')
  const { analyzeVocabulary } = await import(pathToFileURL(modulePath).href)
  const { simplifiedChinese, simplifyVocabulary } = await import(pathToFileURL(path.join(root, 'packages/desktop/src/main/utils/readingChinese.ts')).href)
  const legacySimplify = analysis => {
    const converted = new Map()
    return {
      ...analysis,
      tokens: analysis.tokens.map(token => {
        if (!token.entry) return token
        let entry = converted.get(token.entry)
        if (!entry) {
          entry = { ...token.entry, senses: token.entry.senses.map(simplifiedChinese), senseNotes: token.entry.senseNotes?.map(note => ({ ...note, definition: note.definition ? simplifiedChinese(note.definition) : undefined })) }
          converted.set(token.entry, entry)
        }
        return { ...token, entry }
      })
    }
  }
  global.gc?.()
  const initialHeap = process.memoryUsage().heapUsed
  const start = performance.now()
  const names = variant === 'original' ? ['dictionary', 'scientific'] : ['reading-bundle']
  const dictionary = {}
  let compressedBytes = 0; let rawBytes = 0
  for (const name of names) {
    const compressed = readFileSync(path.join(directory, name + '.json.gz'))
    const raw = gunzipSync(compressed)
    compressedBytes += compressed.length
    rawBytes += raw.length
    Object.assign(dictionary, JSON.parse(raw.toString('utf8')))
  }
  const loadMs = performance.now() - start
  global.gc?.()
  const dictionaryHeapMiB = (process.memoryUsage().heapUsed - initialHeap) / 1024 / 1024
  const paragraph = 'We enhance material definitions of existing 3D assets (a) by applying effects specified by text prompts such as aging, weathering, etc. Conditioned on a set of renderings, we synthesize the corresponding visuals in 2D using a diffusion model building on multi-view visual prompting [Deng et al. 2024] (b). We improve the multi-view consistency of the generator using two key additions—view-correlated noise and attention biasing (c)—that enable succesful inverse-rendering of the visual enhancements back to the original material textures (d).'
  const simplify = variant === 'original' && baselineIndex >= 0 ? legacySimplify : simplifyVocabulary
  const analyze = source => simplify(analyzeVocabulary(source, dictionary, 'computing'))
  const firstStart = performance.now()
  analyze(paragraph)
  const firstParagraphMs = performance.now() - firstStart
  const measure = (source, iterations) => {
    for (let index = 0; index < 5; index++) analyze(source)
    const durations = []
    for (let index = 0; index < iterations; index++) {
      const start = performance.now()
      analyze(source)
      durations.push(performance.now() - start)
    }
    durations.sort((a, b) => a - b)
    return { p50Ms: durations[Math.floor(durations.length * 0.5)], p95Ms: durations[Math.floor(durations.length * 0.95)] }
  }
  const warmParagraph = measure(paragraph, 200)
  const longSource = paragraph.repeat(Math.ceil(30000 / paragraph.length)).slice(0, 30000)
  const warm30000Characters = measure(longSource, 30)
  global.gc?.()
  const retainedHeapMiB = (process.memoryUsage().heapUsed - initialHeap) / 1024 / 1024
  console.log(JSON.stringify({ variant, code: modulePath, compressedBytes, rawBytes, loadMs, dictionaryHeapMiB, retainedHeapMiB, firstParagraphMs, warmParagraph, warm30000Characters }, null, 2))
}
