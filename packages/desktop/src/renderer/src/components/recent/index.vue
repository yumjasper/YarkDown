<template>
  <main class="recent-files-projects">
    <div class="centered-group">
      <h1>YarkText</h1>
      <p>{{ t('recent.welcome') }}</p>
      <div class="home-actions">
        <el-button
          text
          bg
          data-testid="home-new-file"
          type="primary"
          @click="newFile"
        >
          {{ t('recent.newFile') }}
        </el-button>
        <el-button @click="openFile">
          {{ t('recent.openFile') }}
        </el-button>
        <el-button @click="openFolder">
          {{ t('recent.openFolder') }}
        </el-button>
      </div>
      <el-button
        v-if="editorStore.currentFile"
        data-testid="home-continue"
        class="continue-file"
        @click="editorStore.UPDATE_CURRENT_FILE(editorStore.currentFile)"
      >
        {{ t('recent.continue', { name: editorStore.currentFile.filename }) }}
        {{ editorStore.currentFile.isSaved ? '' : ' ●' }}
      </el-button>
      <section
        v-if="recentFiles.length"
        class="home-recents"
      >
        <h2>{{ t('recent.recentFiles') }}</h2>
        <button
          v-for="pathname in recentFiles"
          :key="pathname"
          :title="pathname"
          @click="openRecent(pathname)"
        >
          <span>{{ basename(pathname) }}</span>
          <small>{{ pathname }}</small>
        </button>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useEditorStore } from '@/store/editor'
import { t } from '../../i18n'

const editorStore = useEditorStore()
const recentFiles = ref<string[]>([])
const basename = (pathname: string): string => window.path.basename(pathname)
const newFile = (): void => {
  editorStore.NEW_UNTITLED_TAB({})
}
const openFile = (): void => {
  window.electron.ipcRenderer.send('mt::cmd-open-file')
}
const openFolder = (): void => {
  window.electron.ipcRenderer.send('mt::ask-for-open-project-in-sidebar')
}
const openRecent = (pathname: string): void => {
  editorStore.FOCUS_FILE(pathname)
  if (!editorStore.tabs.some((tab) => window.fileUtils.isSamePathSync(tab.pathname, pathname))) {
    window.electron.ipcRenderer.send('mt::open-file', pathname)
  }
}

onMounted(async () => {
  recentFiles.value = await window.electron.ipcRenderer.invoke('mt::recent-documents')
})
</script>

<style scoped>
.recent-files-projects {
  background: var(--editorBgColor);
  color: var(--editorColor);
  flex: 1;
  overflow: auto;
  display: flex;
  justify-content: center;
}
.centered-group {
  width: min(560px, 90%);
  padding: clamp(30px, 10vh, 100px) 24px 32px;
}
h1 {
  font-size: 32px;
  font-weight: 600;
  margin: 0 0 12px;
}
p {
  opacity: 0.65;
  margin-bottom: 28px;
}
.home-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.home-actions .el-button {
  margin: 0;
}
.continue-file {
  margin: 22px 0 0;
  max-width: 100%;
}
.home-recents {
  margin-top: 32px;
}
h2 {
  font-size: 14px;
  font-weight: 500;
  opacity: 0.65;
}
.home-recents button {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.home-recents button:hover {
  background: var(--sideBarItemHoverBgColor);
}
.home-recents span,
.home-recents small {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.home-recents small {
  opacity: 0.5;
}

.home-actions .el-button.is-text.is-has-bg {
  background-color: var(--buttonPrimaryBgColor);
  color: var(--buttonPrimaryFontColor);
  border-color: transparent;
}
.home-actions .el-button.is-text.is-has-bg:hover,
.home-actions .el-button.is-text.is-has-bg:focus {
  background-color: var(--buttonPrimaryBgColorHover);
  color: var(--buttonPrimaryFontColorHover);
}
</style>
