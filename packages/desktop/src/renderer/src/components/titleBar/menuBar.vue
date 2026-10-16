<template>
  <div
    ref="bar"
    class="app-menu-bar title-no-drag"
    role="menubar"
  >
    <button
      v-for="(item, index) of items"
      v-show="item.visible !== false"
      :key="`${index}-${item.label}`"
      type="button"
      class="menu-bar-item"
      :class="{ 'is-open': openedIndex === index, 'is-checked': item.checked }"
      :aria-pressed="item.checked"
      :aria-haspopup="item.submenu ? 'menu' : undefined"
      :aria-expanded="item.submenu ? openedIndex === index : undefined"
      :role="item.submenu ? 'menuitem' : undefined"
      :disabled="!item.enabled"
      @mousedown.stop.prevent="openMenu(index, $event)"
      @keydown="keyboard(index, $event)"
      @mouseenter="openedIndex >= 0 && item.submenu && show(index, $event.currentTarget as HTMLElement)"
    >
      {{ item.checked ? '✓ ' : '' }}{{ item.label }}
    </button>
    <teleport to="body">
      <menu-panel
        v-if="openedIndex >= 0"
        ref="panel"
        class="app-top-menu-panel"
        :style="{ left: `${position.x}px`, top: `${position.y}px` }"
        :items="items[openedIndex]?.children || []"
        :path="[openedIndex]"
        @select="execute"
        @dismiss="dismiss(true)"
      />
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { MenuBarItem } from '@shared/types/menu'
import MenuPanel from './menuPanel.vue'

const items = ref<MenuBarItem[]>([])
const openedIndex = ref(-1)
const bar = ref<HTMLElement>()
const panel = ref<InstanceType<typeof MenuPanel>>()
const position = ref({ x: 0, y: 0 })

const load = async (): Promise<void> => {
  try {
    items.value = await window.electron.windowControl.getMenuBar()
  } catch {
    items.value = []
  }
}

const openMenu = (index: number, event: MouseEvent): void => {
  if (event.button !== 0) return
  const target = event.currentTarget as HTMLElement | null
  if (!target) return

  if (!items.value[index]?.submenu) { void execute([index]); return }
  if (openedIndex.value === index) dismiss()
  else show(index, target)
}

const show = (index: number, target: HTMLElement) => {
  // Selection-dependent checks and enabled states can change without a menu rebuild.
  void load()
  const rect = target.getBoundingClientRect()
  position.value = { x: Math.max(8, Math.min(rect.left, window.innerWidth - 280)), y: rect.bottom + 4 }
  openedIndex.value = index
  nextTick(() => {
    const bounds = document.querySelector('.app-top-menu-panel')?.getBoundingClientRect()
    if (bounds) position.value.x = Math.max(8, Math.min(position.value.x, window.innerWidth - bounds.width - 8))
  })
}
const dismiss = (restoreFocus = false): void => {
  const index = openedIndex.value
  openedIndex.value = -1
  if (restoreFocus) bar.value?.querySelectorAll<HTMLButtonElement>('button')[index]?.focus()
}
const execute = async(path: number[]) => {
  dismiss()
  await window.electron.ipcRenderer.invoke('mt::menu::execute', path[0], path.slice(1))
  await load()
}
const keyboard = (index: number, event: KeyboardEvent) => {
  if (['Enter', ' ', 'ArrowDown'].includes(event.key)) {
    event.preventDefault()
    if (!items.value[index]?.submenu) { void execute([index]); return }
    if (openedIndex.value === index && event.key !== 'ArrowDown') { dismiss(true); return }
    show(index, event.currentTarget as HTMLElement)
    nextTick(() => panel.value?.focusFirst())
  } else if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault()
    const buttons = Array.from(bar.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])
    const current = buttons.indexOf(event.currentTarget as HTMLButtonElement)
    buttons[(current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
  } else if (event.key === 'Escape') dismiss(true)
}
const outside = (event: PointerEvent) => {
  const target = event.target as Node
  if (!bar.value?.contains(target) && !(target as Element).closest?.('.app-menu-panel')) dismiss()
}
const blur = () => dismiss()

let offClosed: (() => void) | null = null
let offChanged: (() => void) | null = null

onMounted(() => {
  load()
  // The main process rebuilds the menu on language, theme and recents changes.
  offChanged = window.electron.ipcRenderer.on('mt::menu-bar-changed', () => {
    load()
  })
  offClosed = window.electron.ipcRenderer.on('mt::menu::closed', blur)
  window.addEventListener('blur', blur)
  window.addEventListener('resize', blur)
  document.addEventListener('pointerdown', outside, true)
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
  window.removeEventListener('blur', blur)
  window.removeEventListener('resize', blur)
  document.removeEventListener('pointerdown', outside, true)
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
  border-radius: 7px;
}
.menu-bar-item:hover:not(:disabled),
.menu-bar-item.is-open {
  background-color: rgba(128, 128, 128, 0.2);
}
.menu-bar-item:disabled {
  opacity: 0.4;
}
</style>

<style>
.app-top-menu-panel { position: fixed; z-index: 10000; }
</style>
