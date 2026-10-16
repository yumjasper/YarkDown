<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  adjacent,
  fillSudoku,
  moveMerge,
  progressMatch,
  swapMatch,
  type Direction,
  type GameId,
  type MatchResult
} from '@/services/arcade/games'
import MatchBoard from './matchBoard.vue'
import ClassicBoard from './classicBoard.vue'
import Js13kGames from './js13kGames.vue'
import bus from '@/bus'
import {
  ARCADE_KEY,
  GAME_IDS,
  GAME_LABELS,
  creditSession,
  emptyArcade,
  readArcade,
  saveArcade,
  startSession,
  type ArcadeData
} from '@/services/arcade/storage'

const props = defineProps<{ embedded?: boolean; initialGame?: GameId }>()
const emit = defineEmits<{ close: [] }>()
const visible = ref(false)
const panel = ref<HTMLElement>()
const data = ref(emptyArcade())
const game = ref<GameId>('merge')
const nickname = ref('我')
const selected = ref(-1)
const message = ref('')
const error = ref('')
const busy = ref(false)
const matchAnimating = ref(false)
const matchResult = ref<MatchResult>()
const leaderboard = ref(false)
const js13k = ref(false)
let previousFocus: HTMLElement | null = null
let previousRange: Range | null = null
const session = computed(() => data.value.sessions[game.value])
const state = computed(() => session.value?.state)
const total = computed(
  () =>
    data.value.players.find((player) => player.name === session.value?.player)?.totals[
      game.value
    ] ?? 0
)
const best = computed(
  () =>
    data.value.players.find((player) => player.name === session.value?.player)?.best[game.value] ??
    0
)
const totals = computed(() =>
  [...data.value.players]
    .map((player) => ({
      player: player.name,
      score: player.totals[game.value]
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
)
const help = computed(
  () =>
    ({
      merge: '方向键或下方按钮移动，相同数字合并得分；达到 2048 后仍可继续。',
      sudoku:
        '每行、每列和每个 2×3 宫填入 1–6。填对 +10，完成额外 +100；已确认的数字不再重复计分。',
      match:
        '自由交换，组合连消。在步数内达成目标即可过关；没有消除也能移动，每四步赠送一次能量爆破。'
    })[game.value]
)

function load(): void {
  try {
    data.value = readArcade(localStorage)
    error.value = ''
  } catch (reason) {
    error.value = String((reason as Error).message)
  }
}

async function transact(change: (current: ArcadeData) => void): Promise<boolean> {
  if (busy.value) return false
  busy.value = true
  const apply = (): void => {
    const current = readArcade(localStorage)
    change(current)
    saveArcade(localStorage, current)
    data.value = current
    error.value = ''
  }
  try {
    // Windows share one origin; serialize read/modify/write to avoid losing another window's points.
    if (navigator.locks) await navigator.locks.request(ARCADE_KEY, apply)
    else apply()
    return true
  } catch (reason) {
    error.value = (reason as Error).message
    return false
  } finally {
    busy.value = false
  }
}

async function show(): Promise<void> {
  if (visible.value) return
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const selection = window.getSelection()
  previousRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
  load()
  game.value = props.initialGame ?? data.value.selected
  nickname.value = data.value.player
  selected.value = -1
  message.value = ''
  visible.value = true
  await nextTick()
  panel.value?.focus({ preventScroll: true })
  if (!error.value && !session.value) await restart()
}

function hide(restoreFocus = true): void {
  if (!visible.value) return
  visible.value = false
  if (props.embedded) emit('close')
  matchResult.value = undefined
  matchAnimating.value = false
  selected.value = -1
  leaderboard.value = false
  if (restoreFocus && previousFocus?.isConnected) {
    previousFocus.focus({ preventScroll: true })
    if (previousRange?.commonAncestorContainer.isConnected) {
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(previousRange)
    }
  }
}

async function chooseGame(value: GameId): Promise<void> {
  js13k.value = false
  game.value = value
  selected.value = -1
  message.value = ''
  matchResult.value = undefined
  await transact((current) => {
    current.selected = value
    if (!current.sessions[value]) startSession(current, value, nickname.value)
  })
}

async function restart(): Promise<void> {
  const currentGame = game.value
  await transact((current) => {
    startSession(current, currentGame, nickname.value)
  })
  selected.value = -1
  matchResult.value = undefined
  message.value =
    game.value === 'match'
      ? '新的闯关旅程已开始，历史积分和榜单保留。'
      : '新一局已开始；累计积分和榜单保留。'
}

async function move(direction: Direction): Promise<void> {
  await transact((current) => {
    const active = current.sessions.merge
    if (!active) return
    active.state = moveMerge(active.state, direction)
    creditSession(current, active)
  })
}

async function fill(value: number): Promise<void> {
  const index = selected.value
  await transact((current) => {
    const active = current.sessions.sudoku
    if (!active || index < 0 || active.state.board[index]) return
    const next = fillSudoku(active.state, index, value)
    message.value = next === active.state ? '这个数字不正确，再想一想。' : '正确，+10 分。'
    active.state = next
    creditSession(current, active)
  })
}

async function cell(index: number): Promise<void> {
  if (busy.value || matchAnimating.value || leaderboard.value) return
  if (game.value === 'sudoku') {
    selected.value = index
    return
  }
  if (game.value !== 'match') return
  const first = selected.value
  if (first === index) {
    selected.value = -1
    return
  }
  if (!adjacent(first, index)) {
    selected.value = index
    return
  }
  await swap(first, index)
}

async function swap(first: number, index: number): Promise<void> {
  if (busy.value || matchAnimating.value || !adjacent(first, index)) return
  selected.value = -1
  let outcome: MatchResult | undefined
  const saved = await transact((current) => {
    const active = current.sessions.match
    if (!active) return
    const result = swapMatch(active.state, first, index)
    const points = result.state.score - active.state.score
    message.value = points
      ? `+${points} 分 · ${result.combo} 层连消${result.reshuffled ? ' · 新局面已准备好' : ''}`
      : `交换已保留 · 爆破能量 ${result.state.stage?.charge || 0}/4`
    active.state = result.state
    creditSession(current, active)
    outcome = result
  })
  if (saved && visible.value && game.value === 'match') matchResult.value = outcome
}

async function advance(action: 'next' | 'retry' | 'continue'): Promise<void> {
  if (matchAnimating.value) return
  await transact((current) => {
    const active = current.sessions.match
    if (active) active.state = progressMatch(active.state, action)
  })
  selected.value = -1
  matchResult.value = undefined
  message.value =
    action === 'next'
      ? '新关卡已解锁，开始下一段旅程！'
      : action === 'continue'
        ? '已增加 5 步，继续冲刺！'
        : '本关重新开始，累计积分保留。'
}

function onKey(event: KeyboardEvent): void {
  if (!props.embedded && event.target instanceof Element && event.target.closest('.inline-game')) return
  if (
    event.ctrlKey &&
    event.altKey &&
    !event.metaKey &&
    event.code === 'KeyG' &&
    !event.repeat &&
    !event.isComposing
  ) {
    event.preventDefault()
    event.stopImmediatePropagation()
    if (visible.value) hide()
    else void show()
    return
  }
  if (!visible.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopImmediatePropagation()
    hide()
    return
  }
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || leaderboard.value || js13k.value)
    return
  if (event.target instanceof HTMLInputElement) return
  const directions: Record<string, Direction> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down'
  }
  if (game.value === 'merge' && directions[event.key]) {
    event.preventDefault()
    event.stopImmediatePropagation()
    void move(directions[event.key])
  } else if (game.value === 'sudoku' && /^[1-6]$/.test(event.key)) {
    event.preventDefault()
    event.stopImmediatePropagation()
    void fill(Number(event.key))
  }
}

function onOutside(event: PointerEvent): void {
  if (visible.value && event.target instanceof Node && !panel.value?.contains(event.target))
    hide(false)
}
function onBlur(): void {
  // Focusing a sandboxed game blurs the host window while its document still has focus.
  if (
    document.hasFocus() &&
    document.activeElement instanceof HTMLIFrameElement &&
    panel.value?.contains(document.activeElement)
  ) return
  hide(false)
}
function onVisibility(): void {
  if (document.hidden) hide(false)
}
function onStorage(event: StorageEvent): void {
  if (event.key === ARCADE_KEY) load()
}
const openArcade = () => {
  void show()
}

onMounted(() => {
  if (props.embedded) {
    window.addEventListener('storage', onStorage)
    void show()
    return
  }
  bus.on('open-arcade', openArcade)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('blur', onBlur)
  window.addEventListener('storage', onStorage)
  document.addEventListener('visibilitychange', onVisibility)
  document.addEventListener('pointerdown', onOutside, true)
})
onBeforeUnmount(() => {
  bus.off('open-arcade', openArcade)
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('blur', onBlur)
  window.removeEventListener('storage', onStorage)
  document.removeEventListener('visibilitychange', onVisibility)
  document.removeEventListener('pointerdown', onOutside, true)
})
</script>

<template>
  <section
    v-if="visible"
    ref="panel"
    class="arcade-panel ui-surface"
    :class="{ 'arcade-panel-wide': js13k, 'arcade-embedded': embedded }"
    :role="embedded ? 'group' : 'dialog'"
    :aria-label="embedded ? GAME_LABELS[game] : '小憩'"
    tabindex="-1"
    @keydown.stop="embedded && onKey($event)"
  >
    <header>
      <strong>{{ embedded ? GAME_LABELS[game] : '小憩' }}</strong>
      <span class="arcade-muted">{{ embedded ? 'Esc 结束 · 滚出视野自动收起' : 'Esc 收起 · 失焦自动隐藏' }}</span>
      <button
        :aria-label="embedded ? '结束游戏' : '收起小憩'"
        @click="hide()"
      >
        ×
      </button>
    </header>
    <nav
      v-if="!embedded"
      aria-label="选择小游戏"
    >
      <button
        v-for="id in GAME_IDS"
        :key="id"
        :class="{ active: !js13k && game === id }"
        :aria-pressed="!js13k && game === id"
        :disabled="busy || matchAnimating"
        @click="chooseGame(id)"
      >
        {{ GAME_LABELS[id] }}
      </button>
      <button
        :class="{ active: js13k }"
        :aria-pressed="js13k"
        :disabled="busy || matchAnimating"
        @click="js13k = true; leaderboard = false"
      >
        经典精选
      </button>
      <button
        v-if="!js13k"
        :class="{ active: leaderboard }"
        :aria-pressed="leaderboard"
        @click="leaderboard = !leaderboard"
      >
        榜单
      </button>
    </nav>
    <js13k-games
      v-if="js13k"
      @close="hide()"
    />
    <template v-else>
      <details
        v-if="game === 'match'"
        class="arcade-profile"
      >
        <summary>玩家：{{ session?.player || '我' }} · 玩家设置</summary>
        <div class="arcade-player">
          <label>昵称
            <input
              v-model="nickname"
              aria-label="玩家昵称"
              maxlength="24"
              placeholder="我"
            ></label><button
            :disabled="busy || matchAnimating || !!error"
            @click="restart"
          >
            新的旅程
          </button>
        </div>
      </details>
      <div
        v-else
        class="arcade-player"
      >
        <details class="arcade-profile">
          <summary>玩家：{{ session?.player ?? '我' }} · 玩家设置</summary>
          <label>昵称 <input
            v-model="nickname"
            aria-label="玩家昵称"
            maxlength="24"
            placeholder="我"
          ></label>
          <p class="arcade-muted">
            改昵称后点新一局切换玩家
          </p>
        </details>
        <button
          :disabled="busy || matchAnimating || !!error"
          @click="restart"
        >
          {{ state?.over ? '再来一局' : '新一局' }}
        </button>
      </div>
      <p
        v-if="error"
        role="alert"
        class="arcade-error"
      >
        {{ error }} <button @click="load">
          重试读取
        </button>
      </p>
      <template v-if="leaderboard">
        <h3>{{ GAME_LABELS[game] }} · 单局前 20</h3>
        <ol class="arcade-ranking">
          <li
            v-for="entry in data.rankings[game]"
            :key="entry.id"
          >
            <span>{{ entry.player }}</span><b>{{ entry.score.toLocaleString() }}</b>
          </li>
        </ol>
        <p
          v-if="!data.rankings[game].length"
          class="arcade-muted"
        >
          还没有成绩，完成一次得分操作即可上榜。
        </p>
        <h3>累计积分榜 · {{ GAME_LABELS[game] }}</h3>
        <ol class="arcade-ranking">
          <li
            v-for="entry in totals"
            :key="entry.player"
          >
            <span>{{ entry.player }}</span><b>{{ entry.score.toLocaleString() }}</b>
          </li>
        </ol>
        <p class="arcade-muted">
          按游戏分别排名；当前进行中的成绩也计入榜单。
        </p>
      </template>
      <template v-else-if="state">
        <div class="arcade-stats">
          <span>本局 <b>{{ state.score.toLocaleString() }}</b></span><span>最佳 {{ best.toLocaleString() }}</span><span>累计 {{ total.toLocaleString() }}</span>
        </div>
        <p
          v-if="game !== 'match'"
          class="arcade-help"
        >
          {{ help }}
        </p>
        <match-board
          v-if="game === 'match'"
          :state="state"
          :selected="selected"
          :disabled="busy || !!error"
          :result="matchResult"
          @cell="cell"
          @swap="swap"
          @progress="advance"
          @animating="matchAnimating = $event"
        />
        <classic-board
          v-else
          :state="state"
          :selected="selected"
          :disabled="busy || !!error"
          @cell="cell"
          @move="move"
          @fill="fill"
        />
        <p
          class="arcade-message"
          role="status"
        >
          {{
            game === 'match'
              ? message || '关卡和积分自动保存 · 随时收起，回来接着玩'
              : state.over
                ? game === 'sudoku'
                  ? '完成！额外 +100 分，点再来一局继续积累。'
                  : '本局结束，点再来一局继续积累。'
                : message || `已走 ${state.moves} 步 · 进度自动保留`
          }}
        </p>
      </template>
    </template>
    <footer>仅保存在本机 · 不写入文档 · Ctrl+Alt+G 开关</footer>
  </section>
</template>

<style scoped>
.arcade-panel {
  position: fixed;
  left: 54px;
  bottom: 14px;
  z-index: 2200;
  width: min(390px, calc(100vw - 68px));
  max-height: calc(100vh - 90px);
  overflow-y: auto;
  box-sizing: border-box;
  padding: 18px;
  background: var(--editorBgColor);
  color: var(--editorColor);
  border: 1px solid var(--editorColor10);
  border-radius: 18px;
  box-shadow: 0 12px 48px #0003;
  font: 12px/1.5 var(--uiFontFamily);
  -webkit-app-region: no-drag;
}
.arcade-panel:focus {
  outline: none;
}
.arcade-embedded {
  position: relative;
  inset: auto;
  width: min(100%, 360px);
  max-height: none;
  margin: 0 auto;
  box-shadow: none;
  padding: 6px;
  border: 0;
}
.arcade-embedded .arcade-player,
.arcade-embedded .arcade-owner,
.arcade-embedded .arcade-help,
.arcade-embedded footer { display: none; }
.arcade-panel-wide {
  width: min(900px, calc(100vw - 68px));
}
.arcade-panel button {
  font: inherit;
  color: inherit;
  cursor: pointer;
  background: var(--inputBgColor);
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 5px 9px;
}
.arcade-panel button:hover:not(:disabled),
.arcade-panel button.active {
  border-color: var(--editorColor40);
}
.arcade-panel button:focus-visible,
.arcade-panel input:focus-visible {
  outline: 2px solid var(--themeColor);
  outline-offset: 1px;
}
.arcade-panel button:disabled {
  cursor: default;
}
.arcade-panel header {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.arcade-panel header strong {
  font-size: 14px;
}
.arcade-panel header button {
  margin-left: auto;
  font-size: 18px;
  padding: 0 7px;
}
.arcade-muted,
.arcade-panel footer {
  color: var(--editorColor50);
  font-size: 11px;
}
.arcade-panel nav {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.arcade-player {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
.arcade-player input {
  width: 112px;
  padding: 4px 6px;
  color: var(--editorColor);
  background: var(--inputBgColor);
  border: 1px solid var(--editorColor10);
  border-radius: 4px;
  font: inherit;
}
.arcade-owner {
  margin: 5px 0 12px;
}
.arcade-profile {
  margin: 10px 0;
  color: var(--editorColor50);
  font-size: 11px;
}
.arcade-profile summary {
  cursor: pointer;
}
.arcade-profile .arcade-player {
  margin-bottom: 8px;
}
.arcade-stats {
  display: flex;
  justify-content: space-between;
  gap: 5px;
  font-variant-numeric: tabular-nums;
  margin-bottom: 12px;
}
.arcade-stats > span { flex: 1; padding: 8px; border-radius: 8px; background: var(--editorColor04, #8881); text-align: center; }
.arcade-help {
  min-height: 36px;
  margin: 8px 0;
}
.arcade-message {
  min-height: 18px;
  margin: 10px 0;
}
.arcade-error {
  color: var(--deleteColor);
}
.arcade-panel footer {
  border-top: 1px solid var(--editorColor10);
  padding-top: 9px;
}
.arcade-panel h3 {
  font-size: 12px;
  margin: 14px 0 6px;
}
.arcade-ranking {
  margin: 0;
  padding-left: 24px;
  max-height: 140px;
  overflow-y: auto;
}
.arcade-ranking li {
  padding: 3px 2px;
}
.arcade-ranking li span {
  display: inline-block;
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
}
.arcade-ranking li b {
  float: right;
  font-variant-numeric: tabular-nums;
}
</style>
