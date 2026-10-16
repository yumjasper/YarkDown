<template>
  <Teleport to="body">
    <div
      v-if="request"
      ref="panel"
      v-ui-motion.appear="request"
      class="editor-context-menu"
      role="menu"
      :aria-label="t('contextMenu.editorMenu')"
      :style="positionStyle(position)"
      @contextmenu.prevent
      @mousedown.prevent
      @keydown="navigate"
    >
      <div
        class="context-icon-grid"
        @mouseenter="closeSubmenu"
      >
        <button
          v-for="item in clipboardItems"
          :key="item.id"
          type="button"
          class="context-icon-button"
          role="menuitem"
          :data-id="item.id"
          :disabled="item.disabled"
          :aria-label="item.label"
          :title="item.label"
          @click="run(item)"
        >
          <toolbar-icon :name="item.icon || ''" />
        </button>
      </div>
      <button
        type="button"
        class="context-menu-row"
        role="menuitem"
        data-id="copy-as"
        aria-haspopup="menu"
        :aria-expanded="activeId === 'copy-as'"
        @mouseenter="showSubmenu('copy-as', copyItems, $event)"
        @click="showSubmenu('copy-as', copyItems, $event)"
      >
        {{ t('contextMenu.copyPasteAs') }}<span class="context-submenu-arrow">›</span>
      </button>
      <div class="context-menu-divider" />
      <div
        class="context-icon-grid context-format-grid"
        @mouseenter="closeSubmenu"
      >
        <button
          v-for="item in formatItems"
          :key="item.id"
          type="button"
          class="context-icon-button"
          role="menuitem"
          :data-id="item.id"
          :disabled="sourceCode"
          :aria-label="item.label"
          :title="item.label"
          @click="run(item)"
        >
          <toolbar-icon :name="item.icon || ''" />
        </button>
      </div>
      <div class="context-menu-divider" />
      <button
        v-for="group in groups"
        :key="group.id"
        type="button"
        class="context-menu-row"
        role="menuitem"
        :data-id="group.id"
        :disabled="sourceCode"
        aria-haspopup="menu"
        :aria-expanded="activeId === group.id"
        @mouseenter="!sourceCode && showSubmenu(group.id, group.items, $event)"
        @click="showSubmenu(group.id, group.items, $event)"
      >
        {{ group.label }}<span class="context-submenu-arrow">›</span>
      </button>
      <template v-if="nativeItems.length">
        <div class="context-menu-divider" />
        <button
          v-for="item in nativeItems"
          :key="item.id"
          type="button"
          class="context-menu-row"
          role="menuitem"
          :data-id="item.id"
          :disabled="item.disabled"
          @mouseenter="item.children ? showSubmenu(item.id, item.children, $event) : closeSubmenu()"
          @click="item.children ? showSubmenu(item.id, item.children, $event) : run(item)"
        >
          {{ item.label }}<span
            v-if="item.children"
            class="context-submenu-arrow"
          >›</span>
        </button>
      </template>
    </div>
    <div
      v-if="request && activeItems.length"
      ref="submenu"
      v-ui-motion.appear="activeId"
      class="editor-context-menu context-submenu"
      role="menu"
      :style="positionStyle(submenuPosition)"
      @contextmenu.prevent
      @mousedown.prevent
      @keydown="navigate"
    >
      <template
        v-for="item in activeItems"
        :key="item.id"
      >
        <div
          v-if="item.divided"
          class="context-menu-divider"
        />
        <button
          type="button"
          class="context-menu-row"
          :role="item.checked !== undefined ? 'menuitemradio' : 'menuitem'"
          :aria-checked="item.checked"
          :data-id="item.id"
          :disabled="item.disabled"
          @click="item.children ? showSubmenu(item.id, item.children, $event) : run(item)"
        >
          <span class="context-check">{{ item.checked ? '✓' : '' }}</span><span>{{ item.label }}</span>
          <span
            v-if="item.shortcut"
            class="context-shortcut"
          >{{ item.shortcut }}</span>
          <span
            v-if="item.children"
            class="context-submenu-arrow"
          >›</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { vUiMotion } from '@/util/uiMotion'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEditorStore } from '@/store/editor'
import { useCommandCenterStore } from '@/store/commandCenter'
import bus from '@/bus'
import ToolbarIcon from '../bottomToolbar/toolbarIcon.vue'
import type { EditorContextMenuRequest, EditorContextNativeItem } from '@shared/types/menu'
import { fitContextMenu, fitContextSubmenu } from './position'
const tableActions = ref<string[]>([])

interface Item {
  id: string
  label: string
  icon?: string
  disabled?: boolean
  checked?: boolean
  divided?: boolean
  shortcut?: string
  children?: Item[]
  run?: () => void
}
const props = defineProps<{ sourceCode: boolean }>()
const { t } = useI18n()
const editorStore = useEditorStore()
const commands = useCommandCenterStore()
const request = ref<EditorContextMenuRequest | null>(null)
const inTable = ref(false)
let mousePoint: { x: number; y: number } | null = null
const captureContextPoint = (event: MouseEvent): void => {
  if ((event.target as Element)?.closest('.editor-component') && event.button === 2)
    mousePoint = { x: event.clientX, y: event.clientY }
}
const tablePosition = ref({ row: 0, column: 0, rows: 0, columns: 0 })
const panel = ref<HTMLElement | null>(null)
const submenu = ref<HTMLElement | null>(null)
const position = ref({ x: 8, y: 8 })
const submenuPosition = ref({ x: 8, y: 8 })
const activeId = ref('')
const activeItems = ref<Item[]>([])
const heading = ref(0)
let selectedText = ''
let offRequest: (() => void) | undefined

const sourceEditor = () =>
  (
    document.querySelector('.plain-text-editor.is-active .CodeMirror, .source-code:not(.plain-text-editor) .CodeMirror') as
      | (Element & {
          CodeMirror?: {
            getSelection(): string
            replaceSelection(text: string, collapse: string, origin: string): void
            focus(): void
          }
        })
      | null
  )?.CodeMirror
const pasteSourcePlain = async (): Promise<void> => {
  const text = await window.electron.clipboard.readText()
  const editor = sourceEditor()
  editor?.focus()
  editor?.replaceSelection(text, 'end', '+input')
}

const viewport = () => ({ width: window.innerWidth, height: window.innerHeight })
const positionStyle = (point: { x: number; y: number }) => ({
  left: `${point.x}px`,
  top: `${point.y}px`,
  '--context-space-width': `${Math.max(1, window.innerWidth - point.x)}px`,
  '--context-space-height': `${Math.max(1, window.innerHeight - point.y)}px`
})
const closeSubmenu = (): void => {
  activeId.value = ''
  activeItems.value = []
}
const close = (): void => {
  request.value = null
  closeSubmenu()
}
const restoreFocus = (): void => {
  if (props.sourceCode) {
    sourceEditor()?.focus()
  } else bus.emit('editor-focus')
}
const run = (item: Item): void => {
  if (item.disabled) return
  close()
  restoreFocus()
  item.run?.()
}
const command = (id: string, key: string, commandId: string, icon?: string): Item => ({
  id,
  label: t(key),
  icon,
  shortcut: commands.rootCommand.subcommands
    .find((entry) => entry.id === commandId)
    ?.shortcut?.join('+'),
  run: () => bus.emit('cmd::execute', commandId)
})
const main = (id: string, key: string, commandId: string, icon?: string): Item => ({
  id,
  label: t(key),
  icon,
  run: () => window.electron.ipcRenderer.send('mt::execute-main-command', commandId)
})
const canCopy = computed(() => request.value?.canCopy ?? false)
const clipboardItems = computed<Item[]>(() => [
  { ...main('cut', 'contextMenu.cut', 'edit.cut', 'cut'), disabled: !request.value?.canCut },
  { ...main('copy', 'contextMenu.copy', 'edit.copy', 'copy'), disabled: !canCopy.value },
  {
    ...main('paste', 'contextMenu.paste', 'edit.paste', 'paste'),
    disabled: !request.value?.canPaste
  },
  {
    ...main('delete-block', 'bottomToolbar.deleteBlock', 'edit.delete-paragraph', 'delete'),
    disabled: props.sourceCode
  }
])
const copyItems = computed<Item[]>(() => [
  {
    id: 'copy-markdown',
    label: t('contextMenu.copyAsMarkdown'),
    disabled: !canCopy.value,
    run: () =>
      props.sourceCode
        ? window.electron.clipboard.writeText(selectedText)
        : bus.emit('context-copy-selection', 'markdown')
  },
  {
    ...main('copy-html', 'contextMenu.copyAsHtml', 'edit.copy-as-html'),
    disabled: !canCopy.value || props.sourceCode
  },
  {
    ...main('copy-rich', 'contextMenu.copyAsRich', 'edit.copy-as-rich'),
    disabled: !canCopy.value || props.sourceCode
  },
  {
    id: 'copy-plain',
    label: t('contextMenu.copyAsPlainText'),
    disabled: !canCopy.value,
    run: () =>
      props.sourceCode
        ? window.electron.clipboard.writeText(selectedText)
        : bus.emit('context-copy-selection', 'plain')
  },
  {
    ...main('paste-plain', 'contextMenu.pasteAsPlainText', 'edit.paste-as-plaintext'),
    run: () =>
      props.sourceCode
        ? void pasteSourcePlain()
        : window.electron.ipcRenderer.send('mt::execute-main-command', 'edit.paste-as-plaintext'),
    divided: true,
    disabled: !request.value?.canPaste
  }
])
const formatItems = computed(() => [
  command('bold', 'menu.format.bold', 'format.strong', 'bold'),
  command('italic', 'menu.format.italic', 'format.emphasis', 'italic'),
  command('inline-code', 'menu.format.inlineCode', 'format.inline-code', 'code'),
  command('link', 'menu.format.hyperlink', 'format.hyperlink', 'link'),
  command('quote', 'menu.paragraph.quoteBlock', 'paragraph.quote-block', 'quote'),
  command('ordered-list', 'commands.paragraph.orderList', 'paragraph.order-list', 'ordered-list'),
  command('bullet-list', 'commands.paragraph.bulletList', 'paragraph.bullet-list', 'list'),
  command('task-list', 'commands.paragraph.taskList', 'paragraph.task-list', 'task-list')
])
const specialInsert = (id: string, key: string): Item => ({
  id,
  label: t(key),
  run: () => bus.emit('context-insert', id)
})
const groups = computed(() => [
  ...(inTable.value
    ? [
        {
          id: 'table',
          label: t('commands.paragraph.table'),
          items: tableActions.value.map((action) => {
            const { row, column, rows, columns } = tablePosition.value
            return {
              id: `table-${action}`,
              label: t(`tableTools.${action}`),
              divided: ['row-up', 'delete-row', 'copy', 'delete-table'].includes(action),
              disabled:
                (action === 'row-up' && row <= 1) ||
                (action === 'row-down' && (row === 0 || row === rows - 1)) ||
                (action === 'column-previous' && column === 0) ||
                (action === 'column-next' && column === columns - 1),
              run: () => bus.emit('table-action', action)
            }
          })
        }
      ]
    : [
        {
          id: 'paragraph',
          label: t('commands.paragraph.paragraph'),
          items: [
            ...Array.from({ length: 6 }, (_, i) => ({
              ...command(
                `heading-${i + 1}`,
                `commands.paragraph.heading${i + 1}`,
                `paragraph.heading-${i + 1}`
              ),
              checked: heading.value === i + 1
            })),
            {
              ...command('plain-paragraph', 'commands.paragraph.paragraph', 'paragraph.paragraph'),
              checked: heading.value === 0,
              divided: true
            }
          ]
        }
      ]),
  {
    id: 'insert',
    label: t('contextMenu.insert'),
    items: [
      command('image', 'menu.format.image', 'format.image'),
      ...(!inTable.value
        ? [
            specialInsert('footnote', 'contextMenu.footnote'),
            specialInsert('reference-link', 'contextMenu.referenceLink'),
            command(
              'horizontal-line',
              'commands.paragraph.horizontalLine',
              'paragraph.horizontal-line'
            ),
            command('table', 'commands.paragraph.table', 'paragraph.table'),
            command('code-block', 'commands.paragraph.codeFence', 'paragraph.code-fence'),
            command('math-block', 'commands.paragraph.mathBlock', 'paragraph.math-formula'),
            specialInsert('toc', 'contextMenu.toc'),
            command('front-matter', 'commands.paragraph.frontMatter', 'paragraph.front-matter')
          ]
        : []),
      {
        id: 'insert-before',
        label: t('bottomToolbar.insertAbove'),
        divided: true,
        run: () => bus.emit(inTable.value ? 'table-insert-paragraph' : 'insertParagraph', 'before')
      },
      {
        id: 'insert-after',
        label: t('bottomToolbar.insertBelow'),
        run: () => bus.emit(inTable.value ? 'table-insert-paragraph' : 'insertParagraph', 'after')
      }
    ]
  }
])
const convertNative = (items: EditorContextNativeItem[]): Item[] => {
  let divided = false
  const result: Item[] = []
  for (const item of items) {
    if (item.separator) {
      divided = true
      continue
    }
    result.push({
      id: item.id,
      label: item.label,
      disabled: !item.enabled,
      divided,
      children: item.submenu ? convertNative(item.submenu) : undefined,
      run: () => window.electron.ipcRenderer.send('mt::editor-context-native-action', item.id)
    })
    divided = false
  }
  return result
}
const nativeItems = computed(() => convertNative(request.value?.nativeItems ?? []))

const showSubmenu = async (id: string, items: Item[], event: Event): Promise<void> => {
  const target = event.currentTarget as HTMLElement
  activeId.value = id
  activeItems.value = items
  const rect = target.getBoundingClientRect()
  await nextTick()
  if (!submenu.value) return
  submenuPosition.value = fitContextSubmenu(rect, submenu.value.getBoundingClientRect(), viewport())
}
const buttons = (root: HTMLElement): HTMLButtonElement[] =>
  Array.from(root.querySelectorAll('button:not(:disabled)'))
const navigate = async (
  event: KeyboardEvent,
  root = event.currentTarget as HTMLElement
): Promise<void> => {
  const items = buttons(root)
  const focused = document.activeElement as HTMLButtonElement
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    restoreFocus()
    return
  }
  if (event.key === 'ArrowLeft' && root === submenu.value) {
    event.preventDefault()
    panel.value?.querySelector<HTMLButtonElement>(`[data-id="${activeId.value}"]`)?.focus()
    closeSubmenu()
    return
  }
  if (event.key === 'ArrowRight' && focused?.getAttribute('aria-haspopup') === 'menu') {
    event.preventDefault()
    focused.click()
    await nextTick()
    if (submenu.value) buttons(submenu.value)[0]?.focus()
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !items.length) return
  event.preventDefault()
  const current = items.indexOf(focused)
  const index =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
  items[index]?.focus()
}
const openMenu = async (payload: EditorContextMenuRequest): Promise<void> => {
  if (!props.sourceCode && mousePoint) {
    payload = { ...payload, ...mousePoint }
    mousePoint = null
  }
  const target = document.elementFromPoint(payload.x, payload.y)
  const tableCell = !props.sourceCode ? target?.closest<HTMLTableCellElement>('td,th') : null
  inTable.value = !!tableCell
  if (tableCell) {
    tableActions.value = [...(await import('@muyajs/core/block/gfm/table/actions')).tableActions]
    const row = tableCell.parentElement as HTMLTableRowElement
    const table = tableCell.closest('table')!
    tablePosition.value = {
      row: row.rowIndex,
      column: tableCell.cellIndex,
      rows: table.rows.length,
      columns: row.cells.length
    }
    bus.emit('table-context-target', tableCell)
  }
  if (!target?.closest('.editor-component, .source-code')) {
    close()
    return
  }
  if (target.closest('input, .mu-float-wrapper') && !target.closest('.CodeMirror')) return
  closeSubmenu()
  selectedText = props.sourceCode ? (sourceEditor()?.getSelection() ?? '') : payload.selectionText
  heading.value = Number(target.closest('h1,h2,h3,h4,h5,h6')?.tagName.slice(1) ?? 0)
  request.value = props.sourceCode
    ? {
        ...payload,
        selectionText: selectedText,
        canCut: !!selectedText,
        canCopy: !!selectedText
      }
    : payload
  position.value = fitContextMenu(payload, { width: 220, height: 230 }, viewport())
  // Muya derives its active block from editor input events, not contextmenu.
  if (!props.sourceCode)
    document
      .querySelector('.editor-component')
      ?.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }))
  await nextTick()
  if (panel.value)
    position.value = fitContextMenu(payload, panel.value.getBoundingClientRect(), viewport())
}
const outside = (event: PointerEvent): void => {
  const target = event.target as Node | null
  if (!panel.value?.contains(target) && !submenu.value?.contains(target)) close()
}
const sourceContextMenu = (payload: unknown): void => {
  if (props.sourceCode) void openMenu(payload as EditorContextMenuRequest)
}
const keyboard = (event: KeyboardEvent): void => {
  if (!request.value || !panel.value || (event.target as Element)?.closest('.editor-context-menu'))
    return
  if (['Escape', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.stopPropagation()
    void navigate(event, panel.value)
  } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
    close()
  }
}
const scroll = (event: Event): void => {
  if (
    !panel.value?.contains(event.target as Node) &&
    !submenu.value?.contains(event.target as Node)
  )
    close()
}
onMounted(() => {
  bus.on('source-context-menu', sourceContextMenu)
  offRequest = window.electron.ipcRenderer.on('mt::editor-context-menu', (_event, payload) => {
    void openMenu(payload)
  })
  document.addEventListener('pointerdown', outside, true)
  document.addEventListener('contextmenu', captureContextPoint, true)
  document.addEventListener('keydown', keyboard, true)
  window.addEventListener('scroll', scroll, true)
  window.addEventListener('resize', close)
  window.addEventListener('blur', close)
})
watch(() => [props.sourceCode, editorStore.currentFile?.id], close)
onBeforeUnmount(() => {
  bus.off('source-context-menu', sourceContextMenu)
  offRequest?.()
  document.removeEventListener('pointerdown', outside, true)
  document.removeEventListener('contextmenu', captureContextPoint, true)
  document.removeEventListener('keydown', keyboard, true)
  window.removeEventListener('scroll', scroll, true)
  window.removeEventListener('resize', close)
  window.removeEventListener('blur', close)
})
</script>

<style>
.editor-context-menu {
  position: fixed;
  z-index: 10001;
  width: 220px;
  max-width: var(--context-space-width, calc(100vw - 16px));
  max-height: var(--context-space-height, calc(100vh - 16px));
  overflow-y: auto;
  box-sizing: border-box;
  padding: 6px 0;
  border: 1px solid var(--editorColor10);
  border-radius: 8px;
  background: var(--floatBgColor);
  box-shadow: var(--floatShadow);
  color: var(--editorColor);
  font-size: 12px;
}
.context-submenu {
  width: 260px;
}
.context-icon-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 1px 14px 5px;
}
.context-format-grid {
  padding-block: 5px;
}
.context-icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  border: 1px solid var(--editorColor10);
  border-radius: 3px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.context-menu-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-height: 28px;
  padding: 5px 16px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.context-menu-row:hover:not(:disabled),
.context-menu-row[aria-expanded='true'],
.context-icon-button:hover:not(:disabled) {
  background: var(--floatHoverColor);
}
.context-menu-row:disabled,
.context-icon-button:disabled {
  opacity: 0.35;
  cursor: default;
}
.context-menu-row:focus-visible,
.context-icon-button:focus-visible {
  outline: 2px solid var(--themeColor);
  outline-offset: -2px;
}
.context-menu-divider {
  height: 1px;
  margin: 5px 0;
  background: var(--editorColor10);
}
.context-submenu-arrow {
  margin-left: auto;
  padding-left: 10px;
  font-size: 18px;
  line-height: 14px;
}
.context-shortcut {
  margin-left: auto;
  padding-left: 12px;
  font-size: 11px;
  color: var(--editorColor50);
  white-space: nowrap;
}
.context-check {
  flex: none;
  width: 14px;
}
</style>
