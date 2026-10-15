<template>
  <div class="pref-txt">
    <h4>{{ t('preferences.txt.title') }}</h4>
    <minimap-preference />
    <compound>
      <template #head>
        <h6>{{ t('preferences.txt.title') }}</h6>
      </template>
      <template #children>
        <bool
          v-for="key in switches"
          :key="key"
          :description="t(`preferences.txt.${key}`)"
          :bool="preferences[key]"
          :on-change="value => change(key, value)"
        />
        <font-text-box
          :description="t('preferences.txt.txtFontFamily')"
          :value="preferences.txtFontFamily"
          :only-monospace="true"
          :on-change="value => change('txtFontFamily', value)"
        />
        <range
          :description="t('preferences.txt.txtFontSize')"
          :value="preferences.txtFontSize"
          :min="10"
          :max="40"
          :step="1"
          unit="px"
          :on-change="value => change('txtFontSize', value)"
        />
        <cur-select
          :description="t('preferences.txt.txtTabSize')"
          :value="preferences.txtTabSize"
          :options="tabSizes"
          :on-change="value => change('txtTabSize', value)"
        />
      </template>
    </compound>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import MinimapPreference from '../common/minimap/index.vue'
import { usePreferencesStore, type PreferencesState } from '@/store/preferences'
import Compound from '../common/compound/index.vue'
import Bool from '../common/bool/index.vue'
import FontTextBox from '../common/fontTextBox/index.vue'
import Range from '../common/range/index.vue'
import CurSelect from '../common/select/index.vue'

const { t } = useI18n()
const preferences = usePreferencesStore()
const switches = ['txtWordWrap', 'txtLineNumbers'] as const
const tabSizes = [2, 4, 8].map(value => ({ label: String(value), value }))
const change = (type: keyof PreferencesState, value: unknown) => preferences.SET_SINGLE_PREFERENCE({ type, value })
</script>
