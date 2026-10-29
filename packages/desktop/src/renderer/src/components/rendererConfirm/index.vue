<template>
  <div class="renderer-confirm">
    <el-dialog
      v-model="visible"
      :show-close="false"
      :modal="true"
      :close-on-click-modal="false"
      :before-close="dismiss"
      custom-class="ag-dialog-table"
      width="430px"
      @opened="focusPrimary"
    >
      <template #header>
        <div class="renderer-confirm-header">
          <span
            class="renderer-confirm-icon"
            aria-hidden="true"
          >
            <el-icon :size="18"><WarningFilled /></el-icon>
          </span>
          <h2 class="renderer-confirm-title">
            {{ request.title }}
          </h2>
        </div>
      </template>
      <p
        v-if="request.message"
        class="renderer-confirm-message"
      >
        {{ request.message }}
      </p>
      <p
        v-if="request.detail"
        class="renderer-confirm-detail"
      >
        {{ request.detail }}
      </p>
      <ul
        v-if="request.files?.length"
        class="renderer-confirm-files"
      >
        <li
          v-for="(file, index) in request.files"
          :key="`${index}-${file}`"
          :title="file"
        >
          {{ file }}
        </li>
      </ul>
      <template #footer>
        <div class="renderer-confirm-footer">
          <button
            v-for="button in request.buttons"
            :key="button.value"
            :ref="(el) => setButtonRef(el, button)"
            :class="button.primary ? 'button-primary' : 'button'"
            @click="decide(button.value)"
          >
            {{ button.label }}
          </button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { WarningFilled } from '@element-plus/icons-vue'
import type { RendererConfirmButton, RendererConfirmRequest } from '@shared/types/ipc'

// Mounted eagerly in `pages/app.vue`: the unsaved-changes prompt gates window
// close, so this must already be listening before any teardown starts — a
// lazily loaded panel would miss the very event that created it.
const visible = ref(false)
const request = reactive<RendererConfirmRequest & { id: string }>({
  id: '',
  title: '',
  message: '',
  detail: '',
  buttons: [],
  cancelValue: 'cancel',
  files: []
})
// Focusing the primary button is a nicety, not a requirement, so a failed ref
// lookup must not break the prompt.
const buttonRefs = new Map<string, HTMLElement>()

const setButtonRef = (el: unknown, button: RendererConfirmButton): void => {
  if (el instanceof HTMLElement) buttonRefs.set(button.value, el)
  else buttonRefs.delete(button.value)
}

// `mt::renderer-confirm` can fire while a prompt is still open (two windows
// asking in sequence). Each prompt is answered exactly once; this guard keeps a
// stale prompt from settling the newer one with a duplicate answer.
let answered = false

const answer = (value: string): void => {
  if (answered || !request.id) return
  answered = true
  window.electron.ipcRenderer.send('mt::renderer-confirm-result', request.id, value)
}

const decide = (value: string): void => {
  answer(value)
  visible.value = false
}

// Esc and an overlay click both land here. Both mean "do nothing", which is the
// prompt's own cancel value, not necessarily a button the caller rendered.
const dismiss = (done?: () => void): void => {
  answer(request.cancelValue)
  if (done) done()
  else visible.value = false
}

const focusPrimary = (): void => {
  const primary = request.buttons.find((button) => button.primary) ?? request.buttons[0]
  if (primary) buttonRefs.get(primary.value)?.focus()
}

const showConfirm = (incoming: RendererConfirmRequest & { id: string }): void => {
  // A prompt that never got answered would leave main awaiting a decision
  // forever, so settle it with its own cancel value before taking over.
  answer(request.cancelValue)
  buttonRefs.clear()
  request.id = incoming.id
  request.title = incoming.title
  request.message = incoming.message ?? ''
  request.detail = incoming.detail ?? ''
  request.buttons = incoming.buttons ?? []
  request.cancelValue = incoming.cancelValue ?? 'cancel'
  request.files = incoming.files ?? []
  answered = false
  visible.value = true
}

let stopListening: (() => void) | null = null

onMounted(() => {
  stopListening = window.electron.ipcRenderer.on('mt::renderer-confirm', (_event, incoming) => {
    showConfirm(incoming)
  })
})

onBeforeUnmount(() => {
  // An unanswered prompt leaves main's promise pending; answering with the
  // cancel value keeps the caller's "user declined" path intact.
  answer(request.cancelValue)
  stopListening?.()
  stopListening = null
})
</script>

<style scoped>
.renderer-confirm-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 2px 0;
}

.renderer-confirm-icon {
  display: inline-flex;
  color: var(--notificationWarningBg);
}

.renderer-confirm-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--floatFontColor);
}

.renderer-confirm-message {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--floatFontColor);
  white-space: pre-line;
}

.renderer-confirm-detail {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--editorColor60);
  white-space: pre-line;
}

.renderer-confirm-files {
  margin: 0 0 10px;
  padding: 0;
  list-style: none;
  max-height: 168px;
  overflow-y: auto;
  border: 1px solid var(--floatBorderColor);
  border-radius: 8px;
  background: var(--editorColor04);
}

.renderer-confirm-files li {
  padding: 7px 10px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--floatFontColor);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.renderer-confirm-files li + li {
  border-top: 1px solid var(--floatBorderColor);
}

.renderer-confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.renderer-confirm-footer button {
  min-width: 84px;
  font-family: var(--uiFontFamily);
  font-size: 13px;
  line-height: 1.2;
}

.renderer-confirm-footer button:focus-visible {
  outline: 2px solid var(--themeColor);
  outline-offset: 2px;
}
</style>
