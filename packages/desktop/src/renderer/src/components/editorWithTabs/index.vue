<template>
  <div class="editor-with-tabs">
    <tabs v-show="showTabBar" />
    <div
      class="container"
      :class="{ 'has-minimap': preferences.minimapEnabled && !pdf, 'minimap-left': preferences.minimapSide === 'left' }"
      :style="{ '--minimap-width': `${Math.min(160, Math.max(60, preferences.minimapMaxColumn * preferences.minimapScale))}px` }"
      @contextmenu.capture="!pdf && handleScrollContextMenu($event)"
    >
      <editor
        v-show="!plainText && !pdf"
        :markdown="markdown"
        :cursor="cursor"
        :text-direction="textDirection"
        :platform="platform"
      />
      <source-code
        v-if="sourceCode && !plainText && !pdf"
        :markdown="markdown"
        :muya-index-cursor="muyaIndexCursor"
        :text-direction="textDirection"
      />
      <plain-text-editor
        v-if="hasPlainText"
        v-show="plainText"
        :active="plainText"
      />
      <editor-minimap
        v-if="preferences.minimapEnabled && !pdf"
        :plain-text="plainText"
        :source-code="sourceCode"
      />
      <pdf-reader
        v-if="pdf && currentFile && pdfEnabled"
        :key="currentFile.id"
        :file="currentFile"
      />
      <p
        v-if="pdf && !pdfEnabled"
        role="status"
      >
        {{ t('menu.file.open') }}：PDF 阅读器未安装，请重新运行安装程序并勾选“同时安装 PDF 阅读器”。
      </p>
    </div>
    <bottom-toolbar
      v-if="!plainText && !pdf"
      :source-code="sourceCode"
    />
    <div
      v-if="!plainText && !pdf"
      class="editor-status-bar"
    >
      <div
        class="editor-mode-switch"
        role="group"
        :aria-label="t('menu.view.sourceCodeMode')"
      >
        <button
          type="button"
          :class="{ active: sourceCode }"
          :aria-label="t('bottomToolbar.sourceMode')"
          :aria-pressed="sourceCode"
          :title="`${t('bottomToolbar.sourceMode')} (Ctrl+/)`"
          @mousedown.prevent
          @click="setSourceMode(true)"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
          ><path d="m8 6-6 6 6 6m8-12 6 6-6 6" /></svg>
        </button>
        <button
          type="button"
          :class="{ active: !sourceCode }"
          :aria-label="t('bottomToolbar.renderedMode')"
          :aria-pressed="!sourceCode"
          :title="`${t('bottomToolbar.renderedMode')} (Ctrl+/)`"
          @mousedown.prevent
          @click="setSourceMode(false)"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle
              cx="12"
              cy="12"
              r="3"
            />
          </svg>
        </button>
      </div>
      <word-counter
        :word-count="currentFile?.wordCount"
        :selection-word-count="selectionWordCount"
      />
    </div>
    <editor-context-menu
      v-if="!pdf"
      :source-code="sourceCode || plainText"
    />
    <tab-notifications />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { isPdfFile } from '@shared/pdf'
import { useI18n } from 'vue-i18n'
import { isPlainTextFile } from '@shared/plainText'
import { usePreferencesStore } from '@/store/preferences'
import EditorMinimap from '../minimap/index.vue'
import bus from '@/bus'
import { handleScrollContextMenu } from '@/contextMenu/minimap'
import PlainTextEditor from './plainText.vue'
import { useEditorStore } from '@/store/editor'
import { storeToRefs } from 'pinia'
import Tabs from './tabs.vue'
import Editor from './editor.vue'
import SourceCode from './sourceCode.vue'
import TabNotifications from './notifications.vue'
import BottomToolbar from '../bottomToolbar/index.vue'
import EditorContextMenu from '../editorContextMenu/index.vue'
import WordCounter from '../wordCounter/index.vue'

const props = defineProps<{
  markdown: string
  // `cursor` originates as `IFileState.cursor` which is `unknown`
  // (see src/shared/types/files.ts); align here instead of forcing every
  // caller to widen.
  cursor: unknown
  muyaIndexCursor?: unknown
  sourceCode: boolean
  showTabBar: boolean
  textDirection: string
  platform: string
}>()
const { t } = useI18n()
const setSourceMode = (value: boolean): void => {
  if (props.sourceCode !== value) bus.emit('view:toggle-view-entry', 'sourceCode')
}

const { currentFile, selectionWordCount } = storeToRefs(useEditorStore())
const PdfReader = defineAsyncComponent(() => import('./pdfReader.vue'))
const pdfEnabled = window.electron.pdfEnabled
const pdf = computed(() => isPdfFile(currentFile.value?.filename || ''))
const plainText = computed(() => isPlainTextFile(currentFile.value?.filename || ''))
const hasPlainText = ref(false)
const preferences = usePreferencesStore()
watch(plainText, value => { if (value) hasPlainText.value = true }, { immediate: true })
watch(() => [currentFile.value?.id, plainText.value] as const, ([id, plain], [oldId, oldPlain]) => {
  if (id !== oldId || plain === oldPlain || !currentFile.value) return
  const { markdown, cursor, history, muyaIndexCursor } = currentFile.value
  bus.emit('file-changed', { id, markdown, cursor, history, muyaIndexCursor, renderCursor: true })
})
</script>

<style scoped>
.editor-with-tabs {
  position: relative;
  height: 100%;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;

  overflow: hidden;
  background: var(--editorBgColor);
  margin: 4px 6px 6px 4px;
  border: 1px solid var(--editorColor10);
  border-radius: var(--shell-panel-radius);
  & > .container {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
}
.editor-status-bar {
  flex: none;
  height: 28px;
  box-sizing: border-box;
  /* Keep the bottom-right corner clear for the fixed-position arcade launcher
     (32px wide at right:14px), so the word counter never renders underneath it. */
  padding: 0 54px 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--editorColor04);
}
.editor-mode-switch {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 14px;
  background: var(--editorColor04);
}
.editor-mode-switch button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 12px;
  color: var(--editorColor50);
  background: transparent;
  cursor: pointer;
}
.editor-mode-switch button.active {
  color: var(--editorColor);
  background: var(--editorBgColor);
  box-shadow: 0 1px 3px var(--editorColor10);
}
.editor-mode-switch button:hover { color: var(--editorColor); }
.editor-mode-switch button:focus-visible { outline: 2px solid var(--themeColor); outline-offset: 1px; }
.editor-mode-switch svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>

<style>
.editor-with-tabs > .container.has-minimap:not(.minimap-left) .editor-component { padding-right: calc(var(--minimap-width) + 12px); }
.editor-with-tabs > .container.has-minimap:not(.minimap-left) .CodeMirror-lines { padding-right: calc(var(--minimap-width) + 12px); }
.editor-with-tabs > .container.minimap-left.has-minimap > .editor-wrapper,
.editor-with-tabs > .container.minimap-left.has-minimap > .source-code,
.editor-with-tabs > .container.minimap-left.has-minimap > .plain-text-editor { margin-left: calc(var(--minimap-width) + 12px); width: calc(100% - var(--minimap-width) - 12px); }
.editor-with-tabs > .container.minimap-left .editor-minimap { left: 0; right: auto; }
</style>
