import nlp from 'compromise/two'

export type ReadingPartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb'

interface TaggedSentence {
  terms: {
    text: string
    tags: string[]
    offset?: { start: number; length: number }
  }[]
}

const MAX_CHUNK_CHARACTERS = 4096

// Offsets belong to the original selection, not normalized words: repeated words
// can have different grammatical roles, and PDF whitespace must remain intact.
export const readingPartsOfSpeech = (text: string): Map<number, ReadingPartOfSpeech> => {
  const result = new Map<number, ReadingPartOfSpeech>()
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + MAX_CHUNK_CHARACTERS, text.length)
    if (end < text.length) {
      const chunk = text.slice(start, end)
      const boundaries = [...chunk.matchAll(/[.!?](?:\s+)|\n\s*\n/g)]
      const boundary = boundaries.at(-1)
      if (boundary) end = start + boundary.index + boundary[0].length
      else {
        const space = chunk.search(/\s+\S*$/)
        if (space > 0) end = start + space + 1
      }
    }
    const sentences = nlp(text.slice(start, end)).compute('offset').json() as TaggedSentence[]
    for (const sentence of sentences) {
      // A lone word supplies no grammatical context; keep its dictionary priority.
      if (sentence.terms.filter((term) => /[A-Za-z]/.test(term.text)).length < 2) continue
      for (const term of sentence.terms) {
        if (!term.offset) continue
        const offset = start + term.offset.start
        // Contraction expansion and compound tokens need not match our dictionary
        // tokenizer. Leave these neutral instead of assigning another word's role.
        if (text.slice(offset, offset + term.offset.length) !== term.text) continue
        const families = (['noun', 'verb', 'adjective', 'adverb'] as const).filter((part) =>
          term.tags.includes(part[0].toUpperCase() + part.slice(1))
        )
        if (families.length === 1) result.set(offset, families[0])
      }
    }
    start = end
  }
  return result
}
