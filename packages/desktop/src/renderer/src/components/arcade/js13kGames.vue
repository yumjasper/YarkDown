<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  JS13K_GAMES,
  JS13K_STORAGE_PREFIX,
  gameSnapshot,
  isGameStorage,
  type Js13kGame
} from '@/services/arcade/js13k'

const emit = defineEmits<{ close: [] }>()
const props = defineProps<{ initialGame?: Js13kGame }>()
const active = ref<Js13kGame>()
const frame = ref<HTMLIFrameElement>()
const library = ref<HTMLElement>()
const run = ref(0)
const source = ref('')
const error = ref('')
const ready = ref(false)
const locked = ref(false)
let timeout: ReturnType<typeof setTimeout> | undefined
const title = computed(() =>
  active.value ? `${active.value.name} · ${active.value.title}` : '经典游戏精选'
)

function stop(): void {
  clearTimeout(timeout)
  active.value = undefined
  source.value = ''
  ready.value = false
  locked.value = false
  error.value = ''
}

function play(game: Js13kGame): void {
  stop()
  error.value = ''
  try {
    const snapshot = gameSnapshot(localStorage, game)
    const url = new URL(`./js13k/${game.id}/index.html`, window.location.href)
    url.hash = encodeURIComponent(JSON.stringify(snapshot))
    source.value = url.href
    active.value = game
    run.value++
    void nextTick(() => library.value?.parentElement?.scrollTo({ top: 0 }))
    timeout = setTimeout(() => {
      if (!ready.value) error.value = '游戏未能加载，请返回后重试。'
    }, 10000)
  } catch {
    error.value = '无法读取本机游戏记录，请检查存储空间后重试。'
  }
}

function receive(event: MessageEvent): void {
  if (!active.value || event.source !== frame.value?.contentWindow) return
  const message = event.data
  if (!message || message.channel !== 'yarktext-js13k') return
  if (message.type === 'close') emit('close')
  if (message.type === 'pointer-lock' && typeof message.locked === 'boolean') {
    locked.value = message.locked
  }
  if (message.type === 'ready') {
    ready.value = true
    clearTimeout(timeout)
  }
  if (message.type === 'error') error.value = '游戏运行遇到问题，请返回后重新开始。'
  if (message.type === 'save' && isGameStorage(active.value, message.key, message.value)) {
    try {
      const key = JS13K_STORAGE_PREFIX + active.value.id + ':' + message.key
      if (message.value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, message.value)
    } catch {
      error.value = '游戏记录保存失败，请检查本机存储空间。'
    }
  }
}

onMounted(() => {
  window.addEventListener('message', receive)
  if (props.initialGame) play(props.initialGame)
})
onBeforeUnmount(() => {
  stop()
  window.removeEventListener('message', receive)
})
</script>

<template>
  <div
    ref="library"
    class="js13k-library"
  >
    <div class="js13k-heading">
      <h3>{{ title }}</h3>
      <button
        v-if="active"
        @click="initialGame ? emit('close') : stop()"
      >
        {{ initialGame ? '结束游戏' : '返回精选' }}
      </button>
    </div>
    <p
      v-if="error"
      role="alert"
    >
      {{ error }}
    </p>
    <template v-if="active">
      <p>{{ active.help }}</p>
      <p
        v-if="active.pointerLock"
        class="js13k-pointer"
        role="status"
      >
        {{ locked ? '鼠标已锁定 · Esc 释放鼠标' : '点击游戏画面获取鼠标 · 再按 Esc 收起' }}
        · Ctrl+Alt+G 收起
      </p>
      <iframe
        ref="frame"
        :key="run"
        :src="source"
        :title="active.title"
        :sandbox="active.pointerLock ? 'allow-scripts allow-pointer-lock' : 'allow-scripts'"
        allow="autoplay; fullscreen"
        allowfullscreen
        referrerpolicy="no-referrer"
      />
      <p>{{ active.persistence }}</p>
      <p class="js13k-credit">
        {{ active.subtitle }} · {{ active.author }} · {{ active.license }}
      </p>
    </template>
    <template v-else>
      <p>轻量、离线的经典小游戏。选择游戏后点击画面开始操作。</p>
      <div class="js13k-catalog">
        <button
          v-for="item in JS13K_GAMES"
          :key="item.id"
          class="js13k-card"
          @click="play(item)"
        >
          <strong>{{ item.name }} · {{ item.title }}</strong>
          <span>{{ item.subtitle }}</span>
          <span>{{ item.help }}</span>
          <small>{{ item.author }} · {{ item.license }}</small>
        </button>
      </div>
      <p>菜单与提示已汉化，保留作者署名；记录仅存在本机，独立于小憩积分榜。</p>
    </template>
  </div>
</template>

<style scoped>
.js13k-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.js13k-catalog { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.js13k-catalog .js13k-card { margin: 0; height: 100%; }
@media (max-width: 700px) {
  .js13k-catalog { grid-template-columns: minmax(0, 1fr); }
}
.js13k-heading h3 {
  margin: 14px 0;
}
.js13k-card {
  display: flex;
  flex-direction: column;
  text-align: left;
  gap: 8px;
  width: 100%;
  margin-bottom: 12px;
  padding: 16px !important;
}
.js13k-card strong {
  font-size: 18px;
}
.js13k-card small,
.js13k-credit {
  color: var(--editorColor50);
}
iframe {
  width: 100%;
  height: min(58vh, 540px);
  min-height: 260px;
  border: 0;
  border-radius: 8px;
  background: #111;
}
</style>
