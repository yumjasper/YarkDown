import { readFile, writeFile } from 'node:fs/promises'
import { gunzipSync, gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = path.join(root, 'packages/desktop/static/reading-dictionary')
const inputs = await Promise.all(['dictionary.json.gz', 'scientific.json.gz'].map(name => readFile(path.join(directory, name))))
const inputSha256 = inputs.map(input => createHash('sha256').update(input).digest('hex'))
if (!process.argv.includes('--force')) {
  const existing = await Promise.all([
    readFile(path.join(directory, 'bundle-metadata.json'), 'utf8').then(JSON.parse),
    readFile(path.join(directory, 'reading-bundle.json.gz'))
  ]).catch(() => undefined)
  if (existing && existing[0].format === 3 &&
    JSON.stringify(existing[0].inputSha256) === JSON.stringify(inputSha256) &&
    existing[0].sha256 === createHash('sha256').update(existing[1]).digest('hex')) {
    console.log('[reading-bundle] Inputs and bundle checksum unchanged')
    process.exit(0)
  }
}
const base = JSON.parse(gunzipSync(inputs[0]).toString('utf8'))
const scientific = JSON.parse(gunzipSync(inputs[1]).toString('utf8'))
const domains = ['computing', 'chemistry']
const sources = []
const packedTerms = Object.create(null)
const phraseLengths = Object.create(null)
let sourceSenseCount = 0
let bundledSenseCount = 0
for (const [word, senses] of Object.entries(scientific.terms)) {
  const seen = new Set()
  packedTerms[word] = []
  for (const sense of senses) {
    sourceSenseCount++
    const domain = domains.indexOf(sense.domain)
    if (domain < 0) throw new Error(`Unknown scientific domain: ${sense.domain}`)
    let source = sources.indexOf(sense.source)
    if (source < 0) source = sources.push(sense.source) - 1
    const packed = [sense.meaning, domain, source]
    if (sense.definition) packed.push(sense.definition)
    const key = JSON.stringify(packed)
    if (seen.has(key)) continue
    seen.add(key)
    packedTerms[word].push(packed)
    bundledSenseCount++
  }
  const words = word.split(' ')
  if (words.length > 1 && words.length <= 8) {
    const lengths = phraseLengths[words[0]] ??= []
    if (!lengths.includes(words.length)) lengths.push(words.length)
  }
}
for (const word of Object.keys(base.entries)) {
  const words = word.split(' ')
  if (words.length > 1 && words.length <= 8) {
    const lengths = phraseLengths[words[0]] ??= []
    if (!lengths.includes(words.length)) lengths.push(words.length)
  }
}
for (const lengths of Object.values(phraseLengths)) lengths.sort((a, b) => b - a)
const entries = Object.create(null)
for (const [word, [phonetic, senses]] of Object.entries(base.entries)) {
  if (!senses.length || senses.some(sense => sense.includes('\n'))) throw new Error('General senses must be nonempty single lines: ' + word)
  entries[word] = [phonetic, senses.join('\n')]
}
const bundle = { format: 3, ...base, entries, packedTerms, domains, sources, phraseLengths }
const encoded = Buffer.from(JSON.stringify(bundle))
const compressed = gzipSync(encoded, { level: 9 })
const metadata = {
  generalSource: base.generalSource,
  license: 'CC BY-SA 4.0 for adapted Open Dictionary data; see accompanying source licenses',
  format: 3,
  entries: Object.keys(base.entries).length,
  aliases: Object.keys(base.aliases).length,
  commonWords: new Set(base.common).size,
  termKeys: Object.keys(packedTerms).length,
  sourceSenseCount,
  bundledSenseCount,
  phraseHeads: Object.keys(phraseLengths).length,
  rawBytes: encoded.length,
  compressedBytes: compressed.length,
  inputSha256,
  sha256: createHash('sha256').update(compressed).digest('hex'),
  changes: 'Lossless common/alias/general entries with newline-packed general senses; stable scientific priorities; deduplicate only identical meaning/domain/source/definition tuples; shared domain/source tables; phrase-head length index. Original datasets remain build inputs, not installed runtime duplicates.'
}
if (metadata.commonWords !== 1000) throw new Error('Expected exactly 1000 common lemmas')
await writeFile(path.join(directory, 'reading-bundle.json.gz'), compressed)
await writeFile(path.join(directory, 'bundle-metadata.json'), JSON.stringify(metadata, null, 2) + '\n')
console.log(JSON.stringify(metadata, null, 2))
