<template>
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name]" />
  </svg>
</template>

<script setup lang="ts">
defineProps<{ name: string }>()
const paths: Record<string, string> = {
  cut: 'M9 9 21 21M9 15 21 3M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  'ordered-list': 'M9 6h12M9 12h12M9 18h12M3 3h1v5M3 12c0-2 3-2 3 0l-3 4h3M3 19h3l-2 2h2',
  'task-list': 'M21 11v9H3V3h13M8 11l4 4L22 4',
  bold: 'M7 4h6a4 4 0 0 1 0 8H7V4Zm0 8h7a4 4 0 0 1 0 8H7v-8Z',
  italic: 'M10 4h8M6 20h8M14 4l-4 16',
  code: 'm8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16',
  link: 'm10 14 4-4m-6 5-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
  image: 'M3 4h18v16H3V4Zm0 12 5-5 5 5 3-3 5 5M16 8h.01',
  quote: 'M4 6h6v7H5c0 3 1 4 3 5M14 6h6v7h-5c0 3 1 4 3 5',
  list: 'M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  chevron: 'm7 10 5 5 5-5',
  copy: 'M8 8h12v13H8V8ZM5 16H3V3h12v2',
  paste: 'M8 4H5v17h14V4h-3M8 2h8v5H8V2Zm1 9h6m-6 4h6',
  delete: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7'
}
</script>
