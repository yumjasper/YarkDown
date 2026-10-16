<template>
  <div
    ref="panel"
    class="app-menu-panel"
    role="menu"
    @scroll="opened = -1"
    @keydown="keyboard"
  >
    <template
      v-for="(item, index) in items"
      :key="item.index ?? index"
    >
      <div
        v-if="item.visible !== false && item.type === 'separator'"
        class="app-menu-separator"
        role="separator"
      />
      <div
        v-else-if="item.visible !== false"
        class="app-menu-entry"
        @mouseenter="hover(index)"
      >
        <button
          type="button"
          :role="item.checked === undefined ? 'menuitem' : item.type === 'radio' ? 'menuitemradio' : 'menuitemcheckbox'"
          :aria-checked="item.checked"
          :aria-haspopup="item.submenu ? 'menu' : undefined"
          :aria-expanded="item.submenu ? opened === index : undefined"
          :disabled="!item.enabled"
          :data-index="index"
          @mousedown.prevent
          @click.stop="choose(item, index)"
        >
          <span class="app-menu-check">{{ item.checked ? '✓' : '' }}</span>
          <span class="app-menu-label">{{ item.label.replace(/&(?=.)/g, '') }}</span>
          <span class="app-menu-key">{{ item.accelerator }}</span>
          <span class="app-menu-arrow">{{ item.submenu ? '›' : '' }}</span>
        </button>
        <teleport to="body">
          <menu-panel
            v-if="item.submenu && opened === index"
            :ref="setChild"
            class="app-menu-child"
            :style="{ left: `${childPosition.x}px`, top: `${childPosition.y}px` }"
            :items="item.children || []"
            :path="[...path, item.index ?? index]"
            @select="emit('select', $event)"
            @dismiss="emit('dismiss')"
            @back="closeChild(index)"
          />
        </teleport>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, type ComponentPublicInstance } from 'vue'
import type { MenuBarItem } from '@shared/types/menu'
import MenuPanel from './menuPanel.vue'

const props = defineProps<{ items: MenuBarItem[]; path: number[] }>()
const emit = defineEmits<{ select: [path: number[]]; dismiss: []; back: [] }>()
const panel = ref<HTMLElement>()
const child = ref<InstanceType<typeof MenuPanel> | null>(null)
const setChild = (instance: Element | ComponentPublicInstance | null) => { child.value = instance as InstanceType<typeof MenuPanel> | null }
const opened = ref(-1)
const childPosition = ref({ x: 0, y: 0 })
const buttons = () => Array.from(panel.value?.querySelectorAll<HTMLButtonElement>(':scope > .app-menu-entry > button:not(:disabled)') || [])
const focusFirst = () => buttons()[0]?.focus()
defineExpose({ focusFirst })
const hover = (index: number) => {
  opened.value = props.items[index]?.enabled && props.items[index]?.submenu ? index : -1
  const rect = panel.value?.getBoundingClientRect()
  const row = panel.value?.querySelector<HTMLButtonElement>(`:scope > .app-menu-entry > button[data-index="${index}"]`)?.getBoundingClientRect()
  if (rect && row) {
    const childHeight = Math.min(window.innerHeight - 16, (props.items[index]?.children?.filter(item => item.visible !== false).length || 0) * 32 + 12)
    childPosition.value = { x: rect.right + 300 > window.innerWidth ? Math.max(8, rect.left - 280) : rect.right - 2, y: Math.max(8, Math.min(row.top - 5, window.innerHeight - childHeight - 8)) }
  }
}
const choose = (item: MenuBarItem, index: number) => {
  if (!item.enabled) return
  if (item.submenu) { hover(index); nextTick(() => child.value?.focusFirst()) }
  else emit('select', [...props.path, item.index ?? index])
}
const closeChild = (index: number) => {
  opened.value = -1
  nextTick(() => panel.value?.querySelector<HTMLButtonElement>(`:scope > .app-menu-entry > button[data-index="${index}"]`)?.focus())
}
const keyboard = (event: KeyboardEvent) => {
  if (event.defaultPrevented) return
  const entries = buttons(), index = entries.indexOf(document.activeElement as HTMLButtonElement)
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault(); event.stopPropagation()
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length
    entries[target]?.focus()
  } else if (event.key === 'ArrowRight' && index >= 0) {
    const button = entries[index]
    if (button.getAttribute('aria-haspopup')) {
      event.preventDefault(); event.stopPropagation()
      hover(Number(button.dataset.index))
      nextTick(() => child.value?.focusFirst())
    }
  } else if (event.key === 'Escape' || event.key === 'ArrowLeft') {
    event.preventDefault(); event.stopPropagation()
    if (props.path.length > 1) emit('back')
    else emit('dismiss')
  }
}
</script>

<style>
.app-menu-panel { min-width: 240px; max-width: min(360px, calc(100vw - 16px)); max-height: calc(100vh - 80px); overflow-y: auto; box-sizing: border-box; padding: 5px; border: 1px solid var(--floatBorderColor); border-radius: 10px; background: var(--floatBgColor); color: var(--editorColor); box-shadow: 0 8px 28px #00000016; font: 13px/1.5 var(--uiFontFamily); -webkit-app-region: no-drag; }
.app-menu-entry { position: relative; }
.app-menu-entry > button { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 30px; padding: 5px 8px; box-sizing: border-box; border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit; text-align: left; white-space: nowrap; }
.app-menu-entry > button:hover:not(:disabled), .app-menu-entry > button:focus-visible { background: var(--floatHoverColor); }
.app-menu-entry > button:disabled { opacity: .4; }
.app-menu-check, .app-menu-arrow { flex: 0 0 12px; }
.app-menu-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.app-menu-key { color: var(--editorColor50); font-size: 11px; margin-left: 20px; }
.app-menu-separator { height: 1px; margin: 5px 8px; background: var(--floatBorderColor); }
.app-menu-child { position: fixed; z-index: 10001; }
</style>
