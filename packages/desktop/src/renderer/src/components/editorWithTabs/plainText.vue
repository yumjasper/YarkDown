<template>
  <div
    class="plain-text-editor"
    :class="{ 'is-active': active }"
  >
    <div class="plain-text-toolbar">
      <span class="plain-text-label">TXT</span>
      <button
        type="button"
        @click.stop="bus.emit('find')"
      >
        {{ t('plainText.find') }}
      </button>
      <button
        type="button"
        @click.stop="bus.emit('replace')"
      >
        {{ t('plainText.replace') }}
      </button>
      <button
        type="button"
        @click="openGoTo"
      >
        {{ t('plainText.goTo') }}
      </button>
      <label><input
        v-model="wrap"
        type="checkbox"
      >{{ t('plainText.wrap') }}</label>
      <label><input
        v-model="lineNumbers"
        type="checkbox"
      >{{ t('plainText.lineNumber') }}</label>
    </div>
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
    />
    <editor-search v-if="active" />
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
import codeMirror from '@/codeMirror'
import bus from '@/bus'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { wordCount } from '@muyajs/core'
import {
  findTextMatches,
  isPlainTextFile,
  type TextSearchOptions,
  type TextMatch
} from '@shared/plainText'
import EditorSearch from '../search/index.vue'
import { SyntheticHistory } from './syntheticHistory'

const props = defineProps<{ active: boolean }>()
const { t } = useI18n()
const store = useEditorStore()
const preferences = usePreferencesStore()
const { currentFile, tabs } = storeToRefs(store)
const encodingLabel = computed(() =>
  currentFile.value?.encoding.encoding.toUpperCase().replace(/^UTF(\d)/, 'UTF-$1')
)
const container = ref<HTMLDivElement | null>(null)
const lineInput = ref<HTMLInputElement | null>(null)
const wrap = ref(true)
const lineNumbers = ref(true)
const showGoTo = ref(false)
const targetLine = ref(1)
const position = ref({ line: 0, ch: 0 })
const lines = ref(1)
const documents = new Map<string, { doc: CodeMirror.Doc; history: SyntheticHistory }>()
let cm: CodeMirror.Editor | undefined
let activeId: string | undefined
let loading = false
let query = ''
let searchOptions: TextSearchOptions = {}
let matches: TextMatch[] = []
let matchIndex = -1
let marks: CodeMirror.TextMarker[] = []

const isActive = () => !!currentFile.value && isPlainTextFile(currentFile.value.filename)
const commit = () => {
  if (loading || !cm || !activeId) return
  const state = documents.get(activeId)
  if (!state) return
  const markdown = state.doc.getValue()
  const cursor = { anchor: state.doc.getCursor('anchor'), focus: state.doc.getCursor('head') }
  store.LISTEN_FOR_CONTENT_CHANGE({
    id: activeId,
    markdown,
    wordCount: wordCount(markdown),
    history: state.history.build(markdown),
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

const publishMatches = (reveal = true) => {
  if (!cm || !isActive()) return
  store.SEARCH({
    value: query,
    index: matchIndex,
    matches: matches.map(({ start, end }) => ({ start, end }))
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
  if (!cm || !file || !isPlainTextFile(file.filename)) return
  const change = payload as
    { id?: string; cursor?: unknown; muyaIndexCursor?: unknown; isReload?: boolean } | undefined
  if (change?.id && change.id !== file.id) return
  loading = true
  clearMarks()
  query = ''
  matches = []
  matchIndex = -1
  let state = documents.get(file.id)
  if (!state) {
    state = {
      doc: markRaw(new codeMirror.Doc(file.markdown, 'text/plain')),
      history: new SyntheticHistory(file.markdown, true)
    }
    documents.set(file.id, state)
  } else if (state.doc.getValue() !== file.markdown) {
    state.doc.setValue(file.markdown)
    state.doc.clearHistory()
    state.history = new SyntheticHistory(file.markdown, true)
  }
  activeId = file.id
  if (cm.getDoc() !== state.doc) cm.swapDoc(state.doc)
  const cursor = change?.cursor ?? file.cursor ?? change?.muyaIndexCursor ?? file.muyaIndexCursor
  if (isCursor(cursor)) cm.setSelection(cursor.anchor, cursor.focus, { scroll: false })
  loading = false
  position.value = cm.getCursor()
  lines.value = cm.lineCount()
  showGoTo.value = false
  store.UPDATE_TOC([])
  nextTick(() => {
    if (!cm || activeId !== currentFile.value?.id || !isActive()) return
    cm.refresh()
    cm.scrollIntoView(cm.getCursor(), 40)
    if (store.TAKE_OPEN_INTENT(file.pathname) !== false) cm.focus()
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
  if (isActive()) commit()
}

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
  selectAll
}

watch(wrap, (value) => cm?.setOption('lineWrapping', value))
watch(
  () => props.active,
  (value) => {
    if (value) loadFile()
  }
)
watch(lineNumbers, (value) => cm?.setOption('lineNumbers', value))
watch(
  () => tabs.value.map((tab) => tab.id),
  (ids) => {
    for (const id of documents.keys()) if (!ids.includes(id)) documents.delete(id)
  }
)
onMounted(() => {
  cm = markRaw(
    codeMirror(container.value, {
      value: '',
      mode: 'text/plain',
      lineNumbers: true,
      lineWrapping: true,
      styleActiveLine: true,
      smartIndent: false,
      indentWithTabs: true,
      indentUnit: 4,
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
  cm!.on('changes', () => {
    if (loading || !isActive()) return
    commit()
    lines.value = cm!.lineCount()
    if (query) search({ value: query, opt: searchOptions })
  })
  cm!.on('contextmenu', contextMenu)
  for (const [event, handler] of Object.entries(handlers)) bus.on(event, handler)
  loadFile()
})
onBeforeUnmount(() => {
  commit()
  for (const [event, handler] of Object.entries(handlers)) bus.off(event, handler)
  clearMarks()
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
  font:
    14px/1.6 Consolas,
    'Cascadia Mono',
    'Microsoft YaHei',
    monospace;
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
  padding-block: 4px;
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
  .plain-text-toolbar,
  .plain-text-status {
    gap: 6px;
    padding-inline: 6px;
  }
}
</style>
