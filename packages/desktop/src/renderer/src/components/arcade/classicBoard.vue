<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Direction, GameState } from '@/services/arcade/games'

const props = defineProps<{ state: GameState; selected: number; disabled: boolean }>()
const emit = defineEmits<{ cell: [index: number]; move: [direction: Direction]; fill: [value: number] }>()
const touch = ref<{ x: number; y: number }>()
const sudoku = computed(() => props.state.game === 'sudoku')
const remaining = computed(() => props.state.board.filter((value) => !value).length)
const colors = ['#ede7df', '#e8ddc9', '#ebd7af', '#f3bd85', '#ee9b6e', '#e77f65', '#d85d57', '#d7b45c', '#cda34a', '#bd9237', '#aa7a29', '#936921']

function tileStyle(value: number): Record<string, string> {
  const level = value ? Math.min(11, Math.log2(value)) : 0
  return { '--tile-bg': colors[level], '--tile-fg': level < 6 || (level >= 7 && level <= 9) ? '#453624' : '#fffaf1' }
}

function peer(index: number): boolean {
  const selected = props.selected
  if (selected < 0) return false
  return Math.floor(index / 6) === Math.floor(selected / 6) || index % 6 === selected % 6 ||
    (Math.floor(index / 12) === Math.floor(selected / 12) && Math.floor(index % 6 / 3) === Math.floor(selected % 6 / 3))
}

function swipe(event: TouchEvent): void {
  const start = touch.value
  const end = event.changedTouches[0]
  touch.value = undefined
  if (!start || !end || props.disabled || sudoku.value) return
  const dx = end.clientX - start.x
  const dy = end.clientY - start.y
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
  emit('move', Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up')
}
</script>

<template>
  <div :class="['classic-game', { 'classic-sudoku': sudoku }]">
    <div class="classic-heading">
      <div><span class="classic-eyebrow">{{ sudoku ? '慢下来，找到答案' : '让每一步都有新可能' }}</span><h2>{{ sudoku ? '迷你数独' : '2048' }}</h2></div>
      <span class="classic-badge">{{ sudoku ? `待填 ${remaining} 格` : '4 × 4' }}</span>
    </div>
    <div
      :class="['arcade-board', sudoku ? 'arcade-sudoku' : 'arcade-merge']"
      :aria-label="sudoku ? '迷你数独棋盘' : '2048棋盘'"
      @touchstart="touch = { x: $event.touches[0].clientX, y: $event.touches[0].clientY }"
      @touchend="swipe"
    >
      <button
        v-for="(value, index) in state.board"
        :key="index"
        :style="sudoku ? undefined : tileStyle(value)"
        :data-value="value"
        :class="{
          filled: !!value, selected: selected === index,
          given: sudoku && !!state.fixed[index], peer: sudoku && peer(index),
          'box-right': sudoku && index % 6 === 2,
          'box-bottom': sudoku && [1, 3].includes(Math.floor(index / 6)),
          'tile-small': !sudoku && value >= 1024
        }"
        :disabled="disabled || !sudoku || !!value"
        :aria-label="`第${Math.floor(index / (sudoku ? 6 : 4)) + 1}行第${index % (sudoku ? 6 : 4) + 1}列 ${value || '空'}`"
        @click="emit('cell', index)"
      >
        {{ value || '' }}
      </button>
    </div>
    <div
      v-if="sudoku"
      class="arcade-controls number-pad"
      aria-label="填入数字"
    >
      <button
        v-for="value in 6"
        :key="value"
        :disabled="disabled || selected < 0 || state.over"
        @click="emit('fill', value)"
      >
        {{ value }}
      </button>
    </div>
    <div
      v-else
      class="arcade-controls direction-pad"
      aria-label="移动方向"
    >
      <button
        v-for="(label, direction) in { left: '←', up: '↑', down: '↓', right: '→' }"
        :key="direction"
        :disabled="disabled || state.over"
        @click="emit('move', direction as Direction)"
      >
        {{ label }}
      </button>
    </div>
    <p class="classic-tip">
      {{ sudoku ? '每行、每列、每宫填入 1–6 · 选择空格后按数字键' : '方向键移动，也可在棋盘上滑动 · 合并相同数字' }}
    </p>
  </div>
</template>

<style scoped>
.classic-game { --board-accent: #a67749; padding: 14px; border-radius: 16px; background: color-mix(in srgb, var(--editorBgColor) 93%, #bf9b73); border: 1px solid var(--editorColor10); }
.classic-heading { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; gap:8px; }
.classic-heading h2 { margin:2px 0 0; padding:0; font:700 30px/1.2 var(--uiFontFamily); color:var(--editorColor); border:0; }
.classic-eyebrow { font-size:10px; color:var(--editorColor50); letter-spacing:.06em; }
.classic-badge { padding:5px 9px; border-radius:20px; background:var(--editorColor04, #8881); color:var(--editorColor50); font-size:11px; white-space:nowrap; }
.arcade-board { display:grid; grid-template-columns:repeat(4,1fr); gap:7px; padding:8px; background:#b8aa99; border-radius:12px; touch-action:none; }
.arcade-board button { min-width:0; aspect-ratio:1; padding:0; border:0; border-radius:7px; font:700 clamp(20px,3vw,32px)/1 var(--uiFontFamily); font-variant-numeric:tabular-nums; }
.arcade-merge button { background:var(--tile-bg); color:var(--tile-fg); box-shadow:inset 0 1px 0 #fff5; transition:background .12s, transform .12s; opacity:1; }
.arcade-merge .filled { animation:tile-appear .14s ease-out; }
.arcade-merge .tile-small { font-size:23px; }
.arcade-controls { display:flex; gap:7px; justify-content:center; margin-top:12px; }
.arcade-controls button { flex:1; min-height:38px; max-width:64px; font:600 20px/1 var(--uiFontFamily); background:var(--editorBgColor); color:var(--editorColor); border:1px solid var(--editorColor10); border-radius:9px; cursor:pointer; }
.arcade-controls button:hover:not(:disabled) { border-color:var(--board-accent); background:color-mix(in srgb,var(--editorBgColor) 90%,var(--board-accent)); }
.arcade-controls button:disabled { opacity:.4; cursor:default; }
.classic-tip { margin:12px 0 0; font-size:10px; color:var(--editorColor50); text-align:center; }
.classic-sudoku { --board-accent:color-mix(in srgb,var(--editorColor) 65%,#5a86a4); }
.classic-sudoku .classic-heading h2 { font-size:23px; }
.arcade-sudoku { grid-template-columns:repeat(6,1fr); gap:0; padding:0; background:var(--editorBgColor); border:2px solid var(--editorColor40); border-radius:9px; overflow:hidden; }
.arcade-sudoku button { border-radius:0; font-size:23px; font-weight:500; border-right:1px solid var(--editorColor10); border-bottom:1px solid var(--editorColor10); background:transparent; color:var(--board-accent); opacity:1; }
.arcade-sudoku button:nth-child(6n) { border-right:0; }
.arcade-sudoku button:nth-last-child(-n+6) { border-bottom:0; }
.arcade-sudoku button.box-right { border-right:2px solid var(--editorColor40); }
.arcade-sudoku button.box-bottom { border-bottom:2px solid var(--editorColor40); }
.arcade-sudoku button.given { color:var(--editorColor); font-weight:700; }
.arcade-sudoku button.peer { background:color-mix(in srgb,var(--editorBgColor) 93%,var(--board-accent)); }
.arcade-sudoku button.selected { background:color-mix(in srgb,var(--editorBgColor) 78%,var(--board-accent)); outline:2px solid var(--board-accent); outline-offset:-3px; }
button:focus-visible { outline:2px solid var(--board-accent); outline-offset:2px; }
@keyframes tile-appear { from { transform:scale(.92); } to { transform:scale(1); } }
@media (prefers-reduced-motion:reduce) { .arcade-merge .filled { animation:none; } }
</style>
