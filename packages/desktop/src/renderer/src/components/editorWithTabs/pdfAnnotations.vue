<template>
  <div
    class="pdf-annotation-workspace"
    :class="{ 'pdf-hand-mode': tool === 'Hand', 'pdf-panning': !!panning }"
    :data-pdf-tool="tool"
  >
    <pdf-annotation-toolbar
      :tool="tool"
      :ready="!!pdfDocument"
      :editable="editable"
      :palette="palette"
      :color="color"
      :marker-width="markerWidth"
      :text-only="textOnly"
      :author="author"
      :can-undo="canUndo"
      :can-redo="canRedo"
      :dirty="!!drafts.length || !!file.pdfFormValues?.length"
      :saving="saving || !!file.pdfSaving"
      :sidebar="sidebar"
      :count="visibleAnnotations.length"
      @tool="toggleTool"
      @marker="useMarker"
      @color="color = $event"
      @width="markerWidth = $event"
      @text-only="textOnly = $event"
      @author="author = $event"
      @undo="undo"
      @redo="redo"
      @save="save"
      @sidebar="sidebar = !sidebar"
      @discard="discard"
    >
      <slot name="tools" />
    </pdf-annotation-toolbar>
    <p
      v-if="feedback"
      :key="feedbackVersion"
      class="pdf-action-feedback"
      role="status"
      aria-live="polite"
    >
      {{ feedback }}
    </p>
    <div
      v-if="restriction"
      class="pdf-annotation-hint"
      role="status"
    >
      {{ restriction }}
    </div>
    <div
      v-else-if="!['Select', 'Hand'].includes(tool)"
      class="pdf-annotation-hint"
    >
      {{
        tool === 'Erase'
          ? label(
            '单击批注即可擦除，支持撤销。',
            'Click an annotation to erase it. Undo is available.'
          )
          : tool === 'Highlight' && !textOnly
            ? label('拖动记号笔自由标记页面。', 'Drag the marker across the page.')
            : ['Highlight', 'Underline', 'StrikeOut'].includes(tool)
              ? label(
                '拖选文字即可标记，也可先选中文字再点工具。',
                'Select text to mark it, or select text first and click a tool.'
              )
              : label(
                '在页面上单击添加便签或题注；拖动可画框。',
                'Click a page for a note or caption; drag to draw a rectangle.'
              )
      }}
    </div>
    <div class="pdf-annotation-body">
      <slot />
      <aside
        v-if="sidebar"
        class="pdf-annotation-sidebar"
        :aria-label="label('批注列表', 'Annotations')"
      >
        <header class="comments-header">
          <strong>{{ label('批注', 'Comments') }} · {{ visibleAnnotations.length }}</strong><button
            :aria-label="label('关闭批注列表', 'Close comments')"
            @click="sidebar = false"
          >
            ×
          </button>
        </header>
        <input
          v-model="annotationQuery"
          type="search"
          :placeholder="label('搜索批注、作者', 'Search comments and authors')"
          :aria-label="label('搜索批注', 'Search annotations')"
          class="comments-search"
        >
        <label class="page-filter"><input
          v-model="currentPageOnly"
          type="checkbox"
        >{{ label('只看当前页', 'Current page only') }}</label>
        <p
          v-if="scanningAnnotations"
          role="status"
        >
          {{ label('正在读取全篇批注…', 'Loading document comments…') }}
        </p>
        <p v-if="!filteredAnnotations.length && visibleAnnotations.length">
          {{ label('没有匹配的批注', 'No matching annotations') }}
        </p>
        <p
          v-if="annotationError"
          role="alert"
        >
          {{ annotationError }}
        </p>
        <p v-if="!visibleAnnotations.length && !annotationError">
          {{ label('暂无批注', 'No annotations') }}
        </p>
        <button
          v-for="annotation in filteredAnnotations"
          :key="annotation.id"
          :data-comment-id="annotation.id"
          :aria-pressed="selectedId === annotation.id"
          class="pdf-annotation-item"
          :class="{ selected: selectedId === annotation.id }"
          @click="select(annotation)"
          @contextmenu.prevent="openAnnotationMenu($event, annotation)"
        >
          <strong>{{ annotation.page }} · {{ kindLabel(annotation.kind) }}</strong>
          <small>{{ annotation.author || label('未知作者', 'Unknown author') }}</small>
          <span>{{ annotation.text || label('无评论正文', 'No comment text') }}</span>
        </button>
        <form
          v-if="selected"
          class="pdf-annotation-form"
          @submit.prevent="applyChanges"
        >
          <label>{{ label('评论 / 题注正文', 'Comment / caption')
          }}<textarea
            ref="commentInput"
            v-model="editText"
            :disabled="!editable || !selected.editable"
            rows="5"
            maxlength="20000"
            :aria-label="label('批注正文', 'Annotation text')"
          />
          </label>
          <label>{{ label('作者', 'Author')
          }}<input
            v-model="editAuthor"
            maxlength="200"
            :disabled="!editable || !selected.editable"
            :aria-label="label('修改批注作者', 'Edit annotation author')"
          ></label>
          <label>{{ label('颜色', 'Color')
          }}<input
            v-model="editColor"
            type="color"
            :disabled="!editable || !selected.editable"
            :aria-label="label('修改批注颜色', 'Edit annotation color')"
          ></label>
          <button
            type="submit"
            :class="{ applied: !!feedback }"
            :aria-label="label('应用修改', 'Apply changes')"
            :disabled="!editable || !selected.editable"
          >
            {{ feedback ? label('✓ 已应用', '✓ Applied') : label('应用修改', 'Apply changes') }}
          </button>
          <button
            type="button"
            :disabled="!editable || !selected.editable"
            @click="removeSelected"
          >
            {{ label('删除批注', 'Delete annotation') }}
          </button>
          <p v-if="!selected.editable">
            {{ label('此批注类型仅支持查看。', 'This annotation type is view only.') }}
          </p>
        </form>
      </aside>
    </div>
    <div
      v-if="selectionMenu"
      class="pdf-selection-menu"
      :style="{ left: `${selectionMenu.x}px`, top: `${selectionMenu.y}px` }"
      role="toolbar"
      :aria-label="label('选区批注菜单', 'Selection annotation menu')"
      @mousedown.prevent
    >
      <button
        :aria-label="label('复制', 'Copy')"
        :title="label('复制', 'Copy')"
        @click="copySelection"
      >
        <pdf-icon name="copy" />
      </button>
      <button
        :aria-label="label('搜索', 'Search')"
        :title="label('搜索', 'Search')"
        @click="searchSelection"
      >
        <pdf-icon name="search" />
      </button>
      <button
        v-for="kind in ['Highlight', 'Underline', 'StrikeOut'] as const"
        :key="kind"
        :disabled="!editable"
        :aria-label="`${label('选区', 'Selection ')}${kindLabel(kind)}`"
        :title="kindLabel(kind)"
        @click="markSelection(kind)"
      >
        <pdf-icon :name="kind" />
      </button>
      <button
        :disabled="!editable"
        :aria-label="label('添加注释', 'Add comment')"
        :title="label('添加注释', 'Add comment')"
        @click="commentSelection"
      >
        <pdf-icon name="Text" />
      </button>
      <button
        :aria-label="label('OpenCode 翻译', 'OpenCode translation')"
        :title="label('翻译', 'Translate')"
        @click="translateSelection"
      >
        <pdf-icon name="translate" />
      </button>
    </div>
    <div
      v-if="contextMenu && selected"
      class="pdf-annotation-context-menu"
      role="menu"
      :aria-label="label('批注操作', 'Annotation actions')"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @contextmenu.prevent
      @keydown.esc.stop="contextMenu = undefined"
    >
      <button
        role="menuitem"
        :disabled="!editable || !selected.editable"
        @click="editNote"
      >
        <pdf-icon name="Text" />{{ label('编辑评论', 'Edit comment') }}
      </button>
      <details>
        <summary>{{ label('修改笔记颜色', 'Change annotation color') }}</summary><div class="context-colors">
          <button
            v-for="swatch in palette"
            :key="swatch"
            :disabled="!editable || !selected.editable"
            :style="{ background: swatch }"
            :aria-label="`${label('批注颜色', 'Annotation color')} ${swatch}`"
            @click="changeNoteColor(swatch)"
          /><input
            type="color"
            :value="editColor"
            :disabled="!editable || !selected.editable"
            :aria-label="label('自定义笔记颜色', 'Custom annotation color')"
            @input="changeNoteColor(($event.target as HTMLInputElement).value)"
          >
        </div>
      </details>
      <button
        role="menuitem"
        @click="copyNote"
      >
        <pdf-icon name="copy" />{{ label('复制评论文字', 'Copy comment text') }}
      </button>
      <button
        role="menuitem"
        :disabled="!editable || !selected.editable"
        @click="duplicateNote"
      >
        <pdf-icon name="copy" />{{ label('复制批注', 'Duplicate annotation') }}
      </button>
      <button
        role="menuitem"
        :disabled="!editable || !selected.editable"
        @click="deleteNote"
      >
        <pdf-icon name="trash" />{{ label('删除批注', 'Delete annotation') }}
      </button>
    </div>
    <div
      v-if="selected?.kind === 'FreeText' && captionPosition && editable"
      class="pdf-caption-editor"
      :style="{ left: `${captionPosition.x}px`, top: `${captionPosition.y}px` }"
    >
      <div class="pdf-caption-controls">
        <button
          :aria-label="label('移动题注', 'Move caption')"
          @pointerdown.prevent="startCaptionDrag($event, false)"
        >
          ⠿
        </button>
        <input
          v-model="editColor"
          type="color"
          :aria-label="label('题注文字颜色', 'Caption text color')"
          @change="applyEdit"
        >
        <label>A
          <input
            v-model.number="editFontSize"
            type="number"
            min="8"
            max="72"
            :aria-label="label('题注字号', 'Caption font size')"
            @change="applyEdit"
          ></label>
        <label>↔
          <input
            v-model.number="editSpacing"
            type="number"
            min="0"
            max="12"
            :aria-label="label('题注字间距', 'Caption letter spacing')"
            @change="applyEdit"
          ></label>
        <button @click="removeSelected">
          {{ label('删除', 'Delete') }}
        </button>
        <button
          :aria-label="label('调整题注宽度', 'Resize caption')"
          @pointerdown.prevent="startCaptionDrag($event, true)"
        >
          ↔
        </button>
        <button @click="closeCaption">
          ✓
        </button>
      </div>
      <textarea
        v-model="editText"
        :aria-label="label('直接编辑题注', 'Edit caption inline')"
        maxlength="2000"
        @input="applyEdit"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import type { PDFViewer, EventBus } from 'pdfjs-dist/web/pdf_viewer.mjs'
import { PDFDateString } from 'pdfjs-dist'
import type { IFileState } from '@shared/types/files'
import type { PdfAnnotation, PdfAnnotationKind } from '@shared/pdf'
import { useEditorStore } from '@/store/editor'
import bus from '@/bus'
import PdfIcon from './pdfIcon.vue'
import PdfAnnotationToolbar from './pdfAnnotationToolbar.vue'
import { PdfAnnotationHistory } from '@/util/pdfAnnotationHistory'
import { PdfAnnotationOverlay } from '@/util/pdfAnnotationOverlay'
import { movePdfAnnotation } from '@/util/pdfAnnotationMove'
import { markerPalette, updateMarkerPalette, boundedMarkerPresets } from '@/util/pdfMarkerPresets'

type Tool = PdfAnnotationKind | 'Select' | 'Hand' | 'Erase'
interface ListedAnnotation extends PdfAnnotation {
  editable: boolean
}
const props = defineProps<{
  file: IFileState
  pdfDocument?: PDFDocumentProxy
  viewer?: PDFViewer
  events?: EventBus
  restriction: string
  page?: number
}>()
const emit = defineEmits<{ discard: []; tool: [value: Tool]; translate: [text: string] }>()
const store = useEditorStore()
const { locale } = useI18n()
const label = (zh: string, en: string) => (locale.value.startsWith('zh') ? zh : en)
const tool = ref<Tool>('Select')
const color = ref(localStorage.getItem('pdf-marker-color') || '#fff100')
const author = ref(localStorage.getItem('pdf-annotation-author') || 'YarkText')
const sidebar = ref(false)
const selectedId = ref('')
const editText = ref('')
const editAuthor = ref('')
const editColor = ref('#f6c344')
const editFontSize = ref(14),
  editSpacing = ref(0)
let storedPresets: unknown = {}
try {
  storedPresets = JSON.parse(localStorage.getItem('pdf-marker-presets') || '{}')
} catch { /* Invalid local preferences use the defaults. */ }
const palette = ref(markerPalette(storedPresets, color.value))
const markerPresets = ref(boundedMarkerPresets(palette.value, storedPresets))
const markerWidth = ref(14),
  textOnly = ref(true)
const selectionMenu = ref<{ x: number; y: number }>()
const captionPosition = ref<{ x: number; y: number }>()
let selectedRange: Range | undefined
let selecting = false
let selectionFrame = 0
const commentInput = ref<HTMLTextAreaElement>()
const saving = ref(false)
const original = ref<ListedAnnotation[]>([])
const annotationError = ref('')
const feedback = ref('')
const feedbackVersion = ref(0)
const drafts = computed(() => props.file.pdfAnnotations || [])
const editable = computed(
  () => !!props.pdfDocument && !props.restriction && !saving.value && !props.file.pdfSaving
)
const history = new PdfAnnotationHistory()
const historyVersion = ref(0)
const canUndo = computed(() => { void historyVersion.value; return history.canUndo })
const canRedo = computed(() => { void historyVersion.value; return history.canRedo })
const toolNames: Array<[Tool, string, string]> = [
  ['Select', '选择', 'Select'],
  ['Hand', '拖拽阅读', 'Hand tool'],
  ['Highlight', '高亮', 'Highlight'],
  ['Underline', '下划线', 'Underline'],
  ['StrikeOut', '删除线', 'Strikeout'],
  ['Text', '便签评论', 'Sticky note'],
  ['FreeText', '文本题注', 'Text caption'],
  ['Ink', '手写画笔', 'Ink pen'],
  ['Square', '矩形', 'Rectangle'],
  ['Erase', '橡皮擦', 'Eraser']
]
const tools = computed(() => toolNames.map(([kind, zh, en]) => ({ kind, label: label(zh, en) })))
const kindLabel = (kind: string) => tools.value.find((item) => item.kind === kind)?.label || kind
const visibleAnnotations = computed<ListedAnnotation[]>(() => {
  const replaced = new Set(drafts.value.map((item) => item.sourceId).filter(Boolean))
  return [
    ...original.value.filter((item) => !replaced.has(item.id)),
    ...drafts.value.filter((item) => !item.deleted).map((item) => ({ ...item, editable: true }))
  ].sort((a, b) => a.page - b.page || b.rect[3] - a.rect[3])
})
const annotationQuery = ref('')
const currentPageOnly = ref(false)
const filteredAnnotations = computed(() => visibleAnnotations.value.filter(item => (!currentPageOnly.value || item.page === props.page) && `${item.text} ${item.author} ${kindLabel(item.kind)}`.toLowerCase().includes(annotationQuery.value.toLowerCase())))
const selected = computed(() =>
  visibleAnnotations.value.find((item) => item.id === selectedId.value)
)
const clone = (items: PdfAnnotation[]) => JSON.parse(JSON.stringify(items)) as PdfAnnotation[]
const commit = (items: PdfAnnotation[], key?: string) => {
  if (!editable.value || !history.record(drafts.value, items, key)) return
  historyVersion.value++
  store.SET_PDF_ANNOTATIONS(props.file.id, items)
}
const undo = () => {
  if (!editable.value || !history.canUndo) return
  store.SET_PDF_ANNOTATIONS(props.file.id, history.undo(drafts.value))
  historyVersion.value++
  selectedId.value = ''
}
const redo = () => {
  if (!editable.value || !history.canRedo) return
  store.SET_PDF_ANNOTATIONS(props.file.id, history.redo(drafts.value))
  historyVersion.value++
  selectedId.value = ''
}
const save = async (copy: boolean) => {
  if (!editable.value) return
  if (selected.value?.editable && !applyEdit()) return
  saving.value = true
  try {
    const success = await store.SAVE_PDF(props.file, copy)
    feedback.value = success ? label('批注已保存到 PDF。', 'Annotations saved to PDF.') : label('尚未保存，批注草稿已保留。', 'Not saved. Annotation drafts are retained.')
    feedbackVersion.value++
  } finally {
    saving.value = false
  }
}
const discard = async () => {
  if (!window.confirm(label('放弃所有未保存的 PDF 批注？', 'Discard all unsaved PDF annotations?')))
    return
  store.SET_PDF_FORM_VALUES(props.file.id, [])
  store.SET_PDF_ANNOTATIONS(props.file.id, [])
  history.clear()
  historyVersion.value++
  emit('discard')
}
const select = (item: ListedAnnotation) => {
  if (selected.value?.editable && !applyEdit()) return
  item = visibleAnnotations.value.find(value => value.id === item.id) || item
  feedback.value = ''
  selectedId.value = item.id
  editText.value = item.text
  editAuthor.value = item.author
  editColor.value = item.color
  editFontSize.value = item.fontSize || 14
  editSpacing.value = item.letterSpacing || 0
  sidebar.value = true
  if (props.page !== item.page) props.viewer?.scrollPageIntoView({ pageNumber: item.page })
  annotationQuery.value = ''
  if (currentPageOnly.value && props.page !== item.page) currentPageOnly.value = false
  void nextTick(() => {
    const entries = document.querySelectorAll<HTMLElement>('.pdf-annotation-item[data-comment-id]')
    for (const entry of entries) if (entry.dataset.commentId === item.id) entry.scrollIntoView({ block: 'nearest' })
  })
}
const captionAppearance = (item: PdfAnnotation) => {
  const w = item.rect[2] - item.rect[0]
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const fontSize = item.fontSize || 14
  const spacing = item.letterSpacing || 0
  ctx.font = `${fontSize}px "Segoe UI", "Microsoft YaHei", sans-serif`
  const lines: string[] = []
  for (const paragraph of item.text.split('\n')) {
    let line = ''
    for (const char of paragraph) {
      if (ctx.measureText(line + char).width + spacing * line.length > w - 8 && line) {
        lines.push(line)
        line = ''
      }
      line += char
    }
    lines.push(line)
  }
  const lineHeight = fontSize * 1.3
  const h = Math.max(28, lines.length * lineHeight + 8)
  item.rect[1] = item.rect[3] - h
  canvas.width = Math.ceil(w * 3)
  canvas.height = Math.ceil(h * 3)
  ctx.scale(3, 3)
  ctx.font = `${fontSize}px "Segoe UI", "Microsoft YaHei", sans-serif`
  ctx.fillStyle = item.color
  ctx.textBaseline = 'top'
  lines.forEach((line, index) => {
    let x = 4
    for (const char of line) {
      ctx.fillText(char, x, 4 + index * lineHeight)
      x += ctx.measureText(char).width + spacing
    }
  })
  item.appearance = canvas.toDataURL('image/png')
}
const applyEdit = () => {
  if (!selected.value || !editable.value || !selected.value.editable) return false
  if (
    selected.value.text === editText.value &&
    selected.value.author === editAuthor.value &&
    selected.value.color === editColor.value &&
    (selected.value.fontSize || 14) === editFontSize.value &&
    (selected.value.letterSpacing || 0) === editSpacing.value
  )
    return true
  const item: PdfAnnotation = {
    ...selected.value,
    text: editText.value,
    author: editAuthor.value,
    color: editColor.value,
    fontSize: Math.min(72, Math.max(8, editFontSize.value || 14)),
    letterSpacing: Math.min(12, Math.max(0, editSpacing.value || 0)),
    modified: new Date().toISOString()
  }
  delete (item as Partial<ListedAnnotation>).editable
  if (original.value.some((original) => original.id === item.id)) item.sourceId = item.id
  if (item.kind === 'FreeText') {
    if (item.text.length > 2000) {
      window.alert(
        label(
          '题注最多 2000 字符；长评论请使用便签。',
          'Captions support up to 2000 characters. Use a sticky note for longer comments.'
        )
      )
      return false
    }
    captionAppearance(item)
  }
  commit([...drafts.value.filter((draft) => draft.id !== item.id), item], `edit:${item.id}`)
  return true
}
const applyChanges = () => {
  if (!applyEdit()) return
  feedback.value = label('修改已应用到批注草稿；点击保存或按 Ctrl+S 写入 PDF。', 'Changes applied to the draft. Save or press Ctrl+S to write them to the PDF.')
  feedbackVersion.value++
}
watch([editText, editAuthor, editColor, editFontSize, editSpacing], () => { feedback.value = '' })
const removeSelected = () => {
  const item = selected.value
  if (!item || !editable.value || !item.editable) return
  const remaining = drafts.value.filter((draft) => draft.id !== item.id)
  if (item.sourceId || original.value.some((original) => original.id === item.id))
    remaining.push({ ...item, sourceId: item.sourceId || item.id, deleted: true })
  commit(remaining)
  selectedId.value = ''
}
const closeCaption = () => { applyEdit(); selectedId.value = '' }
const create = (
  kind: PdfAnnotationKind,
  page: number,
  rect: PdfAnnotation['rect'],
  extra: Partial<PdfAnnotation> = {}
): PdfAnnotation => ({
  id: crypto.randomUUID(),
  kind,
  page,
  rect,
  color: color.value,
  opacity: kind === 'Highlight' ? 0.35 : 1,
  width: 1.5,
  text: '',
  author: author.value,
  modified: new Date().toISOString(),
  ...extra
})
const add = (items: PdfAnnotation[]) => {
  if (!items.length) return
  commit([...drafts.value, ...items])
  if (['Text', 'FreeText'].includes(items[0].kind)) select({ ...items[0], editable: true })
  else { selectedId.value = ''; feedback.value = label('已添加批注，可撤销或保存。', 'Annotation added. Undo or save is available.') }
}
const pageGeometry = (element: Element) => {
  const pageElement = element.closest<HTMLElement>('.page[data-page-number]')
  const pageNumber = Number(pageElement?.dataset.pageNumber)
  const view = props.viewer?.getPageView(pageNumber - 1)
  const surface = pageElement?.querySelector<HTMLElement>('.canvasWrapper')
  return view && surface && pageElement
    ? {
        pageElement,
        pageNumber,
        viewport: view.pdfPage?.getViewport({ scale: view.viewport.scale, rotation: view.viewport.rotation }) || view.viewport,
        bounds: surface.getBoundingClientRect(),
        surface
      }
    : undefined
}
const point = (
  geometry: NonNullable<ReturnType<typeof pageGeometry>>,
  x: number,
  y: number
): [number, number] => {
  const { bounds, viewport } = geometry
  return viewport.convertToPdfPoint(
    ((x - bounds.left) * viewport.width) / bounds.width,
    ((y - bounds.top) * viewport.height) / bounds.height
  ) as [number, number]
}
const boundsOf = (points: number[], padding = 0): PdfAnnotation['rect'] => {
  const xs = points.filter((_, i) => i % 2 === 0),
    ys = points.filter((_, i) => i % 2 === 1)
  return [
    Math.min(...xs) - padding,
    Math.min(...ys) - padding,
    Math.max(...xs) + padding,
    Math.max(...ys) + padding
  ]
}
const markSelection = (kind: PdfAnnotationKind) => {
  const selection = window.getSelection()
  if (selectedRange && selection?.isCollapsed) {
    selection.removeAllRanges()
    selection.addRange(selectedRange)
  }
  if (!editable.value || !selection?.rangeCount || selection.isCollapsed || !props.viewer) return
  const range = selection.getRangeAt(0)
  const items: PdfAnnotation[] = []
  for (const layer of props.viewer.container.querySelectorAll('.textLayer')) {
    if (!range.intersectsNode(layer)) continue
    const geometry = pageGeometry(layer)
    if (!geometry) continue
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT)
    const quads: number[] = []
    const seen = new Set<string>()
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (!range.intersectsNode(node) || !node.textContent) continue
      const segment = document.createRange()
      segment.selectNodeContents(node)
      if (range.startContainer === node) segment.setStart(node, range.startOffset)
      if (range.endContainer === node) segment.setEnd(node, range.endOffset)
      for (const rect of segment.getClientRects()) {
        if (rect.width < 0.2 || rect.height < 0.2) continue
        const key = [rect.x, rect.y, rect.width, rect.height].map((v) => v.toFixed(2)).join(',')
        if (seen.has(key)) continue
        seen.add(key)
        const corners = [
          ...point(geometry, rect.left, rect.top),
          ...point(geometry, rect.right, rect.top),
          ...point(geometry, rect.left, rect.bottom),
          ...point(geometry, rect.right, rect.bottom)
        ]
        const [left, bottom, right, top] = boundsOf(corners)
        quads.push(left, top, right, top, left, bottom, right, bottom)
      }
    }
    if (quads.length)
      items.push(create(kind, geometry.pageNumber, boundsOf(quads, 1), { quadPoints: quads }))
  }
  add(items)
  if (items.length) {
    selection.removeAllRanges()
    hideSelectionMenu()
  }
}
const chooseTool = (value: Tool) => {
  if (!['Select', 'Hand'].includes(value) && !editable.value) return
  applyEdit()
  cancelGesture()
  stopPanning()
  tool.value = value
  emit('tool', value)
  if (value === 'Hand') { window.getSelection()?.removeAllRanges(); hideSelectionMenu() }
  if (['Highlight', 'Underline', 'StrikeOut'].includes(value))
    markSelection(value as PdfAnnotationKind)
}
const addPageAppearance = (page: number, rect: PdfAnnotation['rect'], appearance: string, text: string, asContent: boolean) => {
  if (!editable.value) return
  add([create('FreeText', page, rect, { appearance, text, color: '#1f2937', asContent })])
  selectedId.value = ''
  chooseTool('Select')
}
defineExpose({ chooseTool, addPageAppearance })
const toggleTool = (value: Tool) => chooseTool(tool.value === value && value !== 'Select' ? 'Select' : value)
const useMarker = (swatch: string) => {
  const active = tool.value === 'Highlight' && color.value.toLowerCase() === swatch.toLowerCase()
  color.value = swatch
  chooseTool(active ? 'Select' : 'Highlight')
}
watch(color, value => {
  if (!/^#[a-f\d]{6}$/i.test(value)) return
  localStorage.setItem('pdf-marker-color', value)
  palette.value = updateMarkerPalette(palette.value, value)
  markerPresets.value = boundedMarkerPresets(palette.value, markerPresets.value)
  const preset = markerPresets.value[value]
  markerWidth.value = typeof preset?.width === 'number' ? Math.max(4, Math.min(30, preset.width)) : 14
  textOnly.value = preset?.textOnly !== false
  markerPresets.value[value] = { width: markerWidth.value, textOnly: textOnly.value }
  localStorage.setItem('pdf-marker-presets', JSON.stringify(markerPresets.value))
}, { immediate: true })
watch([markerWidth, textOnly], () => {
  markerPresets.value[color.value] = { width: markerWidth.value, textOnly: textOnly.value }
  localStorage.setItem('pdf-marker-presets', JSON.stringify(markerPresets.value))
}, { flush: 'sync' })
const hideSelectionMenu = () => {
  selectionMenu.value = undefined
  selectedRange = undefined
}
const updateSelectionMenu = () => {
  cancelAnimationFrame(selectionFrame)
  selectionFrame = requestAnimationFrame(() => {
    const selection = window.getSelection()
    if (
      selecting ||
      !selection?.rangeCount ||
      selection.isCollapsed ||
      !selection.toString().trim() ||
      !props.viewer?.container.contains(selection.anchorNode) ||
      !props.viewer.container.contains(selection.focusNode)
    ) {
      hideSelectionMenu()
      return
    }
    selectedRange = selection.getRangeAt(0).cloneRange()
    const end = document.createRange()
    end.setStart(selection.focusNode!, selection.focusOffset)
    end.collapse(true)
    const rect = end.getClientRects()[0] || selectedRange.getBoundingClientRect()
    const y = rect.bottom + 48 > window.innerHeight ? Math.max(8, rect.top - 48) : rect.bottom + 8
    selectionMenu.value = {
      x: Math.max(8, Math.min(window.innerWidth - 280, rect.right)),
      y
    }
  })
}
const copySelection = () => {
  window.electron.clipboard.writeText(selectedRange?.toString() || '')
  hideSelectionMenu()
}
const searchSelection = () => {
  bus.emit('pdf-search-selection', { id: props.file.id, text: selectedRange?.toString() || '' })
  hideSelectionMenu()
}
const translateSelection = () => {
  emit('translate', selectedRange?.toString() || '')
  hideSelectionMenu()
}
const commentSelection = () => {
  markSelection('Highlight')
  tool.value = 'Select'
  void nextTick(() => commentInput.value?.focus())
}
const dismissMenu = (event: PointerEvent | KeyboardEvent) => {
  if (!(event.target as Element)?.closest?.('.pdf-annotation-context-menu')) contextMenu.value = undefined
  if (event instanceof KeyboardEvent) {
    if (event.key === 'Escape') {
      cancelGesture()
      hideSelectionMenu()
      selectedId.value = ''
    }
    return
  }
  if (!(event.target as Element).closest('.pdf-selection-menu')) hideSelectionMenu()
}
let drawing:
  | {
      geometry: NonNullable<ReturnType<typeof pageGeometry>>
      points: number[]
      kind: 'Marker' | 'Square' | 'Ink'
      pointerId: number
    }
  | undefined
const drawingAnnotation = (current: NonNullable<typeof drawing>) => {
  if (current.kind === 'Ink')
    return create('Ink', current.geometry.pageNumber, boundsOf(current.points, 2), { inkList: [current.points], color: color.value, width: 2 })
  if (current.kind === 'Square')
    return create('Square', current.geometry.pageNumber, boundsOf(current.points, 2))
  const quads: number[] = []
  const half = markerWidth.value / 2
  for (let i = 2; i < current.points.length; i += 2) {
    const x = current.points[i - 2],
      y = current.points[i - 1],
      nx = current.points[i],
      ny = current.points[i + 1]
    const length = Math.hypot(nx - x, ny - y) || 1
    const dx = (-(ny - y) / length) * half,
      dy = ((nx - x) / length) * half
    quads.push(x + dx, y + dy, nx + dx, ny + dy, x - dx, y - dy, nx - dx, ny - dy)
  }
  return create('Highlight', current.geometry.pageNumber, boundsOf(quads, 1), {
    quadPoints: quads,
    width: markerWidth.value
  })
}
let annotationDrag:
  | {
      item: PdfAnnotation
      geometry: NonNullable<ReturnType<typeof pageGeometry>>
      x: number
      y: number
      clientX: number
      clientY: number
      pointerId: number
      container: HTMLElement
      resize: boolean
      moved: boolean
    }
  | undefined
let dragFrame = 0
const startAnnotationDrag = (event: PointerEvent, item: ListedAnnotation, resize = false) => {
  if (event.button !== 0 || !editable.value || !item.editable || !props.viewer) return
  if (selectedId.value !== item.id) select(item)
  if (selectedId.value !== item.id || !applyEdit()) return
  const current = selected.value
  if (!current) return
  const element = props.viewer.container.querySelector(`.page[data-page-number="${current.page}"]`)
  const geometry = element && pageGeometry(element)
  if (!geometry) return
  const copy = clone([current])[0]
  delete (copy as Partial<ListedAnnotation>).editable
  if (copy.kind === 'FreeText' && !copy.appearance) captionAppearance(copy)
  event.preventDefault()
  event.stopPropagation()
  hideSelectionMenu()
  selecting = false
  annotationDrag = {
    item: copy, geometry, x: event.clientX, y: event.clientY,
    clientX: event.clientX, clientY: event.clientY,
    pointerId: event.pointerId, container: props.viewer.container, resize, moved: false
  }
  props.viewer.container.setPointerCapture(event.pointerId)
}
const startCaptionDrag = (event: PointerEvent, resize: boolean) => {
  if (selected.value) startAnnotationDrag(event, selected.value, resize)
}
const dragDelta = (drag: NonNullable<typeof annotationDrag>) => {
  const start = point(drag.geometry, drag.x, drag.y)
  const end = point(drag.geometry, drag.clientX, drag.clientY)
  return [end[0] - start[0], end[1] - start[1]]
}
const previewAnnotationDrag = () => {
  const drag = annotationDrag
  if (!drag?.moved) return
  const [dx, dy] = dragDelta(drag)
  const width = drag.resize ? Math.min(1000, Math.max(60, drag.item.rect[2] - drag.item.rect[0] + dx)) : undefined
  overlay.preview(drag.item, drag.resize ? 0 : dx, drag.resize ? 0 : dy, width)
  if (drag.item.kind === 'FreeText' && captionPosition.value && !drag.resize) {
    const [left, upper] = drag.geometry.viewport.convertToViewportPoint(drag.item.rect[0] + dx, drag.item.rect[3] + dy)
    captionPosition.value = {
      x: Math.max(8, Math.min(window.innerWidth - 340, drag.geometry.bounds.left + left * drag.geometry.bounds.width / drag.geometry.viewport.width)),
      y: Math.max(8, Math.min(window.innerHeight - 150, drag.geometry.bounds.top + upper * drag.geometry.bounds.height / drag.geometry.viewport.height - 70))
    }
  }
}
const finishAnnotationDrag = (event: PointerEvent) => {
  const drag = annotationDrag
  if (!drag || event.pointerId !== drag.pointerId) return false
  drag.clientX = event.clientX
  drag.clientY = event.clientY
  annotationDrag = undefined
  cancelAnimationFrame(dragFrame)
  dragFrame = 0
  overlay.resetPreview()
  if (drag.container.hasPointerCapture(drag.pointerId)) drag.container.releasePointerCapture(drag.pointerId)
  if (drag.moved) {
    const [dx, dy] = dragDelta(drag)
    const item = movePdfAnnotation(drag.item, drag.resize ? 0 : dx, drag.resize ? 0 : dy)
    if (drag.resize) {
      item.rect[2] = Math.min(item.rect[0] + 1000, Math.max(item.rect[0] + 60, item.rect[2] + dx))
      captionAppearance(item)
    }
    item.modified = new Date().toISOString()
    commit([...drafts.value.filter(draft => draft.id !== item.id), item])
  }
  scheduleRender()
  return true
}
const pointerDown = (event: PointerEvent) => {
  if (event.button !== 0 || (event.target as Element).closest('.pdf-edit-block, input, textarea, select, button, a')) return
  if (tool.value === 'Hand' && event.button === 0 && props.viewer) {
    event.preventDefault()
    event.stopPropagation()
    hideSelectionMenu()
    const container = props.viewer.container
    panning.value = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: container.scrollLeft, top: container.scrollTop }
    container.setPointerCapture(event.pointerId)
    return
  }
  const annotationId = (event.target as Element).closest('[data-annotation-id]')?.getAttribute('data-annotation-id')
  if (annotationId && tool.value !== 'Erase') {
    const item = visibleAnnotations.value.find(item => item.id === annotationId)
    if (item && tool.value === 'Select') startAnnotationDrag(event, item)
    return
  }
  selecting = tool.value === 'Select'
  if (tool.value === 'Erase' && editable.value) {
    const id = (event.target as Element)
      .closest('[data-annotation-id]')
      ?.getAttribute('data-annotation-id')
    const item = visibleAnnotations.value.find((item) => item.id === id)
    if (item) {
      select(item)
      removeSelected()
      event.preventDefault()
      event.stopPropagation()
    }
    return
  }
  const marker = tool.value === 'Highlight' && !textOnly.value
  if (
    !editable.value ||
    event.button !== 0 ||
    (!marker && !['Text', 'FreeText', 'Square', 'Ink'].includes(tool.value))
  )
    return
  const target = event.target as Element
  const geometry = pageGeometry(target)
  if (!geometry || target.closest('.pdf-draft-layer')) return
  event.preventDefault()
  event.stopPropagation()
  const [x, y] = point(geometry, event.clientX, event.clientY)
  if (marker || tool.value === 'Square' || tool.value === 'Ink') {
    drawing = {
      geometry,
      points: [x, y],
      kind: marker ? 'Marker' : tool.value === 'Ink' ? 'Ink' : 'Square',
      pointerId: event.pointerId
    }
    props.viewer?.container.setPointerCapture(event.pointerId)
    return
  }
  const kind = tool.value as 'Text' | 'FreeText'
  const item = create(
    kind,
    geometry.pageNumber,
    kind === 'Text' ? [x, y - 24, x + 24, y] : [x, y - 30, x + 180, y],
    { text: kind === 'FreeText' ? label('请输入题注', 'Enter caption') : '' }
  )
  if (kind === 'FreeText') item.color = '#1f2937'
  if (kind === 'FreeText') captionAppearance(item)
  add([item])
  tool.value = 'Select'
  void nextTick(() => commentInput.value?.focus())
}
const pointerMove = (event: PointerEvent) => {
  const drag = annotationDrag
  if (drag && drag.pointerId === event.pointerId) {
    event.preventDefault()
    drag.clientX = event.clientX
    drag.clientY = event.clientY
    if (!drag.moved && Math.hypot(drag.clientX - drag.x, drag.clientY - drag.y) < 3) return
    if (!drag.moved) {
      drag.moved = true
      renderDrafts()
    }
    if (!dragFrame) dragFrame = requestAnimationFrame(() => { dragFrame = 0; previewAnnotationDrag() })
    return
  }
  const pan = panning.value
  if (pan && event.pointerId === pan.pointerId && props.viewer) {
    event.preventDefault()
    props.viewer.container.scrollTo(pan.left + pan.x - event.clientX, pan.top + pan.y - event.clientY)
    return
  }
  if (!drawing || event.pointerId !== drawing.pointerId) return
  const next = point(drawing.geometry, event.clientX, event.clientY)
  if (drawing.kind === 'Square' && drawing.points.length > 2) drawing.points.splice(2)
  if (drawing.points.length < 10000) drawing.points.push(...next)
  scheduleRender()
}
const pointerUp = (event: PointerEvent) => {
  if (finishAnnotationDrag(event)) return
  if (panning.value?.pointerId === event.pointerId) { stopPanning(); return }
  selecting = false
  if (drawing && drawing.pointerId === event.pointerId) {
    const current = drawing
    drawing = undefined
    props.viewer?.container.releasePointerCapture(event.pointerId)
    if (current.points.length >= 4) add([drawingAnnotation(current)])
    scheduleRender()
  } else if (['Highlight', 'Underline', 'StrikeOut'].includes(tool.value)) {
    const selectedTool = tool.value as PdfAnnotationKind
    requestAnimationFrame(() => { if (tool.value === selectedTool) markSelection(selectedTool) })
  } else updateSelectionMenu()
}
const panning = ref<{ pointerId: number; x: number; y: number; left: number; top: number }>()
const stopPanning = () => {
  const container = props.viewer?.container
  if (panning.value && container?.hasPointerCapture(panning.value.pointerId)) container.releasePointerCapture(panning.value.pointerId)
  panning.value = undefined
}
const hiddenOriginals = new Map<string, { page: number; previous?: object }>()
const syncOriginalVisibility = () => {
  if (!props.pdfDocument || !props.viewer) return
  const storage = props.pdfDocument.annotationStorage
  const replaced = new Map(
    drafts.value.filter((item) => item.sourceId).map((item) => [item.sourceId!, item.page])
  )
  const affected = new Set<number>()
  for (const [id, entry] of hiddenOriginals) {
    if (replaced.has(id)) continue
    storage.remove(id)
    if (entry.previous) storage.setValue(id, entry.previous)
    hiddenOriginals.delete(id)
    affected.add(entry.page)
  }
  for (const [id, page] of replaced) {
    if (hiddenOriginals.has(id)) continue
    const previous = storage.getRawValue(id)
    hiddenOriginals.set(id, { page, previous })
    storage.setValue(id, { ...previous, noView: true })
    affected.add(page)
  }
  // Imported appearances are painted into the page canvas, so hiding only their HTML hit targets is insufficient.
  for (const page of affected) props.viewer.getPageView(page - 1)?.update({})
  if (affected.size) props.viewer.update()
}
const overlay = new PdfAnnotationOverlay(item => select({ ...item, editable: true }), (event, item) => openAnnotationMenu(event, { ...item, editable: true }))
let renderFrame = 0
const scheduleRender = () => {
  if (renderFrame) return
  renderFrame = requestAnimationFrame(() => { renderFrame = 0; renderDrafts() })
}
const renderDrafts = () => {
  const viewer = props.viewer
  if (!viewer) return
  captionPosition.value = undefined
  const bounds = viewer.container.getBoundingClientRect()
  const surfaces = Array.from(viewer.container.querySelectorAll<HTMLElement>('.page[data-page-number]'))
    .filter(page => { const box = page.getBoundingClientRect(); return box.bottom >= bounds.top - 150 && box.top <= bounds.bottom + 150 })
    .map(page => pageGeometry(page)).filter((geometry): geometry is NonNullable<ReturnType<typeof pageGeometry>> => !!geometry)
  const items = drafts.value.filter(item => !item.deleted)
  if (annotationDrag?.moved && !items.some(item => item.id === annotationDrag?.item.id)) items.push(annotationDrag.item)
  if (drawing && drawing.points.length >= 4) items.push(drawingAnnotation(drawing))
  overlay.render(surfaces.map(geometry => ({ page: geometry.pageElement, surface: geometry.surface, number: geometry.pageNumber, viewport: geometry.viewport })), items, tool.value !== 'Hand' && !drawing, selectedId.value)
  for (const geometry of surfaces) {
    if (selected.value?.kind === 'FreeText' && selected.value.page === geometry.pageNumber) {
      const [x, , , top] = selected.value.rect
      const [left, upper] = geometry.viewport.convertToViewportPoint(x, top)
      captionPosition.value = {
        x: Math.max(8, Math.min(window.innerWidth - 340, geometry.bounds.left + left * geometry.bounds.width / geometry.viewport.width)),
        y: Math.max(8, Math.min(window.innerHeight - 150, geometry.bounds.top + upper * geometry.bounds.height / geometry.viewport.height - 70))
      }
    }
    const replaced = new Set(drafts.value.filter(item => item.sourceId).map(item => item.sourceId))
    geometry.pageElement.querySelectorAll<HTMLElement>('[data-annotation-id]').forEach(node => {
      if (!node.closest('.pdf-draft-layer')) node.style.visibility = replaced.has(node.dataset.annotationId) ? 'hidden' : ''
    })
  }
  previewAnnotationDrag()
}
const cancelGesture = () => {
  const drag = annotationDrag
  annotationDrag = undefined
  cancelAnimationFrame(dragFrame)
  dragFrame = 0
  overlay.resetPreview()
  if (drag?.container.hasPointerCapture(drag.pointerId)) drag.container.releasePointerCapture(drag.pointerId)
  const container = props.viewer?.container
  if (drawing && container?.hasPointerCapture(drawing.pointerId)) container.releasePointerCapture(drawing.pointerId)
  drawing = undefined
  stopPanning()
  scheduleRender()
}
const annotationKey = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement
  if (target.closest('input, textarea, select, [contenteditable=true]')) return
  const modifier = event.ctrlKey || event.metaKey
  if (event.key === 'Escape') { cancelGesture(); chooseTool('Select'); selectedId.value = ''; hideSelectionMenu(); return }
  if (modifier && event.key.toLowerCase() === 'z') { event.preventDefault(); event.stopPropagation(); if (event.shiftKey) redo(); else undo() }
  else if (modifier && event.key.toLowerCase() === 'y') { event.preventDefault(); event.stopPropagation(); redo() }
  else if (['Delete', 'Backspace'].includes(event.key) && selected.value) { event.preventDefault(); event.stopPropagation(); removeSelected() }
  else if (!modifier && !event.altKey) {
    const shortcuts: Record<string, Tool> = { v: 'Select', h: 'Hand', m: 'Highlight', u: 'Underline', n: 'Text', p: 'Ink' }
    const value = shortcuts[event.key.toLowerCase()]
    if (value) { event.preventDefault(); chooseTool(value) }
  }
}
const importedClick = (event: MouseEvent) => {
  if (tool.value === 'Hand' || tool.value === 'Erase') return
  const id = (event.target as Element).closest('[data-annotation-id]')?.getAttribute('data-annotation-id')
  const item = visibleAnnotations.value.find(item => item.id === id)
  if (item) { event.preventDefault(); event.stopPropagation(); select(item) }
}
const contextMenu = ref<{ x: number; y: number }>()
const openAnnotationMenu = (event: MouseEvent, item: ListedAnnotation) => {
  event.preventDefault()
  event.stopPropagation()
  hideSelectionMenu()
  select(item)
  if (selectedId.value !== item.id) return
  contextMenu.value = { x: Math.max(8, Math.min(window.innerWidth - 240, event.clientX)), y: Math.max(8, Math.min(window.innerHeight - 300, event.clientY)) }
}
const annotationContext = (event: MouseEvent) => {
  const id = (event.target as Element).closest('[data-annotation-id]')?.getAttribute('data-annotation-id')
  const item = visibleAnnotations.value.find(item => item.id === id)
  if (item) openAnnotationMenu(event, item)
}
const changeNoteColor = (value: string) => { editColor.value = value; applyEdit(); contextMenu.value = undefined }
const copyNote = () => { if (selected.value) { applyEdit(); window.electron.clipboard.writeText(editText.value); contextMenu.value = undefined } }
const duplicateNote = () => {
  if (!selected.value?.editable || !editable.value || !applyEdit()) return
  const item = clone([selected.value])[0]
  delete item.sourceId
  delete (item as Partial<ListedAnnotation>).editable
  item.id = crypto.randomUUID()
  item.modified = new Date().toISOString()
  add([item])
  select({ ...item, editable: true })
  contextMenu.value = undefined
}
const editNote = () => { contextMenu.value = undefined; void nextTick(() => commentInput.value?.focus()) }
const deleteNote = () => { removeSelected(); contextMenu.value = undefined }
let observer: MutationObserver | undefined
let cleanup: (() => void) | undefined
let loadId = 0
const loadedAnnotationPages = new Set<number>()
const loadingAnnotationPages = new Set<number>()
const scanningAnnotations = ref(false)
const fetchAnnotations = async (doc: PDFDocumentProxy, all = false) => {
  const request = loadId
  const indexes = all ? Array.from({ length: doc.numPages }, (_, index) => index + 1) : [props.page || 1]
  if (all) scanningAnnotations.value = true
  try {
  for (const index of indexes) {
    if (request !== loadId || doc !== props.pdfDocument) return
    if (loadedAnnotationPages.has(index) || loadingAnnotationPages.has(index)) continue
    loadingAnnotationPages.add(index)
    const listed: ListedAnnotation[] = []
    try {
    const page: PDFPageProxy = await doc.getPage(index)
    for (const data of await page.getAnnotations({ intent: 'display' })) {
      if (!data.rect || data.subtype === 'Popup' || ['Link', 'Widget'].includes(data.subtype))
        continue
      const kind = data.subtype as PdfAnnotationKind
      const supported = toolNames.some(([value]) => value === kind)
      const bytes = data.color as Uint8ClampedArray | undefined
      listed.push({
        id: data.id,
        sourceId: data.id,
        kind,
        page: index,
        rect: [...data.rect] as PdfAnnotation['rect'],
        quadPoints: data.quadPoints ? Array.from(data.quadPoints) : undefined,
        inkList: data.inkLists?.map((line: ArrayLike<number | { x: number; y: number }>) =>
          Array.from(line).flatMap((value) =>
            typeof value === 'number' ? [value] : [value.x, value.y]
          )
        ),
        text: data.contentsObj?.str || '',
        author: data.titleObj?.str || '',
        color: bytes
          ? `#${Array.from(bytes)
              .map((value) => value.toString(16).padStart(2, '0'))
              .join('')}`
          : '#f6c344',
        opacity: data.opacity ?? 1,
        width: data.borderStyle?.width || 1.5,
        fontSize: data.defaultAppearanceData?.fontSize || 14,
        letterSpacing: Math.min(
          12,
          Math.max(0, parseFloat(data.richText?.html?.attributes?.style?.letterSpacing) || 0)
        ),
        modified: (PDFDateString.toDateObject(data.modificationDate) || new Date()).toISOString(),
        editable: supported && !(data.annotationFlags & (64 | 128))
      })
    }
    if (request !== loadId || doc !== props.pdfDocument) return
    original.value = [...original.value.filter(item => item.page !== index), ...listed]
    loadedAnnotationPages.add(index)
    } finally { if (request === loadId) loadingAnnotationPages.delete(index) }
  }
  } finally { if (request === loadId && all) scanningAnnotations.value = false }
}
const loadVisibleAnnotations = () => {
  const doc = props.pdfDocument
  if (!doc) return
  void fetchAnnotations(doc, sidebar.value).catch(error => {
    if (doc !== props.pdfDocument) return
    annotationError.value = label('批注列表加载失败，请重新加载 PDF。', 'Annotations could not be loaded. Reload the PDF.')
    console.error('Unable to read PDF annotations:', error)
  })
}
watch([() => props.page, sidebar], loadVisibleAnnotations)
watch(author, (value) => localStorage.setItem('pdf-annotation-author', value))
watch(selectedId, () => {
  void nextTick(scheduleRender)
})
watch(
  [drafts, tool],
  () => {
    syncOriginalVisibility()
    void nextTick(scheduleRender)
  },
  { deep: true }
)
watch(
  () => props.pdfDocument,
  (doc) => {
    cleanup?.()
    original.value = []
    loadedAnnotationPages.clear()
    loadingAnnotationPages.clear()
    scanningAnnotations.value = false
    history.clear()
    historyVersion.value++
    cleanup = undefined
    annotationError.value = ''
    if (!doc || !props.viewer || !props.events) return
    const container = props.viewer.container,
      events = props.events
    document.addEventListener('selectionchange', updateSelectionMenu)
    document.addEventListener('pointerdown', dismissMenu)
    document.addEventListener('keydown', dismissMenu)
    document.addEventListener('pointermove', pointerMove)
    document.addEventListener('pointerup', pointerUp)
    document.addEventListener('pointercancel', cancelGesture)
    window.addEventListener('blur', cancelGesture)
    const scrolled = () => {
      hideSelectionMenu()
      scheduleRender()
    }
    container.addEventListener('scroll', scrolled, { passive: true })
    container.addEventListener('pointerdown', pointerDown, true)
    container.addEventListener('keydown', annotationKey)
    container.addEventListener('click', importedClick)
    container.addEventListener('contextmenu', annotationContext)
    container.addEventListener('lostpointercapture', stopPanning)
    observer = new MutationObserver((records) => {
      if (
        records.some((record) =>
          [...record.addedNodes].some(
            (node) =>
              node instanceof Element &&
              !node.closest('.pdf-draft-layer') &&
              !node.classList.contains('pdf-draft-layer')
          )
        )
      )
        scheduleRender()
    })
    observer.observe(container, { childList: true, subtree: true })
    events.on('pagerendered', scheduleRender)
    events.on('scalechanging', scheduleRender)
    events.on('rotationchanging', scheduleRender)
    loadVisibleAnnotations()
    syncOriginalVisibility()
    renderDrafts()
    cleanup = () => {
      loadId++
      cancelGesture()
      observer?.disconnect()
      selecting = false
      hideSelectionMenu()
      captionPosition.value = undefined
      cancelAnimationFrame(selectionFrame)
      document.removeEventListener('selectionchange', updateSelectionMenu)
      document.removeEventListener('pointerdown', dismissMenu)
      document.removeEventListener('keydown', dismissMenu)
      document.removeEventListener('pointermove', pointerMove)
      document.removeEventListener('pointerup', pointerUp)
      document.removeEventListener('pointercancel', cancelGesture)
      window.removeEventListener('blur', cancelGesture)
      container.removeEventListener('scroll', scrolled)
      for (const [id, entry] of hiddenOriginals) {
        doc.annotationStorage.remove(id)
        if (entry.previous) doc.annotationStorage.setValue(id, entry.previous)
      }
      hiddenOriginals.clear()
      container.removeEventListener('pointerdown', pointerDown, true)
      container.removeEventListener('keydown', annotationKey)
      container.removeEventListener('click', importedClick)
      container.removeEventListener('contextmenu', annotationContext)
      contextMenu.value = undefined
      container.removeEventListener('lostpointercapture', stopPanning)
      events.off('pagerendered', scheduleRender)
      events.off('scalechanging', scheduleRender)
      events.off('rotationchanging', scheduleRender)
      cancelAnimationFrame(renderFrame)
      renderFrame = 0
      overlay.clear()
    }
  },
  { immediate: true }
)
bus.on('undo', undo)
bus.on('redo', redo)
const flushComment = (id: unknown) => {
  if (id === props.file.id) applyEdit()
}
bus.on('flush-pdf-annotation', flushComment)
onBeforeUnmount(() => {
  applyEdit()
  cleanup?.()
  loadId++
  bus.off('undo', undo)
  bus.off('redo', redo)
  bus.off('flush-pdf-annotation', flushComment)
})
</script>

<style scoped>
.pdf-annotation-workspace {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
}
button,
input,
textarea {
  font: inherit;
  color: inherit;
  border: 1px solid var(--editorColor10);
  border-radius: 4px;
  background: var(--editorBgColor);
}
button {
  padding: 4px 7px;
  cursor: pointer;
}
button.active,
button.selected {
  background: var(--editorColor10);
  border-color: var(--themeColor);
}
button:disabled,
input:disabled,
textarea:disabled {
  opacity: 0.45;
  cursor: default;
}
input[type='color'] {
  width: 28px;
  height: 26px;
  padding: 2px;
}
.pdf-author {
  width: 70px;
  padding: 4px;
}
.pdf-annotation-hint {
  padding: 5px 10px;
  font-size: 12px;
  color: var(--editorColor50);
  border-bottom: 1px solid var(--editorColor10);
}
.pdf-annotation-body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.pdf-annotation-sidebar {
  width: min(310px, 40vw);
  flex: none;
  padding: 8px;
  box-sizing: border-box;
  overflow: auto;
  border-left: 1px solid var(--editorColor10);
  font-size: 12px;
}
.pdf-annotation-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
  text-align: left;
  padding: 8px;
  margin-bottom: 5px;
  overflow-wrap: anywhere;
}
.pdf-annotation-item small {
  color: var(--editorColor50);
}
.pdf-annotation-item span {
  max-height: 72px;
  overflow: hidden;
  white-space: pre-wrap;
}
.pdf-annotation-form {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--editorColor10);
}
.pdf-annotation-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pdf-annotation-form textarea {
  resize: vertical;
  min-height: 70px;
  padding: 6px;
}
.pdf-annotation-form input {
  padding: 4px;
}
.pdf-annotation-form button.applied { color: var(--themeColor); background: var(--themeColor20); border-color: var(--themeColor); }
.pdf-action-feedback { margin: 0; color: var(--themeColor); line-height: 1.6; }
.pdf-hand-mode :deep(.pdf-scroll), .pdf-hand-mode :deep(.pdf-scroll *) { cursor: grab !important; user-select: none !important; }
.pdf-panning :deep(.pdf-scroll), .pdf-panning :deep(.pdf-scroll *) { cursor: grabbing !important; }
button:active:not(:disabled), summary:active { transform: translateY(1px); filter: brightness(.9); }
.pdf-selection-menu,
.pdf-caption-editor {
  position: fixed;
  z-index: 100;
  padding: 7px;
  color: var(--editorColor);
  background: var(--editorBgColor);
  box-shadow: 0 4px 20px #0004;
  border: 1px solid var(--editorColor10);
  border-radius: 8px;
}
.pdf-selection-menu {
  display: flex;
  flex-wrap: wrap;
  max-width: min(440px, calc(100vw - 30px));
  gap: 4px;
}
.pdf-caption-editor {
  width: 320px;
}
.pdf-caption-controls {
  display: flex;
  gap: 5px;
  align-items: center;
}
.pdf-caption-controls input[type='number'] {
  width: 38px;
}
.pdf-caption-controls button[aria-label='移动题注'],
.pdf-caption-controls button[aria-label='Move caption'] {
  cursor: grab;
  touch-action: none;
}
.pdf-caption-controls button[aria-label='调整题注宽度'],
.pdf-caption-controls button[aria-label='Resize caption'] {
  cursor: ew-resize;
  touch-action: none;
}
.pdf-caption-editor textarea {
  margin-top: 6px;
  width: 100%;
  min-height: 48px;
  resize: vertical;
  box-sizing: border-box;
}

.pdf-selection-menu > button { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 30px; padding: 5px; background: transparent; border-color: transparent; }
.pdf-selection-menu summary { list-style: none; padding: 6px; }
.pdf-selection-menu summary::-webkit-details-marker { display: none; }
.pdf-selection-menu button:focus-visible { outline: 2px solid var(--themeColor); }
.comments-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.comments-search { box-sizing: border-box; width: 100%; padding: 7px; margin-bottom: 8px; }
.page-filter { display: flex; align-items: center; gap: 5px; margin-bottom: 10px; color: var(--editorColor50); }
.pdf-annotation-sidebar { background: var(--editorBgColor); }
.pdf-annotation-context-menu { position: fixed; z-index: 1000; width: 220px; padding: 6px; background: var(--editorBgColor); color: var(--editorColor); border: 1px solid var(--editorColor10); border-radius: 8px; box-shadow: 0 5px 24px #0003; font: 12px var(--uiFontFamily); }
.pdf-annotation-context-menu > button, .pdf-annotation-context-menu summary { display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box; padding: 8px; border: 0; background: transparent; cursor: pointer; text-align: left; }
.pdf-annotation-context-menu > button:hover, .pdf-annotation-context-menu summary:hover { background: var(--editorColor10); }
.context-colors { display: flex; flex-wrap: wrap; gap: 5px; padding: 8px; }
.context-colors button { width: 24px; height: 24px; border-radius: 5px; border: 1px solid var(--editorColor10); }
</style>
