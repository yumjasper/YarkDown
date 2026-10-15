<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { adjacent, fillSudoku, moveMerge, swapMatch, type Direction, type GameId } from '@/services/arcade/games'
import {
  ARCADE_KEY, GAME_IDS, GAME_LABELS, creditSession, emptyArcade,
  readArcade, saveArcade, startSession, type ArcadeData
} from '@/services/arcade/storage'

const visible = ref(false)
const panel = ref<HTMLElement>()
const data = ref(emptyArcade())
const game = ref<GameId>('merge')
const nickname = ref('我')
const selected = ref(-1)
const message = ref('')
const error = ref('')
const busy = ref(false)
const leaderboard = ref(false)
let previousFocus: HTMLElement | null = null
let previousRange: Range | null = null
const symbols = ['○', '◇', '△', '□', '✦', '⬡']
const session = computed(() => data.value.sessions[game.value])
const state = computed(() => session.value?.state)
const total = computed(() => data.value.players.find(player => player.name === session.value?.player)?.totals[game.value] ?? 0)
const best = computed(() => data.value.players.find(player => player.name === session.value?.player)?.best[game.value] ?? 0)
const totals = computed(() => [...data.value.players].map(player => ({
  player: player.name, score: player.totals[game.value]
})).sort((a, b) => b.score - a.score).slice(0, 20))
const help = computed(() => ({
  merge: '方向键或下方按钮移动，相同数字合并得分；达到 2048 后仍可继续。',
  sudoku: '每行、每列和每个 2×3 宫填入 1–6。填对 +10，完成额外 +100；已确认的数字不再重复计分。',
  match: '依次选择相邻图形交换，横竖三个同形即可消除。每个 +10，连锁按层数加倍；无解自动换盘，积分保留。'
}[game.value]))

function load(): void {
  try {
    data.value = readArcade(localStorage)
    error.value = ''
  } catch (reason) { error.value = String((reason as Error).message) }
}

async function transact(change: (current: ArcadeData) => void): Promise<void> {
  if (busy.value) return
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
  } catch (reason) { error.value = (reason as Error).message }
  finally { busy.value = false }
}

async function show(): Promise<void> {
  if (visible.value) return
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const selection = window.getSelection()
  previousRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
  load()
  game.value = data.value.selected
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
  game.value = value
  selected.value = -1
  message.value = ''
  await transact(current => {
    current.selected = value
    if (!current.sessions[value]) startSession(current, value, nickname.value)
  })
}

async function restart(): Promise<void> {
  const currentGame = game.value
  await transact(current => { startSession(current, currentGame, nickname.value) })
  selected.value = -1
  message.value = '新一局已开始；累计积分和榜单保留。'
}

async function move(direction: Direction): Promise<void> {
  await transact(current => {
    const active = current.sessions.merge
    if (!active) return
    active.state = moveMerge(active.state, direction)
    creditSession(current, active)
  })
}

async function fill(value: number): Promise<void> {
  const index = selected.value
  await transact(current => {
    const active = current.sessions.sudoku
    if (!active || index < 0 || active.state.board[index]) return
    const next = fillSudoku(active.state, index, value)
    message.value = next === active.state ? '这个数字不正确，再想一想。' : '正确，+10 分。'
    active.state = next
    creditSession(current, active)
  })
}

async function cell(index: number): Promise<void> {
  if (busy.value || leaderboard.value) return
  if (game.value === 'sudoku') { selected.value = index; return }
  if (game.value !== 'match') return
  const first = selected.value
  if (first === index) { selected.value = -1; return }
  if (!adjacent(first, index)) { selected.value = index; return }
  selected.value = -1
  await transact(current => {
    const active = current.sessions.match
    if (!active) return
    const result = swapMatch(active.state, first, index)
    const points = result.state.score - active.state.score
    message.value = points
      ? `+${points} 分 · ${result.combo} 层连锁${result.reshuffled ? ' · 已自动换盘' : ''}`
      : '这次交换无法消除，请换一组。'
    active.state = result.state
    creditSession(current, active)
  })
}

function onKey(event: KeyboardEvent): void {
  if (event.ctrlKey && event.altKey && !event.metaKey && event.code === 'KeyG' && !event.repeat && !event.isComposing) {
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
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || leaderboard.value) return
  if (event.target instanceof HTMLInputElement) return
  const directions: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
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
  if (visible.value && event.target instanceof Node && !panel.value?.contains(event.target)) hide(false)
}
function onBlur(): void { hide(false) }
function onVisibility(): void { if (document.hidden) hide(false) }
function onStorage(event: StorageEvent): void { if (event.key === ARCADE_KEY) load() }

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('blur', onBlur)
  window.addEventListener('storage', onStorage)
  document.addEventListener('visibilitychange', onVisibility)
  document.addEventListener('pointerdown', onOutside, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('blur', onBlur)
  window.removeEventListener('storage', onStorage)
  document.removeEventListener('visibilitychange', onVisibility)
  document.removeEventListener('pointerdown', onOutside, true)
})
</script>

<template>
  <button
    v-if="!visible"
    class="arcade-launcher"
    aria-label="打开小憩"
    title="小憩 · Ctrl+Alt+G"
    @pointerdown.prevent
    @click="show"
  >
    ···
  </button>
  <section
    v-if="visible"
    ref="panel"
    class="arcade-panel"
    role="dialog"
    aria-label="小憩"
    tabindex="-1"
    @keydown.stop
  >
    <header>
      <strong>小憩</strong>
      <span class="arcade-muted">Esc 收起 · 失焦自动隐藏</span>
      <button
        aria-label="收起小憩"
        @click="hide()"
      >
        ×
      </button>
    </header>
    <nav aria-label="选择小游戏">
      <button
        v-for="id in GAME_IDS"
        :key="id"
        :class="{ active: game === id }"
        :aria-pressed="game === id"
        :disabled="busy"
        @click="chooseGame(id)"
      >
        {{ GAME_LABELS[id] }}
      </button>
      <button
        :class="{ active: leaderboard }"
        :aria-pressed="leaderboard"
        @click="leaderboard = !leaderboard"
      >
        榜单
      </button>
    </nav>
    <div class="arcade-player">
      <label>玩家 <input
        v-model="nickname"
        aria-label="玩家昵称"
        maxlength="24"
        placeholder="我"
      ></label>
      <button
        :disabled="busy || !!error"
        @click="restart"
      >
        {{ state?.over ? '再来一局' : '新一局' }}
      </button>
    </div>
    <p class="arcade-muted arcade-owner">
      当前局：{{ session?.player ?? '我' }} · 改昵称后点新一局切换玩家
    </p>
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
      <p class="arcade-help">
        {{ help }}
      </p>
      <div
        :class="['arcade-board', `arcade-${game}`]"
        :aria-label="`${GAME_LABELS[game]}棋盘`"
      >
        <button
          v-for="(value, index) in state.board"
          :key="index"
          :class="{ selected: selected === index, given: game === 'sudoku' && !!state.fixed[index], filled: !!value, 'box-right': game === 'sudoku' && index % 6 === 2, 'box-bottom': game === 'sudoku' && [1, 3].includes(Math.floor(index / 6)) }"
          :disabled="busy || !!error || game === 'merge' || (game === 'sudoku' && !!value)"
          :aria-label="`第${Math.floor(index / (game === 'match' ? 7 : game === 'sudoku' ? 6 : 4)) + 1}行第${index % (game === 'match' ? 7 : game === 'sudoku' ? 6 : 4) + 1}列 ${game === 'match' ? symbols[value] : value || '空'} `"
          @click="cell(index)"
        >
          {{ game === 'match' ? symbols[value] : value || '·' }}
        </button>
      </div>
      <div
        v-if="game === 'merge'"
        class="arcade-controls"
        aria-label="移动方向"
      >
        <button
          v-for="(label, direction) in { left: '←', up: '↑', down: '↓', right: '→' }"
          :key="direction"
          :disabled="busy || !!error || state.over"
          @click="move(direction as Direction)"
        >
          {{ label }}
        </button>
      </div>
      <div
        v-if="game === 'sudoku'"
        class="arcade-controls"
        aria-label="填入数字"
      >
        <button
          v-for="value in 6"
          :key="value"
          :disabled="busy || !!error || selected < 0 || state.over"
          @click="fill(value)"
        >
          {{ value }}
        </button>
      </div>
      <p
        class="arcade-message"
        role="status"
      >
        {{ state.over ? (game === 'sudoku' ? '完成！额外 +100 分，点再来一局继续积累。' : '本局结束，点再来一局继续积累。') : message || `已走 ${state.moves} 步 · 进度自动保留` }}
      </p>
    </template>
    <footer>仅保存在本机 · 不写入文档 · Ctrl+Alt+G 开关</footer>
  </section>
</template>

<style scoped>
.arcade-launcher { position: fixed; right: 14px; bottom: 8px; z-index: 100; display: flex; align-items: center; justify-content: center; width: 32px; height: 26px; box-sizing: border-box; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--editorColor50); font: bold 16px/1 monospace; cursor: pointer; -webkit-app-region: no-drag; }
.arcade-launcher:hover { color: var(--editorColor); background: var(--editorColor04); }
.arcade-panel { position: fixed; right: 18px; bottom: 38px; z-index: 2200; width: min(348px, calc(100vw - 36px)); max-height: calc(100vh - 110px); overflow-y: auto; box-sizing: border-box; padding: 16px; background: var(--editorBgColor); color: var(--editorColor); border: 1px solid var(--editorColor10); border-radius: 10px; box-shadow: 0 8px 32px #0002; font: 12px/1.5 var(--uiFontFamily); -webkit-app-region: no-drag; }
.arcade-panel:focus { outline: none; }
.arcade-panel button { font: inherit; color: inherit; cursor: pointer; background: var(--inputBgColor); border: 1px solid transparent; border-radius: 5px; padding: 5px 9px; }
.arcade-panel button:hover:not(:disabled), .arcade-panel button.active { border-color: var(--editorColor40); }
.arcade-panel button:focus-visible, .arcade-panel input:focus-visible { outline: 2px solid var(--themeColor); outline-offset: 1px; }
.arcade-panel button:disabled { cursor: default; }
.arcade-panel header { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
.arcade-panel header strong { font-size: 14px; }
.arcade-panel header button { margin-left: auto; font-size: 18px; padding: 0 7px; }
.arcade-muted, .arcade-panel footer { color: var(--editorColor50); font-size: 11px; }
.arcade-panel nav { display: flex; gap: 5px; }
.arcade-player { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 12px; }
.arcade-player input { width: 112px; padding: 4px 6px; color: var(--editorColor); background: var(--inputBgColor); border: 1px solid var(--editorColor10); border-radius: 4px; font: inherit; }
.arcade-owner { margin: 5px 0 12px; }
.arcade-stats { display: flex; justify-content: space-between; gap: 5px; font-variant-numeric: tabular-nums; }
.arcade-help { min-height: 36px; margin: 8px 0; }
.arcade-board { display: grid; gap: 4px; }
.arcade-merge { grid-template-columns: repeat(4, 1fr); }
.arcade-sudoku { grid-template-columns: repeat(6, 1fr); gap: 2px; }
.arcade-match { grid-template-columns: repeat(7, 1fr); }
.arcade-board button { aspect-ratio: 1; min-width: 0; padding: 0; font: 20px/1 monospace; border: 1px solid var(--editorColor10); }
.arcade-merge button { font-size: 18px; }
.arcade-merge button.filled { background: var(--codeBlockBgColor); font-weight: bold; }
.arcade-match button { font-size: 24px; }
.arcade-sudoku button.given { color: var(--editorColor); font-weight: bold; }
.arcade-sudoku button.filled:not(.given) { color: var(--themeColor); }
.arcade-sudoku button.box-right { border-right: 2px solid var(--editorColor40); }
.arcade-sudoku button.box-bottom { border-bottom: 2px solid var(--editorColor40); }
.arcade-board button.selected { outline: 2px solid var(--themeColor); outline-offset: -2px; background: var(--themeColor10); }
.arcade-controls { display: flex; justify-content: center; gap: 8px; margin-top: 10px; }
.arcade-controls button { min-width: 32px; }
.arcade-message { min-height: 18px; margin: 10px 0; }
.arcade-error { color: var(--deleteColor); }
.arcade-panel footer { border-top: 1px solid var(--editorColor10); padding-top: 9px; }
.arcade-panel h3 { font-size: 12px; margin: 14px 0 6px; }
.arcade-ranking { margin: 0; padding-left: 24px; max-height: 140px; overflow-y: auto; }
.arcade-ranking li { padding: 3px 2px; }
.arcade-ranking li span { display: inline-block; max-width: 170px; overflow: hidden; text-overflow: ellipsis; vertical-align: bottom; }
.arcade-ranking li b { float: right; font-variant-numeric: tabular-nums; }
</style>
