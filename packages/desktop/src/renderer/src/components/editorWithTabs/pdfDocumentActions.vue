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
    <details>
      <summary
        :aria-label="label('翻译设置', 'Translation settings')"
        :title="label('翻译设置', 'Translation settings')"
      >
        <pdf-icon name="translate" />
      </summary>
      <div class="pdf-translation-settings">
        <label>{{ label('翻译目标语言', 'Translation language') }} <select v-model="translationLanguage"><option value="zh-Hans">中文</option><option value="en">English</option><option value="ja">日本語</option></select></label>
        <button
          :disabled="!pdfDocument"
          @click="translatePage"
        >
          {{ label('用 Bing 翻译本页（在线）', 'Translate page with Bing (online)') }}
        </button>
      </div>
    </details>
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
const printing = ref(false), status = ref(''), translationLanguage = ref('zh-Hans')
const translatePage = async() => {
  try {
    const page = await props.pdfDocument?.getPage(props.page)
    const content = await page?.getTextContent()
    const text = (content?.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('') || '').slice(0, 5000)
    if (!text.trim()) { status.value = label('本页没有可翻译的文字。', 'This page has no text to translate.'); return }
    await window.electron.shell.openExternal(`https://www.bing.com/translator?to=${translationLanguage.value}&text=${encodeURIComponent(text)}`)
  } catch (error) { status.value = String(error) }
}
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
details { position: relative; }
summary { list-style: none; cursor: pointer; padding: 6px; border-radius: 5px; }
summary::-webkit-details-marker { display: none; }
summary:hover, button:hover { background: var(--editorColor10); }
.pdf-translation-settings { position: absolute; z-index: 30; right: 0; top: 32px; width: 230px; padding: 12px; background: var(--editorBgColor); border: 1px solid var(--editorColor10); box-shadow: 0 4px 18px #0003; border-radius: 8px; }
.pdf-translation-settings label { display: flex; gap: 5px; margin-bottom: 10px; }
</style>
