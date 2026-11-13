import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import {
  analyzeVocabulary,
  isReadingDomain,
  type ReadingDictionary
} from '../../../src/shared/readingVocabulary'
import type { ReadingDomain } from '../../../src/shared/types/reading'

const data = JSON.parse(
  gunzipSync(readFileSync('static/reading-dictionary/dictionary.json.gz')).toString('utf8')
) as ReadingDictionary
Object.assign(
  data,
  JSON.parse(
    gunzipSync(readFileSync('static/reading-dictionary/scientific.json.gz')).toString('utf8')
  )
)
const entry = (word: string, domain: ReadingDomain = 'computing') =>
  analyzeVocabulary(word, data, domain).tokens[0].entry

describe('modern three-category dictionaries', () => {
  it('supports only general, computing/AI and chemistry', () => {
    for (const domain of ['general', 'computing', 'chemistry'])
      expect(isReadingDomain(domain)).toBe(true)
    for (const domain of ['research', 'mathematics', 'physics', undefined])
      expect(isReadingDomain(domain)).toBe(false)
    expect(analyzeVocabulary('generative', data).domain).toBe('general')
    const senses = Object.values(data.terms || {}).flat()
    expect([...new Set(senses.map((sense) => sense.domain))].sort()).toEqual([
      'chemistry',
      'computing'
    ])
    for (const domain of ['computing', 'chemistry']) {
      expect(
        senses.filter((sense) => sense.domain === domain && sense.source === 'NAER').length
      ).toBeGreaterThan(1000)
    }
    expect(senses.filter((sense) => sense.source === 'AI/LLM Glossary').length).toBeGreaterThan(100)
  })

  it('defaults to a contemporary meaning without deleting rare alternatives', () => {
    const general = entry('Generative', 'general')
    expect(general?.senses[0]).toContain('能产生')
    expect(general?.senses.at(-1)).toContain('生殖')
    expect(general?.senseNotes?.[0]).toMatchObject({
      priority: 'core',
      source: 'Open Dictionary v2.0 / Wiktionary'
    })
    expect(general?.senseNotes?.[0].definition).toContain('产生新的')
    expect(entry('Generative')?.senses[0]).toBe('生成式的')
    expect(entry('Generative')?.senseNotes?.[0].source).toBe('YarkText research terms')
    expect(entry('hallucination', 'general')?.senses.join(' ')).toContain('人工智能幻觉')
    expect(entry('prompt', 'general')?.senses.join(' ')).toContain('人工智能')
    expect(entry('Transformer', 'general')?.senses.join(' ')).toContain('Transformer 模型')
  })

  it('keeps priority and definition aligned for every selected meaning', () => {
    const word = entry('weathering', 'general')
    expect(word?.senses[0]).toContain('风化')
    const notes = word?.senseNotes || []
    expect(notes).toHaveLength(word?.senses.length || 0)
    const rank = { core: 0, common: 1, rare: 2 }
    const priorities = notes.map((note) => rank[note.priority || 'rare'])
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b))
    for (const note of notes) expect(note.definition).toBeTruthy()
  })

  it('recognizes technical and general phrases without altering source text', () => {
    const title = 'Generative Detail Enhancement for Physically Based Materials'
    const result = analyzeVocabulary(title, data, 'computing')
    expect(result.tokens.map((token) => token.text).join('')).toBe(title)
    expect(
      result.tokens.find((token) => token.text === 'Detail Enhancement')?.entry?.senses[0]
    ).toBe('细节增强')
    expect(
      result.tokens.find((token) => token.text === 'Physically Based Materials')?.entry?.senses[0]
    ).toBe('基于物理的材质')
    const phrase = Object.keys(data.entries).find(
      (word) => word.includes(' ') && word.split(' ').length === 2
    )
    expect(phrase).toBeDefined()
    if (phrase) expect(analyzeVocabulary(phrase, data, 'general').tokens[0].entry).toBeDefined()
  })

  it('keeps computing and chemistry meanings isolated', () => {
    expect(entry('Transformer', 'computing')?.senses[0]).toContain('神经网络')
    expect(entry('reduction', 'chemistry')?.senses[0]).toBe('还原')
    expect(entry('reduction', 'computing')?.senses[0]).toBe('归约')
    expect(entry('catalyst', 'chemistry')?.senses[0]).toBe('催化剂')
    for (const domain of ['computing', 'chemistry'] as const) {
      expect(entry('noise', domain)?.senses[0]).toBe('噪声')
      expect(entry('noise', domain)?.senseNotes?.[0].source).toBe('YarkText research terms')
    }
    expect(entry('noise', 'computing')?.senses.some((sense) => sense.includes('雜訊'))).toBe(true)
    expect(entry('inverse-rendering', 'computing')?.senses[0]).toBe('逆向渲染')
  })

  it('preserves surface meanings and fills missing POS families from the lemma', () => {
    expect(entry('weathering', 'general')?.word).toBe('weathering')
    expect(entry('weathering', 'general')?.senses[0]).toContain('风化')
    expect(entry('weathering', 'general')?.senses).not.toContain('n. 天气')
    expect(entry('trained', 'general')?.senses[0]).toContain('受过训练')
    expect(entry('trained', 'general')?.senses.some(sense => /^n\./.test(sense))).toBe(false)
    expect(entry('are')?.word).toBe('be')
    expect(entry('applying', 'general')?.senses.join(' ')).not.toContain('apply 的现在分词')
  })

  it('ranks noun and verb senses per occurrence using the rules engine', () => {
    for (const [source, pos] of [
      ['are weathering the rock', /^v/],
      ['the weathering of rock', /^n/]
    ] as const) {
      const word = analyzeVocabulary(source, data, 'general').tokens.find(
        (token) => token.text === 'weathering'
      )?.entry
      expect(word?.senses[0]).toMatch(pos)
      expect(word?.senseNotes?.[0].definition).toBeTruthy()
    }
    expect(
      analyzeVocabulary('and weathering that', data, 'chemistry').tokens.find(
        (token) => token.text === 'weathering'
      )?.entry?.senses[0]
    ).toContain('風化')
  })

  it('does not match phrases across punctuation', () => {
    expect(
      analyzeVocabulary('diffusion, model', data, 'computing').tokens.some(
        (token) => token.entry?.word === 'diffusion model'
      )
    ).toBe(false)
  })

  it('keeps identical glosses with distinct explanations aligned to their original senses', () => {
    const dictionary: ReadingDictionary = {
      entries: { record: ['', ['n. 记录', 'n. 记录', 'v. 记录']] },
      aliases: {}, common: [], wholeGlosses: true, generalSource: 'test',
      generalNotes: { record: [['信息内容', 'core'], ['存储载体', 'common'], ['保存信息的动作', 'core']] }
    }
    const words = analyzeVocabulary('They record a record.', dictionary).tokens.filter(token => token.text === 'record')
    expect(words[0].entry?.senseNotes?.[0].definition).toBe('保存信息的动作')
    expect(words[1].entry?.senses.filter(sense => sense === 'n. 记录')).toHaveLength(2)
    expect(words[1].entry?.senseNotes?.slice(0, 2).map(note => note.definition)).toEqual(['信息内容', '存储载体'])
  })

  it('returns no empty entry when a form-only record has no resolvable lemma', () => {
    const dictionary: ReadingDictionary = {
      entries: { applying: ['', ['v. apply 的现在分词']] },
      aliases: {}, common: [], wholeGlosses: true
    }
    expect(analyzeVocabulary('applying', dictionary).tokens[0]).toEqual({ text: 'applying', unknown: true })
  })
})
