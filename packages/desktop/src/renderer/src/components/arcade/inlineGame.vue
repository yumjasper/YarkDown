<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
const Arcade = defineAsyncComponent(() => import('./index.vue'))
const Js13kGames = defineAsyncComponent(() => import('./js13kGames.vue'))
import { JS13K_GAMES } from '@/services/arcade/js13k'
import type { GameId } from '@/services/arcade/games'

const props = defineProps<{ id: string }>()
const running = ref(false)
const root = ref<HTMLElement>()
const builtins: Record<string, { game: GameId; title: string; detail: string; icon: string }> = {
  '2048': { game: 'merge', title: '2048', detail: '滑动、合并，向 2048 再靠近一步。', icon: '2048' },
  sudoku: { game: 'sudoku', title: '迷你数独', detail: '一张小棋盘，一段安静思考的时间。', icon: '1–6' },
  match: { game: 'match', title: '轻消消', detail: '交换色彩，开启一段连消旅程。', icon: '✦' }
}
const builtin = computed(() => Object.hasOwn(builtins, props.id) ? builtins[props.id] : undefined)
const original = computed(() => JS13K_GAMES.find((game) => game.id === props.id))
const title = computed(() => builtin.value?.title ?? original.value?.name ?? '未知游戏')
let observer: IntersectionObserver | undefined
function stop(): void { running.value = false }
function onVisibility(): void { if (document.hidden) stop() }
onMounted(() => {
  observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) stop() })
  if (root.value) observer.observe(root.value)
  document.addEventListener('visibilitychange', onVisibility)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <span
    ref="root"
    class="inline-game"
    contenteditable="false"
    @keydown.stop
    @keyup.stop
    @pointerdown.stop
    @click.stop
    @beforeinput.stop
    @input.stop
    @wheel.stop
  >
    <span
      v-if="!running"
      class="inline-game-card"
    >
      <span
        class="inline-game-cover"
        aria-hidden="true"
      >{{ builtin?.icon ?? '▶' }}</span>
      <span class="inline-game-description">
        <span class="inline-game-label">互动游戏 · 本机运行</span>
        <strong>{{ title }}</strong>
        <span>{{ builtin?.detail ?? original?.subtitle ?? `暂不支持 ${id}，请检查游戏名称。` }}</span>
      </span>
      <button
        v-if="builtin || original"
        @click="running = true"
      >开始游戏 <span aria-hidden="true">↗</span></button>
    </span>
    <span
      v-else
      class="inline-game-running"
    >
      <arcade
        v-if="builtin"
        :initial-game="builtin.game"
        embedded
        @close="stop"
      />
      <js13k-games
        v-else-if="original"
        :initial-game="original"
        @close="stop"
      />
    </span>
  </span>
</template>

<style scoped>
.inline-game { display:block; margin:8px 0 20px; color:var(--editorColor); font:13px/1.5 var(--uiFontFamily); white-space:normal; user-select:none; }
.inline-game-card { display:flex; gap:18px; align-items:center; padding:22px; background:var(--editorBgColor); border:1px solid var(--editorColor10); border-radius:16px; box-shadow:0 3px 16px #00000006; }
.inline-game-cover { display:grid; place-items:center; flex-shrink:0; width:72px; height:72px; border-radius:15px; background:linear-gradient(135deg,#f3e8d7,#e9ce9a); color:#806235; font:bold 22px/1 var(--uiFontFamily); }
.inline-game-description { display:flex; flex:1; flex-direction:column; gap:4px; }
.inline-game-description strong { font-size:20px; font-weight:650; }
.inline-game-description > span:last-child { color:var(--editorColor50); font-size:12px; }
.inline-game-label { font-size:10px; color:var(--editorColor50); letter-spacing:.08em; }
.inline-game button { border:0; padding:10px 15px; border-radius:9px; background:var(--themeColor); color:#fff; font:500 12px/1.4 var(--uiFontFamily); cursor:pointer; flex-shrink:0; }
.inline-game button:focus-visible { outline:2px solid var(--themeColor); outline-offset:3px; }
.inline-game-running { display:block; border:1px solid var(--editorColor10); border-radius:16px; padding:16px; background:var(--editorBgColor); }
@media(max-width:650px) { .inline-game-card { flex-wrap:wrap; padding:16px; gap:12px; } .inline-game-cover { width:52px; height:52px; } }
</style>
