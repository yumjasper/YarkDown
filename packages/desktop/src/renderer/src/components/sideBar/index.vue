<template>
  <div
    v-show="showSideBar"
    ref="sideBar"
    class="side-bar"
    :style="{ width: `${finalSideBarWidth}px` }"
  >
    <div class="side-bar-rail">
      <button
        v-for="tab of sideBarIcons"
        :key="tab.id"
        type="button"
        class="rail-icon"
        :class="{ active: tab.id === rightColumn }"
        :title="tab.name()"
        @click="handleLeftIconClick(tab.id)"
      >
        <component :is="tab.icon" />
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
    <div
      v-show="rightColumn"
      class="right-column"
    >
      <tree
        v-if="rightColumn === 'files'"
        :project-tree="projectTree"
        :opened-files="openedFiles"
        :tabs="tabs"
      />
      <side-bar-search v-else-if="rightColumn === 'search'" />
      <toc v-else-if="rightColumn === 'toc'" />
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
import { useLayoutStore } from '@/store/layout'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'

import { sideBarIcons, sideBarBottomIcons } from './help'
import Tree from './tree.vue'
import SideBarSearch from './search.vue'
import Toc from './toc.vue'
import { storeToRefs } from 'pinia'
import type { TabDescriptor } from './types'
import { SIDEBAR_RAIL_WIDTH, MIN_SIDEBAR_CONTENT_WIDTH } from '@/util/shellLayout'

const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const editorStore = useEditorStore()

const sideBar = ref<HTMLDivElement | null>(null)
const dragBar = ref<HTMLDivElement | null>(null)

const openedFiles = ref<TabDescriptor[]>([])
const sideBarViewWidth = ref(Number(layoutStore.sideBarWidth))

const { rightColumn, showSideBar, sideBarWidth } = storeToRefs(layoutStore)

const { projectTree } = storeToRefs(projectStore)
const { tabs } = storeToRefs(editorStore)

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
  background: color-mix(in srgb, var(--editorBgColor) 96%, var(--editorColor));
  border-right: 1px solid var(--editorColor10);
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
  border-right: 1px solid var(--editorColor04);
}
.rail-icon {
  position: relative;
  border: none;
  background: transparent;
  padding: 9px 0;
  width: 100%;
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
.rail-icon.active svg {
  color: var(--themeColor);
}
.rail-icon.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 7px;
  bottom: 7px;
  width: 2px;
  background: var(--themeColor);
  border-radius: 1px;
}
.rail-settings {
  margin-top: auto;
}

.right-column {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
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
