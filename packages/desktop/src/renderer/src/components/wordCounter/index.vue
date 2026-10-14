<template>
  <el-tooltip
    v-if="wordCount"
    class="item"
    popper-class="word-count-tooltip"
    placement="top-end"
  >
    <template #content>
      <div class="title-section">
        {{ selectionWordCount ? t('menu.counter.documentSelection') : t('menu.counter.document') }}
      </div>
      <div class="title-item">
        <span class="front">{{ t('menu.counter.words') }}:</span><span class="text">{{ formatCountPair('word') }}</span>
      </div>
      <div class="title-item">
        <span class="front">{{ t('menu.counter.characters') }}:</span><span class="text">{{ formatCountPair('character') }}</span>
      </div>
      <div class="title-item">
        <span class="front">{{ t('menu.counter.paragraphs') }}:</span><span class="text">{{ formatCountPair('paragraph') }}</span>
      </div>
      <div class="title-item">
        <span class="front">{{ t('menu.counter.allCharacters') }}:</span><span class="text">{{ formatCountPair('all') }}</span>
      </div>
    </template>
    <div class="word-count-wrapper">
      <div
        class="word-count"
        @click.stop="handleWordClick"
      >
        <span class="text-center-vertical">{{ wordCountText }}</span>
      </div>
    </div>
  </el-tooltip>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FileWordCount } from '@shared/types/files'

const props = defineProps<{
  wordCount?: FileWordCount | null
  selectionWordCount?: FileWordCount | null
}>()

const { t } = useI18n()

const HASH = {
  word: { short: 'W' },
  character: { short: 'C' },
  paragraph: { short: 'P' },
  all: { short: 'A' }
}

const show = ref<'word' | 'paragraph' | 'character' | 'all'>('word')

const wordCountText = computed(() => {
  if (!props.wordCount) return ''

  const value = props.wordCount[show.value]
  const selectionValue = props.selectionWordCount?.[show.value]
  return selectionValue == null
    ? `${HASH[show.value].short} ${value}`
    : `${HASH[show.value].short} ${value} / ${selectionValue}`
})

const formatCountPair = (key: keyof FileWordCount) => {
  const value = props.wordCount?.[key] ?? 0
  const selectionValue = props.selectionWordCount?.[key]
  return selectionValue == null ? `${value}` : `${value} / ${selectionValue}`
}

const handleWordClick = () => {
  const ITEMS = ['word', 'paragraph', 'character', 'all'] as const
  const len = ITEMS.length
  let index = ITEMS.indexOf(show.value)
  index += 1
  if (index >= len) index = 0
  show.value = ITEMS[index]!
}
</script>

<style scoped>
.word-count-wrapper {
  flex: none;
  display: flex;
  justify-content: flex-end;
  padding-right: 12px;
  position: relative;
  z-index: 2;
}

.word-count {
  cursor: pointer;
  font-size: 12px;
  color: var(--editorColor50);
  text-align: center;
  line-height: 24px;
  padding: 0 5px;
  box-sizing: border-box;
  transition: all 0.25s ease-in-out;
  & > .text-center-vertical {
    padding: 2px 5px;
    border-radius: 3px;
  }
  &:hover > span {
    background: var(--sideBarBgColor);
    color: var(--sideBarTitleColor);
  }
}

.text-center-vertical {
  display: inline-block;
  vertical-align: middle;
  line-height: normal;
}
</style>
