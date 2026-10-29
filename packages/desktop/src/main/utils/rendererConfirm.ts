import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import log from 'electron-log'
import { t } from '../i18n'
import type {
  RendererConfirmButton,
  RendererConfirmRequest,
  RendererConfirmResult
} from '@shared/types/ipc'

// Renderer-drawn prompts replace `dialog.showMessageBox` so every confirmation
// follows the active theme. Main parks a resolver per prompt and the editor
// window answers over `mt::renderer-confirm-result`; ids are unique so two
// windows asking at once cannot consume each other's answer.
let confirmSeq = 0
const pendingConfirms = new Map<string, (result: RendererConfirmResult) => void>()

export interface RendererConfirmOptions {
  title: string
  message?: string
  detail?: string
  /** One entry per button, rendered left to right. */
  buttons: RendererConfirmButton[]
  /** Value returned for Esc, overlay clicks and window teardown. */
  cancelValue: string
  /**
   * File names to list under the message. Used by the unsaved-changes prompt,
   * which names every dirty tab so the user knows what they are about to lose.
   */
  files?: string[]
}

/**
 * Draws a themed confirmation inside `win` and resolves with the chosen button
 * value. Returns `cancelValue` when the window cannot show a prompt (destroyed
 * or mid-teardown) so callers keep their existing "user said no" behaviour
 * instead of hanging.
 */
export const showRendererConfirm = async(
  win: BrowserWindow | null,
  options: RendererConfirmOptions
): Promise<string> => {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
    return options.cancelValue
  }

  const id = `confirm-${++confirmSeq}`
  return new Promise<RendererConfirmResult>((resolve) => {
    const settle = (value: RendererConfirmResult): void => {
      if (!pendingConfirms.delete(id)) return
      win.removeListener('closed', onClosed)
      resolve(value)
    }
    // A window that dies mid-prompt can never answer; settle as cancel so the
    // caller is not left awaiting a decision forever.
    const onClosed = (): void => settle(options.cancelValue)
    pendingConfirms.set(id, settle)
    win.once('closed', onClosed)
    try {
      const request: RendererConfirmRequest & { id: string } = {
        id,
        title: options.title,
        message: options.message,
        detail: options.detail,
        buttons: options.buttons,
        cancelValue: options.cancelValue,
        files: options.files
      }
      win.webContents.send('mt::renderer-confirm', request)
    } catch (err) {
      log.error('Failed to show the renderer confirm prompt:', err)
      settle(options.cancelValue)
    }
  })
}

export const registerRendererConfirmHandlers = (): void => {
  ipcMain.on('mt::renderer-confirm-result', (_e, id: string, value: string) => {
    const settle = pendingConfirms.get(id)
    if (settle) settle(value)
  })
}

/**
 * Two-button "do it / cancel" shape. Cancel is listed first and maps to the
 * prompt's cancel value, so Enter on the primary-less default and Esc both
 * decline — the safe outcome for destructive callers.
 */
export const confirmAction = async(
  win: BrowserWindow | null,
  options: {
    title: string
    message?: string
    detail?: string
    confirmLabel: string
    /** Set for non-destructive actions so the confirm button gets the accent. */
    primary?: boolean
  }
): Promise<boolean> => {
  const value = await showRendererConfirm(win, {
    title: options.title,
    message: options.message,
    detail: options.detail,
    cancelValue: 'cancel',
    buttons: [
      { label: t('dialog.cancel'), value: 'cancel' },
      { label: options.confirmLabel, value: 'confirm', primary: options.primary }
    ]
  })
  return value === 'confirm'
}
