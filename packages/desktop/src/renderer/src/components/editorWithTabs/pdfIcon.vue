<template>
  <svg
    class="pdf-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="paths[name] || paths.more" />
  </svg>
</template>
<script setup lang="ts">
defineProps<{ name: string }>()
const paths: Record<string, string> = {
  fill: 'M3 3h12v18H3ZM7 7h4M7 11h4M17 14l4-4 2 2-4 4-3 1Z',
  edit: 'M3 3h12v18H3ZM7 7h4M7 11h4M13 18l7-7 2 2-7 7-3 1Z',
  export: 'M3 3h12v18H3ZM7 7h4M14 12h8m-3-3 3 3-3 3',
  create: 'M3 3h12v18H3ZM7 7h4M17 15h6M20 12v6',
  Select: 'M5 3 19 13l-7 1-3 7Z',
  Hand: 'M8 12V5a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v10c0 5-3 7-7 7h-1c-2 0-3-1-4-3l-4-6a2 2 0 0 1 3-2l3 3',
  Highlight: 'm5 14 9-10 6 5-9 10H5Zm3 3 9-10M4 21h12',
  Underline: 'M6 3v7a6 6 0 0 0 12 0V3M4 21h16',
  StrikeOut: 'M17 5c-2-3-10-3-10 2 0 2 3 3 5 3M7 19c3 3 10 1 10-3 0-2-2-3-5-3M3 12h18',
  Text: 'M4 3h16v13H9l-5 5ZM8 7h8M8 11h5',
  FreeText: 'M3 3h18v18H3ZM7 8h10M12 8v9M9 17h6',
  Ink: 'M3 18c4-12 7-14 7-8s-6 12-2 10 8-12 7-6-1 7 6 2',
  Square: 'M4 4h16v16H4Z',
  Erase: 'm3 14 10-10a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-9 9H8Zm4-4 9 8M12 21h9',
  undo: 'm8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14',
  redo: 'm16 4 5 5-5 5M21 9H11a7 7 0 0 0 0 14',
  save: 'M4 3h13l4 4v14H3V3ZM7 3v6h10V3M7 21v-8h10v8',
  copy: 'M8 8h13v13H8ZM16 8V3H3v13h5',
  comments: 'M3 3h18v14H9l-6 4ZM7 7h10M7 12h7',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  author: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a8 8 0 0 1 16 0v3',
  settings: 'M3 6h7m4 0h7M3 18h11m4 0h3M10 3v6M14 15v6',
  outline: 'M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1',
  thumbnails: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  previous: 'm15 5-7 7 7 7', next: 'm9 5 7 7-7 7',
  zoomIn: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-1 5 6 6M7 10h6M10 7v6',
  zoomOut: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-1 5 6 6M7 10h6',
  rotate: 'M8 9h5l3 3v9H8ZM13 9v4h3M3 9a8 8 0 0 1 15-3M18 1v5h-5',
  reload: 'M20 8a8 8 0 0 0-14-3L3 8m0-6v6h6M4 16a8 8 0 0 0 14 3l3-3m0 6v-6h-6',
  fullscreen: 'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6',
  search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-1 5 6 6',
  up: 'm5 15 7-7 7 7', down: 'm5 9 7 7 7-7',
  print: 'M6 8V3h12v5M6 17H3V8h18v9h-3M6 14h12v7H6ZM17 11h1',
  translate: 'M3 5h12M9 2v3M5 5c1 6 4 8 9 11M13 5c-1 6-4 8-10 11M14 21l4-11 4 11M16 17h4',
  more: 'M4 12h1M11 12h1M18 12h1', close: 'm5 5 14 14M19 5 5 19'
}
</script>
<style scoped>
.pdf-icon { width: 18px; height: 18px; display: block; flex: none; }
</style>
