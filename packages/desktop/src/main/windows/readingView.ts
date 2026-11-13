import { BrowserWindow, shell, WebContentsView, type WebContents } from 'electron'
import type {
  ReadingResult,
  ReadingViewBounds,
  TranslationProvider,
  TranslationRequest
} from '../../shared/types/reading'
import { clampReadingBounds, isReadingNavigation, translationPageUrl } from '../utils/readingWeb'
import {
  cleanupTranslationScript,
  focusTranslationInputScript,
  prepareTranslationScript,
  translationSnapshotScript
} from '../utils/readingPageAdapter'
import { waitForTranslation, type TranslationSnapshot } from '../utils/readingTranslation'
import { simplifiedChinese } from '../utils/readingChinese'
import { randomUUID } from 'node:crypto'

interface ReadingView {
  id: string
  provider: TranslationProvider
  view: WebContentsView
  bounds: ReadingViewBounds | null
  ready: boolean
  controller?: AbortController
  cleanup: () => void
  results: Map<string, string>
  loadError?: boolean
}
export class ReadingViews {
  private views = new Map<number, ReadingView>()

  close(owner: WebContents, id?: string): void {
    const entry = this.views.get(owner.id)
    if (!entry || (id && entry.id !== id)) return
    this.views.delete(owner.id)
    entry.controller?.abort()
    entry.cleanup()
    const win = owner.isDestroyed() ? null : BrowserWindow.fromWebContents(owner)
    if (win && !win.isDestroyed()) win.contentView.removeChildView(entry.view)
    if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close()
  }

  layout(owner: WebContents, id: string, bounds: ReadingViewBounds | null): boolean {
    const entry = this.views.get(owner.id)
    if (!entry || entry.id !== id) return false
    entry.bounds = bounds
    const win = BrowserWindow.fromWebContents(owner)
    if (!win) return false
    const clipped = clampReadingBounds(bounds, win.getContentSize(), owner.getZoomFactor())
    entry.view.setBounds(clipped)
    entry.view.setVisible(entry.ready && clipped.width > 0 && clipped.height > 0)
    return true
  }

  private create(
    owner: WebContents,
    id: string,
    provider: TranslationProvider,
    bounds: ReadingViewBounds | null
  ): ReadingView {
    this.close(owner)
    const win = BrowserWindow.fromWebContents(owner)
    if (!win || owner.isDestroyed()) throw new Error('Owner closed')
    const view = new WebContentsView({
      webPreferences: {
        partition: `persist:yarktext-reading-${provider}`,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        backgroundThrottling: false
      }
    })
    const dispose = () => this.close(owner)
    const entry: ReadingView = {
      id,
      provider,
      view,
      bounds,
      ready: false,
      results: new Map(),
      cleanup: () => {
        owner.removeListener('destroyed', dispose)
        owner.removeListener('did-start-navigation', dispose)
      }
    }
    this.views.set(owner.id, entry)
    owner.once('destroyed', dispose)
    owner.once('did-start-navigation', dispose)
    view.setVisible(false)
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (isReadingNavigation(url, provider)) {
        void view.webContents.loadURL(url).catch(() => {})
      } else if (/^https:\/\//i.test(url)) void shell.openExternal(url).catch(() => {})
      return { action: 'deny' }
    })
    const navigate = (event: Electron.Event, url: string) => {
      if (!isReadingNavigation(url, provider)) event.preventDefault()
    }
    view.webContents.on('will-navigate', navigate)
    view.webContents.on('will-redirect', navigate)
    view.webContents.on('will-attach-webview', (event) => event.preventDefault())
    view.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false)
    )
    view.webContents.session.setPermissionCheckHandler(() => false)
    win.contentView.addChildView(view)
    this.layout(owner, id, bounds)
    return entry
  }

  cancel(owner: WebContents, id: string): void {
    const entry = this.views.get(owner.id)
    if (!entry || entry.id !== id) return
    entry.controller?.abort()
    if (!entry.ready) this.close(owner, id)
    else this.layout(owner, id, null)
  }

  private isResultPage(entry: ReadingView): boolean {
    try {
      const url = new URL(entry.view.webContents.getURL())
      return entry.provider === 'google'
        ? url.hostname === 'translate.google.com' && url.pathname === '/'
        : ['www.bing.com', 'cn.bing.com'].includes(url.hostname) && url.pathname === '/translator'
    } catch {
      return false
    }
  }

  private navigate(entry: ReadingView, source = ''): void {
    // Translation DOM often becomes usable before ads and analytics finish loading.
    void entry.view.webContents.loadURL(translationPageUrl(entry.provider, source)).catch(() => {
      if (!entry.ready) entry.loadError = true
    })
  }

  async open(
    owner: WebContents,
    id: string,
    provider: TranslationProvider,
    bounds: ReadingViewBounds
  ): Promise<ReadingResult> {
    const existing = this.views.get(owner.id)
    if (existing?.id === id && existing.provider === provider && existing.ready) {
      existing.controller?.abort()
      this.layout(owner, id, bounds)
      return { ok: true, data: undefined }
    }
    let entry: ReadingView | undefined
    try {
      entry = this.create(owner, id, provider, bounds)
      const current = entry
      const controller = new AbortController()
      entry.controller = controller
      const contents = entry.view.webContents
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => finish(new Error('Timeout')), 18000)
        const loaded = () => finish()
        const aborted = () => finish(new Error('Cancelled'))
        const failed = (
          _event: Electron.Event,
          code: number,
          _description: string,
          _url: string,
          isMainFrame: boolean
        ) => {
          if (isMainFrame && code !== -3) finish(new Error('Network'))
        }
        const finish = (error?: Error) => {
          clearTimeout(timeout)
          contents.removeListener('dom-ready', loaded)
          contents.removeListener('did-fail-load', failed)
          controller.signal.removeEventListener('abort', aborted)
          if (error) reject(error)
          else resolve()
        }
        contents.once('dom-ready', loaded)
        contents.on('did-fail-load', failed)
        controller.signal.addEventListener('abort', aborted, { once: true })
        this.navigate(current)
      })
      if (this.views.get(owner.id) !== entry) return { ok: false, error: '已取消 / Cancelled' }
      entry.ready = true
      this.layout(owner, id, bounds)
      return { ok: true, data: undefined }
    } catch {
      if (entry && this.views.get(owner.id) === entry) this.close(owner, id)
      return {
        ok: false,
        error:
          '官方网页无法加载，请检查网络，或使用外部浏览器。 / Could not load the official page. Check the network or use an external browser.'
      }
    }
  }

  async translate(
    owner: WebContents,
    id: string,
    request: TranslationRequest
  ): Promise<ReadingResult<string>> {
    let entry: ReadingView | undefined
    const requestId = randomUUID()
    let controller: AbortController | undefined
    try {
      const existing = this.views.get(owner.id)
      const warm =
        existing?.id === id &&
        existing.provider === request.provider &&
        existing.ready &&
        this.isResultPage(existing)
      entry = warm ? existing : this.create(owner, id, request.provider, null)
      entry.controller?.abort()
      controller = new AbortController()
      entry.controller = controller
      this.layout(owner, id, null)
      const cached = entry.results.get(request.source)
      if (cached) return { ok: true, data: cached }
      if (!warm) this.navigate(entry, request.source)
      const current = entry
      const contents = entry.view.webContents
      let prepared = false,
        submitted = false
      const signal = controller.signal
      const publish = (phase: 'loading' | 'translating' | 'result', text?: string) => {
        if (signal.aborted || owner.isDestroyed() || this.views.get(owner.id) !== current) return
        owner.send('mt::reading::translation-update', {
          id, sequence: request.sequence ?? 0, provider: request.provider, phase,
          text: text === undefined ? undefined : simplifiedChinese(text)
        })
      }
      publish(warm ? 'translating' : 'loading')
      const text = await waitForTranslation({
        source: request.source,
        signal,
        onPreview: text => publish('result', text),
        prepare: async() => {
          if (prepared || signal.aborted || contents.isDestroyed()) return
          if (!this.isResultPage(current)) {
            if (/^https:/.test(contents.getURL())) throw new Error('Sign-in or consent required')
            return
          }
          try {
            // webContents.executeJavaScript waits for did-stop-loading, unlike the frame API.
            prepared = (await contents.mainFrame.executeJavaScript(
              prepareTranslationScript(request.provider, requestId, !warm, request.source)
            )) as boolean
            if (prepared && !signal.aborted) {
              current.ready = true
              this.layout(owner, id, null)
              publish('translating')
            }
          } catch {
            prepared = false
          }
          if (current.loadError && !prepared) throw new Error('Network')
        },
        read: async() => {
          if (!prepared || signal.aborted || contents.isDestroyed() || !this.isResultPage(current))
            return null
          try {
            const snapshot = (await contents.mainFrame.executeJavaScript(
              translationSnapshotScript(request.provider, requestId)
            )) as TranslationSnapshot | null
            if (!snapshot) return null
            if (
              !submitted &&
              snapshot.input.replace(/\s+/g, ' ').trim() !==
                request.source.replace(/\s+/g, ' ').trim()
            ) {
              if (
                (await contents.mainFrame.executeJavaScript(
                  focusTranslationInputScript(request.provider)
                )) &&
                !signal.aborted
              ) {
                submitted = true
                await contents.insertText(request.source)
              }
              return null
            }
            return snapshot
          } catch {
            return null
          }
        }
      })
      if (signal.aborted || this.views.get(owner.id) !== entry)
        return { ok: false, error: '已取消 / Cancelled' }
      if (text) {
        const result = simplifiedChinese(text)
        entry.results.set(request.source, result)
        if (entry.results.size > 24) {
          const oldest = entry.results.keys().next().value
          if (oldest !== undefined) entry.results.delete(oldest)
        }
        return { ok: true, data: result }
      }
      return {
        ok: false,
        error:
          '未获得有效中文译文。可能需要登录、通过验证，或网页结构已变化；请使用官方网页手动翻译。 / No valid Chinese result. Sign-in, verification or a changed page may require manual translation in the official page.'
      }
    } catch {
      if (controller?.signal.aborted) return { ok: false, error: '已取消 / Cancelled' }
      return {
        ok: false,
        error:
          '在线翻译失败，请检查网络或打开官方网页完成登录、验证后重试。 / Online translation failed. Check the network or complete sign-in/verification in the official page.'
      }
    } finally {
      controller?.abort()
      if (entry && !entry.view.webContents.isDestroyed() && this.isResultPage(entry))
        void entry.view.webContents.mainFrame
          .executeJavaScript(cleanupTranslationScript(requestId))
          .catch(() => {})
      if (entry && !entry.ready && this.views.get(owner.id) === entry) this.close(owner, id)
    }
  }
}
