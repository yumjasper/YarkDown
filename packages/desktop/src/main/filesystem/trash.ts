import path from 'path'
import { shell } from 'electron'
import type { BrowserWindow } from 'electron'
import { t } from '../i18n'
import { showRendererConfirm } from '../utils/rendererConfirm'

/** Asks first; returns true only when the item was actually trashed. */
export const confirmAndTrashItem = async(
  win: BrowserWindow | null,
  fullPath: string
): Promise<boolean> => {
  // Trashing is destructive and irreversible from the app, so cancel is both
  // the default and the Esc mapping; the confirm button stays non-primary.
  const value = await showRendererConfirm(win, {
    title: t('contextMenu.sideBar.moveToTrash'),
    message: t('dialog.moveToTrash', { name: path.basename(fullPath) }),
    cancelValue: 'cancel',
    buttons: [
      { label: t('dialog.cancel'), value: 'cancel' },
      { label: t('contextMenu.sideBar.moveToTrash'), value: 'trash' }
    ]
  })

  if (value !== 'trash') return false
  await shell.trashItem(fullPath)
  return true
}
