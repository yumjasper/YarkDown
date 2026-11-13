export type TranslationProvider = 'bing' | 'google'
export interface ReadingViewBounds {
  x: number
  y: number
  width: number
  height: number
}
export type ReadingResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string }
export interface TranslationRequest {
  source: string
  provider: TranslationProvider
  sequence?: number
}
export interface TranslationUpdate {
  id: string
  sequence: number
  provider: TranslationProvider
  phase: 'loading' | 'translating' | 'result'
  text?: string
}
export type ReadingDomain = 'general' | 'computing' | 'chemistry'
export interface DictionarySenseNote {
  domain: ReadingDomain
  source: string
  definition?: string
  priority?: 'core' | 'common' | 'rare'
}
export interface DictionaryWord {
  word: string
  phonetic: string
  senses: string[]
  senseNotes?: DictionarySenseNote[]
  common: boolean
}
export interface ReadingToken {
  text: string
  entry?: DictionaryWord
  unknown?: boolean
}
export interface VocabularyAnalysis {
  domain?: ReadingDomain
  text: string
  tokens: ReadingToken[]
}
