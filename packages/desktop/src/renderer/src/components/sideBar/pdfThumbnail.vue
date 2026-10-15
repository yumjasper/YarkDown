<template>
  <button
    ref="element"
    class="pdf-thumbnail"
    :class="{ current }"
    :data-render-state="state"
    :aria-label="`${label} ${pageNumber}`"
    :title="error || `${label} ${pageNumber}`"
    @click="activate"
  >
    <div class="pdf-thumbnail-preview">
      <canvas
        v-show="state === 'ready'"
        ref="canvas"
        width="1"
        height="1"
      />
      <span
        v-if="state === 'error'"
        role="alert"
      >{{
        message('缩略图生成失败，点击重试', 'Thumbnail failed. Click to retry.')
      }}</span>
      <span
        v-else-if="state !== 'ready'"
        role="status"
      >{{
        message('正在生成…', 'Generating…')
      }}</span>
    </div>
    <span>{{ pageNumber }}</span>
  </button>
</template>
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
const emit = defineEmits<{ navigate: [page: number] }>()
const props = defineProps<{
  pdfDocument: PDFDocumentProxy
  pageNumber: number
  current: boolean
  label: string
}>()
const { locale } = useI18n()
const message = (zh: string, en: string) => (locale.value.startsWith('zh') ? zh : en)
const element = ref<HTMLButtonElement>(),
  canvas = ref<HTMLCanvasElement>()
const state = ref('idle'),
  error = ref('')
let observer: IntersectionObserver | undefined
let renderTask: RenderTask | undefined
let generation = 0
let disposed = false
const render = async () => {
  const request = ++generation
  renderTask?.cancel()
  state.value = 'loading'
  error.value = ''
  try {
    const page = await props.pdfDocument.getPage(props.pageNumber)
    if (request !== generation || disposed) return
    const viewport = page.getViewport({ scale: 140 / page.getViewport({ scale: 1 }).width })
    // A cancelled render may still own its canvas until its promise settles.
    const staging = document.createElement('canvas')
    staging.width = Math.ceil(viewport.width)
    staging.height = Math.ceil(viewport.height)
    const task = page.render({ canvas: staging, viewport })
    renderTask = task
    await task.promise
    if (request !== generation || disposed || !canvas.value) return
    const ctx = canvas.value.getContext('2d')
    if (!ctx) throw new Error('Canvas context unavailable')
    canvas.value.width = staging.width
    canvas.value.height = staging.height
    ctx.drawImage(staging, 0, 0)
    state.value = 'ready'
  } catch (reason) {
    if (request !== generation || disposed) return
    error.value = reason instanceof Error ? reason.message : String(reason)
    state.value = 'error'
  }
}
const activate = () => {
  if (state.value === 'error') void render()
  else emit('navigate', props.pageNumber)
}
onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.at(-1)?.isIntersecting) void render()
      else {
        generation++
        renderTask?.cancel()
        state.value = 'idle'
        if (canvas.value) {
          canvas.value.width = 1
          canvas.value.height = 1
        }
      }
    },
    { root: element.value?.closest('.pdf-navigation-scroll'), rootMargin: '200px' }
  )
  if (element.value) observer.observe(element.value)
})
onBeforeUnmount(() => {
  disposed = true
  generation++
  observer?.disconnect()
  renderTask?.cancel()
})
</script>
<style scoped>
.pdf-thumbnail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 210px;
  padding: 8px;
  border: 2px solid transparent;
  border-radius: 5px;
  background: var(--editorColor04);
  color: inherit;
  cursor: pointer;
}
.pdf-thumbnail.current {
  border-color: var(--themeColor);
}
.pdf-thumbnail-preview {
  min-height: 180px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pdf-thumbnail-preview span {
  font-size: 12px;
  padding: 12px;
  color: var(--editorColor50);
}
.pdf-thumbnail-preview [role='alert'] {
  color: var(--themeColor);
}
canvas {
  max-width: 140px;
  max-height: 210px;
  background: white;
}
</style>
