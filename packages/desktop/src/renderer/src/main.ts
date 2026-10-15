import { createApp, type App } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import bootstrapRenderer from './bootstrap'
import axios from './axios'
import pinia from './store'
import './assets/symbolIcon'

// Element Plus instead of Element UI for Vue 3
import { ElAutocomplete, ElButton, ElCol, ElDialog, ElForm, ElFormItem, ElIcon, ElInput, ElInputNumber, ElOption, ElPopover, ElRadio, ElRadioGroup, ElRow, ElSelect, ElSlider, ElSwitch, ElTabPane, ElTable, ElTableColumn, ElTabs, ElText, ElTooltip, ElTree } from 'element-plus'
import 'element-plus/es/components/autocomplete/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/col/style/css'
import 'element-plus/es/components/dialog/style/css'
import 'element-plus/es/components/form/style/css'
import 'element-plus/es/components/form-item/style/css'
import 'element-plus/es/components/icon/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/input-number/style/css'
import 'element-plus/es/components/option/style/css'
import 'element-plus/es/components/popover/style/css'
import 'element-plus/es/components/radio/style/css'
import 'element-plus/es/components/radio-group/style/css'
import 'element-plus/es/components/row/style/css'
import 'element-plus/es/components/select/style/css'
import 'element-plus/es/components/slider/style/css'
import 'element-plus/es/components/switch/style/css'
import 'element-plus/es/components/tab-pane/style/css'
import 'element-plus/es/components/table/style/css'
import 'element-plus/es/components/table-column/style/css'
import 'element-plus/es/components/tabs/style/css'
import 'element-plus/es/components/text/style/css'
import 'element-plus/es/components/tooltip/style/css'
import 'element-plus/es/components/tree/style/css'

// I18n translation system
import i18nPlugin from './i18n'

// something is wrong here! \/
import services from './services/index'
import routes from './router'
import Main from './Main.vue'

import './assets/styles/index.css'
import './assets/styles/printService.css'

// -----------------------------------------------

window.marktext = {}
bootstrapRenderer()

// -----------------------------------------------
// Be careful when changing code before this line!

// Create Vue app
const app: App<Element> = createApp(Main)

// Configure Element Plus with locale
for (const component of [ElAutocomplete, ElButton, ElCol, ElDialog, ElForm, ElFormItem, ElIcon, ElInput, ElInputNumber, ElOption, ElPopover, ElRadio, ElRadioGroup, ElRow, ElSelect, ElSlider, ElSwitch, ElTabPane, ElTable, ElTableColumn, ElTabs, ElText, ElTooltip, ElTree]) app.use(component)

const envType = window.marktext?.env?.type as string | undefined

const router = createRouter({
  history: createWebHashHistory(),
  // it seems like something might have changed in vue-router? it uses the full "file path" instead of
  // links like /editor if we use the old createWebHistory()
  routes: routes(envType)
})

app.use(router)
app.use(pinia)
app.use(i18nPlugin)

// Configure axios globally
app.config.globalProperties.$http = axios

// Register services globally
;(services as unknown as Array<Record<string, unknown> & { name: string }>).forEach((s) => {
  app.config.globalProperties['$' + s.name] = s[s.name]
})

// Mount the app
app.mount('#app')
