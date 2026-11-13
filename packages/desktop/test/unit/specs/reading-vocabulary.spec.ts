import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import {
  analyzeVocabulary,
  normalizeReadingText,
  shortDictionarySense,
  type ReadingDictionary
} from '../../../src/shared/readingVocabulary'
import { readVocabulary } from '../../../src/main/utils/readingDictionary'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))
const dictionary: ReadingDictionary = {
  common: ['the', 'take', 'study', 'can', 'will'],
  entries: {
    the: ['', ['art. 这']],
    take: ['', ['v. 拿']],
    study: ['', ['v. 学习']],
    can: ['', ['v. 能']],
    will: ['', ['v. 将']],
    bank: ['bæŋk', ['n. 银行；岸', 'v. 存款']],
    anomalous: ['', ['a. 异常的']],
    researcher: ['', ['n. 研究者']]
  },
  aliases: { taken: 'take', studies: 'study', researchers: 'researcher' }
}
describe('offline reading vocabulary', () => {
  it('preserves sentence order, punctuation and line boundaries', () => {
    const result = analyzeVocabulary(
      'The researchers studied an anomalous bank.\nHello!',
      dictionary
    )
    expect(result.tokens.map((token) => token.text).join('')).toBe(result.text)
    expect(result.tokens.find((token) => token.text === 'researchers')?.entry?.word).toBe(
      'researcher'
    )
    expect(result.tokens.find((token) => token.text === 'The')?.entry?.common).toBe(true)
    expect(result.tokens.find((token) => token.text === 'Hello')?.unknown).toBe(true)
  })
  it('uses dictionary lemmas for the 1000-word exclusion rather than stripping suffixes', () => {
    const result = analyzeVocabulary(
      "Taken studies researchers researcher's can't won’t",
      dictionary
    )
    expect(result.tokens.filter((token) => token.entry).map((token) => token.entry?.word)).toEqual([
      'take',
      'study',
      'researcher',
      'researcher',
      'can',
      'will'
    ])
    expect(result.tokens.find((token) => token.text === 'Taken')?.entry?.common).toBe(true)
    expect(analyzeVocabulary('glass', dictionary).tokens[0].entry).toBeUndefined()
  })
  it('provides separate selectable senses with part of speech retained', () => {
    expect(analyzeVocabulary('bank', dictionary).tokens[0].entry?.senses).toEqual([
      'n. 银行',
      'n. 岸',
      'v. 存款'
    ])
    expect(shortDictionarySense('n. 银行；河岸')).toBe('银行')
    expect(shortDictionarySense('这是一个很长很长很长很长的义项').length).toBeLessThanOrEqual(14)
  })
  it('repairs extraction hyphenation and treats markup as plain source text', () => {
    expect(normalizeReadingText('anoma-\nlous\u00ad\r\nword')).toBe('anomalous\nword')
    expect(
      analyzeVocabulary('<script>alert(1)</script> 中文', dictionary)
        .tokens.map((token) => token.text)
        .join('')
    ).toBe('<script>alert(1)</script> 中文')
    expect(analyzeVocabulary('', dictionary).tokens).toEqual([])
  })
  it('does not resolve inherited object keys as dictionary entries', () => {
    expect(
      analyzeVocabulary('constructor __proto__ toString', dictionary).tokens.every(
        (token) => !token.entry
      )
    ).toBe(true)
  })
  it('ships a real dictionary with exactly 1000 common lemmas and technical vocabulary', () => {
    const data = JSON.parse(
      gunzipSync(readFileSync('static/reading-dictionary/dictionary.json.gz')).toString('utf8')
    ) as ReadingDictionary
    expect(new Set(data.common).size).toBe(1000)
    expect(Object.keys(data.entries).length).toBe(80736)
    expect(data.generalSource).toBe('Open Dictionary v2.0 / Wiktionary')
    const result = analyzeVocabulary(
      'The anomalous phenomenon was investigated by researchers.',
      data
    )
    expect(
      result.tokens.find((token) => token.text === 'phenomenon')?.entry?.senses.join(' ')
    ).toMatch(/现象/)
    expect(result.tokens.find((token) => token.text === 'investigated')?.entry?.senses.join(' ')).toMatch(/调查|研究/)
    expect(result.tokens.find((token) => token.text === 'The')?.entry?.common).toBe(true)
  })
  it('loads installed resources through the main-process service and validates source', async() => {
    expect(await readVocabulary(null)).toMatchObject({ ok: false })
    expect(await readVocabulary('x'.repeat(30001))).toMatchObject({ ok: false })
    const result = await readVocabulary('anomalous phenomenon')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.tokens.filter((token) => token.entry)).toHaveLength(2)
  })
})
