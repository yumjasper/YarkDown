import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { detectOpenCode, inspectOpenCode } from '../utils/opencode'
import { OpenCodeViews } from '../windows/opencodeView'
import { isTranslationRequest, translateWithOpenCode } from '../utils/opencodeTranslation'
import type { OpenCodeTranslationResult, OpenCodeViewBounds, OpenCodeViewResult } from '@shared/types/opencode'

export const registerOpenCodeHandlers = (): void => {
  const settingsFile = () => path.join(app.getPath('userData'), 'opencode-translation.json')
  const views = new OpenCodeViews()
  const translations = new Map<string, AbortController>()
  const cancelTranslation = (owner: number, id: string) => translations.get(`${owner}:${id}`)?.abort()
  ipcMain.handle('mt::opencode::cancel-translation', (event, id: string) => cancelTranslation(event.sender.id, id))
  ipcMain.handle('mt::opencode::translate', async(event, id: string, request: unknown): Promise<OpenCodeTranslationResult> => {
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(id) || !isTranslationRequest(request))
      return { ok: false, code: 'failed', error: '翻译参数无效，原文限 30,000 字符。 / Invalid translation request. Source limit: 30,000 characters.' }
    const key = `${event.sender.id}:${id}`
    cancelTranslation(event.sender.id, id)
    const controller = new AbortController()
    translations.set(key, controller)
    const cancel = () => controller.abort()
    event.sender.once('destroyed', cancel)
    try {
      const status = await detectOpenCode(settingsFile())
      if (controller.signal.aborted) return { ok: false, code: 'cancelled', error: '已取消 / Cancelled' }
      if (status.state !== 'ready' || !status.command)
        return { ok: false, code: 'unavailable', error: '请先安装并检测 OpenCode CLI。 / Install and check OpenCode CLI first.' }
      if (!status.freeModels.some(model => model.id === request.model))
        return { ok: false, code: 'unavailable', error: '所选模型不在当前零单价模型列表中，请重新检测。 / The selected model is not currently listed as free. Check again.' }
      return await translateWithOpenCode(status.command, request, controller.signal)
    } catch {
      return { ok: false, code: 'failed', error: 'CLI 翻译失败，请重新检测后重试。 / CLI translation failed. Check setup and retry.' }
    } finally {
      event.sender.removeListener('destroyed', cancel)
      if (translations.get(key) === controller) translations.delete(key)
    }
  })
  ipcMain.handle('mt::opencode::open-web', async(event, id: string, bounds: OpenCodeViewBounds): Promise<OpenCodeViewResult> => {
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(id)) return { ok: false, error: 'Invalid view ID.' }
    return views.open(event.sender, id, async() => {
      const status = await detectOpenCode(settingsFile())
      if (status.state !== 'ready' || !status.command) throw new Error('OpenCode 2 is unavailable.')
      return status.command
    }, bounds)
  })
  ipcMain.handle('mt::opencode::web-layout', (event, id: string, bounds: OpenCodeViewBounds | null) => views.layout(event.sender, id, bounds))
  ipcMain.handle('mt::opencode::close-web', (event, id: string) => views.close(event.sender, id))
  ipcMain.handle('mt::opencode::status', () => detectOpenCode(settingsFile()))
  ipcMain.handle('mt::opencode::choose-cli', async(event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: '选择 OpenCode CLI / Choose OpenCode CLI',
      properties: ['openFile'],
      ...(process.platform === 'win32'
        ? { filters: [{ name: 'OpenCode CLI', extensions: ['exe'] }] }
        : {})
    })
    const command = result.filePaths[0]
    if (result.canceled || !command) return null
    const status = await inspectOpenCode(command)
    if (status.version) {
      await mkdir(path.dirname(settingsFile()), { recursive: true })
      await writeFile(settingsFile(), JSON.stringify({ command }), 'utf8')
    }
    return status
  })
}
