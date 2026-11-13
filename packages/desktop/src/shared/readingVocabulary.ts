import { readingPartsOfSpeech, type ReadingPartOfSpeech } from './readingPartOfSpeech'
import type {
  DictionaryWord,
  ReadingDomain,
  VocabularyAnalysis,
  DictionarySenseNote
} from './types/reading'

export interface ScientificSense {
  meaning: string
  domain: Exclude<ReadingDomain, 'general'>
  source: string
  definition?: string
}
export type PackedScientificSense = [
  meaning: string,
  domain: number,
  source: number,
  definition?: string
]
export interface ReadingDictionary {
  entries: Record<string, [string, string[] | string]>
  aliases: Record<string, string>
  common: string[]
  terms?: Record<string, ScientificSense[]>
  generalSource?: string
  generalNotes?: Record<string, [definition: string, priority: 'core' | 'common' | 'rare'][]>
  wholeGlosses?: boolean
  format?: number
  packedTerms?: Record<string, PackedScientificSense[]>
  domains?: ScientificSense['domain'][]
  sources?: string[]
  phraseLengths?: Record<string, number[]>
}
export const normalizeReadingText = (source: string): string =>
  source
    .replace(/\u00ad/g, '')
    .replace(/([A-Za-z])-\s*\r?\n\s*([A-Za-z])/g, '$1$2')
    .replace(/\r\n/g, '\n')
export const isReadingDomain = (domain: unknown): domain is ReadingDomain =>
  ['general', 'computing', 'chemistry'].includes(String(domain))
const key = (word: string): string =>
  word.toLowerCase().replaceAll('’', "'").replace(/\s+/g, ' ').trim()
// Function words remain unannotated even when a subject glossary assigns them a technical sense.
const basicWords = new Set(
  `a an the this that these those i me my mine we us our ours you your yours
  he him his she her hers it its they them their theirs who whom whose what which
  be am is are was were been being have has had having do does did done doing
  can could will would shall should may might must ought
  and or but if then than so as because while when where why how not no yes
  of to in on at by for from with without into onto out up down over under
  back use get go come make take give see say know want need like also very`.split(/\s+/)
)
const basicLemmas: Record<string, string> = {
  am: 'be',
  is: 'be',
  are: 'be',
  was: 'be',
  were: 'be',
  been: 'be',
  being: 'be',
  has: 'have',
  had: 'have',
  having: 'have',
  does: 'do',
  did: 'do',
  done: 'do',
  doing: 'do'
}
const splitSenses = (lines: string[] | string) =>
  (typeof lines === 'string' ? lines.split('\n') : lines).flatMap((line) => {
    const partOfSpeech = line.match(/^(?:[a-z]+\.)+\s*/i)?.[0] || ''
    // Each comma-separated gloss is a separate candidate meaning; keeping the part of
    // speech on every piece lets the contextual ranking treat them individually.
    return line
      .split(/[；;，,]/)
      .map((sense) => partOfSpeech + sense.replace(/^(?:[a-z]+\.)+\s*/i, '').trim())
      .filter((sense) => sense.replace(/^(?:[a-z]+\.)+\s*/i, '').trim())
  })

/** The gloss without its part-of-speech prefix, used to compare meanings across entries. */
const glossText = (sense: string): string => sense.replace(/^(?:[a-z]+\.)+\s*/i, '').trim()

type SensePartOfSpeech = ReadingPartOfSpeech
// The reading index stores the part of speech as a dotted prefix; only these
// four families can be inferred from surrounding words, so everything else stays neutral.
const sensePartOfSpeech = (sense: string): SensePartOfSpeech | undefined => {
  const prefix =
    sense
      .trim()
      .match(/^(?:[a-z]+\.)+/i)?.[0]
      .toLowerCase() ?? ''
  if (!prefix) return undefined
  if (/^(?:n|pl|na|un)\./.test(prefix)) return 'noun'
  if (/^(?:v|vt|vi|vb|vbl|pp|aux|auxiliary)\./.test(prefix)) return 'verb'
  if (/^(?:a|adj)\./.test(prefix)) return 'adjective'
  if (/^adv\./.test(prefix)) return 'adverb'
  return undefined
}
/** Stable partition of general senses: the ones matching the contextual part of speech move first. */
const preferPartOfSpeech = (
  entry: DictionaryWord,
  contextual: SensePartOfSpeech | undefined
): DictionaryWord => {
  if (!contextual || entry.senses.length < 2) return entry
  // Curated subject senses keep their priority; only general dictionary senses are reordered.
  const general = entry.senses.flatMap((_, index) =>
    entry.senseNotes?.[index]?.domain === 'general' ? [index] : []
  )
  const matching = general.filter((index) => sensePartOfSpeech(entry.senses[index]) === contextual)
  if (!matching.length || matching.length === general.length) return entry
  const rest = general.filter((index) => !matching.includes(index))
  const order = [...matching, ...rest]
  if (order.every((from, offset) => from === general[offset])) return entry
  const senses = entry.senses.slice()
  const notes = entry.senseNotes?.slice()
  order.forEach((from, offset) => {
    senses[general[offset]] = entry.senses[from]
    if (notes && entry.senseNotes) notes[general[offset]] = entry.senseNotes[from]
  })
  return { ...entry, senses, ...(notes ? { senseNotes: notes } : {}) }
}

const CACHE_LIMIT = 2048
const remember = <T>(cache: Map<string, T>, word: string, value: T): T => {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(word, value)
  return value
}
interface DictionaryIndex {
  common: Set<string>
  phraseLengths: Record<string, number[]>
  lookups: Map<ReadingDomain, Map<string, DictionaryWord | undefined>>
  scientific: Map<ReadingDomain, Map<string, ScientificSense[]>>
}
// The loaded dictionary is immutable; indexes die with it and caches are bounded per subject.
const indexes = new WeakMap<ReadingDictionary, DictionaryIndex>()
const indexFor = (dictionary: ReadingDictionary): DictionaryIndex => {
  const existing = indexes.get(dictionary)
  if (existing) return existing
  const phraseLengths: Record<string, number[]> = dictionary.phraseLengths || Object.create(null)
  if (!dictionary.phraseLengths) {
    const words = [
      ...Object.keys(dictionary.entries),
      ...Object.keys(dictionary.terms || dictionary.packedTerms || {})
    ]
    for (const word of words) {
      const parts = word.split(' ')
      if (parts.length < 2 || parts.length > 8) continue
      const lengths = (phraseLengths[parts[0]] ??= [])
      if (!lengths.includes(parts.length)) lengths.push(parts.length)
    }
    for (const lengths of Object.values(phraseLengths)) lengths.sort((a, b) => b - a)
  }
  const index: DictionaryIndex = {
    common: new Set(dictionary.common),
    phraseLengths,
    lookups: new Map(),
    scientific: new Map()
  }
  indexes.set(dictionary, index)
  return index
}
const subjectCache = <T>(
  caches: Map<ReadingDomain, Map<string, T>>,
  domain: ReadingDomain
): Map<string, T> => {
  let cache = caches.get(domain)
  if (!cache) {
    cache = new Map()
    caches.set(domain, cache)
  }
  return cache
}
export const analyzeVocabulary = (
  source: string,
  dictionary: ReadingDictionary,
  domain: ReadingDomain = 'general'
): VocabularyAnalysis => {
  const text = normalizeReadingText(source)
  const index = indexFor(dictionary)
  const cache = subjectCache(index.lookups, domain)
  const scientificCache = subjectCache(index.scientific, domain)
  const scientific = (word: string): ScientificSense[] => {
    if (domain === 'general') return []
    const cached = scientificCache.get(word)
    if (cached) return cached
    let senses: ScientificSense[] = []
    if (dictionary.terms && Object.hasOwn(dictionary.terms, word)) {
      senses = dictionary.terms[word].filter((sense) => sense.domain === domain)
    } else if (dictionary.packedTerms && Object.hasOwn(dictionary.packedTerms, word)) {
      for (const [meaning, domainId, sourceId, definition] of dictionary.packedTerms[word]) {
        const subject = dictionary.domains?.[domainId]
        const origin = dictionary.sources?.[sourceId]
        if (subject && origin && subject === domain)
          senses.push({
            meaning,
            domain: subject,
            source: origin,
            ...(definition ? { definition } : {})
          })
      }
    }
    return remember(scientificCache, word, senses)
  }
  const lookup = (surface: string): DictionaryWord | undefined => {
    const lower = key(surface)
    if (cache.has(lower)) return cache.get(lower)
    const candidates = [lower]
    if (/'s$/.test(lower)) candidates.push(lower.replace(/'s$/, ''))
    if (/n't$/.test(lower))
      candidates.push(lower === "can't" ? 'can' : lower === "won't" ? 'will' : lower.slice(0, -3))
    if (/'(?:re|ve|ll|d|m)$/.test(lower)) candidates.push(lower.split("'")[0])
    let entry: DictionaryWord | undefined
    for (const candidate of candidates) {
      const root = Object.hasOwn(basicLemmas, candidate)
        ? basicLemmas[candidate]
        : Object.hasOwn(dictionary.aliases, candidate)
          ? dictionary.aliases[candidate]
          : candidate
      const candidateTerms = scientific(candidate)
      // Only reuse the lemma's terms when the surface form has no entry of its own: an
      // inflected entry (trained, weathering) describes this form, while the lemma's terms
      // (train: 列车) belong to the other part of speech.
      const hasOwnEntry =
        Object.hasOwn(dictionary.entries, candidate) && dictionary.entries[candidate][1].length > 0
      const terms = candidateTerms.length ? candidateTerms : hasOwnEntry ? [] : scientific(root)
      // An inflected form often carries its own entry (weathering, trained). Its meanings
      // describe this surface form better than the lemma's, so keep them first instead of
      // replacing them with the root entry.
      const bases = [candidate, root].filter(
        (name, position, list) =>
          list.indexOf(name) === position &&
          Object.hasOwn(dictionary.entries, name) &&
          dictionary.entries[name][1].length
      )
      if (!bases.length && !terms.length) continue
      const senses: string[] = [],
        senseNotes: DictionarySenseNote[] = []
      for (const sense of terms) {
        for (const meaning of splitSenses([sense.meaning])) {
          senses.push(meaning)
          senseNotes.push({
            domain: sense.domain,
            source: sense.source,
            definition: sense.definition
          })
        }
      }
      // "be的过去式"、"give的过去分词" describe the inflection rather than a meaning, and
      // "apply的变形" only restates the form; neither may become a candidate sense.
      const grammarNote = (sense: string) =>
        /^[\w'-]+\s*的(?:现在|过去|完成|进行|将来)/.test(glossText(sense))
      const formNote = (sense: string) => /^[\w'-]+\s*的(?:变形|变化)$/.test(glossText(sense))
      const realSenses = (base: string) => {
        const stored = dictionary.entries[base][1]
        const lines = typeof stored === 'string' ? stored.split('\n') : stored
        return lines.flatMap((line, position) => {
          const detail = dictionary.generalNotes?.[base]?.[position]
          const note: DictionarySenseNote = {
            domain: 'general',
            source: dictionary.generalSource || 'Dictionary',
            ...(detail ? { definition: detail[0], priority: detail[1] } : {})
          }
          return (dictionary.wholeGlosses ? [line] : splitSenses([line]))
            .filter((sense) => !grammarNote(sense) && !formNote(sense))
            .map((sense) => ({ sense, note }))
        })
      }
      const general: { sense: string; note: DictionarySenseNote }[] = []
      const push = (item: { sense: string; note: DictionarySenseNote }) => {
        if (senses.some((sense) => glossText(sense) === glossText(item.sense))) return
        const duplicate = general.some((existing) =>
          dictionary.wholeGlosses
            ? existing.sense === item.sense && existing.note.definition === item.note.definition
            : glossText(existing.sense) === glossText(item.sense)
        )
        if (!duplicate) general.push(item)
      }
      if (bases.length) {
        const own = realSenses(bases[0])
        const lemma = bases.length > 1 ? realSenses(root) : []
        for (const item of own) push(item)
        // A surface noun/adjective can omit its lemma's verb (weathering).
        // Fill missing POS families without copying the lemma's unrelated noun.
        const ownParts = new Set(own.map((item) => sensePartOfSpeech(item.sense)))
        for (const item of lemma) {
          const part = sensePartOfSpeech(item.sense)
          if (!dictionary.wholeGlosses || !own.length || (part === 'verb' && !ownParts.has(part))) push(item)
        }
      }
      if (dictionary.wholeGlosses) {
        const rank = { core: 0, common: 1, rare: 2 }
        general.sort(
          (a, b) => rank[a.note.priority || 'common'] - rank[b.note.priority || 'common']
        )
      }
      for (const item of general) {
        senses.push(item.sense)
        senseNotes.push(item.note)
      }
      if (!senses.length) continue
      entry = {
        word:
          candidateTerms.length ||
          (dictionary.wholeGlosses && hasOwnEntry && !Object.hasOwn(basicLemmas, candidate))
            ? candidate
            : root,
        phonetic: bases.length ? dictionary.entries[bases[0]][0] : '',
        senses,
        senseNotes,
        common:
          candidates.some((candidate) => basicWords.has(candidate)) ||
          basicWords.has(root) ||
          (index.common.has(root) &&
            !terms.some((sense) =>
              ['YarkText research terms', 'AI/LLM Glossary'].includes(sense.source)
            ))
      }
      break
    }
    return remember(cache, lower, entry)
  }
  const tokens: VocabularyAnalysis['tokens'] = []
  const words = [...text.matchAll(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)]
  let end = 0
  let partsOfSpeech: Map<number, ReadingPartOfSpeech> | undefined
  for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
    const match = words[wordIndex]
    let last = wordIndex
    const head = key(match[0])
    const lengths = Object.hasOwn(index.phraseLengths, head) ? index.phraseLengths[head] : []
    for (const length of lengths) {
      if (length > words.length - wordIndex) continue
      const finish = words[wordIndex + length - 1]
      const phrase = text.slice(match.index, finish.index + finish[0].length)
      if (
        /^[A-Za-z'’\-\s]+$/.test(phrase) &&
        (scientific(key(phrase)).length || Object.hasOwn(dictionary.entries, key(phrase)))
      ) {
        last = wordIndex + length - 1
        break
      }
    }
    const start = match.index
    const finish = words[last]
    const surface = text.slice(start, finish.index + finish[0].length)
    if (start > end) tokens.push({ text: text.slice(end, start) })
    if (surface.length === 1 || /\d/.test(surface)) {
      tokens.push({ text: surface })
    } else {
      const entry = lookup(surface)
      if (!entry)
        tokens.push({ text: surface, ...(basicWords.has(key(surface)) ? {} : { unknown: true }) })
      else {
        // The cached entry is shared across occurrences, so the contextual reorder is
        // applied per occurrence and never written back to the cache.
        if (!partsOfSpeech && entry.senses.length > 1) partsOfSpeech = readingPartsOfSpeech(text)
        const contextual = preferPartOfSpeech(
          entry,
          last === wordIndex ? partsOfSpeech?.get(start) : undefined
        )
        tokens.push({ text: surface, entry: contextual })
      }
    }
    end = finish.index + finish[0].length
    wordIndex = last
  }
  if (end < text.length) tokens.push({ text: text.slice(end) })
  return { text, tokens, domain }
}
export const shortDictionarySense = (sense: string): string => {
  const clean = sense.replace(/^\s*(?:[a-z]+\.)+(?:\s*)/i, '').replace(/^\[[^\]]+\]\s*/, '')
  const first = clean.split(/[；;，,]/)[0].trim()
  return first.length > 14 ? first.slice(0, 13) + '…' : first
}
