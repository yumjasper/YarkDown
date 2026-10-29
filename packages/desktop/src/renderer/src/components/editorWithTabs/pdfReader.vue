<template>
  <section
    class="pdf-reader"
    :data-loaded-bytes="loadedBytes"
    :data-total-bytes="totalBytes"
    :aria-label="labels.reader"
    @keydown="handleKey"
    @click.capture="openLink"
  >
    <div
      class="pdf-toolbar"
      role="toolbar"
      :aria-label="labels.reader"
    >
      <span
        class="pdf-badge"
        :title="labels.readOnly"
      >PDF</span>
      <button
        :disabled="!ready"
        :aria-pressed="navigationOpen"
        :aria-label="zh ? '目录 / 缩略图' : 'Contents / thumbnails'"
        :title="zh ? '目录 / 缩略图' : 'Contents / thumbnails'"
        @click="toggleNavigation"
      >
        <pdf-icon name="outline" />
      </button>
      <button
        :disabled="!ready || page <= 1"
        :title="labels.previous"
        :aria-label="labels.previous"
        @click="goTo(page - 1)"
      >
        <pdf-icon name="previous" />
      </button>
      <input
        v-model="pageInput"
        type="number"
        min="1"
        :max="pages"
        :disabled="!ready"
        :aria-label="labels.page"
        @focus="editingPage = true"
        @blur="editingPage = false; pageInput = page"
        @change="commitPageInput"
        @keydown.enter.prevent="commitPageInput"
      >
      <span>/ {{ pages }}</span>
      <button
        :disabled="!ready || page >= pages"
        :title="labels.next"
        :aria-label="labels.next"
        @click="goTo(page + 1)"
      >
        <pdf-icon name="next" />
      </button>
      <button
        :disabled="!ready"
        :aria-label="labels.zoomOut"
        :title="labels.zoomOut"
        @click="zoom(1 / 1.2)"
      >
        <pdf-icon name="zoomOut" />
      </button>
      <select
        :value="scale"
        :disabled="!ready"
        :aria-label="labels.zoom"
        @change="setScale(($event.target as HTMLSelectElement).value)"
      >
        <option value="page-width">
          {{ labels.width }}
        </option>
        <option value="page-fit">
          {{ labels.fit }}
        </option>
        <option
          v-for="value in [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]"
          :key="value"
          :value="String(value)"
        >
          {{ value * 100 }}%
        </option>
        <option
          v-if="
            !['page-width', 'page-fit', '0.5', '0.75', '1', '1.25', '1.5', '2', '3', '4'].includes(
              scale
            )
          "
          :value="scale"
        >
          {{ Math.round(Number(scale) * 100) }}%
        </option>
      </select>
      <button
        :disabled="!ready"
        :aria-label="labels.zoomIn"
        :title="labels.zoomIn"
        @click="zoom(1.2)"
      >
        <pdf-icon name="zoomIn" />
      </button>
      <button
        :disabled="!ready"
        :aria-label="labels.rotate"
        :title="labels.rotate"
        @click="rotate"
      >
        <pdf-icon name="rotate" />
      </button>
      <button
        :disabled="!ready"
        :aria-label="labels.reload"
        :title="labels.reload"
        @click="load"
      >
        <pdf-icon name="reload" />
      </button>
      <select
        :disabled="!ready"
        :value="readingLayout"
        :aria-label="zh ? '页面布局' : 'Page layout'"
        @change="setLayout(($event.target as HTMLSelectElement).value)"
      >
        <option value="continuous">
          {{ zh ? '连续阅读' : 'Continuous' }}
        </option>
        <option value="single">
          {{ zh ? '单页阅读' : 'Single page' }}
        </option>
        <option value="spread">
          {{ zh ? '双页阅读' : 'Two pages' }}
        </option>
      </select>
      <button
        :disabled="!ready"
        :aria-label="zh ? '全屏' : 'Fullscreen'"
        :title="zh ? '全屏' : 'Fullscreen'"
        @click="toggleFullscreen"
      >
        <pdf-icon name="fullscreen" />
      </button>
      <pdf-document-actions
        :pdf-document="activeDocument"
        :page="page"
        :file="file"
        @translation="openTranslation()"
      />
      <div class="pdf-search">
        <input
          ref="searchInput"
          v-model="query"
          type="search"
          :placeholder="labels.search"
          :aria-label="labels.search"
          :disabled="!ready"
          @input="search()"
          @keydown.enter.prevent="search('again', $event.shiftKey)"
        >
        <span
          role="status"
          class="pdf-matches"
        >{{ matches }}</span>
        <button
          :disabled="!ready || !query"
          :aria-label="labels.previousMatch"
          @click="search('again', true)"
        >
          <pdf-icon name="up" />
        </button>
        <button
          :disabled="!ready || !query"
          :aria-label="labels.nextMatch"
          @click="search('again')"
        >
          <pdf-icon name="down" />
        </button>
        <details class="pdf-find-options">
          <summary :aria-label="zh ? '搜索选项' : 'Search options'">
            <pdf-icon name="settings" />
          </summary><div>
            <label><input
              v-model="searchCase"
              type="checkbox"
              @change="search()"
            >{{ zh ? '区分大小写' : 'Match case' }}</label>
            <label><input
              v-model="searchWord"
              type="checkbox"
              @change="search()"
            >{{ zh ? '全词匹配' : 'Whole words' }}</label>
            <label><input
              v-model="searchAll"
              type="checkbox"
              @change="search()"
            >{{ zh ? '突出显示全部' : 'Highlight all' }}</label>
          </div>
        </details>
      </div>
    </div>
    <div
      v-if="error"
      class="pdf-message"
      role="alert"
    >
      {{ labels.failed }} {{ error }}
      <button @click="load">
        {{ labels.reload }}
      </button>
    </div>
    <form
      v-else-if="passwordRequired"
      class="pdf-message"
      @submit.prevent="submitPassword"
    >
      <label>{{ labels.password }}
        <input
          v-model="password"
          type="password"
          autocomplete="off"
          :aria-label="labels.password"
          autofocus
        ></label>
      <button type="submit">
        {{ labels.unlock }}
      </button>
    </form>
    <div
      v-else-if="!firstPaint"
      class="pdf-message"
      role="status"
    >
      <span>{{ loadStage }}
        <small v-if="totalBytes">{{ formatBytes(loadedBytes) }} / {{ formatBytes(totalBytes) }}</small></span>
      <progress
        :value="loadedBytes || undefined"
        :max="totalBytes || 1"
        :aria-label="labels.loading"
      />
      <span v-if="totalBytes && loadedBytes >= totalBytes">{{
        zh ? '正在解析页面…' : 'Preparing pages…'
      }}</span>
    </div>
    <div class="pdf-reading-body">
      <pdf-annotations
        ref="annotationWorkspace"
        :page="page"
        :file="file"
        :pdf-document="activeDocument"
        :viewer="viewer"
        :events="events"
        :restriction="restriction"
        @tool="value => { if (!['Select', 'Hand'].includes(value)) toolWorkspace?.closePanel() }"
        @discard="discardDrafts"
        @translate="openTranslation"
      >
        <template #tools>
          <pdf-tool-workspace
            ref="toolWorkspace"
            :viewer="viewer"
            :file="file"
            :pdf-document="activeDocument"
            :page="page"
            :restriction="restriction"
            :content-restriction="contentRestriction"
            :export-restriction="exportRestriction"
            @group="value => { if (value) annotationWorkspace?.chooseTool('Select') }"
            @tool="kind => annotationWorkspace?.chooseTool(kind)"
            @appearance="(number, rect, image, text, content) => annotationWorkspace?.addPageAppearance(number, rect, image, text, content)"
          />
        </template>
        <div
          ref="viewport"
          class="pdf-viewport"
        >
          <div
            ref="container"
            class="pdf-scroll"

            :aria-label="labels.pages"
            tabindex="0"
            @dblclick="openLightbox"
          >
            <div class="pdfViewer" />
          </div>
        </div>
      </pdf-annotations>
      <pdf-open-code
        v-if="translationOpen"
        :source="translationSource"
        :request-id="translationRequest"
        :has-document="!!activeDocument"
        @close="translationOpen = false"
        @page="showTranslationPage"
      />
    </div>
    <pdf-image-lightbox
      :image="lightboxImage"
      :exporting="lightboxExporting"
      :message="lightboxMessage"
      @close="closeLightbox"
      @export="exportLightboxImage"
    />
  </section>
</template>

<script setup lang="ts">
import { observeSettledViewport, type SettledViewport } from '@/util/settledViewport'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import 'pdfjs-dist/web/pdf_viewer.css'
import type { PDFViewer, PDFLinkService, EventBus } from 'pdfjs-dist/web/pdf_viewer.mjs'
import { PDF_MAX_CANVAS_PIXELS, trimPdfCanvasCache } from '@/util/pdfCanvasCache'
import type { IFileState } from '@shared/types/files'
import bus from '@/bus'
import { useEditorStore } from '@/store/editor'
import PdfAnnotations from './pdfAnnotations.vue'
import PdfToolWorkspace from './pdfToolWorkspace.vue'
import { pdfFieldEntries } from '@/util/pdfFormFields'
import { useLayoutStore } from '@/store/layout'
import { usePdfNavigationStore } from '@/store/pdfNavigation'
import PdfIcon from './pdfIcon.vue'
import PdfImageLightbox, { type PdfLightboxImage } from './pdfImageLightbox.vue'
import {
  canvasToPngBytes,
  hitTestPageImage,
  probePageImages,
  renderPageImageForExport,
  renderPageImageRegion,
  toDisplayCoordinates
} from '@/util/pdfImageZoom'
import { LocalPdfTransport } from '@/services/pdfTransport'
import PdfDocumentActions from './pdfDocumentActions.vue'
import PdfOpenCode from './pdfOpenCode.vue'

const props = defineProps<{ file: IFileState }>()
const translationOpen = ref(false), translationSource = ref(''), translationRequest = ref(0)
const openTranslation = (text = '') => {
  translationSource.value = text
  translationRequest.value = text.trim() ? translationRequest.value + 1 : 0
  translationOpen.value = true
}
const showTranslationPage = async() => {
  try {
    const content = await (await activeDocument.value?.getPage(page.value))?.getTextContent()
    translationSource.value = content?.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('') || ''
  } catch { translationSource.value = zh.value ? '无法读取本页文字。' : 'Could not read this page’s text.' }
}
const annotationWorkspace = ref<InstanceType<typeof PdfAnnotations>>()
const editorStore = useEditorStore()
const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const labels = computed(() =>
  locale.value.startsWith('zh')
    ? {
        reader: 'PDF 阅读器',
        readOnly: '阅读与批注',
        previous: '上一页',
        next: '下一页',
        page: '页码',
        zoom: '缩放',
        zoomIn: '放大',
        zoomOut: '缩小',
        width: '适合宽度',
        fit: '适合整页',
        rotate: '顺时针旋转',
        reload: '重新加载',
        search: '搜索 PDF 文字',
        previousMatch: '上一个匹配',
        nextMatch: '下一个匹配',
        password: 'PDF 密码',
        unlock: '打开',
        loading: '正在加载 PDF…',
        failed: '无法打开 PDF：',
        pages: 'PDF 页面'
      }
    : {
        reader: 'PDF reader',
        readOnly: 'Read & annotate',
        previous: 'Previous page',
        next: 'Next page',
        page: 'Page number',
        zoom: 'Zoom',
        zoomIn: 'Zoom in',
        zoomOut: 'Zoom out',
        width: 'Page width',
        fit: 'Fit page',
        rotate: 'Rotate clockwise',
        reload: 'Reload',
        search: 'Search PDF text',
        previousMatch: 'Previous match',
        nextMatch: 'Next match',
        password: 'PDF password',
        unlock: 'Open',
        loading: 'Loading PDF…',
        failed: 'Unable to open PDF:',
        pages: 'PDF pages'
      }
)
const container = ref<HTMLDivElement>()
const viewport = ref<HTMLDivElement>()
const searchInput = ref<HTMLInputElement>()
const page = ref(1)
const pageInput = ref<number | string>(1)
const editingPage = ref(false)
watch(page, value => { if (!editingPage.value) pageInput.value = value })
const pages = ref(0)
const scale = ref('page-width')
const query = ref('')
const matches = ref('')
const toolWorkspace = ref<InstanceType<typeof PdfToolWorkspace>>()
const searchCase = ref(false)
const searchWord = ref(false)
const searchAll = ref(true)
const readingLayout = ref('continuous')
const ready = ref(false)
const firstPaint = ref(false)
const layout = useLayoutStore()
const pdfNavigation = usePdfNavigationStore()
const navigationOpen = computed(() => layout.showSideBar && ['toc', 'pdf-thumbnails'].includes(layout.rightColumn || ''))
const toggleNavigation = () => layout.SET_LAYOUT({ showSideBar: true, rightColumn: navigationOpen.value ? '' : 'toc' })
const loadedBytes = ref(0)
const totalBytes = ref(0)
const loadStage = ref('')
let sessionToken: string | undefined
const formatBytes = (value: number) =>
  value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.round(value / 1024)} KB`
const setLayout = (value: string) => {
  readingLayout.value = value
  if (!viewer) return
  viewer.scrollMode = value === 'single' ? 3 : 0
  viewer.spreadMode = value === 'spread' ? 1 : 0
}
const navigateDestination = async(destination: string | unknown[]) => {
  const doc = activeDocument.value
  if (!doc || !links) throw new Error(zh.value ? 'PDF 尚未加载完成，请稍候。' : 'PDF is still loading.')
  const target = typeof destination === 'string' ? await doc.getDestination(destination) : destination
  if (!Array.isArray(target) || !target.length) throw new Error(zh.value ? '目录没有有效的页面目标。' : 'This bookmark has no valid page destination.')
  const index = typeof target[0] === 'number' ? target[0] : await doc.getPageIndex(target[0])
  if (!Number.isInteger(index) || index < 0 || index >= doc.numPages) throw new Error(zh.value ? '目录目标页码无效。' : 'Invalid bookmark page number.')
  await doc.getPage(index + 1)
  if (doc !== activeDocument.value) return
  await links.goToDestination(target)
}
const toggleFullscreen = () => {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void container.value?.closest('.pdf-reader')?.requestFullscreen()
}
const activeDocument = shallowRef<pdfjs.PDFDocumentProxy>()
const restriction = ref('')
const contentRestriction = ref('')
const exportRestriction = ref('')
const error = ref('')
const passwordRequired = ref(false)
const password = ref('')
let updatePassword: ((value: string) => void) | undefined
// Clearing a PDF document does not disconnect the viewer-owned observers and scroll listener.
const viewerLifetime = new AbortController()
let viewer: PDFViewer | undefined
let links: PDFLinkService | undefined
let events: EventBus | undefined
let task: pdfjs.PDFDocumentLoadingTask | undefined
let teardown = Promise.resolve()
let disposed = false
let generation = 0
let resizeViewport: SettledViewport | undefined
let stopNativeResize: (() => void) | undefined
let cacheTimer: ReturnType<typeof setTimeout> | undefined
const scheduleCacheTrim = () => {
  clearTimeout(cacheTimer)
  cacheTimer = setTimeout(() => {
    if (disposed || !viewer || !container.value) return
    const cachedPages = viewer.getCachedPageViews()
    const protectedPages = new Set<number>()
    const selection = window.getSelection()
    for (const view of cachedPages) {
      const selected = selection && !selection.isCollapsed &&
        Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index))
          .some(range => range.intersectsNode(view.div))
      if (selected ||
        view.div.contains(document.activeElement)) protectedPages.add(view.id)
    }
    trimPdfCanvasCache(cachedPages, container.value.getBoundingClientRect(), page.value, protectedPages)
  }, 200)
}
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const saveView = () => {
  if (!viewer || !ready.value) return
  editorStore.SET_PDF_VIEW(props.file.id, {
    page: viewer.currentPageNumber,
    scale: viewer.currentScaleValue,
    rotation: viewer.pagesRotation
  })
}
const goTo = (value: number) => {
  if (viewer && ready.value && Number.isFinite(value)) {
    viewer.currentPageNumber = Math.max(1, Math.min(pages.value, Math.trunc(value)))
  }
}
const commitPageInput = () => {
  editingPage.value = false
  goTo(Number(pageInput.value))
  pageInput.value = viewer?.currentPageNumber || page.value
}
const setScale = (value: string) => {
  if (!viewer || !ready.value) return
  viewer.currentScaleValue = value
  scale.value = viewer.currentScaleValue
  saveView()
}
const zoom = (factor: number) => {
  if (viewer) setScale(String(Math.min(5, Math.max(0.25, viewer.currentScale * factor))))
}
const rotate = () => {
  if (!viewer || !ready.value) return
  const pageNumber = viewer.currentPageNumber
  viewer.pagesRotation = (viewer.pagesRotation + 90) % 360
  // Rotation changes page dimensions; the previous scroll offset can fall outside the visible page.
  viewer.scrollPageIntoView({ pageNumber, ignoreDestinationZoom: true })
  viewer.update()
  viewer.forceRendering(undefined)
  saveView()
}
const search = (type = '', previous = false) => {
  if (!ready.value) return
  matches.value = ''
  events?.dispatch('find', {
    source: viewer,
    type,
    query: query.value,
    caseSensitive: searchCase.value,
    entireWord: searchWord.value,
    highlightAll: searchAll.value,
    findPrevious: previous,
    matchDiacritics: false
  })
}
const focusSearch = () => {
  searchInput.value?.focus()
  searchInput.value?.select()
}
const selectAll = () => {
  if (document.activeElement instanceof HTMLInputElement) {
    document.activeElement.select()
    return
  }
  const content = container.value?.firstElementChild
  if (!content) return
  const range = document.createRange()
  range.selectNodeContents(content)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
}
const handleKey = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    event.stopPropagation()
    focusSearch()
    return
  }
  const target = event.target as HTMLElement
  if (target.closest('input, textarea, select, button, [contenteditable=true]')) return
  if (event.key === 'Home') { event.preventDefault(); goTo(1) }
  if (event.key === 'End') { event.preventDefault(); goTo(pages.value) }
  if (event.key === 'PageDown' && readingLayout.value === 'single') { event.preventDefault(); goTo(page.value + 1) }
  if (event.key === 'PageUp' && readingLayout.value === 'single') { event.preventDefault(); goTo(page.value - 1) }
}
const openLink = (event: MouseEvent) => {
  const anchor = (event.target as Element).closest('a[href]') as HTMLAnchorElement | null
  if (!anchor || anchor.closest('[data-internal-link], .internalLink')) return
  event.preventDefault()
  event.stopPropagation()
  if (/^(https?:|mailto:)/i.test(anchor.href)) void window.electron.shell.openExternal(anchor.href)
}
const submitPassword = () => {
  updatePassword?.(password.value)
  password.value = ''
  passwordRequired.value = false
}

const lightboxImage = ref<PdfLightboxImage | null>(null)
const lightboxExporting = ref(false)
const lightboxMessage = ref('')
let lightboxTarget: { page: number; quad: [number, number][] } | null = null

const releaseLightbox = () => {
  lightboxTarget = null
  lightboxImage.value = null
  lightboxMessage.value = ''
}
const closeLightbox = () => {
  releaseLightbox()
  lightboxExporting.value = false
}

/** Maps a double-click onto the page view that was actually clicked. */
const resolveClickedPage = (event: MouseEvent) => {
  const target = event.target as Element | null
  const pageElement = target?.closest('.pdfViewer .page') as HTMLElement | null
  if (!pageElement || !viewer) return null
  const pageNumber = Number(pageElement.dataset.pageNumber)
  const view = viewer.getPageView(pageNumber - 1)
  if (!view?.viewport) return null
  const rect = pageElement.getBoundingClientRect()
  return {
    pageNumber,
    view,
    // Both offsets use client coordinates so the page's own scroll cancels out.
    x: ((event.clientX - rect.left) / rect.width) * view.viewport.width,
    y: ((event.clientY - rect.top) / rect.height) * view.viewport.height
  }
}

const openLightbox = async(event: MouseEvent) => {
  if (!ready.value || !activeDocument.value || lightboxImage.value) return
  // Annotation tools and hand mode own the pointer; only Select may zoom.
  if (annotationWorkspace.value?.tool && annotationWorkspace.value.tool !== 'Select') return
  const clicked = resolveClickedPage(event)
  if (!clicked) return
  const page = await activeDocument.value.getPage(clicked.pageNumber).catch(() => null)
  if (!page) return
  try {
    const rotation = viewer?.pagesRotation || 0
    // The quad is in display orientation, so the size thresholds must be too.
    const unit = page.getViewport({ scale: 1, rotation: page.rotate + rotation })
    const coordinates = toDisplayCoordinates(page, await probePageImages(page), rotation)
    const hit = hitTestPageImage(
      coordinates,
      clicked.x / clicked.view.viewport.width,
      clicked.y / clicked.view.viewport.height,
      unit.width,
      unit.height
    )
    if (!hit) return
    event.preventDefault()
    // Double-click would otherwise extend the text selection under the image.
    window.getSelection()?.removeAllRanges()
    const canvas = await renderPageImageRegion(page, hit.quad, rotation)
    // The renderer CSP allows `data:` for images but not `blob:`, so the preview
    // has to be inlined; a blob URL here shows as a broken image.
    const url = canvas.toDataURL('image/png')
    releaseLightbox()
    lightboxTarget = { page: clicked.pageNumber, quad: hit.quad }
    lightboxImage.value = {
      url,
      page: clicked.pageNumber,
      width: canvas.width,
      height: canvas.height
    }
  } catch (reason) {
    // A failed probe must never break reading; just skip the preview.
    console.warn('PDF image preview failed:', reason)
  }
}

const exportLightboxImage = async() => {
  if (lightboxExporting.value || !lightboxTarget || !activeDocument.value) return
  lightboxExporting.value = true
  lightboxMessage.value = ''
  try {
    const page = await activeDocument.value.getPage(lightboxTarget.page)
    const canvas = await renderPageImageForExport(
      page,
      lightboxTarget.quad,
      viewer?.pagesRotation || 0
    )
    const data = await canvasToPngBytes(canvas)
    const saved = await window.electron.ipcRenderer.invoke('mt::pdf::export-image', {
      pathname: props.file.pathname,
      page: lightboxTarget.page,
      data
    })
    lightboxMessage.value = saved
      ? (zh.value ? `已保存到 ${saved}` : `Saved to ${saved}`)
      : (zh.value ? '已取消保存。' : 'Save cancelled.')
  } catch (reason) {
    lightboxMessage.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    lightboxExporting.value = false
  }
}

const load = async() => {
  closeLightbox()
  bus.emit('flush-pdf-annotation', props.file.id)
  const request = ++generation
  saveView()
  ready.value = false
  firstPaint.value = false
  loadedBytes.value = 0
  totalBytes.value = 0
  loadStage.value = zh.value ? '正在打开 PDF…' : 'Opening PDF…'
  pdfNavigation.clear(props.file.id)
  activeDocument.value = undefined
  restriction.value = ''
  contentRestriction.value = ''
  exportRestriction.value = ''
  error.value = ''
  passwordRequired.value = false
  matches.value = ''
  updatePassword = undefined
  try {
    viewer?.setDocument(null)
    links?.setDocument(null)
    const previousTask = task
    task = undefined
    if (previousTask) teardown = teardown.catch(() => {}).then(() => previousTask.destroy())
    await teardown
    if (sessionToken) {
      void window.electron.ipcRenderer.invoke('mt::pdf::close', sessionToken).catch(() => {})
      sessionToken = undefined
    }
    if (disposed || request !== generation) return
    const session = await window.electron.ipcRenderer.invoke('mt::pdf::open', props.file.pathname)
    if (disposed || request !== generation) {
      void window.electron.ipcRenderer.invoke('mt::pdf::close', session.token)
      return
    }
    sessionToken = session.token
    totalBytes.value = session.size
    loadStage.value = zh.value ? '正在读取 PDF…' : 'Reading PDF…'
    const hashPromise = window.electron.ipcRenderer.invoke('mt::pdf::hash', session.token)
    // Hash failures are observed below, including when document parsing fails first.
    void hashPromise.catch(() => {})
    const assetBase = new URL('./pdfjs/', document.baseURI).href
    const loading = pdfjs.getDocument({
      range: new LocalPdfTransport({
        length: session.size,
        read: (begin, end) => window.electron.ipcRenderer.invoke('mt::pdf::read-range', session.token, begin, end),
        active: () => !disposed && request === generation,
        progress: loaded => { loadedBytes.value = loaded },
        failed: reason => {
          error.value = reason instanceof Error ? reason.message : String(reason)
          void task?.destroy().catch(() => {})
        }
      }),
      rangeChunkSize: 256 * 1024,
      disableAutoFetch: true,
      disableStream: true,
      cMapUrl: `${assetBase}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${assetBase}standard_fonts/`,
      wasmUrl: `${assetBase}wasm/`
    })
    task = loading
    loading.onPassword = (callback: (value: string) => void) => {
      if (disposed || request !== generation) return
      updatePassword = callback
      passwordRequired.value = true
    }
    const pdfDocument = await loading.promise
    if (disposed || request !== generation) return
    restriction.value = zh.value
      ? '正在校验文件与批注权限…'
      : 'Checking file and annotation permissions…'
    pages.value = pdfDocument.numPages
    links!.setDocument(pdfDocument)
    viewer!.setDocument(pdfDocument)
    // Existing drafts must match the source before they are overlaid on its pages.
    const hash = await hashPromise
    if (disposed || request !== generation) return
    if ((props.file.pdfAnnotations?.length || props.file.pdfFormValues?.length) && props.file.pdfSourceHash !== hash) {
      throw new Error(
        zh.value
          ? '文件已被外部修改。草稿已保留，请放弃草稿后重新加载。'
          : 'The PDF changed externally. Discard the retained drafts before reloading.'
      )
    }
    editorStore.SET_PDF_ANNOTATIONS(props.file.id, props.file.pdfAnnotations || [], hash)
    let inspectionFailed = false
    const [metadata, permissions, fields] = await Promise.all([
      pdfDocument.getMetadata().catch(() => {
        inspectionFailed = true
        return { info: {} }
      }),
      pdfDocument.getPermissions().catch(() => {
        inspectionFailed = true
        return null
      }),
      pdfDocument.getFieldObjects().catch(() => {
        inspectionFailed = true
        return null
      })
    ])
    if (disposed || request !== generation) return
    restriction.value = ''
    if (inspectionFailed) {
      restriction.value = locale.value.startsWith('zh')
        ? '无法确认此 PDF 的编辑权限，仍可阅读，批注编辑暂不可用。'
        : 'Editing permissions could not be verified. Reading is available; annotation editing is disabled.'
    } else if (
      (metadata.info as { EncryptFilterName?: string }).EncryptFilterName ||
      (fields &&
        pdfFieldEntries(fields).some(([, values]) =>
          (values as Array<{ type?: string }>).some((field) => field.type === 'signature')
        ))
    ) {
      restriction.value = locale.value.startsWith('zh')
        ? '加密或数字签名 PDF 保持只读，以保留加密和签名。'
        : 'Encrypted or digitally signed PDFs are read only to preserve encryption and signatures.'
    } else if (permissions && !permissions.has(pdfjs.PermissionFlag.MODIFY_ANNOTATIONS)) {
      restriction.value = locale.value.startsWith('zh')
        ? '此 PDF 未允许修改批注。'
        : 'This PDF does not permit annotation changes.'
    }
    contentRestriction.value = inspectionFailed || (permissions && !permissions.has(pdfjs.PermissionFlag.MODIFY_CONTENTS))
      ? (zh.value ? '此 PDF 未允许修改正文。' : 'This PDF does not permit content changes.') : ''
    exportRestriction.value = inspectionFailed || (permissions && !permissions.has(pdfjs.PermissionFlag.COPY))
      ? (zh.value ? '此 PDF 未允许复制或导出内容。' : 'This PDF does not permit copying or export.') : ''
    activeDocument.value = pdfDocument
    pdfNavigation.attach(props.file.id, pdfDocument, page.value, goTo, navigateDestination)
  } catch (reason) {
    if (!disposed && request === generation) {
      error.value = reason instanceof Error ? reason.message : String(reason)
    }
  }
}
const reloadChangedFile = (payload: unknown) => {
  const change = payload as { id?: string; isReload?: boolean }
  if (change.id === props.file.id && change.isReload) void load()
}
const savedFile = (payload: unknown) => {
  if ((payload as { id?: string }).id === props.file.id) void load()
}
const searchSelectedText = (payload: unknown) => {
  const selection = payload as { id: string; text: string }
  if (selection.id !== props.file.id) return
  query.value = selection.text
  search()
  focusSearch()
}
const discardDrafts = () => {
  void load()
}
onMounted(async () => {
  try {
    // The component bundle reads globalThis.pdfjsLib, initialized by the core import.
    const { PDFViewer, PDFLinkService, PDFFindController, EventBus } =
      await import('pdfjs-dist/web/pdf_viewer.mjs')
    if (disposed || !container.value || !viewport.value) return
    events = new EventBus()
    links = new PDFLinkService({ eventBus: events })
    const find = new PDFFindController({ eventBus: events, linkService: links })
    // PDF.js 6.4 accepts abortSignal at runtime but omits it from its published option type.
    const viewerOptions: ConstructorParameters<typeof PDFViewer>[0] & { abortSignal: AbortSignal } = {
      container: container.value,
      abortSignal: viewerLifetime.signal,
      eventBus: events,
      linkService: links,
      findController: find,
      annotationMode: pdfjs.AnnotationMode.ENABLE_STORAGE,
      imageResourcesPath: new URL('./pdfjs/images/', document.baseURI).href,
      maxCanvasPixels: PDF_MAX_CANVAS_PIXELS
    }
    viewer = new PDFViewer(viewerOptions)
    links.setViewer(viewer)
    events.on('pagesinit', () => {
      if (disposed) return
      const saved = props.file.pdfView
      ready.value = true
      loadStage.value = zh.value
        ? '正在准备首屏（按需读取）…'
        : 'Preparing first page (on-demand reading)…'
      viewer!.pagesRotation = saved?.rotation || 0
      setScale(saved?.scale || 'page-width')
      goTo(saved?.page || 1)
      if (query.value) search()
    })
    events.on('pagerendered', ({ error: renderError }: { error?: Error }) => {
      if (disposed) return
      if (renderError) error.value = renderError.message
      else firstPaint.value = true
      scheduleCacheTrim()
    })
    events.on('scalechanging', () => { if (viewer) { scale.value = viewer.currentScaleValue; saveView() } })
    events.on('pagechanging', ({ pageNumber }: { pageNumber: number }) => {
      page.value = pageNumber
      pdfNavigation.setPage(props.file.id, pageNumber)
      saveView()
      scheduleCacheTrim()
    })
    events.on(
      'updatefindmatchescount',
      ({ matchesCount }: { matchesCount: { current: number; total: number } }) => {
        matches.value = `${matchesCount.current} / ${matchesCount.total}`
      }
    )
    events.on('updatefindcontrolstate', ({ state }: { state: number }) => {
      if (state === 1) matches.value = '0 / 0'
    })
    resizeViewport = observeSettledViewport(viewport.value, container.value, () => {
      if (disposed || !ready.value) return
      if (['page-width', 'page-fit'].includes(scale.value)) viewer!.currentScaleValue = scale.value
      viewer!.update()
      scheduleCacheTrim()
    })
    stopNativeResize = window.electron.ipcRenderer.on('mt::window-resize-state', (_event, active) => {
      resizeViewport?.setInteractive(active)
    })
    bus.on('find', focusSearch)
    bus.on('selectAll', selectAll)
    bus.on('file-changed', reloadChangedFile)
    bus.on('pdf-saved', savedFile)
    bus.on('pdf-search-selection', searchSelectedText)
    await load()
  } catch (reason) {
    if (!disposed) error.value = reason instanceof Error ? reason.message : String(reason)
  }
})
onBeforeUnmount(() => {
  pdfNavigation.clear(props.file.id)
  closeLightbox()
  saveView()
  disposed = true
  generation++
  stopNativeResize?.()
  resizeViewport?.dispose()
  clearTimeout(cacheTimer)
  bus.off('find', focusSearch)
  bus.off('selectAll', selectAll)
  bus.off('file-changed', reloadChangedFile)
  bus.off('pdf-saved', savedFile)
  bus.off('pdf-search-selection', searchSelectedText)
  viewer?.setDocument(null)
  viewerLifetime.abort()
  // Localization observes the detached page tree independently of the document and worker.
  void viewer?.l10n?.destroy().catch(() => {})
  links?.setDocument(null)
  activeDocument.value = undefined
  const previousTask = task
  task = undefined
  if (previousTask) teardown = teardown.catch(() => {}).then(() => previousTask.destroy())
  const token = sessionToken
  if (token)
    void teardown
      .finally(() => window.electron.ipcRenderer.invoke('mt::pdf::close', token))
      .catch(() => {})
  void teardown.catch(() => {})
})
</script>

<style scoped>
.pdf-reader {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  color: var(--editorColor);
  background: var(--editorBgColor);
}
.pdf-reading-body { display: flex; flex: 1; min-height: 0; min-width: 0; overflow: hidden; }
.pdf-reading-body :deep(.pdf-annotation-workspace) { min-width: 0; }
.pdf-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px;
  padding: 5px 8px;
  border-bottom: 1px solid var(--editorColor10);
  font: 12px var(--uiFontFamily);
}
.pdf-toolbar button,
.pdf-toolbar input,
.pdf-toolbar select,
.pdf-message input,
.pdf-message button {
  color: inherit;
  background: var(--editorBgColor);
  border: 1px solid var(--editorColor10);
  border-radius: 5px;
  padding: 4px 7px;
  font: inherit;
}
.pdf-toolbar button {
  min-width: 28px;
  cursor: pointer;
}
.pdf-toolbar button:hover {
  background: var(--editorColor04);
}
.pdf-toolbar :disabled {
  opacity: 0.4;
  cursor: default;
}
.pdf-toolbar input[type='number'] {
  width: 52px;
}
.pdf-badge {
  color: var(--editorColor50);
  margin-right: 6px;
  white-space: nowrap;
}
.pdf-search {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}
.pdf-search input {
  width: clamp(80px, 11vw, 150px);
}
.pdf-matches {
  white-space: nowrap;
}
.pdf-scroll {
  position: absolute;
  inset: 0;
  overflow: auto;
  contain: strict;
  background: #525659;
}
.pdf-message progress {
  display: block;
  width: min(320px, 80%);
  height: 5px;
  margin: 8px auto;
  accent-color: var(--themeColor);
}
.pdf-message small {
  color: var(--editorColor50);
  margin-left: 8px;
}
.pdf-viewport {
  position: relative;
  overflow: hidden;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
.pdf-message {
  padding: 12px;
  text-align: center;
  font-size: 13px;
}
.pdf-reader :deep(.pdfViewer .page) {
  box-sizing: content-box;
}

.pdf-toolbar button { display: inline-flex; align-items: center; justify-content: center; min-width: 30px; height: 30px; padding: 5px; border-color: transparent; background: transparent; }
.pdf-toolbar button[aria-pressed=true] { color: var(--themeColor); background: var(--themeColor20); }
.pdf-toolbar button:focus-visible { outline: 2px solid var(--themeColor); outline-offset: 1px; }
.pdf-find-options { position: relative; }
.pdf-find-options summary { cursor: pointer; list-style: none; padding: 5px; }
.pdf-find-options > div { position: absolute; right: 0; top: 30px; z-index: 30; width: 170px; padding: 12px; display: flex; flex-direction: column; gap: 10px; background: var(--editorBgColor); border: 1px solid var(--editorColor10); border-radius: 8px; box-shadow: 0 5px 20px #0003; }
.pdf-find-options label { display: flex; align-items: center; gap: 5px; }
</style>
