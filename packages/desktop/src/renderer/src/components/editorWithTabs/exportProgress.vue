<template>
  <div
    v-if="label"
    v-ui-motion.appear="label"
    class="export-progress"
    role="status"
    aria-live="polite"
  >
    <span
      class="export-progress-spinner"
      aria-hidden="true"
    />
    <span class="export-progress-label">{{ t('editorStatusBar.exporting', { type: label }) }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { vUiMotion } from '@/util/uiMotion'
import { useEditorStore } from '@/store/editor'

const { t } = useI18n()
const { exportingType } = storeToRefs(useEditorStore())

// Names that upper-casing would mangle; everything else is a file extension already.
const FORMAT_LABELS: Record<string, string> = {
  styledHtml: 'HTML',
  html: 'HTML',
  docx: 'Word',
  odt: 'ODT',
  latex: 'LaTeX',
  textil: 'Textile',
  dokuwiki: 'DokuWiki'
}

const label = computed(() => {
  const type = exportingType.value
  if (!type) return ''
  return FORMAT_LABELS[type] ?? type.toUpperCase()
})
</script>

<style scoped>
.export-progress {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 5px;
  color: var(--editorColor70);
  font: 12px/1 var(--uiFontFamily);
  white-space: nowrap;
  user-select: none;
}

/* A partial ring rotating around a static track: reads as "working" without
   changing size, so the status bar does not reflow while it spins. */
.export-progress-spinner {
  flex: none;
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 1.5px solid color-mix(in srgb, var(--themeColor) 24%, transparent);
  border-top-color: var(--themeColor);
  border-radius: 50%;
  animation: export-progress-spin 800ms linear infinite;
}

@keyframes export-progress-spin {
  to {
    transform: rotate(1turn);
  }
}
</style>
