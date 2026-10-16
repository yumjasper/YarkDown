import type CodeMirror from 'codemirror'
import type { useEditorStore } from '@/store/editor'
import bus from '@/bus'
import { findTextMatches, type TextMatch, type TextSearchOptions } from '@shared/plainText'

type SearchStore = Pick<ReturnType<typeof useEditorStore>, 'SEARCH'>

export function bindSourceSearch(cm: CodeMirror.Editor, store: SearchStore, isActive: () => boolean): () => void {
  let query = ''
  let options: TextSearchOptions = {}
  let matches: TextMatch[] = []
  let index = -1
  let marks: CodeMirror.TextMarker[] = []
  let replacing = false
  const clear = () => {
    for (const mark of marks) mark.clear()
    marks = []
  }
  const publish = (reveal = true) => {
    store.SEARCH({ value: query, index, matches: matches.map(({ start, end }) => ({ start, end })) })
    if (reveal && index >= 0) {
      const match = matches[index]
      cm.setSelection(cm.posFromIndex(match.start), cm.posFromIndex(match.end), { scroll: true })
    }
  }
  const search = (payload: unknown) => {
    if (!isActive()) return
    const { value, opt } = payload as { value: string; opt?: TextSearchOptions }
    query = value
    options = opt || {}
    clear()
    matches = findTextMatches(cm.getValue(), query, options)
    const caret = cm.indexFromPos(cm.getCursor('from'))
    index = matches.findIndex(match => match.start >= caret)
    if (index < 0 && matches.length) index = 0
    cm.operation(() => {
      marks = matches.map(match => cm.markText(cm.posFromIndex(match.start), cm.posFromIndex(match.end), { className: 'source-search-match' }))
      publish()
    })
  }
  const find = (action: unknown) => {
    if (!isActive() || !matches.length) return
    index = (index + (action === 'previous' ? -1 : 1) + matches.length) % matches.length
    publish()
  }
  const replace = (payload: unknown) => {
    if (!isActive() || !matches.length) return
    const { value, opt } = payload as { value: string; opt?: { isSingle?: boolean } }
    const selected = opt?.isSingle === false ? matches : matches.slice(index, index + 1)
    replacing = true
    try {
      cm.operation(() => {
        for (const match of [...selected].reverse()) {
          cm.replaceRange(match.replacement(value), cm.posFromIndex(match.start), cm.posFromIndex(match.end), '+replace')
        }
      })
    } finally {
      replacing = false
    }
    search({ value: query, opt: options })
  }
  const changes = () => {
    if (!replacing && query && isActive()) search({ value: query, opt: options })
  }
  const selection = () => {
    if (isActive() && !query) store.SEARCH({ value: cm.getSelection(), index: -1, matches: [] })
  }
  bus.on('searchValue', search)
  bus.on('replaceValue', replace)
  bus.on('find-action', find)
  cm.on('changes', changes)
  cm.on('cursorActivity', selection)
  return () => {
    bus.off('searchValue', search)
    bus.off('replaceValue', replace)
    bus.off('find-action', find)
    cm.off('changes', changes)
    cm.off('cursorActivity', selection)
    clear()
  }
}
