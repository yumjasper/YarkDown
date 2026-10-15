import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import { t } from '../../i18n'

export const textActions = (wrap: boolean, lineNumbers: boolean): MenuItemConstructorOptions[] => [
  ['txtFind', 'plainText.find', 'find'],
  ['txtReplace', 'plainText.replace', 'replace'],
  ['txtGoToLine', 'plainText.goTo', 'goToLine'],
  ['txtWordWrap', 'plainText.wrap', 'toggleTextWrap'],
  ['txtLineNumbers', 'plainText.lineNumber', 'toggleTextLineNumbers']
].map(([id, label, action]) => ({
  id,
  label: t(label),
  ...(id === 'txtWordWrap' || id === 'txtLineNumbers'
    ? { type: 'checkbox' as const, checked: id === 'txtWordWrap' ? wrap : lineNumbers }
    : {}),
  click: (_item, window) => {
    (window as BrowserWindow | undefined)?.webContents.send('mt::editor-edit-action', action)
  }
}))
