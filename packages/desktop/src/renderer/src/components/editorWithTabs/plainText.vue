<template>
  <div
    class="plain-text-editor"
    :class="{ 'is-active': active && focused }"
  >
    <form
      v-if="showGoTo"
      class="plain-text-go-to"
      @submit.prevent="goToLine"
    >
      <label>{{ t('plainText.lineNumber') }}
        <input
          ref="lineInput"
          v-model.number="targetLine"
          type="number"
          min="1"
          :max="lines"
          required
        >
      </label>
      <button type="submit">
        {{ t('plainText.go') }}
      </button>
      <button
        type="button"
        @click="showGoTo = false"
      >
        {{ t('plainText.close') }}
      </button>
    </form>
    <div
      ref="container"
      class="plain-text-content"
      :style="textStyle"
    />
    <editor-search v-if="active && focused" />
    <div class="plain-text-status">
      <span>{{ t('plainText.type') }}</span>
      <span>{{ t('plainText.total', { count: lines }) }}</span>
      <span class="plain-text-position">{{ t('plainText.line') }} {{ position.line + 1 }}, {{ t('plainText.column') }}
        {{ position.ch + 1 }}</span>
      <span>{{ encodingLabel }}{{ currentFile?.encoding.isBom ? ' BOM' : '' }}</span>
      <span>{{ currentFile?.lineEnding.toUpperCase() }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import type CodeMirror from 'codemirror'
import codeMirror from '@/codeMirror/core'
import bus from '@/bus'
import { observeSettledResize } from '@/util/settledResize'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { wordCount } from '@muyajs/core/utils/wordCount'
import {
  findTextMatches,
  isPlainTextFile,
  type TextSearchOptions,
  type TextMatch
} from '@shared/plainText'
import EditorSearch from '../search/index.vue'
import { SyntheticHistory } from './syntheticHistory'
import type { PlainTextDocuments, TextDocumentView } from './plainTextDocuments'

const props = defineProps<{ active: boolean; focused: boolean; fileId: string; pool: PlainTextDocuments }>()
const emit = defineEmits<{ activate: [] }>()
const { t } = useI18n()
const store = useEditorStore()
const preferences = usePreferencesStore()
const { currentFile: globalCurrentFile, tabs } = storeToRefs(store)
const currentFile = computed(() => tabs.value.find(file => file.id === props.fileId))
const encodingLabel = computed(() =>
  currentFile.value?.encoding.encoding.toUpperCase().replace(/^UTF(\d)/, 'UTF-$1')
)
const container = ref<HTMLDivElement | null>(null)
const lineInput = ref<HTMLInputElement | null>(null)
const setting = (key: 'txtWordWrap' | 'txtLineNumbers') => computed({
  get: () => preferences[key],
  set: (value: boolean) => preferences.SET_SINGLE_PREFERENCE({ type: key, value })
})
const wrap = setting('txtWordWrap')
const lineNumbers = setting('txtLineNumbers')
const textStyle = computed(() => ({
  '--txt-font-family': JSON.stringify(preferences.txtFontFamily) + ', monospace',
  '--txt-font-size': preferences.txtFontSize + 'px'
}))
const showGoTo = ref(false)
const targetLine = ref(1)
const position = ref({ line: 0, ch: 0 })
const lines = ref(1)
const documents = new Map<string, TextDocumentView>()
let stopResize: (() => void) | undefined
let cm: CodeMirror.Editor | undefined
let activeId: string | undefined
let loading = false
let query = ''
let searchOptions: TextSearchOptions = {}
let matches: TextMatch[] = []
let matchIndex = -1
let marks: CodeMirror.TextMarker[] = []

const isActive = () => props.active && props.focused && !!currentFile.value && currentFile.value.id === globalCurrentFile.value?.id && isPlainTextFile(currentFile.value.filename)
const commit = () => {
  if (loading || !cm || !activeId) return
  const state = documents.get(activeId)
  if (!state) return
  const markdown = state.doc.getValue()
  if (tabs.value.find(file => file.id === activeId)?.markdown === markdown) return
  const cursor = { anchor: state.doc.getCursor('anchor'), focus: state.doc.getCursor('head') }
  store.LISTEN_FOR_CONTENT_CHANGE({
    id: activeId,
    markdown,
    wordCount: wordCount(markdown),
    history: state.shared.history.build(markdown),
    cursor,
    muyaIndexCursor: cursor
  })
}

const cursorActivity = () => {
  if (loading || !cm || !isActive()) return
  position.value = cm.getCursor()
  lines.value = cm.lineCount()
  const selected = cm.getSelection()
  store.SET_SELECTION_WORD_COUNT(selected ? wordCount(selected) : null)
  if (!query) store.SEARCH({ value: selected, matches: [], index: -1 })
  if (activeId)
    store.PERSIST_CURSOR(activeId, { anchor: cm.getCursor('anchor'), focus: cm.getCursor('head') })
}

const clearMarks = () => {
  for (const mark of marks) mark.clear()
  marks = []
}

// Notepad++-style "show only matching lines" for plain-text files. Same
// approach and performance notes as sourceSearch: hide unmatched line wraps,
// never touch the doc; stale handles no-op in CodeMirror; index→line uses a
// shared offset walk; the apply loop only touches lines that change state.
let hiddenLines = new Set<CodeMirror.LineHandle>()
const applyLineFilter = () => {
  if (!cm) return
  const onlyMatches = (searchOptions as { onlyMatches?: boolean }).onlyMatches === true
  cm.getWrapperElement().classList.toggle('cm-filtering-search', onlyMatches)
  if (!onlyMatches) {
    if (hiddenLines.size) {
      cm.operation(() => {
        for (const line of hiddenLines) cm!.removeLineClass(line, 'wrap', 'cm-search-hidden-line')
      })
      hiddenLines = new Set()
    }
    return
  }
  const text = cm.getValue()
  const matched = new Set<number>()
  // Notepad3 keeps the caret line visible even without a match.
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
  const cmInstance = cm
  cm.operation(() => {
    let line = 0
    let offset = 0
    const doc = cmInstance.getDoc()
    while (line < lineCount) {
      const handle = doc.getLineHandle(line)
      const keep = matched.has(line)
      if (keep) {
        if (hiddenLines.delete(handle)) cmInstance.removeLineClass(handle, 'wrap', 'cm-search-hidden-line')
      } else if (!hiddenLines.has(handle)) {
        cmInstance.addLineClass(handle, 'wrap', 'cm-search-hidden-line')
        nextHidden.add(handle)
      } else {
        hiddenLines.delete(handle)
        nextHidden.add(handle)
      }
      const breakAt = text.indexOf('\n', offset)
      offset = breakAt === -1 ? text.length : breakAt + 1
      line++
    }
    for (const line of hiddenLines) cmInstance.removeLineClass(line, 'wrap', 'cm-search-hidden-line')
  })
  hiddenLines = nextHidden
}

const publishMatches = (reveal = true) => {
  if (!cm || !isActive()) return
  store.SEARCH({
    value: query,
    index: matchIndex,
    matches: matches.map(({ start, end }) => ({ start, end })),
    hiddenCount: (searchOptions as { onlyMatches?: boolean }).onlyMatches === true ? hiddenLines.size : 0
  })
  if (reveal && matchIndex >= 0) {
    const match = matches[matchIndex]
    cm.setSelection(cm.posFromIndex(match.start), cm.posFromIndex(match.end), { scroll: true })
  }
}

const search = (payload: unknown) => {
  if (!cm || !isActive()) return
  const { value, opt } = payload as { value: string; opt?: TextSearchOptions }
  query = value
  searchOptions = opt || {}
  clearMarks()
  matches = findTextMatches(cm.getValue(), query, searchOptions)
  const caret = cm.indexFromPos(cm.getCursor('from'))
  matchIndex = matches.findIndex((match) => match.start >= caret)
  if (matchIndex < 0 && matches.length) matchIndex = 0
  cm.operation(() => {
    marks = matches.map((match) =>
      cm!.markText(cm!.posFromIndex(match.start), cm!.posFromIndex(match.end), {
        className: 'plain-text-match'
      })
    )
    // Filter first, then publish so the SEARCH payload reports the fresh
    // hiddenLines count and the reveal scroll sees the filtered layout.
    applyLineFilter()
    publishMatches()
  })
}

const find = (action: unknown) => {
  if (!isActive() || !matches.length) return
  matchIndex = (matchIndex + (action === 'previous' ? -1 : 1) + matches.length) % matches.length
  publishMatches()
}

const replace = (payload: unknown) => {
  if (!cm || !isActive() || !matches.length) return
  const { value, opt } = payload as { value: string; opt?: { isSingle?: boolean } }
  const replacements = opt?.isSingle === false ? matches : matches.slice(matchIndex, matchIndex + 1)
  cm.operation(() => {
    for (const match of [...replacements].reverse()) {
      cm!.replaceRange(
        match.replacement(value),
        cm!.posFromIndex(match.start),
        cm!.posFromIndex(match.end),
        '+replace'
      )
    }
  })
  search({ value: query, opt: searchOptions })
}

interface IndexCursor {
  anchor: CodeMirror.Position
  focus: CodeMirror.Position
}
const isCursor = (value: unknown): value is IndexCursor => {
  const cursor = value as IndexCursor | null
  return typeof cursor?.anchor?.line === 'number' && typeof cursor?.focus?.line === 'number'
}

const loadFile = (payload?: unknown) => {
  const file = currentFile.value
  if (!props.active || !cm || !file || !isPlainTextFile(file.filename)) return
  const change = payload as
    { id?: string; cursor?: unknown; muyaIndexCursor?: unknown; isReload?: boolean } | undefined
  if (change?.id && change.id !== file.id) return
  loading = true
  clearMarks()
  applyLineFilter()
  query = ''
  matches = []
  matchIndex = -1
  let state = documents.get(file.id)
  const switched = activeId !== file.id
  const reloaded = !!state && state.doc.getValue() !== file.markdown
  if (!state) {
    state = props.pool.open(file.id, file.markdown)
    documents.set(file.id, state)
  } else if (state.doc.getValue() !== file.markdown) {
    state.doc.setValue(file.markdown)
    state.doc.clearHistory()
    state.shared.history = new SyntheticHistory(file.markdown, true)
  }
  activeId = file.id
  if (cm.getDoc() !== state.doc) cm.swapDoc(state.doc)
  const cursor = change?.cursor ?? file.cursor ?? change?.muyaIndexCursor ?? file.muyaIndexCursor
  if (isCursor(cursor) && (switched || reloaded || (props.focused && !!change?.cursor))) cm.setSelection(cursor.anchor, cursor.focus, { scroll: false })
  loading = false
  position.value = cm.getCursor()
  lines.value = cm.lineCount()
  showGoTo.value = false
  if (isActive()) store.UPDATE_TOC([])
  nextTick(() => {
    if (!cm || activeId !== currentFile.value?.id || !props.active) return
    cm.refresh()
    if (switched || reloaded) cm.scrollIntoView(cm.getCursor(), 40)
    if (isActive() && store.TAKE_OPEN_INTENT(file.pathname) !== false && !document.activeElement?.closest('.plain-text-group-bar')) cm.focus()
  })
}

const openGoTo = () => {
  showGoTo.value = true
  targetLine.value = position.value.line + 1
  nextTick(() => {
    lineInput.value?.focus()
    lineInput.value?.select()
  })
}
const goToLine = () => {
  if (
    !cm ||
    !Number.isInteger(targetLine.value) ||
    targetLine.value < 1 ||
    targetLine.value > cm.lineCount()
  )
    return
  cm.setCursor({ line: targetLine.value - 1, ch: 0 })
  cm.scrollIntoView(cm.getCursor(), 40)
  showGoTo.value = false
  cm.focus()
}
const undo = () => {
  if (isActive()) cm?.undo()
}
const redo = () => {
  if (isActive()) cm?.redo()
}
const selectAll = () => {
  if (isActive() && cm?.hasFocus()) cm.execCommand('selectAll')
}
const focus = () => {
  if (isActive()) cm?.focus()
}
const flush = () => {
  if (props.active) commit()
}
defineExpose({ focus, flush })

const contextMenu = async (instance: CodeMirror.Editor, event: Event) => {
  if (!(event instanceof MouseEvent)) return
  event.preventDefault()
  event.stopPropagation()
  const clipboard = await window.electron.clipboard.readText()
  const selectionText = instance.getSelection()
  bus.emit('source-context-menu', {
    x: event.clientX,
    y: event.clientY,
    selectionText,
    canCut: !!selectionText,
    canCopy: !!selectionText,
    canPaste: !!clipboard,
    nativeItems: []
  })
}

const handlers: Record<string, (payload: unknown) => void> = {
  'file-loaded': loadFile,
  'file-changed': loadFile,
  'flush-active-editor': flush,
  'editor-focus': focus,
  searchValue: search,
  replaceValue: replace,
  'find-action': find,
  undo,
  redo,
  selectAll,
  goToLine: () => { if (isActive()) openGoTo() },
  toggleTextWrap: () => { if (isActive()) wrap.value = !wrap.value },
  toggleTextLineNumbers: () => { if (isActive()) lineNumbers.value = !lineNumbers.value }
}

watch(wrap, (value) => cm?.setOption('lineWrapping', value))
watch(() => props.fileId, () => loadFile())
watch(() => props.focused, value => { if (value) nextTick(cursorActivity) })
watch(
  () => props.active,
  (value) => {
    if (value) loadFile()
  }
)
watch(lineNumbers, (value) => cm?.setOption('lineNumbers', value))
watch(() => preferences.txtTabSize, value => { cm?.setOption('tabSize', value); cm?.setOption('indentUnit', value) })
watch(textStyle, () => nextTick(() => cm?.refresh()))
watch(
  () => tabs.value.map((tab) => tab.id),
  (ids) => {
    for (const [id, view] of documents) if (!ids.includes(id)) { props.pool.release(view); documents.delete(id) }
  }
)
onMounted(() => {
  cm = markRaw(
    codeMirror(container.value, {
      value: '',
      mode: 'text/plain',
      lineNumbers: lineNumbers.value,
      lineWrapping: wrap.value,
      styleActiveLine: true,
      smartIndent: false,
      indentWithTabs: true,
      indentUnit: preferences.txtTabSize,
      tabSize: preferences.txtTabSize,
      viewportMargin: 10,
      direction: preferences.textDirection,
      extraKeys: {
        'Ctrl-G': openGoTo,
        'Cmd-G': openGoTo,
        'Ctrl-F': () => bus.emit('find'),
        'Cmd-F': () => bus.emit('find'),
        'Ctrl-H': () => bus.emit('replace'),
        'Alt-Z': () => {
          wrap.value = !wrap.value
        }
      }
    })
  )
  cm!.on('cursorActivity', cursorActivity)
  cm!.on('focus', () => emit('activate'))
  cm!.on('changes', () => {
    if (loading || !props.active) return
    commit()
    lines.value = cm!.lineCount()
    if (query && isActive()) search({ value: query, opt: searchOptions })
  })
  cm!.on('contextmenu', contextMenu)
  for (const [event, handler] of Object.entries(handlers)) bus.on(event, handler)
  if (container.value) {
    stopResize = observeSettledResize(container.value, () => cm?.refresh())
  }
  loadFile()
})
onBeforeUnmount(() => {
  commit()
  for (const [event, handler] of Object.entries(handlers)) bus.off(event, handler)
  clearMarks()
  cm?.getWrapperElement().classList.remove('cm-filtering-search')
  for (const line of hiddenLines) cm?.removeLineClass(line, 'wrap', 'cm-search-hidden-line')
  hiddenLines = new Set()
  stopResize?.()
  for (const view of documents.values()) props.pool.release(view)
  documents.clear()
  cm?.getWrapperElement().remove()
  cm = undefined
})
</script>

<style>
.plain-text-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  color: var(--editorColor);
}
.plain-text-toolbar,
.plain-text-go-to,
.plain-text-status {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: none;
  padding: 7px 16px;
  font-size: 12px;
  border-bottom: 1px solid var(--editorColor04);
}
.plain-text-toolbar label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.plain-text-label {
  color: var(--themeColor);
  font-weight: 600;
}
.plain-text-editor button {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: 4px;
  padding: 3px 7px;
  cursor: pointer;
}
.plain-text-editor button:hover {
  background: var(--floatHoverColor);
}
.plain-text-go-to input {
  width: 90px;
  margin-left: 8px;
  color: inherit;
  background: var(--editorBgColor);
  border: 1px solid var(--editorColor04);
}
.plain-text-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.plain-text-editor .CodeMirror {
  height: 100%;
  max-width: none;
  margin: 0;
  color: var(--editorColor);
  font-family: var(--txt-font-family, Consolas, monospace);
  font-size: var(--txt-font-size, 14px);
  line-height: 1.6;
}
.plain-text-editor .CodeMirror-lines {
  padding: 12px 0;
}
.plain-text-editor .CodeMirror-gutters {
  padding-right: 8px;
  border-right: 1px solid var(--editorColor04);
}
.plain-text-editor .CodeMirror-linenumber {
  color: var(--editorColor50);
}
.plain-text-editor .CodeMirror-cursor {
  border-left-color: var(--editorColor);
}
.plain-text-editor .CodeMirror-selected {
  background: var(--selection-color, rgb(45 170 219 / 30%));
}
.plain-text-status {
  border-bottom: 0;
  border-top: 1px solid var(--editorColor04);
  height: 28px;
  box-sizing: border-box;
padding-block: 0;
  /* Same corner reservation as the markdown status bar: the arcade launcher
     floats above the trailing encoding / line-ending labels otherwise. */
  padding-right: 54px;
  line-height: 20px;
  gap: 18px;
}
.plain-text-position {
  margin-left: auto;
}
.plain-text-editor .search-bar {
  z-index: 10;
  top: 42px;
}
.plain-text-match {
  background: var(--highlightColor, #f5cf6380);
}
@media (max-width: 650px) {
  .plain-text-toolbar {
    gap: 6px;
    padding-inline: 6px;
  }
.plain-text-status {
    gap: 6px;
    padding-left: 6px;
    padding-right: 54px;
  }
}
</style>
