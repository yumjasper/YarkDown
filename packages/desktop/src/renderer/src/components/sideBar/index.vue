<template>
  <div
    v-show="showSideBar"
    ref="sideBar"
    v-ui-motion="showSideBar"
    class="side-bar"
    :style="{ width: `${finalSideBarWidth}px` }"
  >
    <div class="side-bar-rail">
      <button
        v-for="tab of visibleSideBarIcons"
        :key="tab.id"
        type="button"
        class="rail-icon"
        :class="{ active: tab.id === rightColumn }"
        :title="tab.name()"
        :aria-label="tab.name()"
        :aria-pressed="tab.id === rightColumn"
        @click="handleLeftIconClick(tab.id)"
      >
        <component :is="tab.icon" />
      </button>
      <div class="rail-bottom">
        <button
          type="button"
          class="rail-icon"
          aria-label="打开小憩"
          title="小憩 · Ctrl+Alt+G"
          @pointerdown.prevent
          @click="bus.emit('open-arcade')"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path
              d="M7 7h10c3 0 4 3 4 6l1 4c0 3-3 4-5 1l-2-2H9l-2 2c-2 3-5 2-5-1l1-4c0-3 1-6 4-6ZM6 10v5M3.5 12.5h5M16 11h.01M19 14h.01"
            />
          </svg>
        </button>
        <button
          type="button"
          class="rail-icon rail-settings"
          :title="settingsEntry.name()"
          @click="openSettings"
        >
          <component :is="settingsEntry.icon" />
        </button>
      </div>
    </div>
    <div
      v-show="rightColumn"
      v-ui-motion.slide="rightColumn"
      class="right-column"
    >
      <tree
        v-if="rightColumn === 'files'"
        :project-tree="projectTree"
        :tabs="tabs"
      />
      <side-bar-search v-else-if="rightColumn === 'search'" />
      <pdf-navigation
        v-else-if="pdf && ['toc', 'pdf-thumbnails'].includes(rightColumn)"
        :mode="rightColumn === 'toc' ? 'outline' : 'thumbnails'"
      />
      <toc v-else-if="rightColumn === 'toc' && !plainText" />
    </div>
    <div
      v-show="rightColumn"
      ref="dragBar"
      class="drag-bar"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { vUiMotion } from '@/util/uiMotion'
import { useLayoutStore } from '@/store/layout'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import { isPlainTextFile } from '@shared/plainText'
import { isPdfFile } from '@shared/pdf'

import { sideBarIcons, sideBarBottomIcons } from './help'
import Tree from './tree.vue'
import SideBarSearch from './search.vue'
import Toc from './toc.vue'
import PdfNavigation from './pdf.vue'
import { Grid } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { SIDEBAR_RAIL_WIDTH, MIN_SIDEBAR_CONTENT_WIDTH } from '@/util/shellLayout'
import bus from '@/bus'

const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const editorStore = useEditorStore()
const { locale } = useI18n()

const sideBar = ref<HTMLDivElement | null>(null)
const dragBar = ref<HTMLDivElement | null>(null)

const sideBarViewWidth = ref(Number(layoutStore.sideBarWidth))

const { rightColumn, showSideBar, sideBarWidth } = storeToRefs(layoutStore)

const { projectTree } = storeToRefs(projectStore)
const { tabs } = storeToRefs(editorStore)
const plainText = computed(() => {
  const filename = editorStore.currentFile?.filename || ''
  return isPlainTextFile(filename)
})
const pdf = computed(() => editorStore.editorActivated && isPdfFile(editorStore.currentFile?.filename || ''))
const visibleSideBarIcons = computed(() => [
  ...sideBarIcons.filter((tab) => !plainText.value || tab.id !== 'toc'),
  ...(pdf.value
    ? [
        {
          id: 'pdf-thumbnails',
          name: () => (locale.value.startsWith('zh') ? 'PDF 缩略图' : 'PDF thumbnails'),
          icon: Grid
        }
      ]
    : [])
])
watch(
  pdf,
  (value) => {
    if (value && rightColumn.value === 'files' && showSideBar.value)
      layoutStore.SET_LAYOUT({ rightColumn: 'toc' })
    if (!value && rightColumn.value === 'pdf-thumbnails')
      layoutStore.SET_LAYOUT({ rightColumn: plainText.value ? 'files' : 'toc' })
  },
  { immediate: true }
)
let markdownColumn: string | undefined
watch(
  plainText,
  (value) => {
    if (value && rightColumn.value === 'toc') {
      markdownColumn = 'toc'
      layoutStore.SET_LAYOUT({ rightColumn: 'files' })
    } else if (!value && markdownColumn) {
      if (rightColumn.value === 'files') layoutStore.SET_LAYOUT({ rightColumn: markdownColumn })
      markdownColumn = undefined
    }
  },
  { immediate: true }
)

const RAIL_WIDTH = SIDEBAR_RAIL_WIDTH
const MIN_CONTENT_WIDTH = MIN_SIDEBAR_CONTENT_WIDTH
watch(sideBarWidth, (width) => {
  sideBarViewWidth.value = Number(width)
})

// sideBarWidth stores the resizable content column; the icon rail adds a
// fixed strip in front of it.
const finalSideBarWidth = computed<number>(() => {
  if (!showSideBar.value) return 0
  if (rightColumn.value === '') return RAIL_WIDTH
  return RAIL_WIDTH + Math.max(MIN_CONTENT_WIDTH, sideBarViewWidth.value)
})

onMounted(() => {
  nextTick(() => {
    const dragBarEl = dragBar.value
    if (!dragBarEl) return
    let startX = 0
    let currentContentWidth = +sideBarWidth.value
    let startWidth = currentContentWidth

    sideBarViewWidth.value = currentContentWidth

    const mouseUpHandler = (): void => {
      document.removeEventListener('mousemove', mouseMoveHandler, false)
      document.removeEventListener('mouseup', mouseUpHandler, false)
      layoutStore.CHANGE_SIDE_BAR_WIDTH(
        currentContentWidth < MIN_CONTENT_WIDTH ? MIN_CONTENT_WIDTH : currentContentWidth
      )
    }

    const mouseMoveHandler = (event: MouseEvent): void => {
      const offset = event.clientX - startX
      currentContentWidth = startWidth + offset
      sideBarViewWidth.value = currentContentWidth
    }

    const mouseDownHandler = (event: MouseEvent): void => {
      startX = event.clientX
      startWidth = +sideBarWidth.value
      document.addEventListener('mousemove', mouseMoveHandler, false)
      document.addEventListener('mouseup', mouseUpHandler, false)
    }

    dragBarEl.addEventListener('mousedown', mouseDownHandler, false)
  })
})

const settingsEntry = sideBarBottomIcons[0]

const openSettings = (): void => {
  projectStore.OPEN_SETTING_WINDOW()
}

const handleLeftIconClick = (name: string): void => {
  if (rightColumn.value === name) {
    // Capture the expanded width BEFORE collapsing: once rightColumn is '',
    // finalSideBarWidth evaluates to the bare rail width and would overwrite
    // the user's real width with the clamped minimum (#2421).
    const widthToPersist = Math.max(MIN_CONTENT_WIDTH, sideBarViewWidth.value)
    layoutStore.SET_LAYOUT({ rightColumn: '' })
    layoutStore.CHANGE_SIDE_BAR_WIDTH(widthToPersist)
  } else {
    const needDispatch = rightColumn.value === ''
    layoutStore.SET_LAYOUT({ rightColumn: name })
    sideBarViewWidth.value = +sideBarWidth.value
    if (needDispatch) {
      layoutStore.CHANGE_SIDE_BAR_WIDTH(sideBarViewWidth.value)
    }
  }
}
</script>

<style scoped>
.side-bar {
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
  flex-grow: 0;
  height: calc(100vh - var(--titleBarHeight) - var(--menuBarHeight));
  margin-top: calc(var(--titleBarHeight) + var(--menuBarHeight));
  min-width: 0;
  position: relative;
  color: var(--sideBarColor);
  user-select: none;
  background: var(--shell-bg);
  box-sizing: border-box;
  font-size: 13px;
  line-height: 1.5;
}

/* Vertical icon rail: the three views are switched by their icons, the
   settings entry sits at the bottom like in VS Code. */
.side-bar-rail {
  flex: none;
  width: 45px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 0;
  box-sizing: border-box;
}
.rail-icon {
  position: relative;
  border: none;
  background: transparent;
  padding: 8px 0;
  width: 34px;
  height: 34px;
  border-radius: var(--shell-item-radius);
  display: flex;
  justify-content: center;
  cursor: pointer;
}
.rail-icon svg {
  width: 18px;
  height: 18px;
  color: var(--sideBarIconColor);
}
.rail-icon:hover svg {
  color: var(--themeColor);
}
.rail-icon:hover,
.rail-icon.active {
  background: var(--editorColor10);
}
.rail-icon.active svg {
  color: var(--themeColor);
}
.rail-icon.active::before {
  content: '';
  position: absolute;
  left: -5px;
  top: 7px;
  bottom: 7px;
  width: 2px;
  background: var(--themeColor);
  border-radius: 1px;
}
.rail-settings {
  margin-top: 0;
}
.rail-bottom {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.right-column {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  --sidebar-inset: 10px;
  padding-top: 0;
  box-sizing: border-box;
  margin-top: 4px;
  margin-bottom: 6px;
  background: color-mix(in srgb, var(--editorBgColor) 98%, var(--editorColor));
  border: 1px solid var(--editorColor10);
  border-radius: var(--shell-panel-radius);
}
.right-column :deep(.opened-file),
.right-column :deep(.side-bar-file),
.right-column :deep(.folder-name) {
  margin-inline: 6px;
  border-radius: var(--shell-item-radius);
}
.right-column :deep(.opened-file.active) {
  background: var(--themeColor20);
}
.right-column :deep(.side-bar-file.current::before) {
  height: 16px;
  border-radius: 2px;
}
.right-column :deep(.el-tree-node__content) {
  margin-right: 6px;
  border-radius: var(--shell-item-radius);
}
.right-column :deep(.search-wrapper) {
  border-radius: var(--shell-item-radius);
}
.right-column :deep(.matches ul li) {
  border-radius: var(--shell-item-radius);
}
.right-column :deep(.opened-files > .title),
.right-column :deep(.project-tree > .title) {
  padding-inline: var(--sidebar-inset);
}
.right-column :deep(.search-wrapper) {
  margin: var(--sidebar-inset);
}

.drag-bar {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  height: 100%;
  width: 3px;
  cursor: col-resize;
}

.drag-bar:hover {
  border-right: 2px solid var(--iconColor);
}
</style>
