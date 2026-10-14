<template>
  <el-popover
    v-model:visible="open"
    trigger="click"
    role="menu"
    :aria-label="label"
    placement="top-start"
    :width="180"
    :disabled="disabled"
    :show-arrow="false"
    popper-class="bottom-toolbar-popover"
  >
    <template #reference>
      <button
        ref="trigger"
        type="button"
        class="bottom-toolbar-button"
        :data-id="id"
        :aria-label="label"
        aria-haspopup="menu"
        :aria-expanded="open"
        :disabled="disabled"
        :title="label"
        @mousedown.prevent
        @keydown.escape.stop.prevent="dismiss"
        @keydown.down.prevent="focusMenu(false)"
        @keydown.up.prevent="focusMenu(true)"
      >
        <toolbar-icon
          v-if="icon"
          :name="icon"
        />
        <span v-else>{{ label }}</span>
        <toolbar-icon
          v-if="id !== 'more'"
          name="chevron"
          class="toolbar-chevron"
        />
      </button>
    </template>
    <div
      ref="menu"
      class="bottom-toolbar-menu"
      :aria-label="label"
      @keydown="navigate"
    >
      <template
        v-for="item in items"
        :key="item.id"
      >
        <div
          v-if="item.divided"
          class="toolbar-menu-divider"
        />
        <button
          type="button"
          class="bottom-toolbar-menu-item"
          role="menuitem"
          tabindex="-1"
          :data-id="item.id"
          :disabled="item.disabled"
          @mousedown.prevent
          @click="run(item)"
        >
          <span class="toolbar-menu-icon"><toolbar-icon
            v-if="item.icon"
            :name="item.icon"
          /></span>
          {{ item.label }}
        </button>
      </template>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import ToolbarIcon from './toolbarIcon.vue'
import type { ToolbarMenuItem } from './types'

defineProps<{
  id: string
  label: string
  icon?: string
  items: ToolbarMenuItem[]
  disabled?: boolean
}>()
const open = ref(false)
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLDivElement | null>(null)
const buttons = (): HTMLButtonElement[] =>
  Array.from(menu.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
const focusMenu = async (last: boolean): Promise<void> => {
  open.value = true
  await nextTick()
  const items = buttons()
  items[last ? items.length - 1 : 0]?.focus()
}
const dismiss = (): void => {
  open.value = false
  trigger.value?.focus()
}
const navigate = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    dismiss()
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const items = buttons()
  if (!items.length) return
  const current = items.indexOf(document.activeElement as HTMLButtonElement)
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
  items[next]?.focus()
}
const run = (item: ToolbarMenuItem): void => {
  open.value = false
  item.run()
}
</script>

<style>
.el-popover.bottom-toolbar-popover {
  padding: 6px;
  border: 1px solid var(--editorColor10);
  border-radius: 10px;
  background: var(--floatBgColor);
  box-shadow: var(--floatShadow);
  color: var(--editorColor);
}
.bottom-toolbar-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 28px;
  padding: 4px 7px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  text-align: start;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.bottom-toolbar-menu-item:hover:not(:disabled) {
  background: var(--floatHoverColor);
}
.bottom-toolbar-menu-item:disabled {
  opacity: 0.35;
  cursor: default;
}
.toolbar-menu-icon {
  display: inline-flex;
  flex: none;
  width: 16px;
}
.toolbar-menu-divider {
  height: 1px;
  margin: 5px 4px;
  background: var(--editorColor10);
}
.toolbar-chevron {
  width: 10px;
  height: 10px;
}
</style>
