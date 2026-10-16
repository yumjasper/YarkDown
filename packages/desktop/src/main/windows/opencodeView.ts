import { BrowserWindow, shell, WebContentsView, type WebContents } from 'electron'
import type { OpenCodeViewBounds, OpenCodeViewResult } from '@shared/types/opencode'
import { clampOpenCodeBounds, isOpenCodeOrigin, parseOpenCodePairUrl } from '../utils/opencodeWeb'
import { runOpenCode } from '../utils/opencode'

interface EmbeddedOpenCode {
  id: string
  view?: WebContentsView
  bounds: OpenCodeViewBounds | null
  ready: boolean
  cleanup: () => void
}

export class OpenCodeViews {
  private views = new Map<number, EmbeddedOpenCode>()

  close(owner: WebContents, id?: string): void {
    const entry = this.views.get(owner.id)
    if (!entry || (id && entry.id !== id)) return
    this.views.delete(owner.id)
    entry.cleanup()
    if (!entry.view) return
    const win = owner.isDestroyed() ? null : BrowserWindow.fromWebContents(owner)
    if (win && !win.isDestroyed()) win.contentView.removeChildView(entry.view)
    if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close()
  }

  layout(owner: WebContents, id: string, bounds: OpenCodeViewBounds | null): boolean {
    const entry = this.views.get(owner.id)
    if (!entry || entry.id !== id) return false
    entry.bounds = bounds
    const win = BrowserWindow.fromWebContents(owner)
    if (!win || !entry.view) return true
    const clipped = clampOpenCodeBounds(bounds, win.getContentSize(), owner.getZoomFactor())
    entry.view.setBounds(clipped)
    entry.view.setVisible(entry.ready && clipped.width > 0 && clipped.height > 0)
    return true
  }

  async open(owner: WebContents, id: string, resolveCommand: () => Promise<string>, bounds: OpenCodeViewBounds): Promise<OpenCodeViewResult> {
    this.close(owner)
    const dispose = () => this.close(owner)
    const entry: EmbeddedOpenCode = {
      id, bounds, ready: false,
      cleanup: () => {
        owner.removeListener('destroyed', dispose)
        owner.removeListener('did-start-navigation', dispose)
      }
    }
    this.views.set(owner.id, entry)
    owner.once('destroyed', dispose)
    owner.once('did-start-navigation', dispose)
    try {
      // Pairing credentials stay in the main process and are consumed only by
      // the untouched official page, in its own session without our preload.
      const command = await resolveCommand()
      if (this.views.get(owner.id) !== entry || owner.isDestroyed()) return { ok: false, error: 'Connection cancelled.' }
      const url = parseOpenCodePairUrl(await runOpenCode(command, ['pair']))
      if (this.views.get(owner.id) !== entry || owner.isDestroyed()) return { ok: false, error: 'Connection cancelled.' }
      const win = BrowserWindow.fromWebContents(owner)
      if (!win) throw new Error('Owner window closed.')
      const origin = new URL(url).origin
      const view = new WebContentsView({ webPreferences: {
        partition: `yarktext-opencode-${owner.id}`, sandbox: true,
        contextIsolation: true, nodeIntegration: false, webSecurity: true
      } })
      entry.view = view
      view.setVisible(false)
      view.webContents.setWindowOpenHandler(({ url: destination }) => {
        if (/^https?:\/\//i.test(destination)) void shell.openExternal(destination).catch(() => {})
        return { action: 'deny' }
      })
      view.webContents.on('will-navigate', (event, destination) => {
        if (!isOpenCodeOrigin(destination, origin)) {
          event.preventDefault()
          if (/^https?:\/\//i.test(destination)) void shell.openExternal(destination).catch(() => {})
        }
      })
      view.webContents.on('will-redirect', (event, destination) => {
        if (!isOpenCodeOrigin(destination, origin)) event.preventDefault()
      })
      win.contentView.addChildView(view)
      this.layout(owner, id, entry.bounds)
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          view.webContents.loadURL(url),
          new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('OpenCode UI load timed out.')), 30000) })
        ])
      } finally { clearTimeout(timer) }
      if (this.views.get(owner.id) !== entry) return { ok: false, error: 'Connection cancelled.' }
      entry.ready = true
      this.layout(owner, id, entry.bounds)
      return { ok: true }
    } catch {
      if (this.views.get(owner.id) === entry) this.close(owner)
      return { ok: false, error: '无法连接 OpenCode 官方界面，请确认本地服务可用后重试。 / Could not connect to the official OpenCode UI. Check your local service and retry.' }
    }
  }
}
