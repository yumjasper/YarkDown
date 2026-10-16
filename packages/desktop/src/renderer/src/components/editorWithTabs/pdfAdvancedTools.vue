<template>
  <section
    class="advanced-tools"
    :aria-label="label('本地 PDF 高级工具', 'Local advanced PDF tools')"
  >
    <template v-if="mode === 'edit'">
      <span>{{ label('点击页面中的虚线文字框即可编辑', 'Click an outlined text block on the page to edit') }}</span>
      <button
        :disabled="busy || !enabled"
        :aria-label="label('刷新正文', 'Refresh text blocks')"
        :title="label('刷新正文', 'Refresh text blocks')"
        @click="readBlocks"
      >
        <pdf-icon name="reload" />
      </button>
      <details class="engine-info">
        <summary>{{ label('帮助 / 引擎', 'Help / engine') }}</summary>
        <button
          :disabled="busy"
          :aria-label="label('检查本地引擎', 'Check local engine')"
          :title="label('检查本地引擎', 'Check local engine')"
          @click="checkEngine"
        >
          <pdf-icon name="settings" />
        </button>
        <p>{{ label('在原文字块内重排，超出范围会提示。暂不支持跨块或跨页；字体可能替换。扫描页需先 OCR，搜索层不能直接改写扫描图。', 'Reflows within the original block and rejects overflow. No cross-block/page reflow; fonts may be substituted. Scans need OCR; search layers cannot rewrite scanned images.') }}</p>
      </details>
      <Teleport
        v-if="overlayTarget && inspection"
        :to="overlayTarget"
      >
        <div class="pdf-edit-blocks">
          <button
            v-for="block in editableBlocks"
            :key="block.id"
            class="pdf-edit-block"
            :class="{ selected: block.id === blockId }"
            :style="blockStyle(block)"
            :disabled="busy"
            :aria-label="`${label('编辑正文', 'Edit text')}: ${block.text.slice(0, 60)}`"
            :title="block.text.slice(0, 120)"
            @pointerdown.stop
            @click.stop="selectBlock(block.id)"
          />
        </div>
      </Teleport>
      <Teleport
        v-if="selected"
        to="body"
      >
        <form
          class="pdf-text-editor"
          :aria-label="label('正文编辑', 'Text editor')"
          @submit.prevent="editBlock"
          @keydown.ctrl.enter.prevent="editBlock"
          @keydown.meta.enter.prevent="editBlock"
          @keydown.esc.prevent="closeEditor"
        >
          <header>
            <strong>{{ label('编辑正文', 'Edit text') }}</strong><span>{{ label('第', 'Page') }} {{ inspectedPage }} {{ label('页', '') }}</span>
            <button
              type="button"
              :disabled="busy"
              :aria-label="label('关闭正文编辑', 'Close text editor')"
              @click="closeEditor"
            >
              ×
            </button>
          </header>
          <textarea
            ref="textInput"
            v-model="text"
            :disabled="busy"
            maxlength="20000"
            :aria-label="label('修改原正文', 'Edit original text')"
          />
          <footer>
            <label>{{ label('字号 (pt)', 'Font size (pt)') }} <input
              v-model.number="fontSize"
              type="number"
              min="4"
              max="96"
              :disabled="busy"
            ></label>
            <button
              type="button"
              :disabled="busy || !changed"
              :aria-label="label('还原', 'Reset')"
              :title="label('还原', 'Reset')"
              @click="resetText"
            >
              <pdf-icon name="undo" />
            </button>
            <button
              class="primary"
              type="submit"
              :disabled="busy || !enabled || !changed"
              :aria-label="label('保存修改…', 'Save changes…')"
              :title="label('保存修改…', 'Save changes…')"
            >
              <pdf-icon name="save" />
            </button>
          </footer>
          <small>{{ label('Ctrl+Enter 保存；另存为新 PDF，不覆盖原件。', 'Ctrl+Enter saves to a new PDF, leaving the original intact.') }}</small>
          <p
            v-if="message"
            role="status"
            aria-live="polite"
          >
            {{ message }}
          </p>
        </form>
      </Teleport>
    </template>
    <template v-else>
      <button
        :disabled="busy"
        :aria-label="label('检查本地引擎', 'Check local engine')"
        :title="label('检查本地引擎', 'Check local engine')"
        @click="checkEngine"
      >
        <pdf-icon name="settings" />
      </button>
      <button
        :disabled="busy || !enabled"
        :aria-label="label('扫描件 OCR（中英文）', 'Scan OCR (Chinese/English)')"
        :title="label('扫描件 OCR（中英文）', 'Scan OCR (Chinese/English)')"
        @click="ocr"
      >
        <pdf-icon name="export" />
      </button>
      <select
        v-model="kind"
        :disabled="busy"
        :aria-label="label('版式转换格式', 'Layout conversion format')"
      >
        <option value="docx">
          {{ label('Word：段落、表格与图片重建', 'Word: paragraphs, tables and images') }}
        </option>
        <option value="xlsx">
          {{ label('Excel：提取表格', 'Excel: extract tables') }}
        </option>
        <option value="pptx">
          {{ label('PowerPoint：整页图片保留外观', 'PowerPoint: page images preserve appearance') }}
        </option>
      </select>
      <button
        :disabled="busy || !enabled"
        :aria-label="label('本地版式转换', 'Local layout conversion')"
        :title="label('本地版式转换', 'Local layout conversion')"
        @click="convert"
      >
        <pdf-icon name="export" />
      </button>
      <p>{{ label('OCR 仅处理没有文字层的页面，扫描图不变。Word 复杂版式需核对；Excel 仅表格；PowerPoint 页面为图片。全部本地执行。', 'OCR processes pages without text layers; scans remain intact. Review complex Word layouts. Excel exports tables; PowerPoint uses page images. All processing is local.') }}</p>
    </template>
    <span v-if="capabilities">{{ capabilities.available ? `PyMuPDF ${capabilities.version}` : capabilities.error }}</span>
    <p
      v-if="message && !selected"
      role="status"
      aria-live="polite"
    >
      {{ message }}
    </p>
  </section>
</template>
<script setup lang="ts">
import PdfIcon from './pdfIcon.vue'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs'
import type { IFileState } from '@shared/types/files'
import type { PdfAdvancedCapabilities, PdfAdvancedRequest, PdfBlockInspection, PdfTextBlock } from '@shared/pdf'
import { useEditorStore } from '@/store/editor'

const props = defineProps<{ file: IFileState; page: number; mode: 'edit' | 'export'; enabled: boolean; viewer?: PDFViewer }>()
const store = useEditorStore()
const { locale } = useI18n()
const label = (zh: string, en: string) => locale.value.startsWith('zh') ? zh : en
const busy = ref(false)
const message = ref('')
const capabilities = ref<PdfAdvancedCapabilities>()
const inspection = ref<PdfBlockInspection>()
const inspectedPage = ref(0)
const blockId = ref(-1)
const text = ref('')
const fontSize = ref(12)
const textInput = ref<HTMLTextAreaElement>()
const kind = ref<'docx' | 'xlsx' | 'pptx'>('docx')
const overlayTarget = shallowRef<HTMLElement>()
const layoutVersion = ref(0)
let version = 0
let disposed = false
const selected = computed(() => inspection.value?.blocks.find(block => block.id === blockId.value))
const editableBlocks = computed(() => inspection.value?.blocks.filter(block => block.editable) || [])
const changed = computed(() => !!selected.value && (text.value !== selected.value.text || fontSize.value !== selected.value.fontSize))
const resetText = () => {
  text.value = selected.value?.text || ''
  fontSize.value = selected.value?.fontSize || 12
}
const discardAllowed = () => !changed.value || window.confirm(label('放弃尚未保存的正文修改？', 'Discard unsaved text edits?'))
const closeEditor = () => { if (!busy.value && discardAllowed()) blockId.value = -1 }
const selectBlock = async (id: number) => {
  if (busy.value || (id !== blockId.value && !discardAllowed())) return
  blockId.value = id
  resetText()
  message.value = ''
  await nextTick()
  textInput.value?.focus()
}
const updateLayout = () => {
  const page = props.viewer?.getPageView(inspectedPage.value - 1)?.div
  if (page && (!overlayTarget.value?.isConnected || overlayTarget.value.parentElement !== page)) {
    overlayTarget.value?.remove()
    const host = document.createElement('div')
    host.className = 'pdf-text-edit-host'
    page.appendChild(host)
    overlayTarget.value = host
  }
  layoutVersion.value++
}
const blockStyle = (block: PdfTextBlock) => {
  void layoutVersion.value
  const view = props.viewer?.getPageView(inspectedPage.value - 1)
  if (!view?.pdfPage) return {}
  const [x0, , , y1] = view.pdfPage.view
  const viewport = view.pdfPage.getViewport({ scale: view.viewport.scale, rotation: view.viewport.rotation })
  const [left, top] = viewport.convertToViewportPoint(x0 + block.rect[0], y1 - block.rect[1])
  const [right, bottom] = viewport.convertToViewportPoint(x0 + block.rect[2], y1 - block.rect[3])
  return { left: `${Math.min(left, right)}px`, top: `${Math.min(top, bottom)}px`, width: `${Math.abs(right - left)}px`, height: `${Math.abs(bottom - top)}px` }
}
watch(() => props.viewer, (viewer, _previous, onCleanup) => {
  if (!viewer || props.mode !== 'edit') return
  const events = viewer.eventBus
  events.on('pagerendered', updateLayout)
  events.on('scalechanging', updateLayout)
  events.on('rotationchanging', updateLayout)
  onCleanup(() => {
    events.off('pagerendered', updateLayout)
    events.off('scalechanging', updateLayout)
    events.off('rotationchanging', updateLayout)
  })
}, { immediate: true })
const run = async (action: () => Promise<void>) => {
  if (busy.value) return
  busy.value = true
  message.value = label('正在本地处理…', 'Processing locally…')
  try { await action() } catch (error) { message.value = error instanceof Error ? error.message : String(error) }
  finally { busy.value = false }
}
const checkEngine = () => run(async () => {
  capabilities.value = await window.electron.ipcRenderer.invoke('mt::pdf::engine-capabilities')
  message.value = capabilities.value.available ? label('本地引擎可用。', 'Local engine ready.') : capabilities.value.error || 'Engine unavailable.'
})
const ensureSaved = async () => {
  if (props.file.pdfSaving) throw new Error(label('PDF 正在保存。', 'PDF is being saved.'))
  if ((props.file.pdfAnnotations?.length || props.file.pdfFormValues?.length) && !await store.SAVE_PDF(props.file))
    throw new Error(label('请先保存 PDF 后重试。', 'Save the PDF before retrying.'))
}
const loadBlocks = async (page: number, pathname: string, generation: number) => {
  const result = await window.electron.ipcRenderer.invoke('mt::pdf::inspect-blocks', pathname, page)
  if (disposed || generation !== version || pathname !== props.file.pathname) return
  inspection.value = result
  inspectedPage.value = page
  blockId.value = -1
  updateLayout()
  message.value = result.blocks.some(block => block.editable)
    ? label('点击页面中的文字框开始编辑。', 'Click a text block on the page to edit.')
    : label('本页没有可直接编辑的正文；扫描图或 OCR 搜索层不能直接改写。', 'No editable text on this page; scans and invisible OCR layers cannot be rewritten directly.')
}
const readBlocks = () => {
  if (busy.value || !discardAllowed()) return
  const generation = ++version
  void run(async () => {
    await ensureSaved()
    await loadBlocks(props.page, props.file.pathname, generation)
  })
}
watch(() => [props.page, props.file.pathname, props.enabled, props.viewer] as const, async (_value, _old, onCleanup) => {
  const generation = ++version
  let canceled = false
  onCleanup(() => { canceled = true })
  if (props.mode !== 'edit' || !props.enabled || !props.viewer || changed.value) return
  // Page changes during inference invalidate its result; defer the next request until the worker exits.
  while (busy.value && !canceled) await new Promise(resolve => setTimeout(resolve, 50))
  if (canceled || disposed) return
  inspection.value = undefined
  blockId.value = -1
  await run(async () => {
    await ensureSaved()
    await loadBlocks(props.page, props.file.pathname, generation)
  })
}, { immediate: true })
const execute = async (request: PdfAdvancedRequest) => {
  if (!props.enabled) return
  await ensureSaved()
  const result = await window.electron.ipcRenderer.invoke('mt::pdf::advanced', request)
  message.value = result?.message || label('已取消，修改仍保留。', 'Canceled; edits are retained.')
  if (result && request.action !== 'convert') {
    version++
    inspection.value = undefined
    blockId.value = -1
    window.electron.ipcRenderer.send('mt::open-file', result.pathname, {})
  }
}
const editBlock = () => {
  if (!changed.value) return
  void run(async () => {
    if (!selected.value || !inspection.value) return
    await execute({ action: 'edit', pathname: props.file.pathname, page: inspectedPage.value, blockId: selected.value.id, text: text.value, fontSize: fontSize.value, sourceHash: inspection.value.sourceHash })
  })
}
const ocr = () => run(() => execute({ action: 'ocr', pathname: props.file.pathname }))
const convert = () => run(() => execute({ action: 'convert', pathname: props.file.pathname, kind: kind.value }))
onBeforeUnmount(() => { disposed = true; version++; overlayTarget.value?.remove() })
</script>
<style scoped>
.advanced-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; width: 100%; padding: 4px 0; }
button, select, input, textarea { font: inherit; color: inherit; background: var(--editorBgColor); border: 1px solid var(--editorColor10); border-radius: 6px; padding: 6px; }
button { cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
p { width: 100%; margin: 0; color: var(--editorColor50); }
input { width: 60px; }
select { max-width: 100%; }
.engine-info { margin-left: auto; max-width: 500px; }
summary { cursor: pointer; }
.pdf-edit-blocks { position: absolute; inset: 0; z-index: 6; pointer-events: none; }
.pdf-edit-block { position: absolute; pointer-events: auto; border: 1px dashed #36a97b; border-radius: 2px; background: transparent; padding: 0; cursor: text; }
.pdf-edit-block:hover, .pdf-edit-block.selected { background: #36a97b20; border: 2px solid #36a97b; }
.pdf-text-editor { position: fixed; z-index: 10000; right: 24px; bottom: 28px; width: min(360px, calc(100vw - 48px)); padding: 14px; color: var(--editorColor); background: var(--editorBgColor); border: 1px solid var(--editorColor10); border-radius: 10px; box-shadow: 0 6px 32px #0003; font: 13px var(--uiFontFamily); }
.pdf-text-editor header, .pdf-text-editor footer { display: flex; gap: 8px; align-items: center; }
.pdf-text-editor header button { margin-left: auto; }
.pdf-text-editor textarea { box-sizing: border-box; width: 100%; min-height: 130px; max-height: 35vh; resize: vertical; margin: 10px 0; line-height: 1.6; }
.pdf-text-editor .primary { background: #36a97b; color: white; margin-left: auto; }
.pdf-text-editor small { display: block; margin-top: 8px; color: var(--editorColor50); }
.pdf-text-editor p { margin-top: 8px; max-height: 100px; overflow: auto; }
</style>
