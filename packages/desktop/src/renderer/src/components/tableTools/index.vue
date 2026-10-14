<template>
  <Teleport to="body">
    <div
      v-if="cell"
      class="table-tools"
      :class="{ 'table-tools-up': opensUp }"
      :style="position"
      @mousedown.prevent
      @keydown.esc.stop="popup = ''"
    >
      <div class="table-tools-left">
        <button
          data-table-tool="resize"
          :title="t('tableTools.resize')"
          :aria-label="t('tableTools.resize')"
          @click="toggle('resize')"
        >
          <toolbar-icon name="resize" />
        </button>
        <button
          v-for="align in ['left', 'center', 'right']"
          :key="align"
          :data-table-tool="align"
          :aria-label="t(`tableTools.${align}`)"
          :title="t(`tableTools.${align}`)"
          :aria-pressed="cell.align === align"
          @click="setAlign(align)"
        >
          <toolbar-icon :name="`align-${align}`" />
        </button>
      </div>
      <div class="table-tools-right">
        <button
          data-table-tool="more"
          :title="t('tableTools.more')"
          :aria-label="t('tableTools.more')"
          @click="toggle('more')"
        >
          <toolbar-icon name="more-vertical" />
        </button>
        <button
          data-table-tool="delete-table"
          :title="t('tableTools.delete-table')"
          :aria-label="t('tableTools.delete-table')"
          @click="run('delete-table')"
        >
          <toolbar-icon name="delete" />
        </button>
      </div>
      <div
        v-if="popup === 'more'"
        class="table-tools-menu"
        role="menu"
      >
        <button
          v-for="action in tableActions"
          :key="action"
          :data-table-action="action"
          :disabled="tableActionDisabled(cell, action)"
          role="menuitem"
          @click="run(action)"
        >
          {{ t(`tableTools.${action}`) }}
        </button>
      </div>
      <div
        v-if="popup === 'resize'"
        class="table-tools-resize"
        @mousedown.stop
      >
        <div
          class="table-tools-grid"
          @mouseleave="setHover(rows, columns)"
        >
          <button
            v-for="n in 80"
            :key="n"
            :class="{
              current: Math.ceil(n / 8) <= cell.table.rowCount && (n - 1) % 8 < cell.table.columnCount,
              selected: Math.ceil(n / 8) <= hoverRows && (n - 1) % 8 < hoverColumns
            }"
            :aria-label="`${((n - 1) % 8) + 1} × ${Math.ceil(n / 8)}`"
            @mouseenter="setHover(Math.ceil(n / 8), ((n - 1) % 8) + 1)"
            @click="applyResize(Math.ceil(n / 8), ((n - 1) % 8) + 1)"
          />
        </div>
        <div class="table-tools-size">
          <input
            v-model.number="columns"
            type="number"
            min="1"
            max="50"
            :aria-label="t('tableTools.columns')"
            @keydown.enter="applyResize(rows, columns)"
          >
          ×
          <input
            v-model.number="rows"
            type="number"
            min="1"
            max="200"
            :aria-label="t('tableTools.rows')"
            @keydown.enter="applyResize(rows, columns)"
          >
          <button @click="applyResize(rows, columns)">
            {{ t('common.ok') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  getTableCell,
  performTableAction,
  resizeTable,
  tableActionDisabled,
  tableActions,
  type Muya,
  type TTableAction
} from '@muyajs/core'
import bus from '@/bus'
import ToolbarIcon from '../bottomToolbar/toolbarIcon.vue'

const props = defineProps<{ muya: Muya | null }>()
const { t } = useI18n()
const cell = shallowRef<ReturnType<typeof getTableCell>>(null)
let contextCell: ReturnType<typeof getTableCell> = null
const popup = ref('')
const rows = ref(1)
const columns = ref(1)
const hoverRows = ref(1)
const hoverColumns = ref(1)
const bounds = ref({ left: 0, top: 0, width: 0 })
const position = computed(() => ({
  left: `${bounds.value.left}px`,
  top: `${bounds.value.top}px`,
  width: `${bounds.value.width}px`,
  '--table-menu-height': `${Math.max(60, (opensUp.value ? bounds.value.top - 60 : window.innerHeight - bounds.value.top - 34))}px`
}))
const opensUp = computed(() => bounds.value.top > window.innerHeight / 2)
let frame = 0

const refresh = () => {
  const engine = props.muya
  if (!engine) {
    cell.value = null
    return
  }
  const next = document.activeElement?.closest('.table-tools, .editor-context-menu') ? cell.value : getTableCell(engine)
  const rect = next?.table.domNode?.querySelector('table')?.getBoundingClientRect()
  const editorRect = engine.domNode.getBoundingClientRect()
  if (
    !next?.outMostBlock ||
    !rect ||
    rect.bottom < Math.max(56, editorRect.top) ||
    rect.top > window.innerHeight
  ) {
    cell.value = null
    popup.value = ''
    return
  }
  if (cell.value?.table !== next.table) popup.value = ''
  cell.value = next
  bounds.value = { left: rect.left, top: Math.max(56, rect.top - 26), width: rect.width }
}
const schedule = () => {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(refresh)
}
const pointer = (event: Event) => {
  const target = event.target as Element | null
  if (target?.closest('.table-tools, .editor-context-menu')) return
  contextCell = null
  popup.value = ''
  if (!target || !props.muya?.domNode.contains(target)) {
    cell.value = null
    return
  }
  schedule()
}
const toggle = (kind: string) => {
  popup.value = popup.value === kind ? '' : kind
  if (kind === 'resize' && cell.value) {
    rows.value = hoverRows.value = cell.value.table.rowCount
    columns.value = hoverColumns.value = cell.value.table.columnCount
  }
}
const setHover = (rowCount: number, columnCount: number) => {
  hoverRows.value = rowCount
  hoverColumns.value = columnCount
}
watch([rows, columns], ([rowCount, columnCount]) => setHover(rowCount, columnCount))
const run = (action: TTableAction) => {
  const target = contextCell ?? cell.value
  if (!target) return
  const copied = performTableAction(target, action)
  contextCell = null
  if (copied !== undefined) window.electron.clipboard.writeText(copied)
  popup.value = ''
  schedule()
}
const setAlign = (align: string) => {
  if (!cell.value) return
  cell.value.table.alignColumn(cell.value.columnOffset, align)
  cell.value.firstContentInDescendant()?.setCursor(0, 0, true)
  schedule()
}
const applyResize = (rowCount: number, columnCount: number) => {
  if (!cell.value) return
  const next = resizeTable(cell.value, rowCount, columnCount)
  if (!next) return
  cell.value = next
  popup.value = ''
  schedule()
}
const context = (target: unknown) => {
  if (!props.muya || !(target instanceof Element)) return
  const next = getTableCell(props.muya, target)
  if (!next) return
  contextCell = next
  cell.value = next
  schedule()
}
const insertParagraph = (location: unknown) => {
  if (location !== 'before' && location !== 'after') return
  contextCell?.firstContentInDescendant()?.setCursor(0, 0, true)
  contextCell = null
  props.muya?.insertParagraph(location, '', true)
  schedule()
}
const contextAction = (action: unknown) => {
  if (typeof action === 'string' && tableActions.includes(action as TTableAction))
    run(action as TTableAction)
}
onMounted(() => {
  document.addEventListener('selectionchange', schedule)
  document.addEventListener('keyup', schedule)
  document.addEventListener('click', pointer)
  window.addEventListener('resize', schedule)
  window.addEventListener('scroll', schedule, true)
  bus.on('table-context-target', context)
  bus.on('table-action', contextAction)
  bus.on('table-insert-paragraph', insertParagraph)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  document.removeEventListener('selectionchange', schedule)
  document.removeEventListener('keyup', schedule)
  document.removeEventListener('click', pointer)
  window.removeEventListener('resize', schedule)
  window.removeEventListener('scroll', schedule, true)
  bus.off('table-context-target', context)
  bus.off('table-action', contextAction)
  bus.off('table-insert-paragraph', insertParagraph)
})
</script>

<style>
.table-tools {
  position: fixed;
  z-index: 1000;
  height: 24px;
  display: flex;
  justify-content: space-between;
  color: var(--editorColor);
  font:
    12px 'Segoe UI',
    sans-serif;
}
.table-tools-left,
.table-tools-right {
  display: flex;
  gap: 2px;
}
.table-tools button {
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  border-radius: 3px;
}
.table-tools-left button,
.table-tools-right button {
  width: 26px;
  height: 24px;
  padding: 4px;
}
.table-tools button:hover,
.table-tools button[aria-pressed='true'] {
  background: var(--editorColor10);
}
.table-tools svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 1.4;
  fill: none;
}
.table-tools circle {
  fill: currentColor;
}
.table-tools-menu,
.table-tools-resize {
  position: absolute;
  top: 25px;
  background: var(--floatBgColor);
  border: 1px solid var(--editorColor10);
  border-radius: 6px;
  box-shadow: var(--floatShadow);
  padding: 6px;
  max-height: min(480px, var(--table-menu-height));
  overflow-y: auto;
}
.table-tools-up .table-tools-menu,
.table-tools-up .table-tools-resize {
  top: auto;
  bottom: 25px;
}
.table-tools-menu {
  right: 0;
  width: 210px;
}
.table-tools-menu button {
  display: block;
  width: 100%;
  padding: 6px 14px;
  text-align: left;
}
.table-tools-menu button:disabled {
  opacity: 0.35;
  cursor: default;
}
.table-tools-menu button:nth-child(5),
.table-tools-menu button:nth-child(9),
.table-tools-menu button:nth-child(11),
.table-tools-menu button:nth-child(13) {
  border-top: 1px solid var(--editorColor10);
  margin-top: 4px;
  border-radius: 0;
}
.table-tools-resize {
  left: 0;
  width: 160px;
}
.table-tools-grid {
  display: grid;
  grid-template-columns: repeat(8, 15px);
  gap: 2px;
  justify-content: center;
  padding: 8px;
}
.table-tools-grid button {
  width: 15px;
  height: 15px;
  border: 1px solid var(--editorColor10);
  border-radius: 0;
  padding: 0;
}
.table-tools-grid button.current {
  background: color-mix(in srgb, var(--editorColor) 30%, transparent);
}
.table-tools-grid button.selected {
  background: var(--themeColor20);
  border-color: var(--themeColor);
}
.table-tools-size {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px;
}
.table-tools-size input {
  box-sizing: border-box;
  min-width: 0;
  width: 42px;
  color: var(--editorColor);
  background: var(--floatBgColor);
  border: 1px solid var(--editorColor10);
  padding: 3px;
}
.table-tools-size button {
  flex-shrink: 0;
  white-space: nowrap;
  padding: 3px;
}
</style>
