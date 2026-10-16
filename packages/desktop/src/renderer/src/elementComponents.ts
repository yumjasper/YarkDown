import { defineAsyncComponent, type App } from 'vue'
import ElButton from 'element-plus/es/components/button/index'
import 'element-plus/es/components/button/style/css'
import ElDialog from 'element-plus/es/components/dialog/index'
import 'element-plus/es/components/dialog/style/css'
import ElIcon from 'element-plus/es/components/icon/index'
import 'element-plus/es/components/icon/style/css'
import ElTooltip from 'element-plus/es/components/tooltip/index'
import 'element-plus/es/components/tooltip/style/css'
import ElTree from 'element-plus/es/components/tree/index'
import 'element-plus/es/components/tree/style/css'

export function registerElementComponents(app: App): void {
  for (const component of [ElButton, ElDialog, ElIcon, ElTooltip, ElTree]) app.use(component)
  app.component('ElAutocomplete', defineAsyncComponent(async() => {
    const [module] = await Promise.all([import('element-plus/es/components/autocomplete/index'), import('element-plus/es/components/autocomplete/style/css')])
    return module.default
  }))
  app.component('ElCol', defineAsyncComponent(async() => {
    const [module] = await Promise.all([import('element-plus/es/components/col/index'), import('element-plus/es/components/col/style/css')])
    return module.default
  }))
  app.component('ElForm', defineAsyncComponent(async() => {
    const [module] = await Promise.all([import('element-plus/es/components/form/index'), import('element-plus/es/components/form/style/css')])
    return module.default
  }))
  app.component('ElFormItem', defineAsyncComponent(async() => {
    const [module] = await Promise.all([import('element-plus/es/components/form/index'), import('element-plus/es/components/form-item/style/css')])
    return module.ElFormItem
  }))
  app.component('ElInput', defineAsyncComponent(async() => {
    const [module] = await Promise.all([import('element-plus/es/components/input/index'), import('element-plus/es/components/input/style/css')])
    return module.default
  }))
  app.component('ElInputNumber', defineAsyncComponent(async() => {
    const [module] = await Promise.all([import('element-plus/es/components/input-number/index'), import('element-plus/es/components/input-number/style/css')])
    return module.default
  }))
  app.component('ElOption', defineAsyncComponent(async() => {
    const [module] = await Promise.all([import('element-plus/es/components/select/index'), import('element-plus/es/components/option/style/css')])
    return module.ElOption
  }))
  app.component('ElPopover', defineAsyncComponent(async() => {
    const [module] = await Promise.all([import('element-plus/es/components/popover/index'), import('element-plus/es/components/popover/style/css')])
    return module.default
  }))
  app.component('ElRadio', defineAsyncComponent(async() => {
    const [module] = await Promise.all([import('element-plus/es/components/radio/index'), import('element-plus/es/components/radio/style/css')])
    return module.default
  }))
  app.component('ElRadioGroup', defineAsyncComponent(async() => {
    const [module] = await Promise.all([import('element-plus/es/components/radio/index'), import('element-plus/es/components/radio-group/style/css')])
    return module.ElRadioGroup
  }))
  app.component('ElRow', defineAsyncComponent(async() => {
    const [module] = await Promise.all([import('element-plus/es/components/row/index'), import('element-plus/es/components/row/style/css')])
    return module.default
  }))
  app.component('ElSelect', defineAsyncComponent(async() => {
    const [module] = await Promise.all([import('element-plus/es/components/select/index'), import('element-plus/es/components/select/style/css')])
    return module.default
  }))
  app.component('ElSlider', defineAsyncComponent(async() => {
    const [module] = await Promise.all([import('element-plus/es/components/slider/index'), import('element-plus/es/components/slider/style/css')])
    return module.default
  }))
  app.component('ElSwitch', defineAsyncComponent(async() => {
    const [module] = await Promise.all([import('element-plus/es/components/switch/index'), import('element-plus/es/components/switch/style/css')])
    return module.default
  }))
  app.component('ElTabPane', defineAsyncComponent(async() => {
    const [module] = await Promise.all([import('element-plus/es/components/tabs/index'), import('element-plus/es/components/tab-pane/style/css')])
    return module.ElTabPane
  }))
  app.component('ElTable', defineAsyncComponent(async() => {
    const [module] = await Promise.all([import('element-plus/es/components/table/index'), import('element-plus/es/components/table/style/css')])
    return module.default
  }))
  app.component('ElTableColumn', defineAsyncComponent(async() => {
    const [module] = await Promise.all([import('element-plus/es/components/table/index'), import('element-plus/es/components/table-column/style/css')])
    return module.ElTableColumn
  }))
  app.component('ElTabs', defineAsyncComponent(async() => {
    const [module] = await Promise.all([import('element-plus/es/components/tabs/index'), import('element-plus/es/components/tabs/style/css')])
    return module.default
  }))
  app.component('ElText', defineAsyncComponent(async() => {
    const [module] = await Promise.all([import('element-plus/es/components/text/index'), import('element-plus/es/components/text/style/css')])
    return module.default
  }))
}
