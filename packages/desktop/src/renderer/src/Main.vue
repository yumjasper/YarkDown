<script setup lang="ts">
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
</script>

<template>
  <div id="app">
    <!-- This router-view will render either App component (/editor) or Preference component (/preference) -->
    <el-config-provider :locale="zhCn">
      <router-view />
    </el-config-provider>
  </div>
</template>
