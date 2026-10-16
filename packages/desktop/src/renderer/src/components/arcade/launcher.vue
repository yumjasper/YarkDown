<template>
  <lazy-event-panel
    event="open-arcade"
    :loader="() => import('./index.vue')"
    @ready="releaseShortcut"
  />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import LazyEventPanel from '../lazyEventPanel.vue'
import bus from '@/bus'

const launch = (event: KeyboardEvent) => {
  if (event.target instanceof Element && event.target.closest('.inline-game')) return
  if (!event.ctrlKey || !event.altKey || event.metaKey || event.code !== 'KeyG' || event.repeat || event.isComposing) return
  event.preventDefault()
  event.stopImmediatePropagation()
  bus.emit('open-arcade')
}
const releaseShortcut = () => window.removeEventListener('keydown', launch, true)
onMounted(() => window.addEventListener('keydown', launch, true))
onBeforeUnmount(releaseShortcut)
</script>
