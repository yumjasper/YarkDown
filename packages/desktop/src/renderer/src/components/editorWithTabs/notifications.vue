<template>
  <div
    v-if="currentNotification"
    v-ui-motion.appear="currentNotification"
    class="editor-notifications"
    :class="currentNotification.style"
    :style="{ 'max-width': `calc(100vw - ${effectiveSideBarWidth}px)` }"
  >
    <span
      class="notification-dot"
      aria-hidden="true"
    />
    <p
      class="msg"
      role="status"
    >
      {{ currentNotification.msg }}
    </p>
    <div class="notification-actions">
      <button
        v-if="currentNotification.showConfirm"
        type="button"
        class="notification-button"
        @click.stop="handleClick(true)"
      >
        {{ t('common.ok') }}
      </button>
      <button
        type="button"
        class="notification-dismiss"
        :aria-label="t('dialog.close')"
        :title="t('dialog.close')"
        @click.stop="handleClick(false)"
      >
        <el-icon :size="12">
          <Close />
        </el-icon>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { vUiMotion } from '@/util/uiMotion'
import { computed } from 'vue'
import { useEditorStore } from '@/store/editor'
import { useLayoutStore } from '@/store/layout'
import { storeToRefs } from 'pinia'
import { Close } from '@element-plus/icons-vue'
import { t } from '../../i18n'

const editorStore = useEditorStore()
const layoutStore = useLayoutStore()

const { currentFile } = storeToRefs(editorStore)
const { effectiveSideBarWidth } = storeToRefs(layoutStore)

const currentNotification = computed(() => {
  const notifications = currentFile.value?.notifications
  if (!notifications || notifications.length === 0) {
    return null
  }
  return notifications[0]
})

const handleClick = (status: boolean) => {
  const notifications = currentFile.value?.notifications
  if (!notifications || notifications.length === 0) {
    console.error(t('editor.notifications.notificationNotFound'))
    return
  }

  const item = notifications.shift()
  const action = item?.action
  if (action) {
    action(status)
  }
}
</script>

<style scoped>
.editor-notifications {
  /* Accent per severity: the banner tint, border, dot and the action button
     all derive from this one value so the three variants stay in step. */
  --notification-accent: var(--notificationPrimaryBg);

  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  margin: 6px 10px 10px;
  padding: 7px 10px 7px 12px;
  border: 1px solid color-mix(in srgb, var(--notification-accent) 26%, transparent);
  border-radius: var(--shell-panel-radius, 10px);
  background: color-mix(in srgb, var(--notification-accent) 9%, var(--editorBgColor));
  color: var(--editorColor80);
  font: 13px/1.5 var(--uiFontFamily);
  user-select: none;

  &.warn {
    --notification-accent: var(--notificationWarningBg);
  }

  &.crit {
    --notification-accent: var(--notificationErrorBg);
  }
}

.notification-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--notification-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--notification-accent) 20%, transparent);
}

.msg {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.notification-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
}

.notification-button,
.notification-dismiss {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  box-sizing: border-box;
  border: 1px solid transparent;
  border-radius: 7px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.notification-button {
  padding: 0 12px;
  border-color: color-mix(in srgb, var(--notification-accent) 42%, transparent);
  background: var(--editorBgColor);
  color: var(--editorColor);
}

.notification-button:hover {
  background: color-mix(in srgb, var(--notification-accent) 12%, var(--editorBgColor));
}

.notification-button:active {
  background: color-mix(in srgb, var(--notification-accent) 18%, var(--editorBgColor));
}

.notification-dismiss {
  width: 26px;
  padding: 0;
  background: transparent;
  color: var(--editorColor50);
}

.notification-dismiss:hover {
  background: color-mix(in srgb, var(--editorColor) 8%, transparent);
  color: var(--editorColor);
}

.notification-button:focus-visible,
.notification-dismiss:focus-visible {
  outline: 2px solid var(--themeColor);
  outline-offset: 1px;
}
</style>
