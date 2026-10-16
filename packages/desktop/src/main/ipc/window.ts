import {
  BrowserWindow,
  Menu,
  MenuItem,
  ipcMain,
  type IpcMainEvent,
  type WebContents
} from 'electron'
import log from 'electron-log'
import { nativeMenuPosition } from '../utils/menuPosition'
import { type CommandManager } from '../commands'
import type { MenuTemplate, MenuTemplateItem, MenuPopupPosition } from '@shared/types/menu'
import type AppMenu from '../menu'

// The AppMenu instance is created after the sandbox IPC handlers are
// registered, so the menu bar channels below resolve it lazily.
let menuProvider: (() => AppMenu | null) | null = null

export const setMenuProvider = (provider: () => AppMenu | null): void => {
  menuProvider = provider
}

const windowFromEvent = (event: IpcMainEvent): BrowserWindow | null =>
  BrowserWindow.fromWebContents(event.sender)

interface PopupEntry {
  sender: WebContents
}
const popups = new Map<number, PopupEntry>()

const buildMenu = (template: MenuTemplate | undefined, windowId: number): Menu => {
  const menu = new Menu()
  for (const item of template || []) {
    if (item.type === 'separator') {
      menu.append(new MenuItem({ type: 'separator' }))
      continue
    }
    const id = item.id
    menu.append(
      new MenuItem({
        label: item.label,
        type: item.type as 'normal' | 'submenu' | 'checkbox' | 'radio' | undefined,
        accelerator: item.accelerator,
        enabled: item.enabled !== false,
        checked: !!item.checked,
        click: () => {
          const sender = popups.get(windowId)?.sender
          try {
            sender?.send('mt::menu::click', { windowId, id })
          } catch {
            /* sender destroyed */
          }
        },
        submenu: item.submenu ? buildMenu(item.submenu as MenuTemplateItem[], windowId) : undefined
      })
    )
  }
  return menu
}

export const registerWindowHandlers = (commandManager: CommandManager): void => {
  ipcMain.on('mt::win::minimize', (event) => {
    const win = windowFromEvent(event)
    if (win) win.minimize()
  })
  ipcMain.on('mt::win::toggle-maximize', (event) => {
    const win = windowFromEvent(event)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('mt::win::maximize', (event) => {
    const win = windowFromEvent(event)
    if (win) win.maximize()
  })
  ipcMain.on('mt::win::unmaximize', (event) => {
    const win = windowFromEvent(event)
    if (win) win.unmaximize()
  })
  ipcMain.on('mt::win::close', (event) => {
    const win = windowFromEvent(event)
    if (win) win.close()
  })
  ipcMain.on('mt::win::set-fullscreen', (event, flag: boolean) => {
    const win = windowFromEvent(event)
    if (win) win.setFullScreen(!!flag)
  })
  ipcMain.on('mt::win::toggle-fullscreen', (event) => {
    const win = windowFromEvent(event)
    if (win) win.setFullScreen(!win.isFullScreen())
  })
  ipcMain.handle('mt::win::is-maximized', (event) => {
    const win = windowFromEvent(event as unknown as IpcMainEvent)
    return !!win && win.isMaximized()
  })
  ipcMain.handle('mt::win::is-fullscreen', (event) => {
    const win = windowFromEvent(event as unknown as IpcMainEvent)
    return !!win && win.isFullScreen()
  })

  ipcMain.on('mt::execute-main-command', (event, commandId: string) => {
    const win = windowFromEvent(event)
    if (!win || !commandManager.has(commandId)) return
    try {
      commandManager.execute(commandId, win)
    } catch (err) {
      log.error(`execute-main-command "${commandId}" failed:`, err)
    }
  })

  ipcMain.on('mt::menu::popup', (event, template: MenuTemplate, position?: MenuPopupPosition) => {
    const win = windowFromEvent(event)
    if (!win) return
    // Stash sender BEFORE menu.popup so buildMenu click handlers can resolve
    // it, but make sure we still clean up the map entry if menu.popup throws
    // — otherwise the entry leaks and a later popup for the same window could
    // route clicks to a dead sender.
    popups.set(win.id, { sender: event.sender })
    try {
      const menu = buildMenu(template, win.id)
      menu.popup({
        window: win,
        ...nativeMenuPosition(position, win.webContents.getZoomFactor()),
        callback: () => {
          popups.delete(win.id)
          try {
            event.sender.send('mt::menu::closed', { windowId: win.id })
          } catch {
            /* destroyed */
          }
        }
      })
    } catch (err) {
      popups.delete(win.id)
      log.error('menu popup failed:', err)
    }
  })

  ipcMain.on('mt::menu::popup-application', (event, position?: MenuPopupPosition) => {
    const win = windowFromEvent(event)
    if (!win) return
    try {
      const appMenu = Menu.getApplicationMenu()
      if (!appMenu) return
      appMenu.popup({ window: win, ...nativeMenuPosition(position, win.webContents.getZoomFactor()) })
    } catch (err) {
      log.error('application menu popup failed:', err)
    }
  })

  ipcMain.handle('mt::menu::get-menu-bar', (event) => {
    const win = windowFromEvent(event as unknown as IpcMainEvent)
    const menu = menuProvider?.()
    if (!win || !menu) return []
    try {
      return menu.getMenuBar(win.id)
    } catch (err) {
      log.error('get menu bar failed:', err)
      return []
    }
  })

  ipcMain.handle('mt::menu::execute', (event, topIndex: number, indices: number | number[]) => {
    const win = windowFromEvent(event as unknown as IpcMainEvent)
    if (!win || !Number.isInteger(topIndex) || topIndex < 0) return
    if (!Array.isArray(indices) && !Number.isInteger(indices)) return
    if (Array.isArray(indices) && (indices.length > 10 || !indices.every(Number.isInteger))) return
    menuProvider?.()?.executeMenuItem(win.id, topIndex, indices)
  })

  ipcMain.on('mt::menu::popup-top-menu', (event, topIndex: number, position?: MenuPopupPosition) => {
    const win = windowFromEvent(event)
    const menu = menuProvider?.()
    if (!win || !menu) return
    try {
      menu.popupTopMenu(win.id, topIndex, position)
    } catch (err) {
      log.error('top menu popup failed:', err)
    }
  })
}
