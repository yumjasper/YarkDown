<template>
  <div
    class="bottom-toolbar-host"
    dir="ltr"
  >
    <div
      v-if="!hidden"
      class="bottom-toolbar"
      role="toolbar"
      :aria-label="t('bottomToolbar.title')"
    >
      <toolbar-menu
        id="paragraph"
        :label="t('commands.paragraph.paragraph')"
        :items="paragraphItems"
        :disabled="sourceCode"
      />
      <span
        class="toolbar-divider"
        aria-hidden="true"
      />
      <el-tooltip
        v-for="item in inlineItems"
        :key="item.id"
        :content="item.label"
        placement="top"
        :show-after="500"
      >
        <button
          type="button"
          class="bottom-toolbar-button"
          :data-id="item.id"
          :aria-label="item.label"
          :disabled="sourceCode"
          @mousedown.prevent
          @click="execute(item.command)"
        >
          <toolbar-icon :name="item.icon" />
        </button>
      </el-tooltip>
      <span
        class="toolbar-divider"
        aria-hidden="true"
      />
      <toolbar-menu
        id="list"
        :label="t('bottomToolbar.lists')"
        icon="list"
        :items="listItems"
        :disabled="sourceCode"
      />
      <span
        class="toolbar-divider"
        aria-hidden="true"
      />
      <toolbar-menu
        id="more"
        :label="t('bottomToolbar.more')"
        icon="more"
        :items="moreItems"
      />
    </div>
    <button
      v-else
      type="button"
      class="bottom-toolbar-button toolbar-restore"
      data-id="show-toolbar"
      :aria-label="t('bottomToolbar.show')"
      :title="t('bottomToolbar.show')"
      @click="hidden = false"
    >
      <toolbar-icon name="more" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import bus from '@/bus'
import ToolbarIcon from './toolbarIcon.vue'
import ToolbarMenu from './toolbarMenu.vue'
import type { ToolbarMenuItem } from './types'

const props = defineProps<{ sourceCode: boolean }>()
const { t } = useI18n()
const hidden = ref(false)

const execute = (id: string): void => {
  bus.emit('cmd::execute', id)
}
const commandItem = (id: string, label: string, command: string): ToolbarMenuItem => ({
  id,
  label,
  disabled: props.sourceCode,
  run: () => execute(command)
})
const inlineItems = computed(() => [
  { id: 'bold', icon: 'bold', label: t('menu.format.bold'), command: 'format.strong' },
  { id: 'italic', icon: 'italic', label: t('menu.format.italic'), command: 'format.emphasis' },
  {
    id: 'inline-code',
    icon: 'code',
    label: t('menu.format.inlineCode'),
    command: 'format.inline-code'
  },
  { id: 'link', icon: 'link', label: t('menu.format.hyperlink'), command: 'format.hyperlink' },
  { id: 'image', icon: 'image', label: t('menu.format.image'), command: 'format.image' },
  {
    id: 'quote',
    icon: 'quote',
    label: t('menu.paragraph.quoteBlock'),
    command: 'paragraph.quote-block'
  }
])
const paragraphItems = computed(() => [
  commandItem('paragraph', t('commands.paragraph.paragraph'), 'paragraph.paragraph'),
  ...Array.from({ length: 6 }, (_, i) =>
    commandItem(
      `heading-${i + 1}`,
      t(`commands.paragraph.heading${i + 1}`),
      `paragraph.heading-${i + 1}`
    )
  ),
  { ...commandItem('table', t('commands.paragraph.table'), 'paragraph.table'), divided: true },
  commandItem('code-block', t('commands.paragraph.codeFence'), 'paragraph.code-fence'),
  commandItem(
    'horizontal-line',
    t('commands.paragraph.horizontalLine'),
    'paragraph.horizontal-line'
  )
])
const listItems = computed(() => [
  { ...commandItem('bullet-list', t('commands.paragraph.bulletList'), 'paragraph.bullet-list'), icon: 'list' },
  { ...commandItem('ordered-list', t('commands.paragraph.orderList'), 'paragraph.order-list'), icon: 'ordered-list' },
  { ...commandItem('task-list', t('commands.paragraph.taskList'), 'paragraph.task-list'), icon: 'task-list' }
])

// Clipboard commands cross into main to use Electron's native clipboard.
const clipboardItem = (id: string, label: string, command: string): ToolbarMenuItem => ({
  id,
  label,
  run: () => window.electron.ipcRenderer.send('mt::execute-main-command', command)
})
const editorItem = (
  id: string,
  label: string,
  event: string,
  payload: string
): ToolbarMenuItem => ({
  id,
  label,
  disabled: props.sourceCode,
  run: () => {
    bus.emit('editor-focus')
    bus.emit(event, payload)
  }
})
const moreItems = computed<ToolbarMenuItem[]>(() => [
  {
    id: 'source-code',
    label: props.sourceCode ? t('bottomToolbar.renderedMode') : t('bottomToolbar.sourceMode'),
    run: () => bus.emit('view:toggle-view-entry', 'sourceCode')
  },
  {
    ...editorItem('insert-before', t('bottomToolbar.insertAbove'), 'insertParagraph', 'before'),
    divided: true
  },
  editorItem('insert-after', t('bottomToolbar.insertBelow'), 'insertParagraph', 'after'),
  { ...clipboardItem('copy', t('bottomToolbar.copy'), 'edit.copy'), divided: true, icon: 'copy' },
  { ...clipboardItem('paste', t('bottomToolbar.paste'), 'edit.paste'), icon: 'paste' },
  commandItem('clear-format', t('bottomToolbar.clearFormat'), 'format.clear-format'),
  {
    ...editorItem(
      'delete-block',
      t('bottomToolbar.deleteBlock'),
      'deleteParagraph',
      'deleteParagraph'
    ),
    divided: true,
    icon: 'delete'
  },
  {
    id: 'hide-toolbar',
    label: t('bottomToolbar.hide'),
    divided: true,
    run: () => {
      hidden.value = true
    }
  }
])
</script>

<style>
.bottom-toolbar-host {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 12px 18px 10px;
}
.bottom-toolbar {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 1px;
  max-width: 100%;
  box-sizing: border-box;
  padding: 4px 7px;
  border: 1px solid var(--editorColor10);
  border-radius: 22px;
  background: var(--floatBgColor);
  box-shadow: 0 2px 10px rgb(0 0 0 / 6%);
}
.bottom-toolbar-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: none;
  width: 28px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--editorColor50);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.bottom-toolbar-button:hover:not(:disabled),
.bottom-toolbar-button[aria-expanded='true'] {
  background: var(--floatHoverColor);
  color: var(--editorColor);
}
.bottom-toolbar-button:focus-visible,
.bottom-toolbar-menu-item:focus-visible {
  outline: 2px solid var(--themeColor);
  outline-offset: 1px;
}
.bottom-toolbar-button:disabled {
  opacity: 0.35;
  cursor: default;
}
.bottom-toolbar-button[data-id='paragraph'] {
  width: auto;
  padding: 0 7px;
  white-space: nowrap;
}
.toolbar-divider {
  width: 1px;
  height: 14px;
  margin: 0 3px;
  background: var(--editorColor10);
}
.toolbar-restore {
  border: 1px solid var(--editorColor10);
  border-radius: 50%;
  background: var(--floatBgColor);
}
@media (max-width: 480px) {
  .bottom-toolbar-host {
    padding-inline: 8px;
  }
  .bottom-toolbar-button {
    width: 24px;
  }
  .toolbar-divider {
    margin-inline: 2px;
  }
}
</style>
