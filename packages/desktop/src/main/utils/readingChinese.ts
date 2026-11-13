import { Converter } from 'opencc-js/t2cn'
import type { DictionaryWord, VocabularyAnalysis } from '../../shared/types/reading'

const convert = Converter({ from: 'tw', to: 'cn' })
export const simplifiedChinese = (text: string): string => convert(text)

// Dictionary-word objects are immutable and bounded by the lookup cache; avoid reconverting them per selection.
const converted = new WeakMap<DictionaryWord, DictionaryWord>()
export const simplifyVocabulary = (analysis: VocabularyAnalysis): VocabularyAnalysis => {
  return {
    ...analysis,
    tokens: analysis.tokens.map(token => {
      if (!token.entry) return token
      let entry = converted.get(token.entry)
      if (!entry) {
        entry = {
          ...token.entry,
          senses: token.entry.senses.map(simplifiedChinese),
          senseNotes: token.entry.senseNotes?.map(note => ({
            ...note,
            definition: note.definition ? simplifiedChinese(note.definition) : undefined
          }))
        }
        converted.set(token.entry, entry)
      }
      return { ...token, entry }
    })
  }
}
