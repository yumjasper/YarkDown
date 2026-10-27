<template>
  <aside
    ref="host"
    class="editor-minimap"
    :class="{ 'slider-always': preferences.minimapShowSlider === 'always', dragging, 'auto-hover': preferences.minimapAutohide === 'mouseover', 'auto-scroll': preferences.minimapAutohide === 'scroll', scrolling }"
    role="scrollbar"
    tabindex="0"
    :aria-label="t('minimap.title')"
    aria-orientation="vertical"
    :aria-valuenow="announced"
    aria-valuemin="0"
    :aria-valuemax="Math.round(geometry.scrollRange)"
    @pointerdown="pointerDown"
    @pointermove="pointerMove"
    @pointerup="pointerUp"
    @pointercancel="pointerUp"
    @lostpointercapture="pointerUp"
    @wheel.prevent="wheel"
    @keydown="keydown"
  >
    <div
      ref="tileLayer"
      class="minimap-tiles"
      aria-hidden="true"
    />
    <canvas
      ref="canvas"
      class="minimap-overlay"
      aria-hidden="true"
    />
    <div
      class="minimap-slider"
      :style="{ transform: `translateY(${geometry.sliderTop}px)`, height: `${geometry.sliderHeight}px` }"
    />
    <button
      class="minimap-close"
      type="button"
      :title="t('minimap.hide')"
      :aria-label="t('minimap.hide')"
      @pointerdown.stop
      @click="set('minimapEnabled', false)"
    >
      ×
    </button>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import type CodeMirror from 'codemirror'
import { usePreferencesStore, type PreferencesState } from '@/store/preferences'
import { useEditorStore } from '@/store/editor'
import { minimapLayout, minimapScrollTarget } from './layout'
import { minimapText } from './text'
import type { MinimapTileRequest } from './worker'

const props = defineProps<{ plainText: boolean; sourceCode: boolean }>()
const preferences = usePreferencesStore()
const store = useEditorStore()
const { currentFile } = storeToRefs(store)
const { t } = useI18n()
const host = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const tileLayer = ref<HTMLDivElement | null>(null)
const scrollTop = ref(0)
// Screen readers get the position at a human pace. Writing `aria-valuenow` on
// every wheel event forced an accessibility-tree update per event, the same
// class of cost that stalled the document while scrolling.
const announced = ref(0)
let announcedAt = 0
let pendingScrollTop = 0
const height = ref(1)
const documentHeight = ref(1)
const viewportHeight = ref(1)
const rowCount = ref(1)
const dragging = ref(false)
const scrolling = ref(false)
const geometry = computed(() => minimapLayout(height.value, documentHeight.value, viewportHeight.value, scrollTop.value, rowCount.value, preferences.minimapScale, preferences.minimapSize))
let scroller: HTMLElement | null = null
let cm: CodeMirror.Editor | null = null
let rows: Array<{ text: string; top: number; height: number; heading?: boolean }> = []
let resize: ResizeObserver | undefined
let mutation: MutationObserver | undefined
let hostObserver: MutationObserver | undefined
let frame = 0
let rebuildTimer: ReturnType<typeof setTimeout> | undefined
let scrollTimer: ReturnType<typeof setTimeout> | undefined
let dragOffset = 0
let lastPaintOffset = NaN
let forcePaint = true
let disconnected = false
let bindGeneration = 0
let textCache = new WeakMap<Element, string>()
interface CachedTile { canvas: HTMLCanvasElement; job: number; ready: boolean }
const tiles = new Map<number, CachedTile>()
const TILE_HEIGHT = 768
let worker: Worker | null = null
let nextJob = 0
const pendingJobs = new Map<number, { index: number; tile: CachedTile }>()

const set = (type: keyof PreferencesState, value: unknown) => {
  preferences.SET_SINGLE_PREFERENCE({ type, value })
}
let cachedPalette: { normal: string; accent: string } | undefined
let cachedWidth = 0
const palette = () => {
  if (!cachedPalette && host.value) {
    const style = getComputedStyle(host.value)
    const normal = style.color
    cachedPalette = { normal, accent: style.getPropertyValue('--themeColor').trim() || normal }
  }
  return cachedPalette ?? { normal: '#888', accent: '#4c9be8' }
}
// `clientWidth` is a layout read; caching it keeps the scroll frame free of one
// forced reflow. The ResizeObserver below is the invalidation point.
const hostWidth = () => {
  if (!cachedWidth && host.value) cachedWidth = host.value.clientWidth
  return cachedWidth
}
const requestPaint = (force = false) => {
  forcePaint ||= force
  if (!frame) frame = requestAnimationFrame(paint)
}
const syncScroll = () => {
  if (!scroller) return
  // `scrollTop` is the only value a scroll tick can change. Reading
  // `scrollHeight`/`clientHeight` here forced a layout flush on every wheel
  // event, which is what made scrolling crawl on the long tutorial; `rebuild`
  // refreshes both whenever the document or the viewport actually resizes.
  scrollTop.value = scroller.scrollTop
  scrolling.value = true
  clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    scrolling.value = false
    announced.value = Math.round(pendingScrollTop)
  }, 700)
  // Announcing every tick would rewrite an ARIA attribute per wheel event and
  // rebuild the accessibility node each time. One announcement per ~1% of the
  // document is still readable, and the settled value lands last.
  pendingScrollTop = scroller.scrollTop
  const step = Math.max(1, geometry.value.scrollRange / 100)
  if (Math.abs(pendingScrollTop - announcedAt) >= step) {
    announcedAt = pendingScrollTop
    announced.value = Math.round(pendingScrollTop)
  }
  requestPaint()
}
const rebuild = () => {
  if (!scroller || !host.value || disconnected) return
  cachedWidth = 0
  height.value = host.value.clientHeight
  documentHeight.value = scroller.scrollHeight
  viewportHeight.value = scroller.clientHeight
  scrollTop.value = scroller.scrollTop
  pendingScrollTop = announcedAt = scroller.scrollTop
  announced.value = Math.round(scroller.scrollTop)
  if (cm) {
    const count = cm.lineCount()
    const step = Math.max(1, Math.ceil(count / 15000))
    const offset = scroller === cm.getScrollerElement() ? 0 : cm.getWrapperElement().getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    rows = []
    for (let i = 0; i < count; i += step) {
      const top = cm.heightAtLine(i, 'local') + offset
      const next = i + step < count ? cm.heightAtLine(i + step, 'local') + offset : documentHeight.value
      rows.push({ text: cm.getLine(i).slice(0, preferences.minimapMaxColumn), top, height: Math.max(1, next - top) })
    }
    rowCount.value = count
  } else {
    const root = scroller.querySelector('.mu-container')
    const origin = scroller.getBoundingClientRect().top - scroller.scrollTop
    rows = Array.from(root?.children || []).flatMap(element => {
      const rect = element.getBoundingClientRect()
      let text = textCache.get(element)
      if (text === undefined) {
        text = minimapText(element)
        textCache.set(element, text)
      }
      const lines = text.split('\n').flatMap(line => {
        if (!line) return ['']
        const parts: string[] = []
        for (let offset = 0; offset < line.length; offset += preferences.minimapMaxColumn) parts.push(line.slice(offset, offset + preferences.minimapMaxColumn))
        return parts
      })
      const lineHeight = rect.height / Math.max(1, lines.length)
      return lines.map((line, index) => ({ text: line, top: rect.top - origin + index * lineHeight, height: lineHeight, heading: /^H[1-6]$/.test(element.tagName) || element.classList.contains('mu-atx-heading') }))
    })
    rowCount.value = rows.reduce((count, row) => count + Math.max(1, Math.ceil(row.text.length / preferences.minimapMaxColumn)), 0)
  }
  tiles.clear()
  pendingJobs.clear()
  tileLayer.value?.replaceChildren()
  requestPaint(true)
}
const scheduleRebuild = () => {
  clearTimeout(rebuildTimer)
  rebuildTimer = setTimeout(rebuild, 100)
}
const findFirstRow = (top: number) => {
  let low = 0
  let high = rows.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (rows[middle].top + rows[middle].height < top) low = middle + 1
    else high = middle
  }
  return low
}
const paint = () => {
  frame = 0
  const target = canvas.value
  if (!target || !host.value || !scroller) return
  const layout = geometry.value
  if (!forcePaint && Math.abs(lastPaintOffset - layout.offset) < .5) return
  forcePaint = false
  lastPaintOffset = layout.offset
  const width = hostWidth()
  if (!width) return
  const ratio = Math.min(3, Math.max(2, Math.ceil(window.devicePixelRatio || 1)))
  if (target.width !== Math.ceil(width * ratio)) target.width = Math.ceil(width * ratio)
  if (target.height !== Math.ceil(height.value * ratio)) target.height = Math.ceil(height.value * ratio)
  const context = target.getContext('2d', { alpha: true })
  if (!context) return
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, width, height.value)
  // Reading this every frame forces a style recalc inside the scroll frame; it
  // only changes with the theme, so it is cached and invalidated on theme edits.
  const { normal, accent } = palette()
  const scaleY = layout.contentHeight / documentHeight.value
  const firstTile = Math.floor(layout.offset / TILE_HEIGHT)
  const lastTile = Math.floor((layout.offset + height.value) / TILE_HEIGHT)
  for (let index = firstTile; index <= lastTile; index++) {
    let tile = tiles.get(index)
    if (!tile) {
      const bitmap = document.createElement('canvas')
      bitmap.width = Math.ceil(width * ratio)
      bitmap.height = TILE_HEIGHT * ratio
      bitmap.style.cssText = `position:absolute;top:0;left:0;width:${width}px;height:${TILE_HEIGHT}px;will-change:transform`
      tileLayer.value?.appendChild(bitmap)
      tile = { canvas: bitmap, job: 0, ready: false }
      tiles.set(index, tile)
    }
    if (!tile.ready && !tile.job && (!worker || pendingJobs.size < 4)) {
      const top = index * TILE_HEIGHT
      const first = findFirstRow(Math.max(0, top - 8) / scaleY)
      const last = Math.min(rows.length - 1, findFirstRow((top + TILE_HEIGHT) / scaleY))
      const step = Math.max(1, Math.ceil((last - first + 1) / 1500))
      const visibleRows: MinimapTileRequest['rows'] = []
      for (let i = first; i <= last; i += step) visibleRows.push({ ...rows[i], y: rows[i].top * scaleY - top, height: rows[i].height * scaleY })
      if (worker) {
        tile.job = ++nextJob
        pendingJobs.set(tile.job, { index, tile })
        const request: MinimapTileRequest = {
          id: tile.job, width, height: TILE_HEIGHT, ratio,
          fontSize: Math.max(1, Math.min(3 * preferences.minimapScale, (width - 12) / (preferences.minimapMaxColumn * .6), layout.contentHeight / Math.max(1, rowCount.value))),
          renderCharacters: preferences.minimapRenderCharacters, maxColumn: preferences.minimapMaxColumn,
          normal, accent, rows: visibleRows
        }
        worker.postMessage(request)
      } else {
        const buffer = tile.canvas.getContext('2d')
        if (buffer) {
          buffer.scale(ratio, ratio)
          buffer.fillStyle = normal
          buffer.globalAlpha = .55
          for (const row of visibleRows) for (const match of row.text.matchAll(/\S+/g)) buffer.fillRect(5 + match.index / preferences.minimapMaxColumn * (width - 12), row.y, Math.max(1, match[0].length / preferences.minimapMaxColumn * (width - 12)), 1)
        }
        tile.ready = true
      }
    }
    const translate = `translateY(${Math.round((index * TILE_HEIGHT - layout.offset) * ratio) / ratio}px)`
    if (tile.canvas.style.transform !== translate) tile.canvas.style.transform = translate
  }
  for (const [index, tile] of tiles) if (index < firstTile - 1 || index > lastTile + 1) { tile.canvas.remove(); tiles.delete(index) }
  context.globalAlpha = .8
  context.fillStyle = accent
  const search = currentFile.value?.searchMatches
  const contentLength = currentFile.value?.markdown.length || 1
  for (const raw of search?.matches || []) {
    const match = raw as { start?: number }
    if (typeof match.start === 'number') context.fillRect(width - 4, match.start / contentLength * layout.contentHeight - layout.offset, 3, 2)
  }
  if (cm) {
    const line = cm.getCursor().line
    context.fillRect(0, line / Math.max(1, cm.lineCount()) * layout.contentHeight - layout.offset, width, 2)
  }
}
const unbind = () => {
  stopWaiting()
  scroller?.removeEventListener('scroll', syncScroll)
  resize?.disconnect()
  mutation?.disconnect()
  cm?.off('changes', scheduleRebuild)
  cm?.off('cursorActivity', cursorMoved)
  cm = null
}
// Resolves the element that actually scrolls the current view. Every editor mode
// mounts as an async component, so this legitimately returns null on early calls.
const resolveScroller = (parent: HTMLElement): HTMLElement | null => {
  const element = parent.querySelector<HTMLElement & { CodeMirror?: CodeMirror.Editor }>(
    props.plainText ? '.plain-text-editor .CodeMirror' : '.source-code .CodeMirror'
  )
  cm = props.plainText || props.sourceCode ? element?.CodeMirror || null : null
  const cmScroller = cm?.getScrollerElement()
  if (cmScroller && (props.plainText || cm?.getOption('viewportMargin') !== Infinity)) return cmScroller
  return props.sourceCode
    ? parent.querySelector<HTMLElement>('.source-code')
    : parent.querySelector<HTMLElement>('.editor-component')
}
const stopWaiting = () => {
  hostObserver?.disconnect()
  hostObserver = undefined
}
// The editor is a lazily loaded component and mounts after this pane, and Muya
// replaces the `.editor-component` placeholder once it boots. Giving up on the
// first miss left the minimap permanently blank with a 1px slider, because
// nothing else re-ran the binding.
const waitForScroller = (parent: HTMLElement, generation: number) => {
  stopWaiting()
  hostObserver = new MutationObserver(() => {
    if (disconnected || generation !== bindGeneration) { stopWaiting(); return }
    if (!resolveScroller(parent)) return
    stopWaiting()
    void bind()
  })
  hostObserver.observe(parent, { childList: true, subtree: true })
}
// Each view mode has different chrome above the scrolling area, and a reused
// minimap keeps its inline offsets. Reset them before resolving the scroller so
// the pane is already correct while it waits for the editor to mount.
const positionHost = (parent: HTMLElement) => {
  const element = host.value
  if (!element) return
  if (!props.plainText) {
    element.style.top = '0'
    element.style.bottom = '0'
    return
  }
  const content = parent.querySelector('.plain-text-content')?.getBoundingClientRect()
  const bounds = parent.getBoundingClientRect()
  if (!content) return
  element.style.top = `${content.top - bounds.top}px`
  element.style.bottom = `${bounds.bottom - content.bottom}px`
}
const bind = async() => {
  const generation = ++bindGeneration
  textCache = new WeakMap()
  unbind()
  await nextTick()
  if (disconnected || generation !== bindGeneration || !host.value) return
  const parent = host.value.parentElement!
  positionHost(parent)
  const resolved = resolveScroller(parent)
  if (!resolved) {
    waitForScroller(parent, generation)
    return
  }
  scroller = resolved
  scroller.addEventListener('scroll', syncScroll, { passive: true })
  resize = new ResizeObserver(scheduleRebuild)
  resize.observe(host.value)
  resize.observe(scroller.firstElementChild || scroller)
  if (cm) { cm.on('changes', scheduleRebuild); cm.on('cursorActivity', cursorMoved) }
  else {
    mutation = new MutationObserver(() => {
      textCache = new WeakMap()
      scheduleRebuild()
    })
    mutation.observe(scroller, { childList: true, subtree: true, characterData: true })
  }
  rebuild()
}
const scrollTo = (top: number) => { if (scroller) { scroller.scrollTop = top; syncScroll() } }
const cursorMoved = () => requestPaint(true)
const pointerDown = (event: PointerEvent) => {
  if (event.button !== 0 || !host.value || !scroller) return
  event.preventDefault()
  const y = event.clientY - host.value.getBoundingClientRect().top
  const layout = geometry.value
  const inside = y >= layout.sliderTop && y <= layout.sliderTop + layout.sliderHeight
  dragOffset = inside ? y - layout.sliderTop : layout.sliderHeight / 2
  dragging.value = true
  if (event.isTrusted) host.value.setPointerCapture(event.pointerId)
  if (!inside) scrollTo(minimapScrollTarget(y, layout, documentHeight.value, viewportHeight.value))
}
const pointerMove = (event: PointerEvent) => {
  if (!dragging.value || !host.value) return
  const y = event.clientY - host.value.getBoundingClientRect().top - dragOffset
  const travel = Math.max(1, Math.min(height.value, geometry.value.contentHeight) - geometry.value.sliderHeight)
  scrollTo(Math.max(0, Math.min(1, y / travel)) * geometry.value.scrollRange)
}
const pointerUp = () => { dragging.value = false }
const wheel = (event: WheelEvent) => { if (scroller) scrollTo(scroller.scrollTop + event.deltaY * (event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? viewportHeight.value : 1)) }
const keydown = (event: KeyboardEvent) => {
  if (!scroller) return
  const keys: Record<string, number> = { ArrowDown: 40, ArrowUp: -40, PageDown: viewportHeight.value, PageUp: -viewportHeight.value, Home: -Infinity, End: Infinity }
  if (!(event.key in keys)) return
  event.preventDefault()
  scrollTo(event.key === 'Home' ? 0 : event.key === 'End' ? geometry.value.scrollRange : scrollTop.value + keys[event.key])
}
watch(() => [currentFile.value?.id, props.plainText, props.sourceCode], bind, { flush: 'post' })
watch(() => [preferences.minimapSize, preferences.minimapScale, preferences.minimapRenderCharacters, preferences.minimapMaxColumn, preferences.theme], () => {
  cachedPalette = undefined
  scheduleRebuild()
})
watch(() => currentFile.value?.searchMatches, () => requestPaint(true))
onMounted(() => {
  if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }: MessageEvent<{ id: number; bitmap: ImageBitmap }>) => {
      const pending = pendingJobs.get(data.id)
      pendingJobs.delete(data.id)
      if (pending && tiles.get(pending.index) === pending.tile) {
        const context = pending.tile.canvas.getContext('bitmaprenderer')
        if (context) context.transferFromImageBitmap(data.bitmap)
        else {
          pending.tile.canvas.getContext('2d')?.drawImage(data.bitmap, 0, 0)
          data.bitmap.close()
        }
        pending.tile.canvas.dataset.renderer = 'worker'
        pending.tile.ready = true
      } else data.bitmap.close()
      requestPaint(true)
    }
    worker.onerror = () => {
      worker?.terminate()
      worker = null
      pendingJobs.clear()
      for (const tile of tiles.values()) tile.job = 0
      requestPaint(true)
    }
  }
  bind()
})
onBeforeUnmount(() => {
  disconnected = true
  worker?.terminate()
  pendingJobs.clear()
  tiles.clear()
  unbind()
  clearTimeout(rebuildTimer)
  clearTimeout(scrollTimer)
  cancelAnimationFrame(frame)
})
</script>

<style>
.editor-minimap { position: absolute; top: 0; right: 12px; bottom: 0; width: var(--minimap-width, 100px); z-index: 4; color: var(--editorColor); background: transparent; overflow: hidden; touch-action: none; user-select: none; cursor: pointer; }
.editor-minimap .minimap-overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.minimap-tiles { position: absolute; inset: 0; pointer-events: none; }
.minimap-slider { position: absolute; top: 0; left: 0; right: 0; background: rgb(110 120 135 / 14%); border-left: 2px solid var(--themeColor); opacity: 0; pointer-events: none; }
.editor-minimap:hover .minimap-slider, .editor-minimap:focus-visible .minimap-slider, .editor-minimap.slider-always .minimap-slider, .editor-minimap.dragging .minimap-slider { opacity: 1; }
.editor-minimap.auto-hover:not(:hover):not(:focus-visible):not(.dragging), .editor-minimap.auto-scroll:not(.scrolling):not(:hover):not(:focus-visible):not(.dragging) { opacity: 0; }
.minimap-close { position: absolute; right: 2px; top: 2px; border: 0; border-radius: 3px; font: 14px sans-serif; cursor: pointer; background: var(--floatBgColor); color: var(--editorColor); opacity: 0; }
.editor-minimap:hover .minimap-close, .editor-minimap:focus-within .minimap-close { opacity: 1; }
</style>
