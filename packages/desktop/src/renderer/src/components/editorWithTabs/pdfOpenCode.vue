<template>
  <aside
    class="pdf-opencode"
    :class="{ 'is-web': webMode || translationMode }"
    :aria-label="label('OpenCode 翻译准备', 'OpenCode translation setup')"
  >
    <header>
      <div class="panel-title">
        <strong>{{ label('翻译', 'Translate') }}</strong><span>OpenCode</span>
      </div>
      <div class="header-actions">
        <button
          v-if="webMode"
          class="text-button"
          @click="showTranslation"
        >
          {{ label('CLI 翻译', 'CLI') }}
        </button>
        <button
          v-if="translationMode"
          class="text-button"
          :aria-label="label('打开 OpenCode 官方界面', 'Open official OpenCode UI')"
          @click="openWeb"
        >
          {{ label('官方界面', 'Official UI') }}
        </button>
        <button
          v-if="webMode || translationMode"
          class="text-button"
          :aria-label="label('返回设置', 'Back to setup')"
          @click="showSetup"
        >
          {{ label('返回设置', 'Settings') }}
        </button>
        <button
          class="close-button"
          :aria-label="label('关闭翻译面板', 'Close translation panel')"
          @click="$emit('close')"
        >
          ×
        </button>
      </div>
    </header>
    <section
      v-if="translationMode"
      class="translation-content"
      :aria-label="label('原文与译文对照', 'Translation comparison')"
    >
      <div class="translation-controls">
        <label class="language-picker"><span>{{ label('翻译为', 'Into') }}</span><select v-model="targetLanguage"><option
          v-for="(name, id) in openCodeTranslationLanguages"
          :key="id"
          :value="id"
        >{{ name }}</option></select></label>
        <label class="model-picker"><span>{{ label('免费模型', 'Free model') }}</span><select v-model="selectedModel"><option
          v-for="model in status?.freeModels || []"
          :key="model.id"
          :value="model.id"
        >{{ model.name }}</option></select></label>
        <div class="translation-actions">
          <button
            v-if="translating"
            @click="cancelRun"
          >
            {{ label('取消翻译', 'Cancel translation') }}
          </button>
          <button
            v-else
            class="primary-button"
            :disabled="!source.trim() || !selectedModel"
            @click="startTranslation"
          >
            {{ label('重新翻译', 'Translate again') }}
          </button>
          <button
            v-if="hasDocument"
            class="text-button"
            @click="$emit('page')"
          >
            {{ label('提取本页文字', 'Use current page text') }}
          </button>
        </div>
        <p class="muted">
          {{ label('通过本机 OpenCode CLI 将选中文字发送给所选在线模型。', 'Your local OpenCode CLI sends the selected text to the chosen online model.') }}
        </p>
      </div>
      <div class="translation-comparison">
        <section class="comparison-source source-preview">
          <div class="section-heading">
            <strong>{{ label('原文', 'Source') }}</strong><span>{{ source.trim().length }} {{ label('字', 'characters') }}</span>
          </div>
          <pre v-if="source.trim()">{{ source }}</pre>
          <p
            v-else
            class="muted"
          >
            {{ label('在 PDF 中选择文字，或提取本页文字。', 'Select text in the PDF or use the current page.') }}
          </p>
        </section>
        <section
          class="comparison-result"
          :aria-busy="translating"
        >
          <div class="section-heading">
            <strong>{{ label('译文', 'Translation') }}</strong><button
              v-if="translationText"
              class="text-button"
              @click="copyResult"
            >
              {{ label('复制译文', 'Copy translation') }}
            </button>
          </div>
          <p
            v-if="translating"
            role="status"
            class="muted"
          >
            {{ label('正在等待 OpenCode 返回译文…', 'Waiting for OpenCode to translate…') }}
          </p>
          <p
            v-else-if="translationError"
            role="alert"
            class="setup-error"
          >
            {{ translationError }}
          </p>
          <pre v-else-if="translationText">{{ translationText }}</pre>
          <p
            v-else
            role="status"
            class="muted"
          >
            {{ selectedModel ? label('选择原文后开始翻译。', 'Select text to start translating.') : label('未检测到可用的免费文本模型，请返回设置重新检测。', 'No free text model found. Check setup again.') }}
          </p>
        </section>
      </div>
    </section>
    <template v-else-if="webMode">
      <div class="web-controls">
        <div class="web-actions">
          <label class="language-picker"><span>{{ label('翻译为', 'Into') }}</span><select v-model="targetLanguage">
            <option
              v-for="(name, id) in openCodeTranslationLanguages"
              :key="id"
              :value="id"
            >
              {{ name }}
            </option>
          </select></label>
          <button
            class="primary-button"
            :disabled="!source.trim()"
            @click="copyTranslation"
          >
            {{ label('复制翻译提示', 'Copy translation prompt') }}
          </button>
        </div>
        <div class="web-hint">
          <span role="status">{{
            copiedPrompt
              ? label('已复制 · 在下方粘贴并手动发送', 'Copied · Paste below and send manually')
              : label(
                '选择免费模型，粘贴后手动发送',
                'Choose a free model, paste and send manually'
              )
          }}</span>
          <button
            v-if="hasDocument"
            class="text-button"
            @click="$emit('page')"
          >
            {{ label('提取本页文字', 'Use current page text') }}
          </button>
        </div>
      </div>
      <details
        v-if="source.trim()"
        class="source-preview web-source"
        open
      >
        <summary>{{ label('原文对照', 'Source text') }} · {{ source.trim().length }} {{ label('字', 'characters') }}</summary>
        <pre>{{ source }}</pre>
      </details>
      <div
        ref="webHost"
        class="opencode-web-host"
        :aria-label="label('OpenCode 官方界面', 'Official OpenCode UI')"
      >
        <span
          v-if="connecting"
          role="status"
        >{{
          label('正在连接 OpenCode…', 'Connecting to OpenCode…')
        }}</span>
      </div>
    </template>
    <div
      v-else
      class="opencode-content"
    >
      <section
        class="connection-card"
        :class="{ ready: status?.state === 'ready' && !busy }"
      >
        <div class="connection-heading">
          <span class="status-dot" /><strong role="status">{{
            busy
              ? label('正在检测 OpenCode…', 'Checking OpenCode…')
              : status?.state === 'ready'
                ? label('OpenCode 已就绪', 'OpenCode is ready')
                : cliLabel
          }}</strong>
        </div>
        <p>
          {{
            status?.state === 'ready'
              ? label(
                '在官方界面中选择免费模型进行翻译。',
                'Translate with a free model in the official UI.'
              )
              : label(
                '连接本机 CLI 后即可开始翻译。',
                'Connect your local CLI to start translating.'
              )
          }}
        </p>
        <button
          class="open-web primary-button"
          :disabled="busy || status?.state !== 'ready'"
          @click="openWeb"
        >
          {{ label('打开 OpenCode 官方界面', 'Open official OpenCode UI') }}
          <span aria-hidden="true">→</span>
        </button>
        <div class="setup-actions">
          <button
            class="text-button"
            :disabled="busy"
            @click="check()"
          >
            {{ label('重新检测', 'Check again') }}
          </button>
          <span aria-hidden="true">·</span>
          <button
            class="text-button"
            :disabled="busy"
            @click="check(true)"
          >
            {{ label('选择 CLI 文件', 'Choose CLI file') }}
          </button>
        </div>
      </section>
      <p
        v-if="error"
        role="alert"
        class="setup-error"
      >
        {{ error }}
      </p>
      <section class="source-card">
        <div class="section-heading">
          <strong>{{ label('待翻译原文', 'Source text') }}</strong><span v-if="source.trim()">{{ source.trim().length }} {{ label('字', 'characters') }}</span>
        </div>
        <details
          v-if="source.trim()"
          class="source-preview"
          open
        >
          <summary>{{ label('原文预览', 'Preview') }}</summary>
          <pre>{{ source }}</pre>
        </details>
        <p
          v-else
          class="muted"
        >
          {{
            label(
              '在 PDF 中选中文字，或提取当前页。',
              'Select text in the PDF or use the current page.'
            )
          }}
        </p>
        <button
          v-if="hasDocument"
          class="text-button page-source"
          @click="$emit('page')"
        >
          {{ label('查看本页原文', 'View current page text') }}
        </button>
      </section>
      <p class="privacy-note">
        {{
          label(
            '原文仅保留在本机，不自动提交 PDF 原文。',
            'Text stays local. PDF text is never submitted automatically.'
          )
        }}
      </p>
      <details class="setup-details">
        <summary>
          {{ label('连接详情与免费模型', 'Connection and free models')
          }}<span
            v-if="status?.freeModels.length"
            class="count"
          >{{
            status.freeModels.length
          }}</span>
        </summary>
        <div class="detail-content">
          <dl
            v-if="status"
            class="setup-status"
          >
            <dt>{{ label('本地 CLI', 'Local CLI') }}</dt>
            <dd>{{ cliLabel }}</dd>
            <dt>{{ label('登录状态', 'Sign-in') }}</dt>
            <dd>{{ authLabel }}</dd>
          </dl>
          <details
            v-if="status?.command"
            class="cli-path"
          >
            <summary>{{ label('CLI 路径', 'CLI path') }}</summary>
            <code>{{ status.command }}</code>
          </details>
          <p
            v-if="status?.authentication === 'not-signed-in' && status.freeModels.length"
            class="muted"
          >
            {{
              label(
                '部分免费模型无需登录，具体额度以 OpenCode 为准。',
                'Some free models need no sign-in. OpenCode determines availability and limits.'
              )
            }}
          </p>
          <div
            v-if="status?.freeModels.length"
            class="setup-models"
          >
            <ul>
              <li
                v-for="model in status.freeModels"
                :key="model.id"
              >
                <span>{{ model.name }}</span><small>{{ label('免费', 'Free') }}</small>
              </li>
            </ul>
          </div>
        </div>
      </details>
      <details
        class="setup-guide setup-details"
        :open="!!status && status.state !== 'ready'"
      >
        <summary>{{ label('安装与登录帮助', 'Installation and sign-in help') }}</summary>
        <div class="detail-content">
          <label class="platform-picker">{{ label('操作系统', 'Operating system') }}
            <select v-model="platform">
              <option value="win32">Windows</option>
              <option value="darwin">macOS</option>
              <option value="linux">Linux</option>
            </select>
          </label>
          <p>{{ installDescription }}</p>
          <div
            v-if="installCommand"
            class="command-line"
          >
            <code>{{ installCommand }}</code><button @click="copy(installCommand)">
              {{ label('复制', 'Copy') }}
            </button>
          </div>
          <p v-if="platform === 'win32'">
            {{
              label(
                '解压后将 opencode.exe 所在目录加入用户 PATH，或点击“选择 CLI 文件”。桌面版附带的 opencode-cli.exe 也可使用。',
                'After extracting, add the folder containing opencode.exe to your user PATH, or choose the CLI file above. The desktop app’s bundled opencode-cli.exe is also supported.'
              )
            }}
          </p>
          <p>
            {{
              label(
                '安装后重启 YarkText，或直接选择 CLI 文件，然后重新检测。仅安装编辑器扩展不等于安装 CLI。',
                'Restart YarkText after installation, or choose the CLI file and check again. An editor extension alone is not a CLI installation.'
              )
            }}
          </p>
          <div class="command-line">
            <code>opencode --version</code><button @click="copy('opencode --version')">
              {{ label('复制', 'Copy') }}
            </button>
          </div>
          <p>
            {{
              label(
                '需要登录时，在系统终端运行以下命令，并按 OpenCode 提示选择服务商完成登录。已有桌面版登录是否共享，以这里的检测结果为准。',
                'If sign-in is needed, run this command in your system terminal and follow OpenCode’s provider login flow. This check shows whether desktop credentials are shared.'
              )
            }}
          </p>
          <div class="command-line">
            <code>opencode auth login</code><button @click="copy('opencode auth login')">
              {{ label('复制', 'Copy') }}
            </button>
          </div>
          <button
            class="docs-link"
            @click="openDocs"
          >
            {{ label('打开 OpenCode 官方安装说明', 'Open official OpenCode installation guide') }} ↗
          </button>
          <span
            v-if="copied"
            role="status"
          >{{ label('命令已复制', 'Command copied') }}</span>
        </div>
      </details>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { OpenCodeStatus } from '@shared/types/opencode'
import { openCodeTranslationLanguages, openCodeTranslationPrompt } from '@/util/openCodeTranslation'

const props = defineProps<{ source: string; hasDocument: boolean; requestId?: number }>()
defineEmits<{ close: []; page: [] }>()
const { locale } = useI18n()
const label = (zh: string, en: string) => (locale.value.startsWith('zh') ? zh : en)
const status = ref<OpenCodeStatus>()
const busy = ref(false),
  error = ref(''),
  copied = ref(false)
const platform = ref('win32')
const webMode = ref(false),
  connecting = ref(false),
  copiedPrompt = ref(false)
const targetLanguage = ref('zh-Hans')
const translationMode = ref(false), translating = ref(false)
const selectedModel = ref(''), translationText = ref(''), translationError = ref('')
let translationAttempt = 0
const webHost = ref<HTMLElement>()
const viewId = crypto.randomUUID()
let observer: ResizeObserver | undefined
let modalObserver: MutationObserver | undefined
let frame = 0
let disposed = false
let connection = 0
const hostBounds = () => {
  const host = webHost.value
  if (!host || !host.getClientRects().length || document.hidden) return null
  if (
    [...document.querySelectorAll('.el-overlay')].some(
      (element) =>
        element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden'
    )
  )
    return null
  const { x, y, width, height } = host.getBoundingClientRect()
  return { x, y, width, height }
}
const syncBounds = () => {
  if (!webMode.value) return
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    if (disposed) return
    const bounds = hostBounds()
    void window.electron.ipcRenderer
      .invoke('mt::opencode::web-layout', viewId, bounds)
      .then((owned) => {
        if (
          !owned &&
          !disposed &&
          webMode.value &&
          !connecting.value &&
          bounds &&
          bounds.width > 0 &&
          bounds.height > 0
        )
          void openWeb()
      })
      .catch(() => {})
  })
}
watch(webHost, (host) => {
  observer?.disconnect()
  if (host) {
    observer = new ResizeObserver(syncBounds)
    observer.observe(host)
  }
})
watch([() => props.source, targetLanguage], () => {
  copiedPrompt.value = false
})
watch([() => props.source, targetLanguage, selectedModel], () => {
  if (translationMode.value) void startTranslation()
}, { flush: 'sync' })
const stopTranslation = () => {
  translationAttempt++
  translating.value = false
  void window.electron.ipcRenderer.invoke('mt::opencode::cancel-translation', viewId).catch(() => {})
}
const cancelRun = () => {
  stopTranslation()
  translationError.value = label('翻译已取消，可点击重新翻译。', 'Translation cancelled. You can retry.')
}
const startTranslation = async() => {
  const attempt = ++translationAttempt
  translationText.value = ''
  translationError.value = ''
  translating.value = !!props.source.trim() && !!selectedModel.value
  try {
    await window.electron.ipcRenderer.invoke('mt::opencode::cancel-translation', viewId)
    if (disposed || attempt !== translationAttempt || !translationMode.value || !translating.value) return
    const result = await window.electron.ipcRenderer.invoke('mt::opencode::translate', viewId, {
      source: props.source, target: targetLanguage.value, model: selectedModel.value
    })
    if (disposed || attempt !== translationAttempt || !translationMode.value) return
    if (result.ok) translationText.value = result.text
    else translationError.value = result.error
  } catch {
    if (attempt === translationAttempt && !disposed)
      translationError.value = label('CLI 翻译失败，请重试或使用官方界面。', 'CLI translation failed. Retry or use the official UI.')
  } finally {
    if (attempt === translationAttempt) translating.value = false
  }
}
const showTranslation = async() => {
  connection++
  webMode.value = false
  connecting.value = false
  translationMode.value = true
  void window.electron.ipcRenderer.invoke('mt::opencode::close-web', viewId).catch(() => {})
  await nextTick()
  if (!disposed) await startTranslation()
}
const copyResult = () => window.electron.clipboard.writeText(translationText.value)
watch(() => props.requestId, request => {
  if (request && status.value?.state === 'ready') void showTranslation()
})
const showSetup = () => {
  stopTranslation()
  translationMode.value = false
  connection++
  webMode.value = false
  connecting.value = false
  void window.electron.ipcRenderer.invoke('mt::opencode::close-web', viewId).catch(() => {})
}
const openWeb = async () => {
  stopTranslation()
  translationMode.value = false
  const attempt = ++connection
  webMode.value = true
  connecting.value = true
  error.value = ''
  await nextTick()
  if (disposed || attempt !== connection) return
  const bounds = hostBounds()
  if (!bounds) {
    showSetup()
    return
  }
  try {
    const result = await window.electron.ipcRenderer.invoke(
      'mt::opencode::open-web',
      viewId,
      bounds
    )
    if (disposed || attempt !== connection) return
    if (!result.ok) {
      error.value = result.error
      showSetup()
    } else syncBounds()
  } catch {
    if (disposed || attempt !== connection) return
    error.value = label(
      '连接失败，请重新检测后重试。',
      'Connection failed. Check the setup and retry.'
    )
    showSetup()
  } finally {
    if (attempt === connection) connecting.value = false
  }
}
const copyTranslation = () => {
  const prompt = openCodeTranslationPrompt(props.source, targetLanguage.value)
  if (prompt) {
    window.electron.clipboard.writeText(prompt)
    copiedPrompt.value = true
  }
}
const cliLabel = computed(() => {
  if (!status.value) return '—'
  const { state, version } = status.value
  if (state === 'missing') return label('未找到 CLI', 'CLI not found')
  if (state === 'upgrade') return `${version} · ${label('需要 OpenCode 2', 'OpenCode 2 required')}`
  return version || label('检测失败', 'Check failed')
})
const authLabel = computed(() => {
  if (status.value?.authentication === 'signed-in')
    return label('已连接：', 'Connected: ') + status.value.providers.join(', ')
  if (status.value?.authentication === 'not-signed-in')
    return label('未检测到已登录服务商', 'No signed-in providers detected')
  return label('尚未确认', 'Not confirmed')
})
const installCommand = computed(() =>
  platform.value === 'darwin'
    ? 'brew install anomalyco/tap/opencode-v2'
    : platform.value === 'linux'
      ? 'curl -fsSL https://opencode.ai/v2/install | bash'
      : ''
)
const installDescription = computed(() => {
  if (platform.value === 'win32')
    return (
      label(
        '从官方安装页下载 Windows 独立 CLI，按电脑架构选择 x64 或 ARM64。本机架构：',
        'Download the Windows standalone CLI from the official guide, choosing x64 or ARM64. This computer: '
      ) + (status.value?.arch || '—')
    )
  if (platform.value === 'darwin')
    return label(
      '在“终端”使用 Homebrew 安装 OpenCode 2；也可以从官方页面下载 Apple silicon 或 Intel 的独立 CLI。',
      'Install OpenCode 2 with Homebrew in Terminal, or download the Apple silicon or Intel standalone CLI from the official guide.'
    )
  return label(
    '在终端运行官方 OpenCode 2 安装命令，或从官方页面选择匹配 x64 / ARM64、glibc / musl 的独立 CLI。',
    'Run the official OpenCode 2 installer in a terminal, or download the standalone CLI matching x64 / ARM64 and glibc / musl.'
  )
})
const check = async (choose = false) => {
  busy.value = true
  error.value = ''
  try {
    const result = choose
      ? await window.electron.ipcRenderer.invoke('mt::opencode::choose-cli')
      : await window.electron.ipcRenderer.invoke('mt::opencode::status')
    if (!result || disposed) return
    if (!status.value)
      platform.value = ['win32', 'darwin', 'linux'].includes(result.platform)
        ? result.platform
        : 'linux'
    status.value = result
    error.value = result.error || ''
    if (result.state === 'ready' && !disposed) {
      if (!result.freeModels.some(model => model.id === selectedModel.value))
        selectedModel.value = result.freeModels.find(model => model.id === 'opencode/big-pickle')?.id || result.freeModels[0]?.id || ''
      if (props.requestId && props.source.trim()) await showTranslation()
      else await openWeb()
    }
  } catch {
    error.value = label(
      '检测失败，请重试或选择 CLI 文件。',
      'Check failed. Retry or choose the CLI file.'
    )
  } finally {
    busy.value = false
  }
}
const copy = (command: string) => {
  window.electron.clipboard.writeText(command)
  copied.value = true
}
const openDocs = () => window.electron.shell.openExternal('https://opencode.ai/v2/docs/')
onMounted(() => {
  void check()
  window.addEventListener('resize', syncBounds)
  document.addEventListener('visibilitychange', syncBounds)
  modalObserver = new MutationObserver(syncBounds)
  modalObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class']
  })
})
onBeforeUnmount(() => {
  disposed = true
  stopTranslation()
  connection++
  observer?.disconnect()
  modalObserver?.disconnect()
  cancelAnimationFrame(frame)
  window.removeEventListener('resize', syncBounds)
  document.removeEventListener('visibilitychange', syncBounds)
  void window.electron.ipcRenderer.invoke('mt::opencode::close-web', viewId).catch(() => {})
})
</script>

<style scoped>
.pdf-opencode {
  flex: 0 0 min(350px, 46%);
  min-width: 260px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--editorColor10);
  background: var(--editorBgColor);
  color: var(--editorColor);
  font: 13px/1.6 var(--uiFontFamily);
}
.pdf-opencode.is-web {
  flex-basis: min(640px, 50%);
  min-width: 340px;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--editorColor10);
}
.panel-title,
.header-actions,
.section-heading,
.connection-heading {
  display: flex;
  align-items: center;
  gap: 9px;
}
.panel-title strong {
  font-size: 15px;
}
.panel-title > span {
  color: var(--editorColor50);
  font-size: 12px;
  padding-left: 9px;
  border-left: 1px solid var(--editorColor10);
}
button,
select {
  color: inherit;
  background: transparent;
  border: 1px solid var(--editorColor10);
  border-radius: 6px;
  font: inherit;
  padding: 6px 10px;
  cursor: pointer;
}
button:hover {
  background: var(--editorColor04, #8881);
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
button:focus-visible,
select:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--themeColor);
  outline-offset: 2px;
}
.primary-button {
  background: var(--themeColor);
  color: #fff;
  border-color: var(--themeColor);
  font-weight: 500;
}
.primary-button:hover:not(:disabled) {
  background: var(--themeColor);
  filter: brightness(0.94);
}
.text-button {
  border: 0;
  padding: 3px 0;
  color: var(--themeColor);
  font-size: 12px;
}
.text-button:hover {
  background: transparent;
  text-decoration: underline;
}
.close-button {
  border: 0;
  font-size: 22px;
  line-height: 1;
  padding: 3px 5px;
  color: var(--editorColor50);
}
.opencode-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 18px 16px;
}
.connection-card {
  padding: 15px;
  border: 1px solid var(--editorColor10);
  border-radius: 10px;
}
.status-dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--editorColor30, #999);
}
.ready .status-dot {
  background: #38976a;
}
p {
  margin: 8px 0 12px;
}
.connection-card p,
.muted,
.privacy-note {
  color: var(--editorColor50);
  font-size: 12px;
}
.open-web {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin-top: 16px;
  padding: 9px 12px;
}
.setup-actions {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}
.setup-actions > span {
  color: var(--editorColor30, #999);
}
.source-card {
  margin-top: 22px;
}
.section-heading {
  justify-content: space-between;
}
.section-heading > span {
  font-size: 11px;
  color: var(--editorColor50);
}
.source-preview {
  margin-top: 8px;
  padding: 9px 12px;
  border-radius: 7px;
  background: var(--editorColor04, #8881);
}
.source-preview summary {
  color: var(--editorColor50);
  font-size: 12px;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 120px;
  overflow: auto;
  font: inherit;
  margin: 8px 0 0;
}
.page-source {
  margin-top: 5px;
}
.privacy-note {
  font-size: 11px;
  margin: 12px 0 20px;
}
.setup-details {
  border-top: 1px solid var(--editorColor10);
}
.setup-details > summary {
  padding: 12px 0;
  font-weight: 500;
}
summary {
  cursor: pointer;
}
.count {
  float: right;
  color: var(--editorColor50);
  font-size: 11px;
  font-weight: 400;
}
.detail-content {
  padding: 0 0 14px;
}
.setup-status {
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr);
  gap: 8px;
  font-size: 12px;
  margin: 0 0 12px;
}
dt {
  color: var(--editorColor50);
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.cli-path {
  font-size: 12px;
  margin-bottom: 12px;
}
ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  font-size: 12px;
}
li small {
  color: var(--editorColor50);
  white-space: nowrap;
}
.platform-picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.setup-guide p {
  font-size: 12px;
  color: var(--editorColor50);
}
.command-line {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: var(--editorColor04, #8881);
  border-radius: 6px;
}
code {
  overflow-wrap: anywhere;
  font-size: 11px;
}
.command-line code {
  flex: 1;
  min-width: 0;
}
.command-line button {
  flex-shrink: 0;
  font-size: 11px;
  padding: 3px 6px;
}
.docs-link {
  margin-top: 12px;
  font-size: 12px;
}
.setup-error {
  color: var(--deleteColor, #c44);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.web-controls {
  padding: 10px 14px;
  border-bottom: 1px solid var(--editorColor10);
}
.web-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.language-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
}
.language-picker > span {
  flex-shrink: 0;
  color: var(--editorColor50);
}
.language-picker select {
  min-width: 0;
  max-width: 140px;
}
.web-actions > button {
  flex-shrink: 0;
  font-size: 12px;
}
.web-hint {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  column-gap: 10px;
  margin-top: 7px;
  color: var(--editorColor50);
  font-size: 11px;
}
.web-source {
  flex-shrink: 0;
  margin: 0;
  padding: 8px 14px;
  border-radius: 0;
  border-bottom: 1px solid var(--editorColor10);
}
.web-source pre { max-height: 84px; font-size: 12px; }
.opencode-web-host {
  flex: 1;
  min-height: 0;
  position: relative;
}
.opencode-web-host > span {
  display: block;
  padding: 18px;
  color: var(--editorColor50);
}
.translation-content { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.translation-controls { padding: 12px 16px 0; border-bottom: 1px solid var(--editorColor10); }
.model-picker { display: flex; align-items: center; gap: 8px; font-size: 12px; margin-top: 9px; }
.model-picker > span { flex-shrink: 0; color: var(--editorColor50); }
.model-picker select { flex: 1; min-width: 0; max-width: 100%; }
.translation-actions { display: flex; align-items: center; gap: 12px; margin-top: 10px; }
.translation-actions > button { font-size: 12px; }
.translation-comparison { flex: 1; min-height: 0; overflow: auto; padding: 16px; }
.comparison-source { margin: 0 0 20px; padding: 12px; }
.comparison-result pre { max-height: none; }
.comparison-result .section-heading { min-height: 26px; }
</style>
