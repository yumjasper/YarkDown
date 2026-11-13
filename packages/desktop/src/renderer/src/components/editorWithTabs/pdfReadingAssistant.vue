<template>
  <aside
    class="pdf-reading-assistant"
    :class="{ 'is-web': webMode }"
    :aria-label="label('阅读助手', 'Reading assistant')"
  >
    <header>
      <div class="heading">
        <pdf-icon name="translate" /><strong>{{ label('阅读助手', 'Reading assistant') }}</strong>
      </div>
      <button
        class="icon-button"
        :aria-label="label('关闭翻译面板', 'Close translation panel')"
        @click="$emit('close')"
      >
        <pdf-icon name="close" />
      </button>
    </header>
    <nav
      class="mode-switch"
      :aria-label="label('翻译方式', 'Translation mode')"
    >
      <button
        :aria-pressed="mode === 'vocabulary'"
        @click="changeMode('vocabulary')"
      >
        {{ label('生词辅助', 'Vocabulary') }}<small>{{ label('离线', 'Offline') }}</small>
      </button>
      <button
        :aria-pressed="mode === 'online'"
        @click="changeMode('online')"
      >
        {{ label('整句翻译', 'Translation') }}<small>{{ label('在线', 'Online') }}</small>
      </button>
    </nav>
    <div
      v-if="mode === 'online'"
      class="provider-bar"
    >
      <label :for="`${viewId}-provider`">{{ label('翻译服务', 'Service') }}</label>
      <select
        :id="`${viewId}-provider`"
        v-model="provider"
        :style="{ colorScheme: isDark ? 'dark' : 'light' }"
      >
        <option value="bing">
          {{ label('必应翻译', 'Bing Translator') }}
        </option>
        <option value="google">
          {{ label('谷歌翻译', 'Google Translate') }}
        </option>
      </select>
      <button
        v-if="!webMode"
        @click="openWeb"
      >
        {{ label('官方网页', 'Official page') }}
      </button>
      <button
        v-else
        @click="returnToReader"
      >
        {{ label('返回对照', 'Back') }}
      </button>
    </div>
    <div
      v-if="webMode"
      class="web-controls"
    >
      <p>
        {{
          label(
            '在官方界面自行登录或翻译。账号会话保存在本机，不读取账号信息。',
            'Sign in or translate in the official page. The session stays on this device; account information is not read.'
          )
        }}
      </p>
      <button
        :disabled="!source.trim()"
        @click="copy(source)"
      >
        {{ label('复制原文', 'Copy source') }}
      </button>
      <button @click="externalPage">
        {{ label('外部浏览器', 'External browser') }}
      </button>
    </div>
    <div
      v-if="webMode"
      ref="webHost"
      class="reading-web-host"
    >
      <span v-if="busy">{{ label('正在加载官方网页…', 'Loading official page…') }}</span>
    </div>
    <div
      v-else
      class="reading-content"
    >
      <div
        v-if="!source.trim()"
        class="empty-state"
      >
        <pdf-icon name="translate" />
        <h3>{{ label('选一句，读懂它', 'Select a sentence. Read it clearly.') }}</h3>
        <p>
          {{
            label(
              '在 PDF 中选中文字，点击选区菜单的翻译图标。生词会按原句顺序显示，不必来回对照词表。',
              'Select PDF text and choose Translate. Vocabulary stays in sentence order, without jumping between a sentence and a word list.'
            )
          }}
        </p>
        <button
          :disabled="!hasDocument"
          @click="$emit('page')"
        >
          {{ label('查看本页原文', 'Use this page’s text') }}
        </button>
      </div>
      <template v-else-if="mode === 'vocabulary'">
        <div class="section-heading">
          <span>{{ label('选中原文', 'Selected passage') }}</span><span class="local-badge">{{ label('不联网', 'On-device') }}</span>
        </div>
        <div class="provider-bar subject-bar">
          <label :for="`${viewId}-subject`">{{ label('学科词义', 'Subject meanings') }}</label>
          <select
            :id="`${viewId}-subject`"
            v-model="domain"
            :style="{ colorScheme: isDark ? 'dark' : 'light' }"
          >
            <option
              v-for="subject in ['general', 'computing', 'chemistry'] as const"
              :key="subject"
              :value="subject"
            >
              {{ domainLabel(subject) }}
            </option>
          </select>
        </div>
        <div class="vocabulary-controls">
          <label><input
            v-model="inlineGloss"
            type="checkbox"
          >{{
            label('词下释义', 'Inline meanings')
          }}</label>
          <span>{{ vocabulary.length }} {{ label('个生词', 'new words') }}</span>
        </div>
        <p
          v-if="busy"
          role="status"
        >
          {{ label('正在本机查词…', 'Looking up words locally…') }}
        </p>
        <div
          v-else
          class="annotated-passage"
          :aria-label="label('生词标注原文', 'Annotated passage')"
        >
          <template
            v-for="(token, index) in analysis?.tokens"
            :key="index"
          >
            <button
              v-if="token.entry"
              class="word"
              :class="{
                unfamiliar: isUnfamiliar(token.entry),
                active: selected?.word === token.entry.word
              }"
              :aria-label="`${token.text}：${label('查词', 'Look up')}`"
              :aria-pressed="selected?.word === token.entry.word"
              @click="selectWord(token.entry)"
            >
              <ruby v-if="inlineGloss && isUnfamiliar(token.entry)">{{ token.text }}<rt>{{ gloss(token.entry) }}</rt></ruby>
              <span v-else>{{ token.text }}</span>
            </button>
            <span
              v-else
              :class="{ 'unknown-word': token.unknown }"
              :title="
                token.unknown
                  ? label(
                    '词库未收录，可能是专名或识别错误',
                    'Not in dictionary; may be a name or extraction error'
                  )
                  : undefined
              "
            >{{ token.text }}</span>
          </template>
        </div>
        <p class="reading-hint">
          {{
            label(
              '学科术语及短语优先，常用 1000 词按通用义过滤。默认释义会按句中的词性调整，点击词语查看来源和全部义项。',
              'Subject terms and phrases come first; 1,000 common general meanings are excluded. The default meaning follows the part of speech in the sentence; click a word for sources and all senses.'
            )
          }}
        </p>
        <div
          v-if="vocabulary.length"
          class="word-navigation"
          :aria-label="label('本句生词', 'Vocabulary in this passage')"
        >
          <button
            v-for="entry in vocabulary"
            :key="entry.word"
            :aria-pressed="selected?.word === entry.word"
            @click="selectWord(entry)"
          >
            {{ entry.word }}
          </button>
        </div>
        <section
          v-if="selected"
          class="dictionary-card"
          :aria-label="label('单词释义', 'Word meanings')"
        >
          <div class="dictionary-heading">
            <div>
              <strong>{{ selected.word }}</strong><span
                v-if="selected.phonetic"
                class="phonetic"
              >/{{ selected.phonetic }}/</span>
            </div>
            <button
              :aria-pressed="known.includes(selected.word)"
              @click="toggleKnown(selected.word)"
            >
              {{
                known.includes(selected.word)
                  ? label('已掌握', 'Mastered')
                  : label('标为掌握', 'Mark mastered')
              }}
            </button>
          </div>
          <div class="sense-heading">
            {{ label('选择符合语境的释义', 'Choose a meaning for this context')
            }}<small>{{ selected.senses.length }} {{ label('个义项', 'senses') }}</small>
          </div>
          <ol class="senses">
            <li
              v-for="(sense, index) in selected.senses"
              :key="index"
            >
              <button
                :aria-pressed="(chosenSenses[selected.word] ?? 0) === index"
                @click="chosenSenses[selected.word] = index"
              >
                <span class="sense-number">{{ index + 1 }}</span><span><span
                  v-if="selected.senseNotes?.[index]"
                  class="sense-source"
                >{{ domainLabel(selected.senseNotes[index].domain) }} ·
                  {{ selected.senseNotes[index].source }}</span><span>{{ sense }}</span><small
                  v-if="selected.senseNotes?.[index]?.definition"
                  class="sense-definition"
                >{{ selected.senseNotes[index].definition }}</small></span>
              </button>
            </li>
          </ol>
          <div class="word-stepper">
            <button
              :disabled="selectedIndex <= 0"
              @click="stepWord(-1)"
            >
              {{ label('上一个', 'Previous') }}
            </button><span>{{
              selectedIndex >= 0
                ? `${selectedIndex + 1} / ${vocabulary.length}`
                : label('常用或已掌握词', 'Common or mastered word')
            }}</span><button
              :disabled="selectedIndex < 0 || selectedIndex >= vocabulary.length - 1"
              @click="stepWord(1)"
            >
              {{ label('下一个', 'Next') }}
            </button>
          </div>
        </section>
        <p
          v-if="unknownCount"
          class="reading-hint"
        >
          {{ unknownCount }}
          {{
            label(
              '个词未收录，以浅色虚线提示。可切换整句翻译。',
              'words are not in the dictionary (dotted underline). You can switch to sentence translation.'
            )
          }}
        </p>
        <details class="dictionary-info">
          <summary>{{ label('词库与已掌握词', 'Dictionary & mastered words') }}</summary>
          <p>
            {{
              label(
                '通用库为 Open Dictionary v2.0（2026-08），保留核心／常用／生僻义优先级与中文解释；数据源自 Wiktionary，经上游模型离线生成，应用不运行模型。计算机／AI 和化学来自 NAER、AI/LLM 词表及项目术语。词典数据按 CC BY-SA 4.0 共享并署名 Wiktionary 贡献者；独立 BNC 前 1000 词元仅用于常用词过滤。',
                'General: Open Dictionary v2.0 (2026-08), with core/common/rare priorities and learner explanations. Wiktionary-derived definitions are generated upstream; no runtime model is used. Computing/AI and chemistry use NAER, the AI/LLM glossary and project terms. Dictionary data is shared under CC BY-SA 4.0 with attribution to Wiktionary contributors. The separate top-1,000 BNC list is only a common-word filter.'
              )
            }}
          </p>
          <div class="mastered-list">
            <button
              v-for="word in known"
              :key="word"
              :aria-label="`${label('取消掌握', 'Unmark mastered')} ${word}`"
              @click="toggleKnown(word)"
            >
              {{ word }} ×
            </button>
          </div>
        </details>
      </template>
      <template v-else>
        <div class="section-heading">
          <span>{{ label('原文', 'Source') }}</span><button
            class="text-button"
            @click="copy(source)"
          >
            {{ label('复制', 'Copy') }}
          </button>
        </div>
        <pre class="source-text">{{ source }}</pre>
        <p class="reading-hint">
          {{
            label(
              '点击翻译后，仅将这段文字发送给所选服务。免费网页可能限流或要求登录、验证；不使用私有翻译 API。',
              'Translate sends only this passage to the chosen service. Free pages may rate-limit or require sign-in or verification. No private translation API is used.'
            )
          }}
        </p>
        <div class="online-actions">
          <button
            v-if="!busy"
            class="primary-button"
            :disabled="source.length > 5000"
            @click="translate"
          >
            {{
              resultText
                ? label('重新翻译', 'Translate again')
                : label('翻译成中文', 'Translate to Chinese')
            }}
          </button><button
            v-else
            @click="cancelTranslation"
          >
            {{ label('取消翻译', 'Cancel translation') }}
          </button><button
            v-if="resultText"
            :disabled="!resultComplete"
            @click="copy(resultText)"
          >
            {{ label('复制译文', 'Copy translation') }}
          </button>
        </div>
        <p
          v-if="source.length > 5000"
          role="alert"
        >
          {{
            label(
              '在线翻译限 5,000 字符，请选择较短段落。',
              'Select a shorter passage (5,000-character limit).'
            )
          }}
        </p>
        <p
          v-if="busy"
          role="status"
        >
          {{
            translationPhase === 'loading'
              ? label('正在连接官方翻译页…', 'Connecting to the official translation page…')
              : translationPhase === 'translating'
                ? label(
                  '正在翻译，官网结果出现后立即同步…',
                  'Translating; results will appear as soon as the page provides them…'
                )
                : label(
                  '已同步官网译文，正在确认完成…',
                  'Official result synchronized; confirming completion…'
                )
          }}
        </p>
        <section
          v-if="resultText"
          class="translation-result"
          :aria-label="label('中文译文', 'Chinese translation')"
          :aria-busy="busy"
        >
          <div class="section-heading">
            <span>{{
              resultComplete
                ? label('中文译文', 'Chinese translation')
                : busy
                  ? label('中文译文 · 同步中', 'Chinese translation · Synchronizing')
                  : label('中文译文 · 未确认完成', 'Chinese translation · Unconfirmed')
            }}</span><small>{{ provider === 'bing' ? 'Bing' : 'Google' }}</small>
          </div>
          <pre>{{ resultText }}</pre>
        </section>
      </template>
      <p
        v-if="error"
        class="reading-error"
        role="alert"
      >
        {{ error }}
      </p>
      <p
        v-if="copied"
        class="reading-hint"
        role="status"
      >
        {{ label('已复制', 'Copied') }}
      </p>
    </div>
    <footer>
      {{
        mode === 'vocabulary'
          ? label('离线查词 · 原文件不变', 'Offline dictionary · PDF unchanged')
          : label('官方网页适配 · 可手动登录', 'Official page adapter · Manual sign-in')
      }}
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  DictionaryWord,
  ReadingDomain,
  TranslationProvider,
  TranslationUpdate,
  VocabularyAnalysis
} from '@shared/types/reading'
import { isReadingDomain, shortDictionarySense } from '@shared/readingVocabulary'
import PdfIcon from './pdfIcon.vue'
const props = defineProps<{ source: string; hasDocument: boolean; requestId?: number }>()
defineEmits<{ close: []; page: [] }>()
const { locale } = useI18n()
const label = (zh: string, en: string) => (locale.value.startsWith('zh') ? zh : en)
const loadSetting = (key: string): string | null => {
  try {
    return localStorage.getItem(`reading-${key}`)
  } catch {
    return null
  }
}
const saveSetting = (key: string, value: string) => {
  try {
    localStorage.setItem(`reading-${key}`, value)
  } catch {
    /* Reading remains available without storage. */
  }
}
const mode = ref<'vocabulary' | 'online'>(
  loadSetting('mode') === 'online' ? 'online' : 'vocabulary'
)
const provider = ref<TranslationProvider>(loadSetting('provider') === 'google' ? 'google' : 'bing')
const inlineGloss = ref(loadSetting('inline') !== 'false')
const savedDomain = loadSetting('domain')
const domain = ref<ReadingDomain>(
  isReadingDomain(savedDomain) ? savedDomain : savedDomain === 'research' ? 'computing' : 'general'
)
const domainLabel = (value: ReadingDomain) =>
  ({
    computing: label('计算机 / AI', 'Computing / AI'),
    chemistry: label('化学', 'Chemistry'),
    general: label('通用', 'General')
  })[value]
const loadKnown = (): string[] => {
  try {
    const value: unknown = JSON.parse(loadSetting('known') || '[]')
    return Array.isArray(value)
      ? value.filter((word): word is string => typeof word === 'string').slice(0, 10000)
      : []
  } catch {
    return []
  }
}
const known = ref(loadKnown())
const analysis = ref<VocabularyAnalysis>(),
  selected = ref<DictionaryWord>()
const chosenSenses = ref<Record<string, number>>(Object.create(null) as Record<string, number>)
const busy = ref(false),
  error = ref(''),
  copied = ref(false),
  resultText = ref(''),
  webMode = ref(false)
const webHost = ref<HTMLElement>()
const viewId = crypto.randomUUID()
// 原生 select 弹层由 Chromium 绘制，只能通过 color-scheme 控制深浅；body.dark 是主题切换的唯一标记。
const isDark = ref(document.body.classList.contains('dark'))
const syncDarkMode = () => {
  isDark.value = document.body.classList.contains('dark')
}
let attempt = 0,
  disposed = false,
  frame = 0
let resizeObserver: ResizeObserver | undefined, modalObserver: MutationObserver | undefined
let copyTimer: ReturnType<typeof setTimeout> | undefined
let removeTranslationListener: (() => void) | undefined
const translationPhase = ref<TranslationUpdate['phase']>('loading')
const resultComplete = ref(false)
const translationUpdate = (update: TranslationUpdate) => {
  if (
    disposed ||
    !busy.value ||
    mode.value !== 'online' ||
    webMode.value ||
    update.id !== viewId ||
    update.sequence !== attempt ||
    update.provider !== provider.value
  )
    return
  translationPhase.value = update.phase
  if (update.text !== undefined) resultText.value = update.text
}
const isUnfamiliar = (entry: DictionaryWord) => !entry.common && !known.value.includes(entry.word)
const vocabulary = computed(() => [
  ...new Map(
    (analysis.value?.tokens || []).flatMap((token) =>
      token.entry && isUnfamiliar(token.entry) ? [[token.entry.word, token.entry] as const] : []
    )
  ).values()
])
const unknownCount = computed(
  () =>
    new Set(
      analysis.value?.tokens
        .filter((token) => token.unknown)
        .map((token) => token.text.toLowerCase())
    ).size
)
const selectedIndex = computed(() =>
  vocabulary.value.findIndex((entry) => entry.word === selected.value?.word)
)
const selectWord = (entry: DictionaryWord) => {
  selected.value = entry
}
const stepWord = (step: number) => {
  const entry = vocabulary.value[selectedIndex.value + step]
  if (entry) selectWord(entry)
}
const gloss = (entry: DictionaryWord) =>
  shortDictionarySense(entry.senses[chosenSenses.value[entry.word] ?? 0] || '')
const toggleKnown = (word: string) => {
  known.value = known.value.includes(word)
    ? known.value.filter((item) => item !== word)
    : [...known.value, word].slice(-10000)
  saveSetting('known', JSON.stringify(known.value))
}
const closeView = () =>
  window.electron.ipcRenderer.invoke('mt::reading::close-web', viewId).catch(() => {})
const invalidate = () => {
  attempt++
  busy.value = false
  error.value = ''
  void window.electron.ipcRenderer.invoke('mt::reading::cancel', viewId).catch(() => {})
}
const lookup = async () => {
  const current = ++attempt
  busy.value = !!props.source.trim()
  error.value = ''
  selected.value = undefined
  analysis.value = undefined
  if (!props.source.trim()) return
  try {
    const result = await window.electron.ipcRenderer.invoke(
      'mt::reading::vocabulary',
      props.source,
      domain.value
    )
    if (disposed || attempt !== current) return
    if (result.ok) {
      analysis.value = result.data
      selected.value = vocabulary.value[0]
    } else error.value = result.error
  } catch {
    if (attempt === current)
      error.value = label('查词失败，请重试。', 'Lookup failed. Please retry.')
  } finally {
    if (attempt === current) busy.value = false
  }
}
const changeMode = (value: 'vocabulary' | 'online') => {
  if (mode.value === value) return
  invalidate()
  webMode.value = false
  mode.value = value
  saveSetting('mode', value)
  if (value === 'vocabulary') void lookup()
}
const translate = async () => {
  invalidate()
  const current = ++attempt
  busy.value = true
  resultText.value = ''
  resultComplete.value = false
  translationPhase.value = 'loading'
  try {
    const result = await window.electron.ipcRenderer.invoke('mt::reading::translate', viewId, {
      source: props.source,
      provider: provider.value,
      sequence: current
    })
    if (disposed || attempt !== current) return
    if (result.ok) {
      resultText.value = result.data
      resultComplete.value = true
    } else error.value = result.error
  } catch {
    if (attempt === current)
      error.value = label(
        '翻译失败，请打开官方网页重试。',
        'Translation failed. Try the official page.'
      )
  } finally {
    if (attempt === current) busy.value = false
  }
}
const cancelTranslation = () => {
  invalidate()
  error.value = label('翻译已取消。', 'Translation cancelled.')
}
const hostBounds = () => {
  const host = webHost.value
  if (
    !webMode.value ||
    !host?.getClientRects().length ||
    document.hidden ||
    [...document.querySelectorAll('.el-overlay')].some(
      (node) => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden'
    )
  )
    return null
  const { x, y, width, height } = host.getBoundingClientRect()
  return { x, y, width, height }
}
const syncBounds = () => {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    if (!disposed && webMode.value)
      void window.electron.ipcRenderer
        .invoke('mt::reading::web-layout', viewId, hostBounds())
        .catch(() => {})
  })
}
const openWeb = async () => {
  const wasBusy = busy.value
  attempt++
  busy.value = true
  error.value = ''
  webMode.value = true
  if (wasBusy)
    await window.electron.ipcRenderer.invoke('mt::reading::cancel', viewId).catch(() => {})
  const current = attempt
  await nextTick()
  if (disposed || current !== attempt) return
  const bounds = hostBounds()
  if (!bounds) {
    busy.value = false
    webMode.value = false
    return
  }
  try {
    const result = await window.electron.ipcRenderer.invoke(
      'mt::reading::open-web',
      viewId,
      provider.value,
      bounds
    )
    if (disposed || current !== attempt) return
    if (!result.ok) {
      webMode.value = false
      error.value = result.error
    } else syncBounds()
  } catch {
    if (current === attempt) {
      webMode.value = false
      error.value = label('官方网页加载失败。', 'Official page failed to load.')
    }
  } finally {
    if (current === attempt) busy.value = false
  }
}
const returnToReader = () => {
  attempt++
  busy.value = false
  webMode.value = false
  void window.electron.ipcRenderer.invoke('mt::reading::web-layout', viewId, null).catch(() => {})
}
const externalPage = () =>
  window.electron.shell.openExternal(
    provider.value === 'google'
      ? 'https://translate.google.com/'
      : 'https://www.bing.com/translator'
  )
const copy = (text: string) => {
  window.electron.clipboard.writeText(text)
  copied.value = true
  clearTimeout(copyTimer)
  copyTimer = setTimeout(() => {
    copied.value = false
  }, 1800)
}
watch(domain, () => {
  saveSetting('domain', domain.value)
  chosenSenses.value = Object.create(null) as Record<string, number>
  if (mode.value === 'vocabulary') void lookup()
})
watch(inlineGloss, (value) => saveSetting('inline', String(value)))
watch(provider, () => {
  invalidate()
  webMode.value = false
  resultText.value = ''
  saveSetting('provider', provider.value)
})
watch([() => props.source, () => props.requestId], () => {
  invalidate()
  webMode.value = false
  resultText.value = ''
  chosenSenses.value = Object.create(null) as Record<string, number>
  if (mode.value === 'vocabulary') void lookup()
})
watch(webHost, (host) => {
  resizeObserver?.disconnect()
  if (host) {
    resizeObserver = new ResizeObserver(syncBounds)
    resizeObserver.observe(host)
  }
})
onMounted(() => {
  removeTranslationListener = window.electron.ipcRenderer.on(
    'mt::reading::translation-update',
    (_event, update) => translationUpdate(update)
  )
  if (mode.value === 'vocabulary') void lookup()
  window.addEventListener('resize', syncBounds)
  document.addEventListener('visibilitychange', syncBounds)
  syncDarkMode()
  modalObserver = new MutationObserver(() => {
    syncDarkMode()
    syncBounds()
  })
  modalObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class']
  })
})
onBeforeUnmount(() => {
  disposed = true
  invalidate()
  removeTranslationListener?.()
  void closeView()
  resizeObserver?.disconnect()
  modalObserver?.disconnect()
  cancelAnimationFrame(frame)
  clearTimeout(copyTimer)
  window.removeEventListener('resize', syncBounds)
  document.removeEventListener('visibilitychange', syncBounds)
})
</script>

<style scoped>
.pdf-reading-assistant {
  flex: 0 0 min(400px, 46%);
  min-width: min(280px, 46vw);
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--editorColor10);
  background: var(--editorBgColor);
  color: var(--editorColor);
  font: 13px/1.6 var(--uiFontFamily);
}
.pdf-reading-assistant.is-web {
  flex-basis: min(640px, 55%);
}
header,
.heading,
.section-heading,
.provider-bar,
.dictionary-heading,
.word-stepper,
.vocabulary-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--editorColor10);
}
.heading {
  justify-content: flex-start;
  font-size: 15px;
}
button,
select {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid var(--editorColor10);
  border-radius: 5px;
  padding: 5px 9px;
  cursor: pointer;
}
/* 原生下拉弹层由 Chromium 单独绘制：透明背景会与继承来的浅色文字组合成白底白字。
   底色必须是实色，因此先铺不透明主题背景，再用半透明色调叠出层次；
   option 在 Windows 上不支持叠加图，需单独给实色。 */
select {
  color: var(--editorColor);
  background-color: var(--editorBgColor);
  background-image: linear-gradient(
    color-mix(in srgb, var(--editorColor) 7%, transparent),
    color-mix(in srgb, var(--editorColor) 7%, transparent)
  );
}
select option {
  color: var(--editorColor);
  background-color: var(--editorBgColor);
}
button:hover {
  background: var(--editorColor04, #8881);
}
button:disabled {
  opacity: 0.4;
  cursor: default;
}
button:focus-visible,
select:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--themeColor);
  outline-offset: 2px;
}
.icon-button {
  border: 0;
  padding: 3px;
  display: flex;
}
.mode-switch {
  display: flex;
  margin: 12px 16px 0;
  border: 1px solid var(--editorColor10);
  border-radius: 6px;
  padding: 3px;
  gap: 3px;
}
.mode-switch button {
  flex: 1;
  border: 0;
  padding: 7px 4px;
  white-space: nowrap;
}
.mode-switch button[aria-pressed='true'] {
  background: var(--editorColor10);
  font-weight: 600;
}
.mode-switch small {
  font-size: 10px;
  color: var(--editorColor50);
  margin-left: 5px;
  font-weight: 400;
}
.reading-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 18px 16px;
}
.section-heading {
  font-size: 11px;
  color: var(--editorColor50);
  margin-bottom: 10px;
}
.local-badge {
  color: var(--themeColor);
}
.vocabulary-controls {
  font-size: 11px;
  color: var(--editorColor50);
  margin: 0 0 14px;
}
.vocabulary-controls label {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
}
input[type='checkbox'] {
  accent-color: var(--themeColor);
}
.annotated-passage {
  font: 17px/2.5 var(--editorFontFamily, var(--uiFontFamily));
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 6px 0 12px;
}
.word {
  font: inherit;
  border: 0;
  border-radius: 3px;
  padding: 0 1px;
  margin: 0;
  line-height: inherit;
  vertical-align: baseline;
  display: inline;
}
.word.unfamiliar {
  text-decoration: underline;
  text-decoration-color: var(--themeColor);
  text-decoration-thickness: 1px;
  text-underline-offset: 4px;
}
.word.active {
  background: var(--editorColor10);
}
ruby {
  ruby-position: under;
  ruby-align: center;
}
rt {
  font: 11px/1.3 var(--uiFontFamily);
  color: var(--editorColor);
  opacity: 0.75;
  text-decoration: none;
  user-select: none;
}
.unknown-word {
  text-decoration: underline dotted var(--editorColor50);
  text-underline-offset: 4px;
}
.reading-hint {
  font-size: 11px;
  color: var(--editorColor50);
  line-height: 1.65;
  margin: 10px 0 14px;
}
.word-navigation {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 16px 0;
}
.word-navigation button {
  font-size: 11px;
  padding: 3px 7px;
}
.word-navigation button[aria-pressed='true'] {
  border-color: var(--themeColor);
  color: var(--themeColor);
}
.dictionary-card {
  border: 1px solid var(--editorColor10);
  border-radius: 7px;
  padding: 13px;
}
.dictionary-heading {
  align-items: flex-start;
}
.dictionary-heading strong {
  font-size: 19px;
  line-height: 1.3;
  display: block;
  overflow-wrap: anywhere;
}
.dictionary-heading button {
  flex-shrink: 0;
  font-size: 11px;
}
.dictionary-heading button[aria-pressed='true'] {
  color: var(--themeColor);
}
.phonetic {
  color: var(--editorColor50);
  font-size: 12px;
}
.sense-heading {
  margin: 15px 0 7px;
  font-size: 11px;
  color: var(--editorColor50);
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.senses {
  padding: 0;
  margin: 0;
  list-style: none;
  max-height: 240px;
  overflow: auto;
  overscroll-behavior: contain;
}
.senses button {
  text-align: left;
  display: flex;
  width: 100%;
  align-items: baseline;
  gap: 9px;
  padding: 7px;
  border-color: transparent;
  overflow-wrap: anywhere;
}
.senses button[aria-pressed='true'] {
  background: var(--editorColor04, #8881);
  border-color: var(--editorColor10);
}
.sense-number {
  font-size: 10px;
  color: var(--editorColor50);
  min-width: 12px;
}
.word-stepper {
  margin-top: 12px;
  border-top: 1px solid var(--editorColor10);
  padding-top: 10px;
  font-size: 10px;
  color: var(--editorColor50);
}
.word-stepper button {
  font-size: 11px;
}
.dictionary-info {
  margin-top: 16px;
  font-size: 11px;
  color: var(--editorColor50);
}
.dictionary-info summary {
  cursor: pointer;
}
.mastered-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.provider-bar {
  flex-wrap: wrap;
  margin: 12px 16px 0;
  font-size: 12px;
}
.provider-bar select {
  flex: 1;
  min-width: 80px;
}
.subject-bar {
  margin: 0 0 14px;
}
.sense-source {
  display: block;
  color: var(--editorColor50);
  font-size: 10px;
  margin-bottom: 3px;
}
.sense-definition {
  display: block;
  color: var(--editorColor50);
  font-size: 11px;
  margin-top: 5px;
}
.source-text,
.translation-result pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: 15px/1.9 var(--uiFontFamily);
  margin: 0;
}
.online-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.primary-button {
  color: white;
  background: var(--themeColor);
  border-color: var(--themeColor);
}
.primary-button:hover {
  background: var(--themeColor);
  filter: brightness(0.95);
}
.text-button {
  border: 0;
  color: var(--themeColor);
  padding: 0;
  font-size: 11px;
}
.translation-result {
  border-top: 1px solid var(--editorColor10);
  margin-top: 22px;
  padding-top: 16px;
}
.reading-error {
  color: var(--editorColor);
  border-left: 2px solid var(--themeColor);
  padding-left: 10px;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.empty-state {
  padding: 24px 0;
}
.empty-state > svg {
  width: 28px;
  height: 28px;
  color: var(--editorColor50);
}
.empty-state h3 {
  font-size: 18px;
  margin: 12px 0 8px;
}
.empty-state p {
  color: var(--editorColor50);
}
.web-controls {
  padding: 4px 16px 12px;
  font-size: 11px;
  color: var(--editorColor50);
}
.web-controls button {
  margin-right: 6px;
  font-size: 11px;
}
.reading-web-host {
  flex: 1;
  min-height: 100px;
  position: relative;
}
.reading-web-host > span {
  position: absolute;
  inset: 18px;
  color: var(--editorColor50);
  font-size: 12px;
}
footer {
  border-top: 1px solid var(--editorColor10);
  padding: 8px 16px;
  font-size: 10px;
  color: var(--editorColor50);
}
@media (prefers-reduced-motion: reduce) {
  * {
    scroll-behavior: auto;
  }
}
</style>
