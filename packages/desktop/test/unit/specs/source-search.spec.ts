import { describe, expect, it, vi } from 'vitest'
import type CodeMirror from 'codemirror'
import bus from '../../../src/renderer/src/bus'
import { bindSourceSearch } from '../../../src/renderer/src/components/editorWithTabs/sourceSearch'

function fixture(initial = 'word and WORD') {
  let text = initial
  let caret = 0
  let caretLine = 0
  let active = true
  const events = new Map<string, () => void>()
  const cleared = vi.fn()
  const SEARCH = vi.fn()
  const wrapperClasses = new Set<string>()
  const addedLines: number[] = []
  const hiddenLines = new Set<number>()
  const editor = {
    getValue: () => text,
    getSelection: () => '',
    getCursor: () => ({ line: caretLine, ch: caret }),
    indexFromPos: (position: { line: number; ch: number }) => {
      const lines = text.split('\n')
      let index = 0
      for (let i = 0; i < position.line; i++) index += lines[i].length + 1
      return index + position.ch
    },
    posFromIndex: (ch: number) => {
      const lines = text.split('\n')
      let line = 0
      let remaining = ch
      while (line < lines.length && remaining > lines[line].length) {
        remaining -= lines[line].length + 1
        line++
      }
      return { line, ch: remaining }
    },
    setSelection: (from: CodeMirror.Position) => { caret = from.ch },
    operation: (run: () => void) => run(),
    markText: () => ({ clear: cleared }),
    lineCount: () => text.split('\n').length,
    getDoc: () => ({ getLineHandle: (line: number) => line }),
    addLineClass: (line: number, _where: string, _cls: string) => {
      hiddenLines.add(line)
      if (!addedLines.includes(line)) addedLines.push(line)
    },
    removeLineClass: (line: number, _where: string, _cls: string) => { hiddenLines.delete(line) },
    getWrapperElement: () => ({ classList: { toggle: (cls: string, on: boolean) => { if (on) wrapperClasses.add(cls); else wrapperClasses.delete(cls) }, remove: (cls: string) => wrapperClasses.delete(cls) } }),
    replaceRange: (value: string, start: CodeMirror.Position, end: CodeMirror.Position) => {
      text = text.slice(0, start.ch) + value + text.slice(end.ch)
      events.get('changes')?.()
    },
    on: (event: string, callback: () => void) => events.set(event, callback),
    off: (event: string) => events.delete(event)
  } as unknown as CodeMirror.Editor
  const dispose = bindSourceSearch(editor, { SEARCH }, () => active)
  // Simulate a click/arrow move: reposition the caret, then fire the same
  // `cursorActivity` event CodeMirror emits so the component's handler runs.
  const moveCaretTo = (line: number, ch = 0) => {
    caretLine = line
    caret = ch
    events.get('cursorActivity')?.()
  }
  return { SEARCH, cleared, events, dispose, text: () => text, deactivate: () => { active = false }, addedLines, hiddenLines, wrapperClasses, moveCaretTo }
}

describe('independent source search', () => {
  it('finds matches, navigates and replaces all as literal text', () => {
    const f = fixture()
    try {
      bus.emit('searchValue', { value: 'word' })
      expect(f.SEARCH.mock.lastCall?.[0].matches).toHaveLength(2)
      bus.emit('find-action', 'next')
      expect(f.SEARCH.mock.lastCall?.[0].index).toBe(1)
      bus.emit('replaceValue', { value: '$1 term', opt: { isSingle: false } })
      expect(f.text()).toBe('$1 term and $1 term')
      expect(f.SEARCH.mock.lastCall?.[0].matches).toHaveLength(0)
    } finally { f.dispose() }
  })
  it('supports regex captures and single replacement', () => {
    const f = fixture('item12 item34')
    try {
      bus.emit('searchValue', { value: 'item(\\d+)', opt: { isRegexp: true } })
      bus.emit('replaceValue', { value: 'value$1', opt: { isSingle: true } })
      expect(f.text()).toBe('value12 item34')
    } finally { f.dispose() }
  })
  it('ignores bus commands when another document type is active', () => {
    const f = fixture()
    try {
      f.deactivate()
      bus.emit('searchValue', { value: 'word' })
      bus.emit('replaceValue', { value: 'changed' })
      expect(f.SEARCH).not.toHaveBeenCalled()
      expect(f.text()).toBe('word and WORD')
    } finally { f.dispose() }
  })
  it('removes marks, CodeMirror handlers and bus subscriptions', () => {
    const f = fixture()
    bus.emit('searchValue', { value: 'word' })
    f.dispose()
    expect(f.cleared).toHaveBeenCalledTimes(2)
    expect(f.events.size).toBe(0)
    f.SEARCH.mockClear()
    bus.emit('searchValue', { value: 'word' })
    expect(f.SEARCH).not.toHaveBeenCalled()
  })
  it('hides unmatched lines while onlyMatches is on and restores them when off', () => {
    const f = fixture('alpha\nbeta\ngamma beta\ndelta')
    try {
      bus.emit('searchValue', { value: 'beta', opt: { onlyMatches: true } })
      expect(f.SEARCH.mock.lastCall?.[0].matches).toHaveLength(2)
      // Line 0 holds the caret (fixture pins the cursor there), so Notepad3's
      // caret-line-kept-visible rule leaves only line 3 hidden.
      expect([...f.addedLines].sort()).toEqual([3])
      expect(f.SEARCH.mock.lastCall?.[0].hiddenCount).toBe(1)
      expect(f.wrapperClasses.has('cm-filtering-search')).toBe(true)

      bus.emit('searchValue', { value: 'beta', opt: {} })
      expect(f.hiddenLines.size).toBe(0)
      expect(f.SEARCH.mock.lastCall?.[0].hiddenCount).toBe(0)
      expect(f.wrapperClasses.has('cm-filtering-search')).toBe(false)
    } finally { f.dispose() }
  })
  it('keeps the caret line visible when the caret moves onto a non-matching line', () => {
    const f = fixture('alpha\nbeta\ngamma beta\ndelta')
    try {
      bus.emit('searchValue', { value: 'beta', opt: { onlyMatches: true } })
      // Caret sits on line 0 (kept by Notepad3's caret-line rule), so line 3 is
      // the only hidden one.
      expect([...f.addedLines].sort()).toEqual([3])

      // Move the caret onto the hidden line; it has to become visible even
      // though it holds no match, and the previously kept line 0 now hides.
      f.moveCaretTo(3)
      expect(f.hiddenLines.has(3)).toBe(false)
      expect(f.hiddenLines.has(0)).toBe(true)
      // The badge tracks the hidden set, and only a click was involved, so the
      // selection must not be re-published as a new active match.
      expect(f.SEARCH.mock.lastCall?.[0].hiddenCount).toBe(1)
    } finally { f.dispose() }
  })
  it('does not re-run the filter while the caret stays on the same line', () => {
    const f = fixture('alpha\nbeta\ngamma beta\ndelta')
    try {
      bus.emit('searchValue', { value: 'beta', opt: { onlyMatches: true } })
      const callsAfterSearch = f.SEARCH.mock.calls.length
      // Same line, different column: a selection drag inside one line.
      f.moveCaretTo(0, 2)
      expect(f.SEARCH.mock.calls.length).toBe(callsAfterSearch)
    } finally { f.dispose() }
  })
  it('clears line filter classes on dispose', () => {
    const f = fixture('alpha\nbeta\ngamma beta\ndelta')
    bus.emit('searchValue', { value: 'beta', opt: { onlyMatches: true } })
    // Only line 3 hides: line 0 is the caret line and stays visible.
    expect(f.addedLines).toHaveLength(1)
    f.dispose()
    expect(f.hiddenLines.size).toBe(0)
    expect(f.wrapperClasses.has('cm-filtering-search')).toBe(false)
  })
})
