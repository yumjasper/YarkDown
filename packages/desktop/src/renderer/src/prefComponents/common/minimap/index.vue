<template>
  <bool
    :description="t('minimap.show')"
    :bool="preferences.minimapEnabled"
    :on-change="value => preferences.SET_SINGLE_PREFERENCE({ type: 'minimapEnabled', value })"
  />
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from '@/store/preferences'
import Bool from '../bool/index.vue'
const { t } = useI18n()
const preferences = usePreferencesStore()
</script>
