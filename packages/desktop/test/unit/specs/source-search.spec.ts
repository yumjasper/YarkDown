import { describe, expect, it, vi } from 'vitest'
import type CodeMirror from 'codemirror'
import bus from '../../../src/renderer/src/bus'
import { bindSourceSearch } from '../../../src/renderer/src/components/editorWithTabs/sourceSearch'

function fixture(initial = 'word and WORD') {
  let text = initial
  let caret = 0
  let active = true
  const events = new Map<string, () => void>()
  const cleared = vi.fn()
  const SEARCH = vi.fn()
  const editor = {
    getValue: () => text,
    getSelection: () => '',
    getCursor: () => ({ line: 0, ch: caret }),
    indexFromPos: (position: CodeMirror.Position) => position.ch,
    posFromIndex: (ch: number) => ({ line: 0, ch }),
    setSelection: (from: CodeMirror.Position) => { caret = from.ch },
    operation: (run: () => void) => run(),
    markText: () => ({ clear: cleared }),
    replaceRange: (value: string, start: CodeMirror.Position, end: CodeMirror.Position) => {
      text = text.slice(0, start.ch) + value + text.slice(end.ch)
      events.get('changes')?.()
    },
    on: (event: string, callback: () => void) => events.set(event, callback),
    off: (event: string) => events.delete(event)
  } as unknown as CodeMirror.Editor
  const dispose = bindSourceSearch(editor, { SEARCH }, () => active)
  return { SEARCH, cleared, events, dispose, text: () => text, deactivate: () => { active = false } }
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
})
