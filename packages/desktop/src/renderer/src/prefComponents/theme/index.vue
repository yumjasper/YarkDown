<template>
  <div class="pref-theme">
    <h4>{{ t('preferences.theme.title') }}</h4>
    <section class="offcial-themes">
      <div
        v-for="themeItem of themes"
        :key="themeItem.name"
        class="theme"
        :class="[
          themeItem.name,
          {
            active: themeItem.name === theme,
            disabled: followSystemTheme
          }
        ]"
        @click="!followSystemTheme && onSelectChange('theme', themeItem.name)"
      >
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-html="themeItem.html" />
      </div>
    </section>
    <separator />

    <Bool
      :description="t('preferences.theme.followSystemTheme')"
      :bool="followSystemTheme"
      :on-change="(value) => onSelectChange('followSystemTheme', value)"
    />

    <compound v-if="followSystemTheme">
      <template #head>
        <h6 class="title">
          {{ t('preferences.theme.modeThemes') }}
        </h6>
      </template>
      <template #children>
        <cur-select
          :description="t('preferences.theme.lightModeTheme')"
          :value="lightModeTheme"
          :options="themeOptions"
          :on-change="(value) => onSelectChange('lightModeTheme', value)"
        />

        <cur-select
          :description="t('preferences.theme.darkModeTheme')"
          :value="darkModeTheme"
          :options="themeOptions"
          :on-change="(value) => onSelectChange('darkModeTheme', value)"
        />
      </template>
    </compound>

    <div class="custom-css">
      <div class="description">
        {{ t('preferences.theme.customCss') }}
      </div>
      <textarea
        class="custom-css-input"
        rows="10"
        :value="customCss"
        @change="
          (event: Event) =>
            onSelectChange('customCss', (event.target as HTMLTextAreaElement).value)
        "
      />
    </div>
    <separator v-show="false" />
    <section
      v-show="false"
      class="import-themes ag-underdevelop"
    >
      <div>
        <span>{{ t('preferences.theme.openThemesFolder') }}</span>
        <el-button size="small">
          {{ t('preferences.theme.openFolder') }}
        </el-button>
      </div>

      <div>
        <span>{{ t('preferences.theme.importCustomThemes') }}</span>
        <el-button size="small">
          {{ t('preferences.theme.importTheme') }}
        </el-button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePreferencesStore } from '@/store/preferences'
import type { PreferencesState } from '@/store/preferences'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import themeMd from './theme.md?raw'
import { themes as configThemes } from './config'
import markdownToHtml from '@/util/markdownToHtml'
import Bool from '../common/bool/index.vue'
import CurSelect from '../common/select/index.vue'
import Separator from '../common/separator/index.vue'
import Compound from '../common/compound/index.vue'
import type { PrefSelectOption } from '../common/types'

interface ThemePreview {
  name: string
  html: string
}

const themes = ref<ThemePreview[]>([])

const { t } = useI18n()
const preferenceStore = usePreferencesStore()

const { followSystemTheme, lightModeTheme, darkModeTheme, theme, customCss } =
  storeToRefs(preferenceStore)

// Generate dropdown options from configThemes
const themeOptions: PrefSelectOption<string>[] = configThemes.map((theme) => ({
  label: theme.name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' '),
  value: theme.name
}))

onMounted(async () => {
  const newThemes: ThemePreview[] = []
  for (const theme of configThemes) {
    const html = await markdownToHtml(themeMd.replace(/{theme}/, theme.name))
    newThemes.push({
      name: theme.name,
      html
    })
  }
  themes.value = newThemes
})

const onSelectChange = (type: keyof PreferencesState, value: unknown): void => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
}
</script>

<style>
.offcial-themes {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  & .theme {
    cursor: pointer;
    width: 100%;
    height: 110px;
    margin: 0;
    padding: 16px 18px 16px 32px;
    overflow: hidden;
    background: var(--editorBgColor);
    color: var(--editorColor);
    box-sizing: border-box;
    box-shadow: 0 9px 28px -9px rgba(0, 0, 0, 0.4);
    border-radius: 5px;
    transition: opacity 0.2s ease;

    &.dark {
      color: rgba(255, 255, 255, 0.7);
      background: #282828;
      & a {
        color: #409eff;
      }
    }
    &.light {
      color: rgba(0, 0, 0, 0.7);
      background: rgba(255, 255, 255, 1);
      & a {
        color: rgba(33, 181, 111, 1);
      }
    }
    &.graphite {
      color: rgba(43, 48, 50, 0.7);
      background: #f7f7f7;
      & a {
        color: rgb(104, 134, 170);
      }
    }
    &.material-dark {
      color: rgba(171, 178, 191, 0.8);
      background: #34393f;
      & a {
        color: #f48237;
      }
    }
    &.one-dark {
      color: #9da5b4;
      background: #282c34;
      & a {
        color: rgba(226, 192, 141, 1);
      }
    }
    &.ulysses {
      color: rgba(101, 101, 101, 0.7);
      background: #f3f3f3;
      & a {
        color: rgb(12, 139, 186);
      }
    }

    /* Typora 风格主题 —— Light */
    &.typora-github {
      color: #24292f;
      background: #ffffff;
      & a {
        color: #0969da;
      }
    }
    &.typora-notion {
      color: #37352f;
      background: #ffffff;
      & h3 {
        font-weight: 600;
      }
      & a {
        color: #2383e2;
      }
    }
    &.typora-drake {
      color: #333333;
      background: #ffffff;
      & h3 {
        padding-left: 8px;
        border-left: 4px solid #e95f59;
      }
      & a {
        color: #4183c4;
      }
    }
    &.typora-vue {
      color: #34495e;
      background: #ffffff;
      & h3 {
        padding: 0.05em 0.35em;
        background: rgba(65, 184, 131, 0.12);
        border-radius: 4px;
      }
      & a {
        color: #41b883;
      }
    }
    &.typora-orange-heart {
      color: #494949;
      background: #fffefb;
      & h3 {
        color: #ef7060;
      }
      & a {
        color: #e05a48;
      }
    }
    &.typora-solarized-light {
      color: #657b83;
      background: #fdf6e3;
      & a {
        color: #268bd2;
      }
    }
    &.typora-newsprint {
      color: #2b2b2b;
      background: #f9f7f1;
      & h3 {
        font-style: italic;
      }
      & a {
        color: #8b2f2f;
      }
    }

    /* Typora 风格主题 —— Dark */
    &.typora-github-dark {
      color: #e6edf3;
      background: #0d1117;
      & a {
        color: #2f81f7;
      }
    }
    &.typora-notion-dark {
      color: rgba(255, 255, 255, 0.81);
      background: #191919;
      & h3 {
        font-weight: 600;
      }
      & a {
        color: #529cca;
      }
    }
    &.typora-drake-dark {
      color: #acb7c4;
      background: #2b2b2b;
      & h3 {
        padding-left: 8px;
        border-left: 4px solid #3473b0;
      }
      & a {
        color: #58a1d6;
      }
    }
    &.typora-cobalt {
      color: #d8e3ea;
      background: #193549;
      & h3 {
        color: #ffd23f;
      }
      & a {
        color: #80c7ff;
      }
    }
    &.typora-lapis {
      color: #c5cee0;
      background: #1f2433;
      & h3 {
        color: #93b4ff;
      }
      & a {
        color: #7aa2ff;
      }
    }

    /* Disabled state when followSystemTheme is on */
    &.disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* Active theme - use outline instead of border to avoid layout shift? */
    &.active {
      box-shadow: var(--floatShadow);
      outline: 2px solid var(--themeColor);
      outline-offset: -2px;
    }

    /* Active + disabled: slightly more visible */
    &.disabled.active {
      opacity: 0.7;
    }
  }
  & h3 {
    position: relative;
    margin: 0;
    font-size: 16px;
    color: currentColor;
    cursor: pointer;
    &::before {
      content: 'h3';
      position: absolute;
      top: 4px;
      left: -20px;
      display: block;
      width: 10px;
      height: 10px;
      font-size: 12px;
      opacity: 0.5;
    }
  }
  & p {
    margin: 6px 0 0;
    font-size: 12px;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.custom-css {
  margin: 20px 0;
  font-size: 14px;
  color: var(--editorColor);
  & .description {
    margin-bottom: 10px;
  }
  & .custom-css-input {
    width: 100%;
    background: transparent;
    color: var(--editorColor);
    border: 1px solid var(--editorColor10);
    border-radius: 4px;
    padding: 8px 10px;
    font-family: 'DejaVu Sans Mono', 'Source Code Pro', 'Droid Sans Mono', Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    box-sizing: border-box;
    resize: vertical;
  }
  & .custom-css-input:focus {
    outline: none;
    border-color: var(--themeColor);
  }
}

.import-themes {
  padding: 10px 0;
  display: flex;
  justify-content: space-around;
  color: var(--editorColor);
  & > div {
    display: flex;
    flex-direction: column;
    & > span {
      display: inline-block;
      margin-bottom: 20px;
    }
  }
}
</style>
