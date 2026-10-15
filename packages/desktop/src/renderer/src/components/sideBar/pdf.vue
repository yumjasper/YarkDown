<template>
  <aside
    ref="root"
    class="pdf-navigation"
    :aria-label="zh ? 'PDF 导航' : 'PDF navigation'"
  >
    <p
      v-if="navigating"
      class="pdf-navigation-feedback"
      role="status"
    >
      {{ zh ? '正在跳转…' : 'Opening page…' }}
    </p>
    <p
      v-else-if="navigationError"
      class="pdf-navigation-feedback"
      role="alert"
    >
      {{ navigationError }}
    </p>
    <template v-if="mode === 'outline'">
      <toc
        v-if="outline.length"
        :nodes="outline"
        :current-key="activeKey"
        :title="zh ? 'PDF 目录' : 'PDF contents'"
        @navigate="navigate"
      />
      <div
        v-else
        class="pdf-navigation-state"
      >
        <div class="pdf-navigation-heading">
          {{ zh ? 'PDF 目录' : 'PDF contents' }}
        </div>
        <p :role="error ? 'alert' : 'status'">
          {{
            error ||
              (loading || !navigation.document
                ? zh
                  ? '正在加载目录…'
                  : 'Loading contents…'
                : zh
                  ? '此 PDF 没有目录书签'
                  : 'This PDF has no bookmarks')
          }}
        </p>
      </div>
    </template>
    <template v-else>
      <div class="pdf-navigation-heading">
        {{ zh ? 'PDF 缩略图' : 'PDF thumbnails' }}
        <small>{{ navigation.document?.numPages || '' }}</small>
      </div>
      <div
        v-if="navigation.document"
        class="pdf-navigation-scroll"
      >
        <pdf-thumbnail
          v-for="number in navigation.document.numPages"
          :key="`${navigation.fileId}:${number}`"
          :pdf-document="navigation.document"
          :page-number="number"
          :current="number === navigation.currentPage"
          :label="zh ? '转到页码' : 'Go to page'"
          @navigate="navigation.goTo"
        />
      </div>
    </template>
  </aside>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePdfNavigationStore } from '@/store/pdfNavigation'
import type { KeyedTocNode } from '@/util/tocKeys'
import Toc from './toc.vue'
import PdfThumbnail from './pdfThumbnail.vue'
const props = defineProps<{ mode: 'outline' | 'thumbnails' }>()
const root = ref<HTMLElement>()
interface Bookmark {
  title: string
  dest: string | unknown[] | null
  items: Bookmark[]
}
const navigation = usePdfNavigationStore()
const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const outline = ref<KeyedTocNode[]>([])
const bookmarkPages = ref<Array<{ key: string; page: number }>>([])
const loading = ref(false),
  error = ref('')
const navigating = ref(false),
  navigationError = ref('')
let generation = 0
const activeKey = computed(
  () => bookmarkPages.value.filter((item) => item.page <= navigation.currentPage).at(-1)?.key || ''
)
const navigate = async (target: unknown) => {
  navigationError.value = ''
  if (typeof target !== 'string' && !Array.isArray(target)) {
    navigationError.value = zh.value
      ? '此目录项没有页面目标，请展开子目录。'
      : 'This bookmark has no destination. Expand its children.'
    return
  }
  navigating.value = true
  try {
    await navigation.goToDestination(target)
  } catch (reason) {
    navigationError.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    navigating.value = false
  }
}
watch(
  () => navigation.document,
  async (doc) => {
    const request = ++generation
    outline.value = []
    bookmarkPages.value = []
    error.value = ''
    if (!doc) return
    loading.value = true
    try {
      const bookmarks = ((await doc.getOutline()) || []) as Bookmark[]
      if (request !== generation) return
      const flat: Array<{ key: string; destination: string | unknown[] }> = []
      const map = (items: Bookmark[], parent = ''): KeyedTocNode[] =>
        items.map((item, index) => {
          const key = `${parent}/${index}`
          if (item.dest) flat.push({ key, destination: item.dest })
          return {
            key,
            label: item.title || '—',
            labelHtml: '',
            slug: item.dest,
            children: map(item.items, key)
          }
        })
      outline.value = map(bookmarks)
      const pages: Array<{ key: string; page: number }> = []
      for (const entry of flat) {
        if (request !== generation) return
        try {
          const dest =
            typeof entry.destination === 'string'
              ? await doc.getDestination(entry.destination)
              : entry.destination
          if (dest?.length) {
            const index = typeof dest[0] === 'number' ? dest[0] : await doc.getPageIndex(dest[0])
            pages.push({ key: entry.key, page: index + 1 })
          }
        } catch {
          /* A malformed bookmark must not hide the remaining outline. */
        }
      }
      if (request === generation) bookmarkPages.value = pages.sort((a, b) => a.page - b.page)
    } catch {
      if (request === generation)
        error.value = zh.value
          ? '目录加载失败，请重新加载 PDF。'
          : 'Contents could not be loaded. Reload the PDF.'
    } finally {
      if (request === generation) loading.value = false
    }
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  generation++
})
watch(
  () => [props.mode, navigation.currentPage, navigation.document],
  async () => {
    await nextTick()
    if (props.mode === 'thumbnails')
      root.value?.querySelector('.pdf-thumbnail.current')?.scrollIntoView({ block: 'nearest' })
  },
  { immediate: true }
)
</script>
<style scoped>
.pdf-navigation {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.pdf-navigation-heading {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 6px var(--sidebar-inset, 10px);
  min-height: 26px;
  font-weight: 600;
  color: var(--sideBarTitleColor);
}
.pdf-navigation-heading small {
  margin-left: auto;
  font-weight: normal;
  color: var(--sideBarColor);
}
.pdf-navigation-state p {
  padding: 8px 12px;
  color: var(--sideBarColor);
}
.pdf-navigation-scroll {
  overflow: auto;
  padding: 6px 10px;
  flex: 1;
  min-height: 0;
}
.pdf-navigation-feedback {
  padding: 4px 10px;
  margin: 0;
  font-size: 12px;
  color: var(--themeColor);
}
</style>
