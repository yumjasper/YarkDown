<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, shallowRef, watch } from 'vue'
const InlineGame = defineAsyncComponent(() => import('./inlineGame.vue'))

const props = defineProps<{ root: HTMLElement | null }>()
const slots = shallowRef<Array<{ element: HTMLElement; id: string; key: number }>>([])
let observer: MutationObserver | undefined
let key = 0
const keys = new WeakMap<HTMLElement, number>()

function sync(): void {
  const next = [...(props.root?.querySelectorAll<HTMLElement>('.mu-game-preview[data-game]') ?? [])].map((element) => {
    if (!keys.has(element)) keys.set(element, ++key)
    return { element, id: element.dataset.game ?? '', key: keys.get(element) ?? 0 }
  })
  if (next.length !== slots.value.length || next.some((slot, index) => slot.element !== slots.value[index]?.element || slot.id !== slots.value[index]?.id)) slots.value = next
}

watch(() => props.root, (root) => {
  observer?.disconnect()
  slots.value = []
  if (!root) return
  observer = new MutationObserver((records) => {
    // SVG games animate their own DOM; only changes outside a game, or its identifier, affect mounts.
    if (records.some((record) => record.type === 'attributes' || !(record.target instanceof Element) || !record.target.closest('.mu-game-preview'))) sync()
  })
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-game'] })
  sync()
}, { immediate: true })
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <teleport
    v-for="slot in slots"
    :key="`${slot.key}:${slot.id}`"
    :to="slot.element"
  >
    <inline-game :id="slot.id" />
  </teleport>
</template>

<style>
.mu-game-preview { display:block; }
.mu-game-block > .mu-paragraph-content { display:block; font:12px/1.6 var(--codeFontFamily,monospace); color:var(--editorColor50); }
.mu-game-block.mu-active > .mu-paragraph-content { color:var(--editorColor); }
.mu-game-preview button { -webkit-app-region:no-drag; }
@media print { .mu-game-preview { display:none; } }
</style>
