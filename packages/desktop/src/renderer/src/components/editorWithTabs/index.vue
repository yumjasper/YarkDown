<template>
  <div class="editor-with-tabs">
    <tabs v-show="showTabBar" />
    <div class="container">
      <editor
        v-show="!plainText"
        :markdown="markdown"
        :cursor="cursor"
        :text-direction="textDirection"
        :platform="platform"
      />
      <source-code
        v-if="sourceCode && !plainText"
        :markdown="markdown"
        :muya-index-cursor="muyaIndexCursor"
        :text-direction="textDirection"
      />
      <plain-text-editor
        v-if="hasPlainText"
        v-show="plainText"
        :active="plainText"
      />
    </div>
    <bottom-toolbar
      v-if="!plainText"
      :source-code="sourceCode"
    />
    <div
      v-if="!plainText"
      class="editor-status-bar"
    >
      <word-counter
        :word-count="currentFile?.wordCount"
        :selection-word-count="selectionWordCount"
      />
    </div>
    <editor-context-menu :source-code="sourceCode || plainText" />
    <tab-notifications />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { isPlainTextFile } from '@shared/plainText'
import bus from '@/bus'
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

defineProps<{
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

const { currentFile, selectionWordCount } = storeToRefs(useEditorStore())
const plainText = computed(() => isPlainTextFile(currentFile.value?.filename || ''))
const hasPlainText = ref(false)
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
  & > .container {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
}
.editor-status-bar {
  flex: none;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  border-top: 1px solid var(--editorColor04);
}
</style>
