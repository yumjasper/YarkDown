<template>
  <section
    class="pdf-tool-workspace"
    :aria-label="label('PDF 工具工作区', 'PDF tools workspace')"
  >
    <nav :aria-label="label('PDF 功能', 'PDF features')">
      <button
        v-for="item in groups"
        :key="item.id"
        :aria-pressed="group === item.id"
        :aria-label="item.name"
        :title="item.name"
        @click="selectGroup(item.id)"
      >
        <pdf-icon :name="item.id" />
      </button>
      <button
        v-if="group"
        class="close"
        :aria-label="label('收起工具面板', 'Close tools panel')"
        @click="group = ''"
      >
        <pdf-icon name="close" />
      </button>
    </nav>
    <div
      v-if="group"
      class="tool-panel"
    >
      <template v-if="group === 'fill'">
        <button
          :disabled="!editable"
          :aria-label="label('读取表单字段', 'Read form fields')"
          :title="label('读取表单字段', 'Read form fields')"
          @click="inspectFields"
        >
          <pdf-icon name="outline" />
        </button>
        <p>
          {{
            label(
              '填写文字、手绘签名与保存统一使用主工具栏的题注、手写画笔和保存图标。手绘签名不是证书数字签名。',
              'Drawn signatures are not certificate signatures. XFA and encrypted/signed files are not edited; use Add fill text for CJK.'
            )
          }}
        </p>
        <div
          v-for="field in fields"
          :key="field.name"
          class="form-field"
        >
          <label :for="`pdf-field-${field.name}`">{{ field.name }}</label>
          <input
            v-if="field.type === 'checkbox'"
            :id="`pdf-field-${field.name}`"
            type="checkbox"
            :checked="field.value === true"
            :disabled="!editable"
            @change="setField(field, ($event.target as HTMLInputElement).checked)"
          >
          <select
            v-else-if="field.options.length"
            :id="`pdf-field-${field.name}`"
            :value="field.value"
            :disabled="!editable"
            @change="setField(field, ($event.target as HTMLSelectElement).value)"
          >
            <option
              value=""
              disabled
            >
              {{ label('请选择', 'Select') }}
            </option>
            <option
              v-for="option in field.options"
              :key="option"
              :value="option"
            >
              {{ option }}
            </option>
          </select>
          <input
            v-else
            :id="`pdf-field-${field.name}`"
            :value="field.value"
            :disabled="!editable"
            maxlength="20000"
            @input="setField(field, ($event.target as HTMLInputElement).value)"
          >
        </div>
      </template>
      <template v-if="group === 'edit'">
        <pdf-advanced-tools
          :file="file"
          :page="page"
          mode="edit"
          :enabled="contentEditable"
          :viewer="viewer"
        />
        <details class="append-tools">
          <summary>{{ label('添加文字或图片（高级）', 'Add text or images (advanced)') }}</summary>
          <p>
            {{
              label(
                '追加页面文字/图片，不改写原正文；不是遮盖删除或安全涂黑。新增文字以图片外观写入，暂不可搜索。',
                'Append page text/images without rewriting original content. This is not redaction. Added text uses raster appearance and is not searchable.'
              )
            }}
          </p>
          <label>{{ label('文字', 'Text') }} <input
            v-model="text"
            maxlength="2000"
          ></label>
          <label>{{ label('字号', 'Font size') }}
            <input
              v-model.number="fontSize"
              type="number"
              min="8"
              max="72"
            ></label>
          <label>{{ label('距左边 (pt)', 'Left (pt)') }}
            <input
              v-model.number="left"
              type="number"
              min="0"
            ></label>
          <label>{{ label('距顶边 (pt)', 'Top (pt)') }} <input
            v-model.number="top"
            type="number"
            min="0"
          ></label>
          <button
            :disabled="!contentEditable || !text.trim()"
            :aria-label="label('追加文字到本页', 'Append text to page')"
            :title="label('追加文字到本页', 'Append text to page')"
            @click="addText"
          >
            <pdf-icon name="FreeText" />
          </button>
          <label>{{ label('图片宽度 (pt)', 'Image width (pt)') }}
            <input
              v-model.number="imageWidth"
              type="number"
              min="10"
              max="1000"
            ></label>
          <label>{{ label('添加 PNG/JPEG 图片', 'Add PNG/JPEG image') }}
            <input
              type="file"
              accept="image/png,image/jpeg"
              :disabled="!contentEditable"
              @change="addImage"
            ></label>
        </details>
      </template>
      <template v-if="group === 'export'">
        <pdf-advanced-tools
          :file="file"
          :page="page"
          mode="export"
          :enabled="!!pdfDocument && !busy && !exportRestriction"
        />
        <select
          v-model="exportKind"
          :aria-label="label('PDF 导出格式', 'PDF export format')"
        >
          <option value="txt">
            {{ label('纯文本（全部页面）', 'Text (all pages)') }}
          </option>
          <option value="docx">
            {{ label('Word（文字重排）', 'Word (reflowed text)') }}
          </option>
          <option value="png">
            {{ label('PNG（当前页面）', 'PNG (current page)') }}
          </option>
        </select>
        <button
          :disabled="!pdfDocument || busy || !!exportRestriction"
          :aria-label="label('导出文件', 'Export file')"
          :title="label('导出文件', 'Export file')"
          @click="exportDocument"
        >
          <pdf-icon name="export" />
        </button>
        <p>
          {{
            label(
              '下方是纯文本/图片导出；保留版式请使用上方本地转换，扫描件请先 OCR。',
              'The exports below are text/image exports. Use local conversion above for layout; run OCR for scans first.'
            )
          }}
        </p>
      </template>
      <template v-if="group === 'create'">
        <label>{{ label('A4 空白页数', 'Blank A4 pages') }}
          <input
            v-model.number="blankPages"
            type="number"
            min="1"
            max="100"
          ></label>
        <button
          :disabled="busy"
          :aria-label="label('创建空白 PDF', 'Create blank PDF')"
          :title="label('创建空白 PDF', 'Create blank PDF')"
          @click="createBlank"
        >
          <pdf-icon name="create" />
        </button>
        <label>{{ label('按选择顺序从图片创建 PDF', 'Create PDF from selected images') }}
          <input
            type="file"
            accept="image/png,image/jpeg"
            multiple
            :disabled="busy"
            @change="createImages"
          ></label>
        <p>
          {{
            label(
              'Markdown 可使用应用现有“导出 PDF”。Office、网页和扫描创建尚未接入。',
              'Use the existing Export PDF for Markdown. Office, web and scanner conversion are not integrated yet.'
            )
          }}
        </p>
      </template>
      <p
        v-if="group === 'edit' && contentRestriction"
        role="status"
      >
        {{ contentRestriction }}
      </p>
      <p
        v-if="group === 'export' && exportRestriction"
        role="status"
      >
        {{ exportRestriction }}
      </p>
      <p
        v-if="restriction && ['comment', 'fill', 'edit'].includes(group)"
        role="status"
      >
        {{ restriction }}
      </p>
      <p
        v-if="status"
        role="status"
        aria-live="polite"
      >
        {{ status }}
      </p>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs'
import type { IFileState } from '@shared/types/files'
import type { PdfAnnotation, PdfAnnotationKind, PdfCreateRequest } from '@shared/pdf'
import { useEditorStore } from '@/store/editor'
import { editablePdfFields, type PdfWorkspaceField } from '@/util/pdfFormFields'
import PdfAdvancedTools from './pdfAdvancedTools.vue'
import PdfIcon from './pdfIcon.vue'

const props = defineProps<{
  file: IFileState
  pdfDocument?: PDFDocumentProxy
  viewer?: PDFViewer
  page: number
  restriction: string
  contentRestriction: string
  exportRestriction: string
}>()
const emit = defineEmits<{
  group: [value: string]
  tool: [kind: PdfAnnotationKind]
  appearance: [
    page: number,
    rect: PdfAnnotation['rect'],
    image: string,
    text: string,
    asContent: boolean
  ]
}>()
const store = useEditorStore()
const { locale } = useI18n()
const label = (zh: string, en: string) => (locale.value.startsWith('zh') ? zh : en)
const group = ref(''),
  busy = ref(false),
  status = ref('')
const groups = computed(() => [
  { id: 'fill', name: label('填写和签名', 'Fill & sign') },
  { id: 'edit', name: label('编辑 PDF', 'Edit PDF') },
  { id: 'export', name: label('导出 PDF', 'Export PDF') },
  { id: 'create', name: label('创建 PDF', 'Create PDF') }
])
const editable = computed(
  () => !!props.pdfDocument && !props.restriction && !props.file.pdfSaving && !busy.value
)
const contentEditable = computed(() => editable.value && !props.contentRestriction)
const selectGroup = (id: string) => {
  group.value = group.value === id ? '' : id
  status.value = ''
}
defineExpose({ closePanel: () => { group.value = '' } })
watch(group, value => emit('group', value))
const fields = ref<PdfWorkspaceField[]>([])
watch(
  () => props.pdfDocument,
  () => {
    fields.value = []
  }
)
const run = async (action: () => Promise<void>) => {
  if (busy.value || props.file.pdfSaving) return
  busy.value = true
  status.value = ''
  try {
    await action()
  } catch (error) {
    status.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}
const inspectFields = () =>
  run(async () => {
    const objects = await props.pdfDocument?.getFieldObjects()
    fields.value = editablePdfFields(objects).map((field) => ({
      ...field,
      value:
        props.file.pdfFormValues?.find((item) => item.name === field.name)?.value ?? field.value
    }))
    status.value = fields.value.length
      ? label(
          `读取到 ${fields.value.length} 个可填写字段。`,
          `Found ${fields.value.length} fillable fields.`
        )
      : label(
          '没有可编辑的 AcroForm 字段，请使用添加填写文字。',
          'No editable AcroForm fields; use Add fill text.'
        )
  })
const setField = (field: PdfWorkspaceField, value: string | boolean) => {
  field.value = value
  const remaining = (props.file.pdfFormValues || []).filter((item) => item.name !== field.name)
  store.SET_PDF_FORM_VALUES(
    props.file.id,
    value === field.original ? remaining : [...remaining, { name: field.name, value }]
  )
}
const text = ref(''),
  fontSize = ref(18),
  left = ref(40),
  top = ref(40),
  imageWidth = ref(180),
  blankPages = ref(1)
const placement = async (width: number, height: number): Promise<PdfAnnotation['rect']> => {
  const page = await props.pdfDocument!.getPage(props.page)
  const [x0, y0, x1, y1] = page.view
  if (
    ![left.value, top.value, width, height].every(Number.isFinite) ||
    left.value < 0 ||
    top.value < 0 ||
    width <= 0 ||
    height <= 0 ||
    left.value + width > x1 - x0 ||
    top.value + height > y1 - y0
  )
    throw new Error(
      label(
        '内容超出页面，请调整位置或尺寸。',
        'Content is outside the page; adjust position or size.'
      )
    )
  return [x0 + left.value, y1 - top.value - height, x0 + left.value + width, y1 - top.value]
}
const addText = () =>
  run(async () => {
    if (props.restriction || props.contentRestriction) return
    if (!Number.isFinite(fontSize.value) || fontSize.value < 8 || fontSize.value > 72)
      throw new Error(label('字号必须为 8–72。', 'Font size must be 8–72.'))
    const lines = text.value.split('\n'),
      canvas = document.createElement('canvas'),
      ctx = canvas.getContext('2d')!
    ctx.font = `${fontSize.value}px "Microsoft YaHei", sans-serif`
    const width = Math.max(10, ...lines.map((line) => ctx.measureText(line).width + 8)),
      height = lines.length * fontSize.value * 1.4 + 8
    const rect = await placement(width, height)
    canvas.width = Math.ceil(width * 2)
    canvas.height = Math.ceil(height * 2)
    ctx.scale(2, 2)
    ctx.font = `${fontSize.value}px "Microsoft YaHei", sans-serif`
    ctx.fillStyle = '#1f2937'
    ctx.textBaseline = 'top'
    lines.forEach((line, index) => ctx.fillText(line, 4, 4 + index * fontSize.value * 1.4))
    emit('appearance', props.page, rect, canvas.toDataURL('image/png'), text.value, true)
    canvas.width = canvas.height = 0
    status.value = label(
      '已追加到草稿，使用保存写入 PDF。',
      'Added to draft; save to write to PDF.'
    )
  })
const addImage = (event: Event) => {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  input.value = ''
  if (!file) return
  void run(async () => {
    if (props.restriction || props.contentRestriction) return
    if (file.size > 20 * 1024 * 1024) throw new Error('Image exceeds 20 MB.')
    const bitmap = await createImageBitmap(file)
    try {
      if (bitmap.width * bitmap.height > 40_000_000) throw new Error('Image exceeds 40 megapixels.')
      const height = (imageWidth.value * bitmap.height) / bitmap.width,
        rect = await placement(imageWidth.value, height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.min(bitmap.width, Math.ceil(imageWidth.value * 2))
      canvas.height = Math.max(1, Math.round((canvas.width * bitmap.height) / bitmap.width))
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const appearance = canvas.toDataURL('image/png')
      if (appearance.length > 3000000)
        throw new Error(label('图片过大，请减小宽度。', 'Image is too large; reduce width.'))
      emit('appearance', props.page, rect, appearance, file.name, true)
      canvas.width = canvas.height = 0
      status.value = label('图片已追加到草稿，请保存。', 'Image added to draft; save the PDF.')
    } finally {
      bitmap.close()
    }
  })
}
const exportKind = ref('txt')
const exportDocument = () =>
  run(async () => {
    const doc = props.pdfDocument
    if (!doc || props.exportRestriction) return
    if (props.file.pdfAnnotations?.length || props.file.pdfFormValues?.length)
      throw new Error(label('请先保存草稿后再导出。', 'Save drafts before exporting.'))
    const destination = await window.electron.ipcRenderer.invoke('mt::dialog::show-save', {
      defaultPath: props.file.filename.replace(/\.pdf$/i, `.${exportKind.value}`),
      filters: [{ name: exportKind.value.toUpperCase(), extensions: [exportKind.value] }]
    })
    if (!destination) return
    let bytes: string | Uint8Array
    if (exportKind.value === 'png') {
      const page = await doc.getPage(props.page),
        initial = page.getViewport({ scale: 1 })
      const scale = Math.min(2, Math.sqrt(8_000_000 / (initial.width * initial.height))),
        viewport = page.getViewport({ scale }),
        canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      try {
        await page.render({ canvas, viewport, background: 'rgb(255,255,255)' }).promise
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((value) =>
            value ? resolve(value) : reject(new Error('PNG encoding failed.'))
          )
        )
        bytes = new Uint8Array(await blob.arrayBuffer())
      } finally {
        canvas.width = canvas.height = 0
      }
    } else {
      const pages: string[] = []
      let size = 0
      for (let index = 1; index <= doc.numPages; index++) {
        if (doc !== props.pdfDocument) throw new Error('PDF changed during export.')
        status.value = `${index} / ${doc.numPages}`
        const content = await (await doc.getPage(index)).getTextContent()
        const extracted = content.items
          .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
          .join('')
        if ((size += extracted.length) > 10_000_000)
          throw new Error('Text export exceeds 10 million characters.')
        pages.push(extracted)
      }
      if (!pages.some((page) => page.trim()))
        throw new Error(
          label(
            '没有可提取文字；扫描件需要 OCR。',
            'No extractable text; scanned pages require OCR.'
          )
        )
      if (exportKind.value === 'docx') {
        const { Document, Packer, Paragraph } = await import('docx')
        const document = new Document({
          sections: pages.map((page) => ({
            children: page.split('\n').map((line) => new Paragraph(line))
          }))
        })
        bytes = new Uint8Array(await (await Packer.toBlob(document)).arrayBuffer())
      } else bytes = pages.join('\n\f\n')
    }
    await window.electron.ipcRenderer.invoke('mt::fs::write-file', destination, bytes)
    status.value = label('导出完成。', 'Export complete.')
  })
const create = async (request: PdfCreateRequest) => {
  const pathname = await window.electron.ipcRenderer.invoke('mt::pdf::create', request)
  if (pathname) {
    window.electron.ipcRenderer.send('mt::open-file', pathname, {})
    status.value = label('PDF 已创建。', 'PDF created.')
  }
}
const createBlank = () => run(() => create({ kind: 'blank', pages: blankPages.value }))
const createImages = (event: Event) => {
  const input = event.target as HTMLInputElement,
    files = Array.from(input.files || [])
  input.value = ''
  if (!files.length) return
  void run(async () => {
    if (files.length > 100 || files.reduce((size, file) => size + file.size, 0) > 100 * 1024 * 1024)
      throw new Error('Select up to 100 images / 100 MB.')
    const images: Uint8Array[] = []
    for (const file of files) images.push(new Uint8Array(await file.arrayBuffer()))
    await create({ kind: 'images', images })
  })
}
</script>
<style scoped>
.pdf-tool-workspace {
  flex: none;
  position: relative;
  font: 12px var(--uiFontFamily);
}
nav {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 0;
}
button,
input,
select {
  color: inherit;
  background: var(--editorBgColor);
  border: 1px solid var(--editorColor10);
  border-radius: 6px;
  padding: 6px 9px;
  font: inherit;
}
button {
  cursor: pointer;
}
button[aria-pressed='true'] {
  color: var(--themeColor);
  background: var(--themeColor20);
}
button:disabled,
input:disabled {
  opacity: 0.45;
  cursor: default;
}
button:focus-visible {
  outline: 2px solid var(--themeColor);
}
.close {
  margin-left: auto;
}
.tool-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  position: absolute;
  right: 0;
  top: 38px;
  z-index: 40;
  width: min(720px, 85vw);
  max-height: 55vh;
  box-sizing: border-box;
  border: 1px solid var(--editorColor10);
  border-radius: 8px;
  box-shadow: 0 5px 24px #0003;
  overflow: auto;
  background: var(--editorBgColor);
}
.tool-panel p {
  width: 100%;
  margin: 3px 0;
  color: var(--editorColor50);
}
.tool-panel label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
input[type='number'] {
  width: 65px;
}
input[type='file'] {
  max-width: 230px;
}
.form-field {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.form-field label {
  min-width: 140px;
}
nav button, .tool-panel button { display: inline-flex; align-items: center; justify-content: center; min-width: 32px; min-height: 32px; padding: 6px; }
</style>
