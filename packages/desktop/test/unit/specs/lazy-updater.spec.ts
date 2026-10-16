import { expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'

const mocks = vi.hoisted(() => ({
  loaded: vi.fn(),
  check: vi.fn(async() => null),
  download: vi.fn(async() => []),
  handlers: new Map<string, (...args: unknown[]) => void>(),
  ipc: new Map<string, (...args: unknown[]) => void>(),
  send: vi.fn()
}))
vi.mock('electron', () => ({
  BrowserWindow: {}, Menu: {},
  ipcMain: { on: (name: string, handler: (...args: unknown[]) => void) => mocks.ipc.set(name, handler) }
}))
vi.mock('electron-updater', () => {
  mocks.loaded()
  return { autoUpdater: {
    autoDownload: true,
    on: (name: string, handler: (...args: unknown[]) => void) => mocks.handlers.set(name, handler),
    checkForUpdates: mocks.check, downloadUpdate: mocks.download
  } }
})

import { checkUpdates } from '../../../src/main/menu/actions/marktext'

it('defers the updater, shares initialization and permits retry after an update check fails', async() => {
  expect(mocks.loaded).not.toHaveBeenCalled()
  const win = { isDestroyed: () => false, webContents: { send: mocks.send } } as unknown as BrowserWindow
  checkUpdates(win)
  checkUpdates(win)
  await vi.waitFor(() => expect(mocks.check).toHaveBeenCalledTimes(1))
  expect(mocks.loaded).toHaveBeenCalledTimes(1)
  mocks.handlers.get('update-not-available')?.()
  expect(mocks.send).toHaveBeenCalledWith('mt::UPDATE_NOT_AVAILABLE', expect.any(String))
  mocks.check.mockRejectedValueOnce(new Error('offline'))
  checkUpdates(win)
  await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledWith('mt::UPDATE_ERROR', 'offline'))
  checkUpdates(win)
  await vi.waitFor(() => expect(mocks.check).toHaveBeenCalledTimes(3))
  mocks.ipc.get('mt::NEED_UPDATE')?.({}, { needUpdate: true })
  await vi.waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1))
  expect(mocks.loaded).toHaveBeenCalledTimes(1)
})
