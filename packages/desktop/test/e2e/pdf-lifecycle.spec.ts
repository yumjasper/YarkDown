import { expect, test } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { expectNoRendererErrors, launchWithDoc } from './helpers'

interface PdfProbe {
  observers: Set<{ targets: Set<Element> }>
  mutations: Set<{ targets: Set<Node> }>
  listeners: Array<{ target: Element; signal?: AbortSignal | null; listener: EventListenerOrEventListenerObject | null; removed: boolean }>
  workers: Set<Worker>
}

test('releases PDF observers, scrolling and workers across multiple tabs and resize', async() => {
  test.setTimeout(120000)
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yarktext-pdf-lifecycle-'))
  const markdown = path.join(directory, 'notes.md')
  await writeFile(markdown, '# Notes alongside several PDFs\n')
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < 24; i++) {
    pdf.addPage([612, 792]).drawText(`Lifecycle page ${i + 1}`, { x: 50, y: 700, font, size: 24 })
  }
  const bytes = await pdf.save()
  const filenames = Array.from({ length: 4 }, (_, i) => path.join(directory, `paper-${i + 1}.pdf`))
  await Promise.all(filenames.map(filename => writeFile(filename, bytes)))
  const { app, page } = await launchWithDoc(markdown, {
    suppressErrorDialog: true,
    preferences: { tabBarVisibility: true, minimapEnabled: false }
  })
  try {
    await expect(page.locator('.editor-component')).toContainText('Notes alongside several PDFs')
    await page.evaluate(() => {
      const probe: PdfProbe = { observers: new Set(), mutations: new Set(), listeners: [], workers: new Set() }
      Object.assign(window, { __pdfLifecycle: probe })
      const NativeObserver = window.ResizeObserver
      window.ResizeObserver = class extends NativeObserver {
        private record = { targets: new Set<Element>() }
        constructor(callback: ResizeObserverCallback) {
          super(callback)
          probe.observers.add(this.record)
        }
        override observe(target: Element, options?: ResizeObserverOptions) {
          probe.observers.add(this.record)
          this.record.targets.add(target)
          super.observe(target, options)
        }
        override unobserve(target: Element) {
          this.record.targets.delete(target)
          super.unobserve(target)
        }
        override disconnect() {
          this.record.targets.clear()
          probe.observers.delete(this.record)
          super.disconnect()
        }
      }
      const NativeMutationObserver = window.MutationObserver
      window.MutationObserver = class extends NativeMutationObserver {
        private record = { targets: new Set<Node>() }
        override observe(target: Node, options?: MutationObserverInit) {
          probe.mutations.add(this.record)
          this.record.targets.add(target)
          super.observe(target, options)
        }
        override disconnect() {
          this.record.targets.clear()
          probe.mutations.delete(this.record)
          super.disconnect()
        }
      }
      const nativeAdd = EventTarget.prototype.addEventListener
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (type === 'scroll' && this instanceof Element && this.matches('.pdf-scroll')) {
          probe.listeners.push({ target: this, signal: typeof options === 'object' ? options.signal : undefined, listener, removed: false })
        }
        nativeAdd.call(this, type, listener, options)
      }
      const nativeRemove = EventTarget.prototype.removeEventListener
      EventTarget.prototype.removeEventListener = function(type, listener, options) {
        if (type === 'scroll') {
          for (const entry of probe.listeners) {
            if (entry.target === this && entry.listener === listener) entry.removed = true
          }
        }
        nativeRemove.call(this, type, listener, options)
      }
      const NativeWorker = window.Worker
      window.Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options)
          probe.workers.add(this)
        }
        override terminate() {
          probe.workers.delete(this)
          super.terminate()
        }
      }
    })
    const snapshot = () => page.evaluate(() => {
      const probe = (window as unknown as { __pdfLifecycle: PdfProbe }).__pdfLifecycle
      const targets = [...probe.observers].flatMap(observer => [...observer.targets])
        .filter(target => target.matches('.pdf-scroll'))
      return {
        mutationObservers: [...probe.mutations].flatMap(observer => [...observer.targets])
          .filter(target => target instanceof Element && target.matches('.pdf-scroll')).length,
        liveObservers: targets.filter(target => target.isConnected).length,
        detachedObservers: targets.filter(target => !target.isConnected).length,
        liveScrollListeners: probe.listeners.filter(entry => !entry.removed && !entry.signal?.aborted).length,
        workers: probe.workers.size
      }
    })
    const expectedPdf = { mutationObservers: 2, liveObservers: 1, detachedObservers: 0, liveScrollListeners: 2, workers: 1 }
    const expectedMarkdown = { mutationObservers: 0, liveObservers: 0, detachedObservers: 0, liveScrollListeners: 0, workers: 0 }
    for (const filename of filenames) {
      await page.evaluate(file => window.electron.ipcRenderer.send('mt::open-file', file, {}), filename)
      await expect(page.locator('.tabs-container li.active')).toContainText(path.basename(filename))
      await expect(page.locator('.pdf-reader .textLayer').first()).toContainText('Lifecycle page 1')
    }
    console.log('[PDF resources after opening four tabs]', JSON.stringify(await snapshot()))
    await expect.poll(snapshot).toEqual(expectedPdf)
    await page.getByRole('spinbutton', { name: '页码' }).fill('12')
    await page.getByRole('spinbutton', { name: '页码' }).press('Enter')
    await expect(page.locator('.pdfViewer .page[data-page-number="12"] .textLayer')).toContainText('Lifecycle page 12')
    for (let round = 0; round < 2; round++) {
      await page.locator('.tabs-container li').filter({ hasText: 'notes.md' }).click()
      await expect(page.locator('.pdf-reader')).toHaveCount(0)
      await expect.poll(snapshot).toEqual(expectedMarkdown)
      await app.evaluate(async({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0]
        for (let i = 0; i < 24; i++) {
          win.setBounds({ width: 1000 + i * 6, height: 720 })
          await new Promise(resolve => setTimeout(resolve, 20))
        }
      })
      await expect.poll(snapshot).toEqual(expectedMarkdown)
      for (const filename of filenames) {
        await page.locator('.tabs-container li').filter({ hasText: path.basename(filename) }).click()
        await expect(page.locator('.pdf-reader canvas').first()).toBeVisible()
        await expect.poll(snapshot).toEqual(expectedPdf)
      }
      await expect(page.getByRole('spinbutton', { name: '页码' })).toHaveValue('12')
    }
    await app.evaluate(async({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      for (let i = 0; i < 24; i++) {
        win.setBounds({ width: 1000 + i * 6, height: 720 })
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    })
    await expect(page.locator('.pdfViewer .page[data-page-number="12"] canvas')).toBeVisible()
    await expect.poll(snapshot).toEqual(expectedPdf)
    await page.locator('.tabs-container li').filter({ hasText: 'notes.md' }).click()
    await expect.poll(snapshot).toEqual(expectedMarkdown)
    console.log('[PDF resources with all four tabs in background]', JSON.stringify(await snapshot()))
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})
