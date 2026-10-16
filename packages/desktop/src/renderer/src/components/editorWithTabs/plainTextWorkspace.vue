<template>
  <div
    ref="root"
    class="plain-text-workspace"
    :class="{ 'is-split': groups.length > 1, resizing }"
    @keydown.capture="shortcut"
  >
    <template
      v-for="(group, index) in groups"
      :key="group.id"
    >
      <div
        v-if="index"
        class="plain-text-divider"
        role="separator"
        tabindex="0"
        :aria-label="label('调整编辑器宽度', 'Resize editors')"
        aria-orientation="vertical"
        aria-valuemin="20"
        aria-valuemax="80"
        :aria-valuenow="Math.round(ratio)"
        @pointerdown="startResize"
        @pointermove="resizePane"
        @pointerup="endResize"
        @pointercancel="endResize"
        @lostpointercapture="endResize"
        @dblclick="ratio = 50"
        @keydown="resizeKey"
      />
      <section
        class="plain-text-group"
        :class="{ focused: activeGroup === group.id }"
        :style="groups.length > 1 && !index ? { flex: `0 0 calc(${ratio}% - 3px)` } : undefined"
        :aria-label="index ? label('右侧编辑器', 'Right editor') : label('左侧编辑器', 'Left editor')"
        @pointerdown.capture="activate(group.id)"
      >
        <header class="plain-text-group-bar">
          <select
            :value="group.fileId"
            :aria-label="label('选择 TXT 文件', 'Choose TXT file')"
            @change="chooseFile(group.id, ($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="file in textTabs"
              :key="file.id"
              :value="file.id"
            >
              {{ file.isSaved ? '' : '● ' }}{{ file.filename }}
            </option>
          </select>
          <button
            v-if="groups.length === 1"
            :aria-label="label('向右拆分编辑器', 'Split editor right')"
            :title="label('向右拆分编辑器（Ctrl+\\）', 'Split editor right (Ctrl+\\)')"
            @click="split"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            ><path d="M3 4h18v16H3ZM12 4v16" /></svg>
          </button>
          <button
            v-else
            :aria-label="label('关闭编辑器组', 'Close editor group')"
            :title="label('关闭此栏，保留文件', 'Close this group and keep the file open')"
            @click="closeGroup(group.id)"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            ><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <div
          class="plain-text-group-body"
          :class="{ 'has-minimap': preferences.minimapEnabled, 'minimap-left': preferences.minimapSide === 'left' }"
        >
          <plain-text-editor
            v-if="group.fileId"
            :ref="instance => setEditor(group.id, instance)"
            :file-id="group.fileId"
            :pool="pool"
            :active="active"
            :focused="activeGroup === group.id"
            @activate="activate(group.id)"
          />
          <editor-minimap
            v-if="group.fileId && preferences.minimapEnabled"
            :plain-text="true"
            :source-code="false"
          />
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, markRaw, nextTick, onBeforeUnmount, ref, watch, type ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { isPlainTextFile } from '@shared/plainText'
import PlainTextEditor from './plainText.vue'
const EditorMinimap = defineAsyncComponent(() => import('../minimap/index.vue'))
import { PlainTextDocuments } from './plainTextDocuments'

const props = defineProps<{ active: boolean }>()
const { locale } = useI18n()
const label = (zh: string, en: string) => locale.value.startsWith('zh') ? zh : en
const store = useEditorStore()
const preferences = usePreferencesStore()
const pool = markRaw(new PlainTextDocuments())
const root = ref<HTMLElement>()
const groups = ref([{ id: 0, fileId: store.currentFile?.id || '' }])
const activeGroup = ref(0), ratio = ref(50), resizing = ref(false)
const textTabs = computed(() => store.tabs.filter(file => isPlainTextFile(file.filename)))
const editors = new Map<number, InstanceType<typeof PlainTextEditor>>()
let nextGroup = 1
const setEditor = (id: number, instance: Element | ComponentPublicInstance | null) => {
  if (instance) editors.set(id, instance as InstanceType<typeof PlainTextEditor>)
  else editors.delete(id)
}
const activate = (id: number) => {
  if (!props.active) return
  const group = groups.value.find(group => group.id === id)
  const file = textTabs.value.find(file => file.id === group?.fileId)
  if (!group || !file) return
  if (activeGroup.value !== id) editors.get(activeGroup.value)?.flush()
  activeGroup.value = id
  if (store.currentFile?.id !== file.id) store.UPDATE_CURRENT_FILE(file)
}
const chooseFile = (id: number, fileId: string) => {
  const group = groups.value.find(group => group.id === id)
  const file = textTabs.value.find(file => file.id === fileId)
  if (!group || !file) return
  editors.get(id)?.flush()
  group.fileId = fileId
  activate(id)
  nextTick(() => editors.get(id)?.focus())
}
const split = async() => {
  if (!props.active || groups.value.length > 1) return
  const original = groups.value[0]
  if (!original?.fileId) return
  editors.get(original.id)?.flush()
  const id = nextGroup++
  groups.value.push({ id, fileId: original.fileId })
  activeGroup.value = id
  ratio.value = 50
  await nextTick()
  editors.get(id)?.focus()
}
const closeGroup = (id: number) => {
  if (groups.value.length < 2) return
  editors.get(id)?.flush()
  groups.value = groups.value.filter(group => group.id !== id)
  const remaining = groups.value[0]
  if (!remaining) return
  activate(remaining.id)
  nextTick(() => editors.get(remaining.id)?.focus())
}
const shortcut = (event: KeyboardEvent) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.code !== 'Backslash') return
  event.preventDefault()
  event.stopPropagation()
  void split()
}
const startResize = (event: PointerEvent) => {
  if (event.button !== 0) return
  event.preventDefault()
  resizing.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
const resizePane = (event: PointerEvent) => {
  if (!resizing.value || !root.value) return
  const rect = root.value.getBoundingClientRect()
  ratio.value = Math.max(20, Math.min(80, (event.clientX - rect.left) / rect.width * 100))
}
const endResize = () => { resizing.value = false }
const resizeKey = (event: KeyboardEvent) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return
  event.preventDefault()
  ratio.value = event.key === 'Home' ? 50 : Math.max(20, Math.min(80, ratio.value + (event.key === 'ArrowLeft' ? -5 : 5)))
}
watch(() => [store.currentFile?.id, props.active] as const, ([id, active]) => {
  if (!active || !id || !textTabs.value.some(file => file.id === id)) return
  const group = groups.value.find(group => group.id === activeGroup.value)
  if (group) group.fileId = id
})
watch(() => textTabs.value.map(file => file.id), ids => {
  const currentId = store.currentFile?.id || ''
  for (const group of groups.value) {
    if (!ids.includes(group.fileId)) group.fileId = ids.includes(currentId) ? currentId : ids[0] || ''
  }
  nextTick(() => pool.prune(ids))
})
onBeforeUnmount(() => pool.clear())
</script>

<style scoped>
.plain-text-workspace { display: flex; height: 100%; min-width: 0; overflow: hidden; }
.plain-text-group { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.plain-text-group-bar { display: flex; align-items: center; gap: 8px; height: 33px; flex-shrink: 0; padding: 0 8px 0 12px; background: var(--editorColor04); border-bottom: 2px solid transparent; }
.plain-text-group.focused > .plain-text-group-bar { border-bottom-color: var(--themeColor); }
.plain-text-group-bar select { flex: 1; min-width: 0; color: var(--editorColor); background: var(--editorBgColor); border: 0; border-radius: 3px; padding: 3px 5px; font: 12px var(--uiFontFamily); text-overflow: ellipsis; }
.plain-text-group-bar button { display: grid; place-items: center; border: 0; border-radius: 3px; background: transparent; color: var(--editorColor50); cursor: pointer; padding: 4px; }
.plain-text-group-bar button:hover { color: var(--editorColor); background: var(--editorColor10); }
.plain-text-group-bar button:focus-visible, .plain-text-divider:focus-visible { outline: 2px solid var(--themeColor); outline-offset: -2px; }
.plain-text-group-bar svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.5; }
.plain-text-group-body { flex: 1; position: relative; min-height: 0; min-width: 0; }
.plain-text-divider { flex: 0 0 6px; cursor: col-resize; background: var(--editorColor04); touch-action: none; }
.plain-text-divider:hover, .plain-text-divider:focus-visible, .resizing .plain-text-divider { background: var(--themeColor); }
.resizing { cursor: col-resize; user-select: none; }
.plain-text-group-body.has-minimap:not(.minimap-left) :deep(.CodeMirror-lines) { padding-right: calc(var(--minimap-width) + 12px); }
.plain-text-group-body.has-minimap.minimap-left > :deep(.plain-text-editor) { margin-left: calc(var(--minimap-width) + 12px); width: calc(100% - var(--minimap-width) - 12px); }
.plain-text-group-body.minimap-left :deep(.editor-minimap) { left: 0; right: auto; }
</style>
