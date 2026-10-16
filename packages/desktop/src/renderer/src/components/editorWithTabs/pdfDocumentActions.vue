<template>
  <div class="pdf-document-actions">
    <button
      :disabled="!pdfDocument || printing"
      :aria-label="label('打印', 'Print')"
      :title="label('打印', 'Print')"
      @click="print"
    >
      <pdf-icon name="print" />
    </button>
    <button
      :aria-label="label('OpenCode 翻译设置', 'OpenCode translation setup')"
      :title="label('OpenCode 翻译设置', 'OpenCode translation setup')"
      @click="$emit('translation')"
    >
      <pdf-icon name="translate" />
    </button>
    <span
      v-if="status"
      role="status"
    >{{ status }}</span>
  </div>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { IFileState } from '@shared/types/files'
import { useEditorStore } from '@/store/editor'
import PdfIcon from './pdfIcon.vue'
import bus from '@/bus'
const props = defineProps<{ pdfDocument?: PDFDocumentProxy; page: number; file: IFileState }>()
const { locale } = useI18n()
const label = (zh: string, en: string) => locale.value.startsWith('zh') ? zh : en
const store = useEditorStore()
defineEmits<{ translation: [] }>()
const printing = ref(false), status = ref('')
const print = async() => {
  if (printing.value || !props.pdfDocument) return
  printing.value = true; status.value = ''
  try {
    if (!await store.SAVE_PDF(props.file)) return
    await window.electron.ipcRenderer.invoke('mt::pdf::print', props.file.pathname)
  } catch (error) { status.value = String(error) }
  finally { printing.value = false }
}
const requestedPrint = (id: unknown) => { if (id === props.file.id) void print() }
bus.on('pdf-print', requestedPrint)
onBeforeUnmount(() => bus.off('pdf-print', requestedPrint))
</script>
<style scoped>
.pdf-document-actions { display: flex; align-items: center; gap: 3px; font-size: 12px; }
button, select { color: inherit; background: transparent; border: 1px solid var(--editorColor10); border-radius: 5px; font: inherit; padding: 6px; cursor: pointer; }
button:disabled { opacity: .4; cursor: default; }
</style>
