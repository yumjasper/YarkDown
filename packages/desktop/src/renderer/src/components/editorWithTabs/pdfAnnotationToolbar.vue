<template>
  <div
    class="pdf-annotation-tools"
    role="toolbar"
    :aria-label="label('PDF 批注', 'PDF annotations')"
  >
    <div class="tool-group">
      <button
        v-for="item in tools"
        :key="item.kind"
        :disabled="['Select', 'Hand'].includes(item.kind) ? !ready : !editable"
        :aria-label="label(item.zh, item.en)"
        :title="label(item.zh, item.en)"
        :aria-pressed="tool === item.kind"
        :class="{ active: tool === item.kind }"
        @mousedown.prevent
        @click="$emit('tool', item.kind)"
      >
        <pdf-icon :name="item.kind" />
      </button>
    </div>
    <div
      class="pdf-marker-presets tool-group"
      :aria-label="label('多色记号笔', 'Marker presets')"
    >
      <button
        v-for="swatch in palette"
        :key="swatch"
        :style="{ '--marker-color': swatch }"
        :disabled="!editable"
        :aria-label="`${label('使用记号笔', 'Use marker')} ${swatch}`"
        :title="`${label('使用记号笔', 'Use marker')} ${swatch}`"
        :aria-pressed="tool === 'Highlight' && color === swatch"
        @mousedown.prevent
        @click="$emit('marker', swatch)"
      >
        <pdf-icon name="Highlight" />
      </button>
    </div>
    <details class="pdf-marker-settings">
      <summary
        :aria-label="label('记号笔设置', 'Marker settings')"
        :title="label('记号笔设置', 'Marker settings')"
      >
        <pdf-icon name="settings" />
      </summary>
      <div class="settings-panel">
        <label>{{ label('粗细', 'Thickness') }} <input
          :value="markerWidth"
          type="range"
          min="4"
          max="30"
          :aria-label="label('记号笔粗细', 'Marker thickness')"
          @input="$emit('width', Number(($event.target as HTMLInputElement).value))"
        ></label>
        <svg
          width="190"
          height="40"
          viewBox="0 0 190 40"
        ><path
          d="M 8 26 Q 50 0 95 22 T 182 16"
          fill="none"
          :stroke="color"
          :stroke-width="markerWidth"
          stroke-linecap="round"
          opacity=".6"
        /></svg>
        <label><input
          :checked="textOnly"
          type="checkbox"
          @change="$emit('textOnly', ($event.target as HTMLInputElement).checked)"
        >{{ label('仅文本突出显示', 'Text highlights only') }}</label>
        <small>{{ label('5 个固定色 + 1 个自定义色，最多 6 支。', '5 default colors + 1 custom color; 6 markers maximum.') }}</small>
      </div>
    </details>
    <input
      :value="color"
      type="color"
      :disabled="!editable"
      :aria-label="label('批注颜色', 'Annotation color')"
      :title="label('自定义颜色', 'Custom color')"
      @input="$emit('color', ($event.target as HTMLInputElement).value)"
    >
    <details class="pdf-author-settings">
      <summary
        :aria-label="label('作者', 'Author')"
        :title="label('作者', 'Author')"
      >
        <pdf-icon name="author" />
      </summary>
      <div class="settings-panel">
        <label>{{ label('作者', 'Author') }}<input
          :value="author"
          maxlength="200"
          :aria-label="label('批注作者', 'Annotation author')"
          @input="$emit('author', ($event.target as HTMLInputElement).value)"
        ></label>
      </div>
    </details>
    <div class="tool-group actions">
      <button
        :disabled="!editable || !canUndo"
        :aria-label="label('撤销', 'Undo')"
        :title="label('撤销 (Ctrl+Z)', 'Undo (Ctrl+Z)')"
        @click="$emit('undo')"
      >
        <pdf-icon name="undo" />
      </button>
      <button
        :disabled="!editable || !canRedo"
        :aria-label="label('重做', 'Redo')"
        :title="label('重做 (Ctrl+Shift+Z)', 'Redo (Ctrl+Shift+Z)')"
        @click="$emit('redo')"
      >
        <pdf-icon name="redo" />
      </button>
      <button
        :disabled="!editable || !dirty || saving"
        :aria-label="label('保存批注', 'Save annotations')"
        :title="label('保存批注 (Ctrl+S)', 'Save annotations (Ctrl+S)')"
        @click="$emit('save', false)"
      >
        <pdf-icon name="save" />
      </button>
      <button
        :disabled="!editable || saving"
        :aria-label="label('保存副本', 'Save copy')"
        :title="label('保存副本', 'Save copy')"
        @click="$emit('save', true)"
      >
        <pdf-icon name="copy" />
      </button>
      <button
        :aria-pressed="sidebar"
        :aria-label="`${label('批注列表', 'Annotations')} (${count})`"
        :title="label('批注列表', 'Annotations')"
        @click="$emit('sidebar')"
      >
        <pdf-icon name="comments" /><small>{{ count }}</small>
      </button>
      <button
        v-if="dirty"
        :aria-label="label('放弃草稿', 'Discard drafts')"
        :title="label('放弃草稿', 'Discard drafts')"
        @click="$emit('discard')"
      >
        <pdf-icon name="trash" />
      </button>
    </div>
    <slot />
    <span
      role="status"
      class="save-status"
      :class="{ dirty }"
    >{{ saving ? label('正在保存 PDF…', 'Saving PDF…') : dirty ? label('尚未保存', 'Unsaved') : label('已保存', 'Saved') }}</span>
  </div>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import PdfIcon from './pdfIcon.vue'
import type { PdfAnnotationKind } from '@shared/pdf'
type Tool = PdfAnnotationKind | 'Select' | 'Hand' | 'Erase'
defineProps<{ tool: Tool; ready: boolean; editable: boolean; palette: string[]; color: string; markerWidth: number; textOnly: boolean; author: string; canUndo: boolean; canRedo: boolean; dirty: boolean; saving: boolean; sidebar: boolean; count: number }>()
defineEmits<{ tool: [Tool]; marker: [string]; color: [string]; width: [number]; textOnly: [boolean]; author: [string]; undo: []; redo: []; save: [boolean]; sidebar: []; discard: [] }>()
const { locale } = useI18n()
const label = (zh: string, en: string) => locale.value.startsWith('zh') ? zh : en
const tools: Array<{ kind: Tool; zh: string; en: string }> = [
  { kind: 'Select', zh: '选择', en: 'Select' }, { kind: 'Hand', zh: '拖拽阅读', en: 'Hand tool' },
  { kind: 'Highlight', zh: '高亮', en: 'Highlight' }, { kind: 'Underline', zh: '下划线', en: 'Underline' },
  { kind: 'StrikeOut', zh: '删除线', en: 'Strikeout' }, { kind: 'Text', zh: '便签评论', en: 'Sticky note' },
  { kind: 'FreeText', zh: '文本题注', en: 'Text caption' }, { kind: 'Ink', zh: '手写画笔', en: 'Ink pen' },
  { kind: 'Square', zh: '矩形', en: 'Rectangle' }, { kind: 'Erase', zh: '橡皮擦', en: 'Eraser' }
]
</script>
<style scoped>
.pdf-annotation-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; padding: 6px 10px; border-bottom: 1px solid var(--editorColor10); font: 12px var(--uiFontFamily); }
.tool-group { display: flex; align-items: center; gap: 2px; padding-right: 6px; border-right: 1px solid var(--editorColor10); }
button, summary { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-width: 30px; height: 30px; padding: 5px; box-sizing: border-box; color: inherit; background: transparent; border: 1px solid transparent; border-radius: 6px; cursor: pointer; }
button:hover, summary:hover { background: var(--editorColor10); }
button[aria-pressed=true] { color: var(--themeColor); background: var(--themeColor20); }
button:disabled { opacity: .4; cursor: default; }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--themeColor); }
.pdf-marker-presets { flex: none; }
.pdf-marker-presets button { border-bottom: 4px solid var(--marker-color); }
.pdf-marker-presets button[aria-pressed=true] { color: #202020; background: var(--marker-color); }
input { color: inherit; background: var(--editorBgColor); border: 1px solid var(--editorColor10); border-radius: 5px; font: inherit; }
input[type=color] { width: 28px; height: 28px; padding: 2px; }
details { position: relative; }
summary { list-style: none; }
summary::-webkit-details-marker { display: none; }
.settings-panel { position: absolute; top: 36px; left: 0; z-index: 30; display: flex; flex-direction: column; gap: 12px; width: 220px; padding: 14px; border: 1px solid var(--editorColor10); border-radius: 8px; background: var(--editorBgColor); box-shadow: 0 5px 20px #0003; }
.settings-panel label { display: flex; gap: 6px; align-items: center; }
.settings-panel input:not([type=checkbox]) { min-width: 0; width: 130px; }
.save-status { margin-left: auto; color: var(--editorColor50); white-space: nowrap; }
.save-status.dirty { color: var(--themeColor); }
@media (max-width: 760px) { .save-status { display: none; } .actions { margin-left: auto; } }
</style>
