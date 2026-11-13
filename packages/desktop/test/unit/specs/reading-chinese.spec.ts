import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { analyzeVocabulary, type ReadingDictionary } from '../../../src/shared/readingVocabulary'
import { simplifyVocabulary, simplifiedChinese } from '../../../src/main/utils/readingChinese'
import type { DictionaryWord, ReadingDomain } from '../../../src/shared/types/reading'

const dictionary = JSON.parse(gunzipSync(readFileSync('static/reading-dictionary/dictionary.json.gz')).toString('utf8')) as ReadingDictionary
Object.assign(dictionary, JSON.parse(gunzipSync(readFileSync('static/reading-dictionary/scientific.json.gz')).toString('utf8')))

describe('reading assistant always displays simplified Chinese', () => {
  it('converts the screenshot terms and online text locally', () => {
    expect(simplifiedChinese('增強 現存 數點 資產 應用 效應 規定 條件 渲染 對應 視覺 擴散模型 注意力機制 偏壓 紋理 資料')).toBe('增强 现存 数点 资产 应用 效应 规定 条件 渲染 对应 视觉 扩散模型 注意力机制 偏压 纹理 资料')
    expect(simplifiedChinese('視覺增強回到原始材質紋理 (d).')).toBe('视觉增强回到原始材质纹理 (d).')
  })
  it.each(['general', 'computing', 'chemistry'] as ReadingDomain[])('converts every selected sense in %s without changing original tokens', domain => {
    const source = 'We enhance material definitions of existing 3D assets by applying effects specified by text prompts, using a diffusion model and attention biasing.'
    const raw = analyzeVocabulary(source, dictionary, domain)
    const result = simplifyVocabulary(raw)
    expect(result.text).toBe(raw.text)
    expect(result.tokens.map(token => token.text).join('')).toBe(source)
    for (const token of result.tokens) {
      for (const sense of token.entry?.senses || []) expect(sense).toBe(simplifiedChinese(sense))
      for (const note of token.entry?.senseNotes || []) if (note.definition) expect(note.definition).toBe(simplifiedChinese(note.definition))
    }
    expect(result.tokens.flatMap(token => token.entry?.senses || []).join('')).not.toMatch(/[強現資產應規條對視擴紋]/)
  })
  it('preserves data provenance and all alternatives without mutating source entries', () => {
    const entry: DictionaryWord = { word: 'renderings', phonetic: 'test', common: false,
      senses: ['渲染圖', '繪製結果'], senseNotes: [{ domain: 'computing', source: '國家教育研究院', definition: '產生二維視覺結果。' }] }
    const result = simplifyVocabulary({ text: 'renderings renderings', tokens: [{ text: 'renderings', entry }, { text: ' ', }, { text: 'renderings', entry }] })
    expect(result.tokens[0].entry?.senses).toEqual(['渲染图', '绘制结果'])
    expect(result.tokens[0].entry?.senseNotes?.[0]).toEqual({ domain: 'computing', source: '國家教育研究院', definition: '产生二维视觉结果。' })
    expect(result.tokens[0].entry).toBe(result.tokens[2].entry)
    expect(entry.senses).toEqual(['渲染圖', '繪製結果'])
  })
})
