import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { analyzeVocabulary, type ReadingDictionary } from '../../../src/shared/readingVocabulary'
import type { ReadingDomain } from '../../../src/shared/types/reading'

const dictionary = JSON.parse(gunzipSync(readFileSync('static/reading-dictionary/dictionary.json.gz')).toString('utf8')) as ReadingDictionary
Object.assign(dictionary, JSON.parse(gunzipSync(readFileSync('static/reading-dictionary/scientific.json.gz')).toString('utf8')))
const domains: ReadingDomain[] = ['general', 'computing', 'chemistry']

describe('basic word and figure label annotation filtering', () => {
  it.each(domains)('leaves figure labels and numeric identifiers plain in %s', domain => {
    const source = '3D assets (a), (b), (c), (d). A B C D x y z in 2D [2024], 3\nD.'
    const result = analyzeVocabulary(source, dictionary, domain)
    expect(result.tokens.map(token => token.text).join('')).toBe(source)
    for (const token of result.tokens) {
      if (/^[A-Za-z]$|\d/.test(token.text)) {
        expect(token.entry, token.text).toBeUndefined()
        expect(token.unknown, token.text).toBeUndefined()
      }
    }
    expect(result.tokens.find(token => token.text === '3D')).toEqual({ text: '3D' })
    expect(result.tokens.find(token => token.text === '2D')).toEqual({ text: '2D' })
  })
  it.each(domains)('does not annotate essential words or their inflections in %s', domain => {
    const source = "We are using this. It is back to the original material. I am, she was, they were, he has, we had, it does, they did. You're here; we aren't there."
    const result = analyzeVocabulary(source, dictionary, domain)
    const basics = ['We', 'are', 'using', 'this', 'It', 'is', 'back', 'to', 'the', 'I', 'am', 'she', 'was', 'they', 'were', 'he', 'has', 'we', 'had', 'it', 'does', 'did', "You're", "aren't"]
    for (const token of result.tokens.filter(token => basics.includes(token.text))) {
      if (token.text.length === 1) expect(token.entry, token.text).toBeUndefined()
      else expect(token.entry?.common, token.text).toBe(true)
      expect(token.unknown, token.text).toBeUndefined()
    }
    expect(result.tokens.find(token => token.text === 'are')?.entry?.word).toBe('be')
    expect(result.tokens.find(token => token.text === 'are')?.entry?.senses.join('')).not.toContain('现在时复数')
    expect(result.tokens.map(token => token.text).join('')).toBe(source)
  })
  it.each(domains)('respects common lemmas despite general subject glossary entries in %s', domain => {
    expect(dictionary.common).toContain('build')
    expect(dictionary.common).toContain('improve')
    const result = analyzeVocabulary('building build built improve improved improving', dictionary, domain)
    expect(result.tokens.filter(token => token.entry)).toHaveLength(6)
    for (const token of result.tokens.filter(token => token.entry)) expect(token.entry?.common, token.text).toBe(true)
  })
  it('keeps real technical terms, acronyms and multiword expressions available', () => {
    const result = analyzeVocabulary('Generative diffusion model LLM attention biasing back', dictionary, 'computing')
    for (const token of result.tokens.filter(token => /Generative|diffusion|LLM|attention/.test(token.text))) {
      expect(token.entry, token.text).toBeDefined()
      expect(token.entry?.common, token.text).toBe(false)
    }
    expect(result.tokens.find(token => token.text === 'back')?.entry?.common).toBe(true)
    expect(analyzeVocabulary('catalyst', dictionary, 'chemistry').tokens[0].entry).toMatchObject({ common: false, senses: expect.arrayContaining(['催化剂']) })
  })
  it('does not turn missing basic words or labels into unknown-word hints', () => {
    const result = analyzeVocabulary('are back Q 3D uncommonword', { common: [], entries: {}, aliases: {} })
    for (const token of result.tokens.filter(token => ['are', 'back', 'Q', '3D'].includes(token.text))) {
      expect(token).toEqual({ text: token.text })
    }
    expect(result.tokens.find(token => token.text === 'uncommonword')?.unknown).toBe(true)
  })
  it('preserves specialized phrases containing a basic word as a complete phrase', () => {
    const data: ReadingDictionary = { entries: {}, aliases: {}, common: ['back'], terms: {
      'back propagation': [{ meaning: '反向传播', domain: 'computing', source: 'test' }]
    } }
    expect(analyzeVocabulary('back propagation', data, 'computing').tokens[0].entry).toMatchObject({ word: 'back propagation', common: false })
  })
})
