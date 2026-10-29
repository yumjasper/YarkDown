<template>
  <div
    v-if="image"
    ref="overlay"
    class="pdf-image-lightbox"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    :aria-label="label('图片预览', 'Image preview')"
    @pointerdown.self="close"
    @keydown="handleKey"
    @wheel.prevent="wheel"
  >
    <div
      class="pdf-image-stage"
      @pointerdown.self="close"
    >
      <img
        :src="image.url"
        :alt="label('PDF 中的图片', 'Image from the PDF')"
        :style="imageStyle"
        draggable="false"
        @error="failed = true"
        @load="failed = false"
        @pointerdown.prevent="startPan"
        @dblclick.prevent="reset"
      >
      <p
        v-if="failed"
        class="pdf-image-error"
        role="alert"
      >
        {{ label('图片无法显示，请重试或改用「提取这张图」。', 'The image could not be displayed. Try again or use "Extract image".') }}
      </p>
    </div>
    <div class="pdf-image-toolbar">
      <span class="pdf-image-page">
        {{ label('第', 'Page') }} {{ image.page }} · {{ Math.round(zoom * 100) }}%
      </span>
      <button
        :aria-label="label('缩小', 'Zoom out')"
        :title="label('缩小', 'Zoom out')"
        @click="zoomBy(1 / 1.25)"
      >
        <pdf-icon name="zoomOut" />
      </button>
      <button
        :aria-label="label('放大', 'Zoom in')"
        :title="label('放大', 'Zoom in')"
        @click="zoomBy(1.25)"
      >
        <pdf-icon name="zoomIn" />
      </button>
      <button
        :aria-label="label('原始大小', 'Reset zoom')"
        :title="label('原始大小（也可双击图片）', 'Reset zoom (or double-click the image)')"
        @click="reset"
      >
        <pdf-icon name="fullscreen" />
      </button>
      <button
        :disabled="exporting"
        :aria-label="label('提取这张图', 'Extract this image')"
        :title="label('提取这张图并另存为 PNG', 'Extract this image as a PNG')"
        @click="$emit('export')"
      >
        <pdf-icon name="export" />
        <span>{{ exporting ? label('正在保存…', 'Saving…') : label('提取这张图', 'Extract image') }}</span>
      </button>
      <button
        :aria-label="label('关闭', 'Close')"
        :title="label('关闭', 'Close')"
        @click="close"
      >
        <pdf-icon name="close" />
      </button>
    </div>
    <p
      v-if="message"
      class="pdf-image-message"
      role="status"
    >
      {{ message }}
    </p>
  </div>
</template>

<script lang="ts">
export interface PdfLightboxImage {
  url: string
  page: number
  width: number
  height: number
}
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import PdfIcon from './pdfIcon.vue'

const props = defineProps<{
  image: PdfLightboxImage | null
  exporting?: boolean
  message?: string
}>()
const emit = defineEmits<{ close: []; export: [] }>()
const { locale } = useI18n()
const label = (zh: string, en: string) => (locale.value.startsWith('zh') ? zh : en)

const MIN_ZOOM = 0.2
const MAX_ZOOM = 12
const zoom = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const failed = ref(false)
let drag: { x: number; y: number; offsetX: number; offsetY: number; pointerId: number } | null = null

const imageStyle = computed(() => ({
  transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(${zoom.value})`
}))

const reset = () => {
  zoom.value = 1
  offsetX.value = 0
  offsetY.value = 0
}

const zoomBy = (factor: number) => {
  zoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom.value * factor))
  if (zoom.value <= 1) {
    offsetX.value = 0
    offsetY.value = 0
  }
}

const close = () => emit('close')

const handleKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close()
  } else if (event.key === '+' || event.key === '=') {
    event.preventDefault()
    zoomBy(1.25)
  } else if (event.key === '-') {
    event.preventDefault()
    zoomBy(1 / 1.25)
  } else if (event.key === '0') {
    event.preventDefault()
    reset()
  }
}

const startPan = (event: PointerEvent) => {
  drag = { x: event.clientX, y: event.clientY, offsetX: offsetX.value, offsetY: offsetY.value, pointerId: event.pointerId }
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', movePan)
  window.addEventListener('pointerup', endPan)
  window.addEventListener('pointercancel', endPan)
}

const movePan = (event: PointerEvent) => {
  if (!drag || event.pointerId !== drag.pointerId) return
  offsetX.value = drag.offsetX + event.clientX - drag.x
  offsetY.value = drag.offsetY + event.clientY - drag.y
}

const endPan = () => {
  drag = null
  window.removeEventListener('pointermove', movePan)
  window.removeEventListener('pointerup', endPan)
  window.removeEventListener('pointercancel', endPan)
}

const wheel = (event: WheelEvent) => {
  if (!props.image) return
  zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15)
}

const overlay = ref<HTMLElement | null>(null)
watch(
  () => props.image,
  async image => {
    reset()
    failed.value = false
    await nextTick()
    // Focus the dialog so Escape and the zoom shortcuts work without a click.
    if (image) overlay.value?.focus()
  }
)
onBeforeUnmount(endPan)
</script>

<style scoped>
.pdf-image-lightbox {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  background: #0b0b0bcc;
  backdrop-filter: blur(2px);
  outline: none;
}
.pdf-image-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: grab;
}
.pdf-image-stage img {
  max-width: 92%;
  max-height: 88%;
  object-fit: contain;
  box-shadow: 0 8px 32px #0008;
  background: #fff;
  transition: transform 80ms ease-out;
  user-select: none;
  touch-action: none;
}
.pdf-image-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  color: #f4f4f4;
  background: #1b1b1b;
  border-top: 1px solid #ffffff1f;
  font: 12px var(--uiFontFamily);
}
.pdf-image-toolbar button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 30px;
  height: 30px;
  padding: 5px 8px;
  color: inherit;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 5px;
  font: inherit;
  cursor: pointer;
}
.pdf-image-toolbar button:hover:not(:disabled) {
  background: #ffffff1a;
}
.pdf-image-toolbar button:focus-visible {
  outline: 2px solid var(--themeColor);
  outline-offset: 1px;
}
.pdf-image-toolbar button:disabled {
  opacity: 0.5;
  cursor: default;
}
.pdf-image-page {
  margin-right: auto;
  color: #ffffffb3;
}
.pdf-image-message {
  margin: 0;
  padding: 0 12px 10px;
  color: #ffd8a8;
  font: 12px var(--uiFontFamily);
}
.pdf-image-error {
  position: absolute;
  top: 50%;
  left: 50%;
  max-width: 320px;
  margin: 0;
  padding: 10px 14px;
  color: #fff;
  background: #000000b3;
  border-radius: 6px;
  text-align: center;
  transform: translate(-50%, -50%);
  font: 12px var(--uiFontFamily);
}
</style>
