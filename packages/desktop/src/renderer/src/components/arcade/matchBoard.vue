<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { GameState, MatchResult } from '@/services/arcade/games'
const props = defineProps<{
  state: GameState
  selected: number
  disabled: boolean
  result?: MatchResult
}>()
const emit = defineEmits<{
  cell: [index: number]
  swap: [a: number, b: number]
  progress: [action: 'next' | 'retry' | 'continue']
  animating: [value: boolean]
}>()
const display = ref([...props.state.board]),
  phase = ref('idle'),
  cleared = ref<number[]>([])
const animating = ref(false),
  waveLabel = ref(''),
  wavePoints = ref(0)
const stage = computed(() => props.state.stage)
const progress = computed(() =>
  Math.min(100, ((stage.value?.points || 0) / (stage.value?.target || 1)) * 100)
)
const colors = ['#ff7595', '#61c99a', '#7b9bff', '#ffc15e', '#b58af1', '#5dd5db']
const names = ['粉色爱心', '绿色水滴', '蓝色宝石', '金色星星', '紫色花朵', '青色圆环']
const symbols = ['○', '◇', '△', '□', '✦', '⬡']
const shapes = [
  'M18 30 6 18C-1 9 11 2 18 11 25 2 37 9 30 18Z',
  'M18 4C14 11 7 17 7 23a11 11 0 0 0 22 0C29 17 22 11 18 4Z',
  'M10 5h16l8 12-16 15L2 17ZM2 17h32M10 5l8 27 8-27',
  'm18 3 5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2Z',
  'M18 10C6-4-4 14 9 19-3 30 16 39 18 26c6 13 23-1 10-8C42 9 24-4 18 10Z',
  'M30 18a12 12 0 1 1-24 0 12 12 0 0 1 24 0ZM24 18a6 6 0 1 0-12 0 6 6 0 0 0 12 0Z'
]
let generation = 0
let dragging: { index: number; x: number; y: number } | undefined
let suppressClick = false
const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
watch(
  () => props.state.board,
  (board) => {
    if (!animating.value) display.value = [...board]
  }
)
watch(
  () => props.result,
  async (result) => {
    const request = ++generation
    if (!result?.swapped) return
    animating.value = true
    emit('animating', true)
    try {
      display.value = result.before || result.swapped
      phase.value = 'swap'
      await pause(reducedMotion ? 0 : 150)
      if (request !== generation) return
      display.value = result.swapped
      for (const [index, wave] of (result.waves || []).entries()) {
        display.value = wave.board
        cleared.value = wave.cleared
        waveLabel.value = {
          burst: '能量爆破！',
          rainbow: '彩虹全消！',
          line: '整行消除！',
          match: index ? `${index + 1} 连消！` : '漂亮！'
        }[wave.effect]
        wavePoints.value = wave.points
        phase.value = 'clear'
        await pause(reducedMotion ? 0 : 150)
        if (request !== generation) return
        cleared.value = []
        display.value = wave.after
        phase.value = 'fall'
        await pause(reducedMotion ? 0 : 150)
        if (request !== generation) return
      }
    } finally {
      if (request === generation) {
        display.value = [...props.state.board]
        phase.value = 'idle'
        cleared.value = []
        waveLabel.value = ''
        animating.value = false
        emit('animating', false)
      }
    }
  }
)
function tileStyle(index: number, value: number): Record<string, string> {
  const pair = props.result?.pair
  const style = { '--gem': colors[value], transform: '' }
  if (phase.value === 'swap' && pair?.includes(index)) {
    const target = pair[0] === index ? pair[1] : pair[0]
    style.transform = `translate(calc(${(target % 7) - (index % 7)} * (100% + 6px)), calc(${Math.floor(target / 7) - Math.floor(index / 7)} * (100% + 6px)))`
  }
  return style
}
function down(event: PointerEvent, index: number): void {
  if (event.button !== 0) return
  dragging = { index, x: event.clientX, y: event.clientY }
  suppressClick = false
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function up(event: PointerEvent): void {
  if (!dragging) return
  const { index, x, y } = dragging
  dragging = undefined
  const dx = event.clientX - x,
    dy = event.clientY - y
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return
  suppressClick = true
  const horizontal = Math.abs(dx) > Math.abs(dy)
  const next = index + (horizontal ? (dx > 0 ? 1 : -1) : dy > 0 ? 7 : -7)
  if (next >= 0 && next < 49 && (!horizontal || Math.floor(next / 7) === Math.floor(index / 7)))
    emit('swap', index, next)
}
function click(index: number): void {
  if (suppressClick) suppressClick = false
  else emit('cell', index)
}
onBeforeUnmount(() => {
  generation++
  emit('animating', false)
})
</script>

<template>
  <div
    class="match-adventure"
    :aria-busy="animating"
  >
    <div class="match-goal">
      <div>
        <span class="match-level">第 {{ stage?.level }} 关</span><strong>{{ Math.min(stage?.points || 0, stage?.target || 0) }}
          <small>/ {{ stage?.target }}</small></strong>
      </div>
      <div class="match-moves">
        <b>{{ stage?.movesLeft }}</b><span>剩余步数</span>
      </div>
    </div>
    <div
      class="match-progress"
      role="progressbar"
      aria-label="本关目标"
      :aria-valuenow="Math.min(stage?.points || 0, stage?.target || 0)"
      :aria-valuemax="stage?.target"
      :aria-valuemin="0"
    >
      <span
        :key="stage?.level"
        :style="{ width: `${progress}%` }"
      />
    </div>
    <div class="match-energy">
      <span>能量爆破</span><i
        v-for="n in 4"
        :key="n"
        :class="{ charged: n <= (stage?.charge || 0) }"
      /><small>每 4 步赠送一次爆破</small>
    </div>
    <div class="match-scene">
      <div
        class="arcade-board arcade-match"
        aria-label="轻消消棋盘"
      >
        <button
          v-for="(value, index) in display"
          :key="index"
          type="button"
          :data-value="value"
          :style="tileStyle(index, value)"
          :class="{
            selected: selected === index,
            clearing: cleared.includes(index),
            falling: phase === 'fall'
          }"
          :disabled="disabled || animating || state.over"
          :aria-label="`第${Math.floor(index / 7) + 1}行第${(index % 7) + 1}列 ${names[value]}`"
          :aria-pressed="selected === index"
          @pointerdown="down($event, index)"
          @pointerup="up"
          @pointercancel="dragging = undefined"
          @click="click(index)"
        >
          <svg
            viewBox="0 0 36 36"
            aria-hidden="true"
          ><path :d="shapes[value]" /></svg><span class="match-sr-only">{{ symbols[value] }}</span>
        </button>
      </div>
      <Transition name="match-cheer">
        <div
          v-if="waveLabel"
          :key="`${waveLabel}:${wavePoints}`"
          class="match-cheer"
          aria-hidden="true"
        >
          <strong>{{ waveLabel }}</strong><b>+{{ wavePoints }}</b>
        </div>
      </Transition>
      <div
        v-if="stage?.status === 'won' && !animating"
        class="match-result match-won"
        role="status"
      >
        <span class="match-stars">{{ '★'.repeat(stage.stars) }}{{ '☆'.repeat(3 - stage.stars) }}</span><strong>第 {{ stage.level }} 关完成！</strong><span>过关奖励 +{{ stage.reward }} · 继续下一段旅程</span>
        <button
          class="match-primary"
          :disabled="disabled"
          @click="emit('progress', 'next')"
        >
          前往第 {{ stage.level + 1 }} 关 →
        </button>
      </div>
      <div
        v-else-if="stage?.status === 'lost' && !animating"
        class="match-result"
        role="status"
      >
        <strong>就差一点，再试试！</strong><button
          class="match-primary"
          :disabled="disabled"
          @click="emit('progress', 'continue')"
        >
          免费加 5 步继续
        </button><button
          :disabled="disabled"
          @click="emit('progress', 'retry')"
        >
          重玩本关
        </button>
      </div>
    </div>
    <p class="match-tip">
      点击相邻两格或滑动交换 · 四连清行 · 五连全色
    </p>
  </div>
</template>

<style scoped>
.match-adventure {
  padding-top: 12px;
}
.match-goal {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.match-goal > div:first-child {
  display: grid;
  gap: 5px;
}
.match-level {
  font-size: 12px;
  font-weight: 700;
  color: var(--themeColor);
}
.match-goal strong {
  font-size: 22px;
  font-variant-numeric: tabular-nums;
}
.match-goal small {
  font-size: 13px;
  color: var(--editorColor50);
}
.match-moves {
  display: grid;
  text-align: center;
  padding: 5px 12px;
  border-radius: 12px;
  background: var(--themeColor10);
}
.match-moves b {
  font-size: 25px;
  line-height: 1.2;
}
.match-moves span {
  font-size: 10px;
}
.match-progress {
  height: 7px;
  border-radius: 9px;
  background: var(--editorColor10);
  margin-top: 10px;
  overflow: hidden;
}
.match-progress > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #53bda3, #a8db86);
  transition: width 0.3s;
}
.match-energy {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  margin: 12px 0;
}
.match-energy small {
  margin-left: auto;
  color: var(--editorColor50);
  font-size: 10px;
}
.match-energy i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--editorColor10);
}
.match-energy i.charged {
  background: #ffc15e;
  box-shadow: 0 0 8px #ffc15e70;
}
.match-scene {
  position: relative;
}
.arcade-match {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
  padding: 8px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--editorColor) 6%, var(--editorBgColor));
}
.arcade-match {
  max-width: 310px;
  margin-inline: auto;
}
.arcade-match button {
  position: relative;
  aspect-ratio: 1;
  padding: 4px;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--gem) 25%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--gem) 13%, var(--editorBgColor));
  cursor: pointer;
  transition:
    transform 0.15s ease,
    background 0.15s;
  touch-action: none;
}
.arcade-match button:hover:not(:disabled) {
  transform: translateY(-2px);
  background: color-mix(in srgb, var(--gem) 26%, var(--editorBgColor));
}
.arcade-match button:focus-visible {
  outline: 2px solid var(--themeColor);
  outline-offset: 2px;
}
.arcade-match button.selected {
  outline: 2px solid var(--gem);
  outline-offset: 1px;
  background: color-mix(in srgb, var(--gem) 35%, var(--editorBgColor));
  z-index: 1;
}
.arcade-match svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
  filter: drop-shadow(0 2px 1px #0002);
}
.arcade-match path {
  fill: var(--gem);
  stroke: color-mix(in srgb, var(--gem) 60%, #fff);
  stroke-width: 1.4;
  fill-rule: evenodd;
  stroke-linejoin: round;
}
.arcade-match button.clearing {
  animation: gem-pop 0.15s ease-in both;
}
.arcade-match button.falling {
  animation: gem-fall 0.15s ease-out;
}
@keyframes gem-pop {
  40% {
    transform: scale(1.18);
    filter: brightness(1.6);
  }
  to {
    transform: scale(0.2);
    opacity: 0;
  }
}
@keyframes gem-fall {
  from {
    transform: translateY(-16px);
    opacity: 0.5;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
.match-cheer {
  position: absolute;
  inset: 28% 0 auto;
  display: grid;
  gap: 4px;
  text-align: center;
  color: #fff;
  text-shadow: 0 2px 8px #523765;
  pointer-events: none;
  z-index: 3;
}
.match-cheer strong {
  font-size: 26px;
}
.match-cheer b {
  font-size: 30px;
}
.match-cheer-enter-active {
  animation: cheer-in 0.2s ease-out;
}
.match-cheer-leave-active {
  transition: opacity 0.15s;
}
.match-cheer-leave-to {
  opacity: 0;
}
@keyframes cheer-in {
  from {
    transform: scale(0.5);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
.match-result {
  position: absolute;
  z-index: 4;
  left: 14px;
  right: 14px;
  top: 22%;
  display: grid;
  gap: 8px;
  text-align: center;
  padding: 14px;
  border: 1px solid var(--themeColor20);
  border-radius: 14px;
  background: color-mix(in srgb, var(--editorBgColor) 96%, var(--themeColor));
  box-shadow: 0 10px 32px #0003;
}
.match-result strong {
  font-size: 17px;
}
.match-result > span:not(.match-stars) {
  color: var(--editorColor50);
  font-size: 11px;
}
.match-stars {
  color: #e7ac25;
  font-size: 30px;
  letter-spacing: 4px;
}
.match-result button {
  border: 0;
  border-radius: 8px;
  padding: 9px 12px;
  font: inherit;
  cursor: pointer;
  color: inherit;
  background: var(--editorColor04);
}
.match-result button.match-primary {
  color: white;
  background: #369f84;
  font-weight: 700;
}
.match-tip {
  color: var(--editorColor50);
  font-size: 11px;
  text-align: center;
  margin: 10px 0 0;
}
.match-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
  }
}
</style>
