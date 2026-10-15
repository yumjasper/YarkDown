import { usePreferencesStore, type PreferencesState } from '@/store/preferences'
import { t } from '@/i18n'
import { popupContextMenu, type ContextMenuItem } from './popupMenu'

export const showMinimapMenu = (event: MouseEvent): void => {
  const preferences = usePreferencesStore()
  const set = (type: keyof PreferencesState, value: unknown) =>
    preferences.SET_SINGLE_PREFERENCE({ type, value })
  const choices = (key: keyof PreferencesState, values: Array<string | number>): ContextMenuItem[] =>
    values.map(value => ({
      label: typeof value === 'number' ? String(value) : t(`minimap.${value}`),
      type: 'radio',
      checked: preferences[key] === value,
      click: () => set(key, value)
    }))
  popupContextMenu([
    { id: 'minimap-enabled', label: t('minimap.show'), type: 'checkbox', checked: preferences.minimapEnabled,
      click: () => set('minimapEnabled', !preferences.minimapEnabled) },
    { type: 'separator' },
    { id: 'minimap-characters', label: t('minimap.characters'), type: 'checkbox', checked: preferences.minimapRenderCharacters,
      click: () => set('minimapRenderCharacters', !preferences.minimapRenderCharacters) },
    { label: t('minimap.size'), submenu: choices('minimapSize', ['proportional', 'fit', 'fill']) },
    { label: t('minimap.slider'), submenu: choices('minimapShowSlider', ['mouseover', 'always']) },
    { label: t('minimap.side'), submenu: choices('minimapSide', ['right', 'left']) },
    { label: t('minimap.scale'), submenu: choices('minimapScale', [1, 2, 3]) },
    { label: t('minimap.autohide'), submenu: choices('minimapAutohide', ['none', 'mouseover', 'scroll']) }
  ], { x: event.clientX, y: event.clientY })
}

export const handleScrollContextMenu = (event: MouseEvent): void => {
  if (!(event.target instanceof Element) || !(event.currentTarget instanceof HTMLElement)) return
  const isMap = event.target.closest('.editor-minimap')
  const isCodeMirrorBar = event.target.closest('.CodeMirror-vscrollbar, .CodeMirror-hscrollbar')
  const isNativeBar = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('.editor-component, .source-code, .CodeMirror-scroll'))
    .some(element => {
      const rect = element.getBoundingClientRect()
      const gutter = element.offsetWidth - element.clientWidth
      return gutter > 0 && element.scrollHeight > element.clientHeight &&
        event.clientY >= rect.top && event.clientY <= rect.bottom &&
        event.clientX >= rect.right - gutter && event.clientX <= rect.right
    })
  if (!isMap && !isCodeMirrorBar && !isNativeBar) return
  event.preventDefault()
  event.stopImmediatePropagation()
  showMinimapMenu(event)
}
