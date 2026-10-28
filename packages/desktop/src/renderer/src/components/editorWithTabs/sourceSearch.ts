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

  // Notepad++-style "show only matching lines". CodeMirror 5 has no filter
  // mode, so lines without a match get a class that CSS hides. Hidden lines
  // keep their fold state untouched — the underlying document is never
  // modified, which is what sets this apart from CodeMirror's foldRange.
  //
  // Performance notes (typing re-runs this per keystroke):
  // - Stale handles survive: addLineClass/removeLineClass resolve deleted
  //   line handles to `lineNo() == null` and no-op, so keeping removed lines
  //   in the set is safe and avoids a full wipe on every recompute.
  // - Matches are index→line converted with a O(matches) shared offset walk,
  //   not posFromIndex (O(lines) per call — quadratic on large docs).
  // - The apply loop is differential: it only toggles lines whose visibility
  //   actually changed, so an unchanged query re-run costs a Set build only.
  let hiddenLines = new Set<CodeMirror.LineHandle>()
  const onlyMatchesActive = () => (options as { onlyMatches?: boolean }).onlyMatches === true
  const applyLineFilter = () => {
    const onlyMatches = onlyMatchesActive()
    const wrapper = cm.getWrapperElement()
    wrapper.classList.toggle('cm-filtering-search', onlyMatches)
    if (!onlyMatches) {
      if (hiddenLines.size) {
        cm.operation(() => {
          for (const line of hiddenLines) cm.removeLineClass(line, 'wrap', 'cm-search-hidden-line')
        })
        hiddenLines = new Set()
      }
      return
    }
    const text = cm.getValue()
    const matched = new Set<number>()
    // Notepad3 keeps the line holding the caret visible even when it has no
    // match, so the typing/editing context never disappears mid-filter.
    matched.add(cm.getCursor().line)
    let lastLine = 0
    let lastOffset = 0
    const lineOf = (index: number) => {
      if (index < lastOffset) {
        lastLine = 0
        lastOffset = 0
      }
      while (true) {
        const nextBreak = text.indexOf('\n', lastOffset)
        if (nextBreak === -1 || nextBreak >= index) break
        lastLine++
        lastOffset = nextBreak + 1
      }
      return lastLine
    }
    for (const match of matches) {
      const from = lineOf(match.start)
      const to = lineOf(match.end)
      for (let line = from; line <= to; line++) matched.add(line)
    }
    const nextHidden = new Set<CodeMirror.LineHandle>()
    const lineCount = cm.lineCount()
    cm.operation(() => {
      let line = 0
      let offset = 0
      const doc = cm.getDoc()
      while (line < lineCount) {
        const handle = doc.getLineHandle(line)
        const keep = matched.has(line)
        if (keep) {
          if (hiddenLines.delete(handle)) cm.removeLineClass(handle, 'wrap', 'cm-search-hidden-line')
        } else if (!hiddenLines.has(handle)) {
          cm.addLineClass(handle, 'wrap', 'cm-search-hidden-line')
          nextHidden.add(handle)
        } else {
          hiddenLines.delete(handle)
          nextHidden.add(handle)
        }
        const breakAt = text.indexOf('\n', offset)
        offset = breakAt === -1 ? text.length : breakAt + 1
        line++
      }
      for (const line of hiddenLines) cm.removeLineClass(line, 'wrap', 'cm-search-hidden-line')
    })
    hiddenLines = nextHidden
  }
  const publish = (reveal = true) => {
    store.SEARCH({
      value: query,
      index,
      matches: matches.map(({ start, end }) => ({ start, end })),
      hiddenCount: onlyMatchesActive() ? hiddenLines.size : 0
    })
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
      // Filter first, then publish: the SEARCH payload reports the fresh
      // hiddenLines count, and the reveal scroll runs against the filtered
      // layout so the active match is not scrolled behind hidden lines.
      applyLineFilter()
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
    cm.getWrapperElement().classList.remove('cm-filtering-search')
    for (const line of hiddenLines) cm.removeLineClass(line, 'wrap', 'cm-search-hidden-line')
    hiddenLines = new Set()
  }
}
