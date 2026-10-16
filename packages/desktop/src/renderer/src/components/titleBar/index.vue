<template>
  <div>
    <div
      v-if="showTitleBar"
      class="title-bar-editor-bg"
      :class="{ 'tabs-visible': showTabBar }"
    />
    <div
      v-if="showTitleBar"
      class="title-bar-stack"
      :class="[
        { active: active },
        { 'tabs-visible': showTabBar },
        { frameless: titleBarStyle === 'custom' },
        { isOsx: isOsx }
      ]"
    >
      <div
        class="title-bar"
        @dblclick.stop="toggleMaxmizeOnMacOS"
      >
        <div
          v-if="showCustomTitleBar"
          class="left-toolbar-spacer title-no-drag"
        >
          <img
            class="window-app-icon"
            :src="appIcon"
            alt=""
          >
        </div>
        <div
          class="title"
          @dblclick.stop="toggleMaxmizeOnMacOS"
        >
          <span v-if="!filename">YarkText</span>
          <span v-else>
            <span
              class="save-dot"
              :class="{ show: !isSaved }"
            />
            <span class="path">
              <bdi dir="ltr">
                <span
                  v-for="(path, index) of paths"
                  :key="index"
                >
                  {{ path }}
                  <el-icon
                    class="path-arrow"
                    :size="12"
                  >
                    <ArrowRight />
                  </el-icon>
                </span>
                <span
                  class="filename"
                  :class="{ isOsx: platform === 'darwin' }"
                  @click="rename"
                >
                  {{ filename }}
                </span>
              </bdi>
            </span>
          </span>
        </div>
        <div
          v-if="titleBarStyle === 'custom' && !isFullScreen && !isOsx"
          class="right-toolbar"
          :class="[{ 'title-no-drag': titleBarStyle === 'custom' }]"
        >
          <div
            class="frameless-titlebar-button frameless-titlebar-close"
            @click.stop="handleCloseClick"
          >
            <div>
              <svg
                width="10"
                height="10"
              >
                <path :d="windowIconClose" />
              </svg>
            </div>
          </div>
          <div
            class="frameless-titlebar-button frameless-titlebar-toggle"
            @click.stop="handleMaximizeClick"
          >
            <div>
              <svg
                width="10"
                height="10"
              >
                <path
                  v-show="!isMaximized"
                  :d="windowIconMaximize"
                />
                <path
                  v-show="isMaximized"
                  :d="windowIconRestore"
                />
              </svg>
            </div>
          </div>
          <div
            class="frameless-titlebar-button frameless-titlebar-minimize"
            @click.stop="handleMinimizeClick"
          >
            <div>
              <svg
                width="10"
                height="10"
              >
                <path :d="windowIconMinimize" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <div
        v-if="showCustomTitleBar"
        class="menu-row title-no-drag"
      >
        <menu-bar />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePreferencesStore } from '@/store/preferences.js'
import { useLayoutStore } from '@/store/layout.js'
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { minimizePath, restorePath, maximizePath, closePath } from '../../assets/window-controls.js'
import { PATH_SEPARATOR } from '../../config'
import { isMac as isOsxPlatform } from '@/util'
import { shouldShowInAppTitleBar } from './visibility'
import MenuBar from './menuBar.vue'
import { pathBreadcrumb } from './pathBreadcrumb'
import { useEditorStore } from '@/store/editor'
import { ArrowRight } from '@element-plus/icons-vue'
import appIcon from '@/assets/images/logo.png'

interface ProjectInfo {
  name?: string
  [key: string]: unknown
}

const props = defineProps<{
  project?: ProjectInfo | null
  filename?: string
  pathname?: string
  active?: boolean
  platform?: string
  isSaved?: boolean
}>()

const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()
const editorStore = useEditorStore()

const isOsx = isOsxPlatform
const windowIconMinimize = minimizePath
const windowIconRestore = restorePath
const windowIconMaximize = maximizePath
const windowIconClose = closePath

const isFullScreen = ref(false)
const isMaximized = ref(false)

onMounted(async () => {
  try {
    const [fs, max] = await Promise.all([
      window.electron.windowControl.isFullScreen(),
      window.electron.windowControl.isMaximized()
    ])
    isFullScreen.value = !!fs
    isMaximized.value = !!max
  } catch {
    // Window state is best-effort; keep the previous values if the query fails.
  }
})

const { titleBarStyle } = storeToRefs(preferencesStore)
const { showTabBar } = storeToRefs(layoutStore)

const paths = computed(() => pathBreadcrumb(props.pathname ?? '', PATH_SEPARATOR))

const showCustomTitleBar = computed(() => {
  return titleBarStyle.value === 'custom' && !isOsx
})

const showTitleBar = computed(() => {
  return shouldShowInAppTitleBar(titleBarStyle.value, isOsx)
})

watch(
  () => props.filename,
  (value) => {
    // Set filename when hover on dock
    const hasOpenFolder = !!(props.project && props.project.name)
    const projectName = props.project?.name ?? ''
    let title: string
    if (value) {
      title = hasOpenFolder ? `${value} - ${projectName}` : `${value}`
    } else {
      title = hasOpenFolder ? projectName : ''
    }

    document.title = title
  }
)

const handleCloseClick = () => {
  window.electron.windowControl.close()
}

const handleMaximizeClick = async () => {
  if (isFullScreen.value) {
    window.electron.windowControl.setFullScreen(false)
    return
  }
  if (isMaximized.value) window.electron.windowControl.unmaximize()
  else window.electron.windowControl.maximize()
}

const toggleMaxmizeOnMacOS = () => {
  if (isOsx) {
    handleMaximizeClick()
  }
}

const handleMinimizeClick = () => {
  window.electron.windowControl.minimize()
}

const rename = () => {
  if (props.platform === 'darwin') {
    editorStore.RESPONSE_FOR_RENAME()
  }
}

const onMaximize = () => {
  isMaximized.value = true
}
const onUnmaximize = () => {
  isMaximized.value = false
}
const onEnterFullScreen = () => {
  isFullScreen.value = true
}
const onLeaveFullScreen = () => {
  isFullScreen.value = false
}

const offMaximize = window.electron.ipcRenderer.on('mt::window-maximize', onMaximize)
const offUnmaximize = window.electron.ipcRenderer.on('mt::window-unmaximize', onUnmaximize)
const offEnterFullScreen = window.electron.ipcRenderer.on(
  'mt::window-enter-full-screen',
  onEnterFullScreen
)
const offLeaveFullScreen = window.electron.ipcRenderer.on(
  'mt::window-leave-full-screen',
  onLeaveFullScreen
)

onBeforeUnmount(() => {
  offMaximize()
  offUnmaximize()
  offEnterFullScreen()
  offLeaveFullScreen()
})
</script>

<style scoped>
.title-bar-editor-bg {
  /* Only tint the native DWM surface; an opaque renderer background would hide Acrylic. */
  position: fixed;
  z-index: 2;
  left: 0;
  top: 0;
  width: 100vw;
  height: var(--titleBarHeight);
  background: color-mix(
    in srgb,
    color-mix(in srgb, var(--editorBgColor) 90%, var(--editorColor)) 35%,
    transparent
  );
}
.title-bar-stack {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  z-index: 2;
  color: var(--editorColor);
  transition: color 0.4s ease-in-out;
  user-select: none;
  cursor: default;
}
:global(body.dark) .title-bar-editor-bg {
  background: color-mix(in srgb, var(--editorBgColor) 80%, transparent);
}
.title-bar-stack.active {
  color: var(--editorColor);
}
.title-bar {
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  background: transparent;
  height: var(--titleBarHeight);
  box-sizing: border-box;
}
.menu-row {
  display: flex;
  align-items: center;
  height: var(--menuBarHeight);
  padding: 0 4px;
  background: var(--editorBgColor);
}
img {
  height: 90%;
  margin-top: 1px;
  vertical-align: top;
}
.title {
  flex: 1;
  min-width: 0;
  padding: 0 8px;
  height: 100%;
  line-height: var(--titleBarHeight);
  font-size: 12px;
  font-weight: 400;
  text-align: center;
  transition: color var(--ui-motion-fast) ease;
  & .filename {
    transition: color var(--ui-motion-fast) ease;
  }
}
div.title > span {
  display: flex;
  align-items: baseline;
  justify-content: center;
}

/* Workaround for GH#339: the RTL context clips an over-long path from the left
   so the filename stays visible. The save dot is a sibling rather than a child
   so that clipping can never swallow it. */
div.title > span > .path {
  direction: rtl;
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
  min-width: 0;
}

/* The RTL context above only exists to clip long paths from the left. Isolating
   each segment keeps an RTL folder name from dragging its separator — or the
   segments around it — out of order. */
div.title > span > .path > bdi > span {
  unicode-bidi: isolate;
}

.title-bar .title .filename.isOsx:hover {
  color: var(--themeColor);
}

.active .save-dot {
  flex: none;
  margin-right: 0.25rem;
  width: 8px;
  height: 8px;
  display: inline-block;
  border-radius: 50%;
  background: var(--highlightThemeColor);
  opacity: 0.7;
  visibility: hidden;
}
.active .save-dot.show {
  visibility: visible;
}
.title:hover {
  color: var(--sideBarTitleColor);
}

.left-toolbar-spacer {
  flex: none;
  width: 30px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.window-app-icon {
  width: 16px;
  height: 16px;
  margin: 0;
}
.frameless .title {
  text-align: left;
  padding-left: 0;
}
.frameless .title > span {
  justify-content: flex-start;
}
.right-toolbar {
  flex: none;
  height: 100%;
  display: flex;
  align-items: center;
  flex-direction: row-reverse;
  & .item {
    margin-right: 10px;
  }
}

.title-no-drag {
  -webkit-app-region: no-drag;
}
/* frameless window controls */
.frameless-titlebar-button {
  position: relative;
  display: block;
  width: 46px;
  height: var(--titleBarHeight);
}
.frameless-titlebar-button > div {
  position: absolute;
  display: inline-flex;
  top: 50%;
  left: 50%;
  transform: translateX(-50%) translateY(-50%);
}
.frameless-titlebar-menu {
  color: var(--sideBarColor);
}
.frameless-titlebar-close:hover {
  background-color: rgb(228, 79, 79);
}
.frameless-titlebar-minimize:hover,
.frameless-titlebar-toggle:hover {
  background-color: rgba(0, 0, 0, 0.1);
}
.frameless-titlebar-button svg {
  fill: currentColor;
}
.frameless-titlebar-close:hover svg {
  fill: #ffffff;
}

.text-center-vertical {
  display: inline-block;
  vertical-align: middle;
  line-height: normal;
}
</style>
