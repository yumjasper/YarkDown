import { describe, expect, it } from 'vitest'
import { readingPartsOfSpeech } from '../../../src/shared/readingPartOfSpeech'
import { analyzeVocabulary, type ReadingDictionary } from '../../../src/shared/readingVocabulary'

const dictionary: ReadingDictionary = {
  entries: { record: ['', ['n. 记录', 'v. 录制']] },
  aliases: {},
  common: []
}

describe('compromise rule-based sense ranking', () => {
  it('ranks each occurrence independently without mutating cached senses', () => {
    const source = 'They record a record.'
    const entries = analyzeVocabulary(source, dictionary, 'general').tokens.filter(
      (token) => token.text === 'record'
    )
    expect(entries.map((token) => token.entry?.senses[0])).toEqual(['v. 录制', 'n. 记录'])
    expect(dictionary.entries.record[1]).toEqual(['n. 记录', 'v. 录制'])
    expect(
      analyzeVocabulary('a record', dictionary, 'general').tokens.at(-1)?.entry?.senses[0]
    ).toBe('n. 记录')
  })

  it('uses the whole sentence instead of treating every word after a determiner as a noun', () => {
    const source = 'The beautiful birds fly quickly.'
    const roles = readingPartsOfSpeech(source)
    expect(roles.get(source.indexOf('beautiful'))).toBe('adjective')
    expect(roles.get(source.indexOf('birds'))).toBe('noun')
    expect(roles.get(source.indexOf('fly'))).toBe('verb')
    expect(roles.get(source.indexOf('quickly'))).toBe('adverb')
  })

  it('preserves character offsets across PDF whitespace and sentence boundaries', () => {
    const source = '  They\nrecord a record.\n\nThey record again.'
    const roles = readingPartsOfSpeech(source)
    expect(roles.get(source.indexOf('record'))).toBe('verb')
    expect(roles.get(source.indexOf('record.'))).toBe('noun')
    expect(roles.get(source.lastIndexOf('record'))).toBe('verb')
    expect(
      analyzeVocabulary(source, dictionary)
        .tokens.map((token) => token.text)
        .join('')
    ).toBe(source)
  })

  it('keeps scientific senses ahead of grammatical ranking', () => {
    const scientific: ReadingDictionary = {
      ...dictionary,
      terms: { record: [{ meaning: '研究记录', domain: 'computing', source: 'test glossary' }] }
    }
    expect(
      analyzeVocabulary('They record music.', scientific, 'computing').tokens.find(
        (token) => token.text === 'record'
      )?.entry?.senses[0]
    ).toBe('研究记录')
  })

  it('handles long selections in bounded chunks with absolute offsets', () => {
    const source = 'They record a record. '.repeat(250)
    const roles = readingPartsOfSpeech(source)
    expect(roles.get(source.lastIndexOf('record.'))).toBe('noun')
    expect(roles.get(source.lastIndexOf('They') + 5)).toBe('verb')
  })
})
