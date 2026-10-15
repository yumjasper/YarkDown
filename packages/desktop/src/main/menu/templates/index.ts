import { type MenuItemConstructorOptions } from 'electron'
import edit from './edit'
import prefEdit from './prefEdit'
import file from './file'
import help from './help'
import marktext from './marktext'
import view from './view'
import window from './window'
import paragraph from './paragraph'
import format from './format'
import theme from './theme'
import { textActions } from './plainText'
import { t } from '../../i18n'
import type Keybindings from '../../keyboard/shortcutHandler'
import type Preference from '../../preferences'

export { default as dockMenu } from './dock'

/**
 * Create the setting window menu.
 *
 * @param keybindings The keybindings instance
 */
export const configSettingMenu = (keybindings: Keybindings): MenuItemConstructorOptions[] => {
  return [
    ...(process.platform === 'darwin' ? [marktext(keybindings)] : []),
    prefEdit(keybindings),
    help()
  ]
}

/**
 * Create the application menu for the editor window.
 *
 * @param keybindings The keybindings instance.
 * @param preferences The preference instance.
 * @param recentlyUsedFiles The recently used files.
 */
export default function(
  keybindings: Keybindings,
  preferences: Preference,
  recentlyUsedFiles: string[] = [],
  plainText = false,
  pdf = false
): MenuItemConstructorOptions[] {
  const viewMenu = view(keybindings, !!preferences.getItem('minimapEnabled'), () => {
    preferences.setItem('minimapEnabled', !preferences.getItem('minimapEnabled'))
  })
  if (plainText) {
    const fileMenu = file(keybindings, preferences, recentlyUsedFiles)
    fileMenu.submenu = (fileMenu.submenu as MenuItemConstructorOptions[]).filter(item =>
      !['exportMenuEntry', 'pandocMenuEntry', ...(pdf ? [] : ['printMenuEntry'])].includes(item.id || '') &&
      (!pdf || item.label !== t('menu.file.autoSave')))
    const editMenu = edit(keybindings)
    const allowed = (pdf ? ['undo', 'redo', 'copy', 'selectAll', 'find', 'findInFolder'] : ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll', 'findInFolder'])
      .map(key => t(`menu.edit.${key}`))
    editMenu.submenu = (editMenu.submenu as MenuItemConstructorOptions[])
      .filter(item => allowed.includes(item.label || ''))
    viewMenu.submenu = (viewMenu.submenu as MenuItemConstructorOptions[]).filter(item =>
      !['sourceCodeModeMenuItem', 'typewriterModeMenuItem', 'focusModeMenuItem', 'tocMenuItem']
        .includes(item.id || '') && item.label !== t('menu.view.reloadImages'))
    return [
      ...(process.platform === 'darwin' ? [marktext(keybindings)] : []),
      fileMenu, editMenu,
      ...(pdf ? [] : textActions(!!preferences.getItem('txtWordWrap'), !!preferences.getItem('txtLineNumbers'))),
      window(keybindings), theme(preferences), viewMenu, help()
    ]
  }
  return [
    ...(process.platform === 'darwin' ? [marktext(keybindings)] : []),
    file(keybindings, preferences, recentlyUsedFiles),
    edit(keybindings),
    paragraph(keybindings, preferences),
    format(keybindings),
    window(keybindings),
    theme(preferences),
    viewMenu,
    help()
  ]
}
