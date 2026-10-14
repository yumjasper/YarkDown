import {
  type BrowserWindow,
  ipcMain,
  Menu,
  MenuItem,
  type ContextMenuParams,
  type WebContents
} from 'electron'
import { getLookUp } from './menuItems'
import spellcheckMenuBuilder from './spellcheck'
import { t } from '../../i18n'
import { isOsx } from '../../config'
import type { EditorContextNativeItem, EditorContextMenuRequest } from '@shared/types/menu'

// Callbacks stay in main and are scoped to the requesting window; IPC carries only IDs.
const nativeActions = new WeakMap<WebContents, Map<string, () => void>>()

ipcMain.on('mt::editor-context-native-action', (event, id: string) => {
  if (typeof id !== 'string') return
  nativeActions.get(event.sender)?.get(id)?.()
})

export const showEditorContextMenu = (
  win: BrowserWindow,
  event: { preventDefault?: () => void },
  params: ContextMenuParams & { inputFieldType?: string },
  isSpellcheckerEnabled: boolean
): void => {
  const actions = new Map<string, () => void>()
  const extras = new Menu()
  if (isOsx && params.selectionText.trim())
    extras.append(new MenuItem(getLookUp(params.selectionText)))
  if (isSpellcheckerEnabled && params.isEditable && !params.inputFieldType) {
    const spelling = new Menu()
    for (const item of spellcheckMenuBuilder(
      !!params.misspelledWord,
      params.misspelledWord,
      params.dictionarySuggestions
    )) {
      spelling.append(item instanceof MenuItem ? item : new MenuItem(item))
    }
    extras.append(
      new MenuItem({
        label: t('contextMenu.spelling'),
        submenu: spelling
      })
    )
  }
  const serialize = (menu: Menu, prefix = 'native'): EditorContextNativeItem[] =>
    menu.items
      .filter((item) => item.visible)
      .map((item, index) => {
        const id = `${prefix}-${index}`
        if (item.enabled && item.type !== 'separator' && !item.submenu) {
          actions.set(id, () => {
            if (!win.isDestroyed()) item.click({}, win, win.webContents)
          })
        }
        return {
          id,
          label: item.label,
          enabled: item.enabled,
          separator: item.type === 'separator',
          submenu: item.submenu ? serialize(item.submenu, id) : undefined
        }
      })
  const request: EditorContextMenuRequest = {
    x: params.x,
    y: params.y,
    selectionText: params.selectionText,
    canCut: params.editFlags.canCut,
    canCopy: params.editFlags.canCopy && !!params.selectionText.trim(),
    canPaste: params.editFlags.canPaste,
    nativeItems: serialize(extras)
  }
  nativeActions.set(win.webContents, actions)
  event.preventDefault?.()
  win.webContents.send('mt::editor-context-menu', request)
}
