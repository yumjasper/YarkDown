<template>
  <div class="app-menu-bar title-no-drag">
    <button
      v-for="(item, index) of items"
      :key="`${index}-${item.label}`"
      type="button"
      class="menu-bar-item"
      :class="{ 'is-open': openedIndex === index }"
      :disabled="!item.enabled"
      @mousedown.stop.prevent="openMenu(index, $event)"
    >
      {{ item.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { MenuBarItem } from '@shared/types/menu'

const items = ref<MenuBarItem[]>([])
const openedIndex = ref(-1)

const load = async (): Promise<void> => {
  try {
    items.value = await window.electron.windowControl.getMenuBar()
  } catch {
    items.value = []
  }
}

const openMenu = (index: number, event: MouseEvent): void => {
  const target = event.currentTarget as HTMLElement | null
  if (!target) return

  const isClosing = openedIndex.value === index
  openedIndex.value = isClosing ? -1 : index
  if (isClosing) return

  // `popupTopMenu` coordinates are window-relative, which is what
  // `getBoundingClientRect` reports inside a frameless window.
  const rect = target.getBoundingClientRect()
  window.electron.windowControl.popupTopMenu(index, {
    x: Math.round(rect.left),
    y: Math.round(rect.bottom)
  })
}

const dismiss = (): void => {
  openedIndex.value = -1
}

let offClosed: (() => void) | null = null
let offChanged: (() => void) | null = null

onMounted(() => {
  load()
  // The main process rebuilds the menu on language, theme and recents changes.
  offChanged = window.electron.ipcRenderer.on('mt::menu-bar-changed', () => {
    load()
  })
  offClosed = window.electron.ipcRenderer.on('mt::menu::closed', dismiss)
  window.addEventListener('blur', dismiss)
})

onBeforeUnmount(() => {
  if (offChanged) {
    offChanged()
    offChanged = null
  }
  if (offClosed) {
    offClosed()
    offClosed = null
  }
  window.removeEventListener('blur', dismiss)
})
</script>

<style scoped>
.app-menu-bar {
  display: flex;
  align-items: center;
  height: 100%;
  gap: 2px;
}
.menu-bar-item {
  padding: 0 6px;
  height: 24px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  line-height: 24px;
  white-space: nowrap;
  cursor: default;
  border-radius: 4px;
}
.menu-bar-item:hover:not(:disabled),
.menu-bar-item.is-open {
  background-color: rgba(128, 128, 128, 0.2);
}
.menu-bar-item:disabled {
  opacity: 0.4;
}
</style>
