<template>
  <div class="editor-with-tabs">
    <tabs v-show="showTabBar" />
    <div class="container">
      <editor
        :markdown="markdown"
        :cursor="cursor"
        :text-direction="textDirection"
        :platform="platform"
      />
      <source-code
        v-if="sourceCode"
        :markdown="markdown"
        :muya-index-cursor="muyaIndexCursor"
        :text-direction="textDirection"
      />
    </div>
    <bottom-toolbar :source-code="sourceCode" />
    <div class="editor-status-bar">
      <word-counter
        :word-count="currentFile?.wordCount"
        :selection-word-count="selectionWordCount"
      />
    </div>
    <editor-context-menu :source-code="sourceCode" />
    <tab-notifications />
  </div>
</template>

<script setup lang="ts">
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
