import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { analyzeVocabulary, type ReadingDictionary } from '../../../src/shared/readingVocabulary'
import { simplifyVocabulary } from '../../../src/main/utils/readingChinese'

const read = (name: string): ReadingDictionary => JSON.parse(gunzipSync(readFileSync(`static/reading-dictionary/${name}.json.gz`)).toString('utf8'))
const bundle = read('reading-bundle')
const original = read('dictionary')
Object.assign(original, read('scientific'))

describe('integrated reading dictionary', () => {
  it('preserves every general entry, alias and common lemma', () => {
    expect(bundle.format).toBe(3)
    const restored = Object.fromEntries(Object.entries(bundle.entries).map(([word, [phonetic, senses]]) =>
      [word, [phonetic, typeof senses === 'string' ? senses.split('\n') : senses]]))
    expect(restored).toEqual(original.entries)
    expect(bundle.generalSource).toBe('Open Dictionary v2.0 / Wiktionary')
    expect(bundle.generalNotes).toEqual(original.generalNotes)
    expect(bundle.domains).toEqual(['computing', 'chemistry'])
    expect(bundle.aliases).toEqual(original.aliases)
    expect(bundle.common).toEqual(original.common)
    expect(new Set(bundle.common).size).toBe(1000)
  })
  it('preserves every scientific meaning, priority, subject, source and definition', () => {
    const restored: NonNullable<ReadingDictionary['terms']> = Object.create(null)
    for (const [word, senses] of Object.entries(bundle.packedTerms || {})) {
      restored[word] = senses.map(([meaning, domainId, sourceId, definition]) => {
        const domain = bundle.domains?.[domainId], source = bundle.sources?.[sourceId]
        if (!domain || !source) throw new Error('Invalid source or domain ID')
        return { meaning, domain, source, ...(definition ? { definition } : {}) }
      })
    }
    const unique: NonNullable<ReadingDictionary['terms']> = Object.create(null)
    for (const [word, senses] of Object.entries(original.terms || {})) {
      unique[word] = [...new Map(senses.map(sense => [JSON.stringify(sense), sense])).values()]
    }
    expect(restored).toEqual(unique)
  })
  it('indexes every scientific multiword term with longest lengths first', () => {
    for (const word of Object.keys(original.terms || {})) {
      const words = word.split(' ')
      if (words.length > 1) expect(bundle.phraseLengths?.[words[0]]).toContain(words.length)
    }
    for (const lengths of Object.values(bundle.phraseLengths || {})) {
      expect(lengths).toEqual([...new Set(lengths)].sort((a, b) => b - a))
      expect(Math.max(...lengths)).toBeLessThanOrEqual(8)
    }
  })
  it.each(['general', 'computing', 'chemistry'] as const)('retains analysis results and meaning priorities in %s', domain => {
    const text = "Generative Detail Enhancement for Physically Based Materials. Building improved back are noise inverse-rendering; Transformer spin curl reduction density, functional theory. Researcher's attention biasing LLM 3D (a)."
    expect(analyzeVocabulary(text, bundle, domain)).toEqual(analyzeVocabulary(text, original, domain))
  })
  it('shares immutable lookup and simplified entries across selections but isolates domains', () => {
    const first = analyzeVocabulary('generative noise', bundle, 'computing')
    const second = analyzeVocabulary('GENERATIVE noise', bundle, 'computing')
    expect(first.tokens[0].entry).toBe(second.tokens[0].entry)
    expect(simplifyVocabulary(first).tokens[0].entry).toBe(simplifyVocabulary(second).tokens[0].entry)
    expect(analyzeVocabulary('generative', bundle, 'general').tokens[0].entry).not.toBe(first.tokens[0].entry)
    expect(analyzeVocabulary('generative', bundle, 'general').tokens[0].entry?.senses[0]).toContain('能产生')
  })
  it('bounds caches and produces the same result after eviction', () => {
    const data: ReadingDictionary = { entries: { term: ['', ['术语']] }, aliases: {}, common: [] }
    const first = analyzeVocabulary('term', data).tokens[0].entry
    for (let index = 0; index < 2200; index++) {
      const suffix = String.fromCharCode(97 + Math.floor(index / 676), 97 + Math.floor(index / 26) % 26, 97 + index % 26)
      analyzeVocabulary('unknown' + suffix, data)
    }
    const second = analyzeVocabulary('term', data).tokens[0].entry
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
  })
  it('does not let indexes or negative caches leak between dictionaries', () => {
    const first: ReadingDictionary = { entries: {}, aliases: {}, common: [] }
    const second: ReadingDictionary = { entries: { noise: ['', ['噪声']] }, aliases: {}, common: [] }
    expect(analyzeVocabulary('noise', first).tokens[0].unknown).toBe(true)
    expect(analyzeVocabulary('noise', second).tokens[0].entry?.senses).toEqual(['噪声'])
  })
})
