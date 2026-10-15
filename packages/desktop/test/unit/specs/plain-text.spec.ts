import { describe, expect, it } from 'vitest'
import {
  findTextMatches,
  isPlainTextFile,
  suggestedDocumentName
} from '../../../src/shared/plainText'
import { SyntheticHistory } from '../../../src/renderer/src/components/editorWithTabs/syntheticHistory'

describe('plain text documents', () => {
  it('recognizes text extensions without matching Markdown paths', () => {
    expect(isPlainTextFile('notes.TXT')).toBe(true)
    expect(isPlainTextFile('Untitled-2.text')).toBe(true)
    expect(isPlainTextFile('notes.txt.md')).toBe(false)
    expect(isPlainTextFile('notes')).toBe(false)
  })

  it('keeps text filenames instead of recommending a Markdown heading', () => {
    expect(suggestedDocumentName('Untitled-2.txt', '# raw text')).toBe('Untitled-2.txt')
    expect(suggestedDocumentName('notes.text', 'heading')).toBe('notes.text')
    expect(suggestedDocumentName('Untitled-1', 'Heading')).toBe('Heading.md')
  })

  it('finds literal Markdown and regular expression punctuation', () => {
    expect(findTextMatches('a [x].* $x$ [x].*', '[x].*').map((m) => m.start)).toEqual([2, 12])
    expect(
      findTextMatches('Hello hello HELLO', 'hello', { isCaseSensitive: true }).map((m) => m.start)
    ).toEqual([6])
    expect(findTextMatches('Hello hello HELLO', 'hello')).toHaveLength(3)
  })

  it('supports Unicode whole words, regex captures and literal replacement dollars', () => {
    expect(findTextMatches('cat cats 猫猫 猫', 'cat', { isWholeWord: true })).toHaveLength(1)
    expect(findTextMatches('猫猫 猫', '猫', { isWholeWord: true }).map((m) => m.start)).toEqual([3])
    const match = findTextMatches('item-12 item-34', '(item)-(\\d+)', { isRegexp: true })[0]
    expect(match.replacement('$2:$1 $$ $&')).toBe('12:item $ item-12')
    expect(findTextMatches('item', 'item')[0].replacement('$1')).toBe('$1')
  })

  it('handles invalid and zero-width patterns without looping', () => {
    expect(findTextMatches('abc', '[', { isRegexp: true })).toEqual([])
    expect(findTextMatches('abc', '(?=a)', { isRegexp: true })).toEqual([])
    expect(findTextMatches('abc', '', { isRegexp: true })).toEqual([])
  })

  it('tracks blank lines as real text edits and recognizes undo to the saved content', () => {
    const history = new SyntheticHistory('a\n', true)
    expect(history.idFor('a\n')).toBe(0)
    expect(history.idFor('a\n\n')).not.toBe(0)
    expect(history.idFor('a\n')).toBe(0)
    expect(new SyntheticHistory('a\n').idFor('a\n\n')).toBe(0)
  })
})
