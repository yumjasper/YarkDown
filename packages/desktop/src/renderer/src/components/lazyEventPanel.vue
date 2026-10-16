<template>
  <component
    :is="panel"
    v-if="panel"
    @vue:mounted="replay"
  />
</template>

<script setup lang="ts">
import { markRaw, onBeforeUnmount, shallowRef, type Component } from 'vue'
import bus from '@/bus'

const props = defineProps<{
  event: string
  loader: () => Promise<{ default: Component }>
}>()
const emit = defineEmits<{ ready: [] }>()
const panel = shallowRef<Component>()
let ready = false
let loading = false
let disposed = false
let pending: unknown
const request = (payload: unknown) => {
  if (ready) return
  pending = payload
  if (loading) return
  loading = true
  void props.loader().then(module => {
    if (!disposed) panel.value = markRaw(module.default)
  }).catch(error => {
    loading = false
    console.error('Unable to load panel:', props.event, error)
  })
}
const replay = () => {
  if (ready) return
  // The real panel has registered its listeners; an async placeholder cannot acknowledge readiness.
  ready = true
  bus.emit(props.event, pending)
  pending = undefined
  emit('ready')
}
bus.on(props.event, request)
onBeforeUnmount(() => {
  disposed = true
  bus.off(props.event, request)
})
</script>
