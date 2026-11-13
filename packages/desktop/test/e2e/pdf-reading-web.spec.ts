import { expect, test } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { expectNoRendererErrors, launchWithDoc } from './helpers'

test('official translation view is isolated, clipped, hidden by modals and released', async() => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yarktext-reading-view-'))
  const filename = path.join(directory, 'view.pdf')
  const pdf = await PDFDocument.create()
  pdf.addPage().drawText('Keep the selected sentence local.')
  await writeFile(filename, await pdf.save())
  const { app, page } = await launchWithDoc(filename, { suppressErrorDialog: true })
  try {
    await expect(page.locator('.textLayer').first()).toContainText(
      'Keep the selected sentence local.'
    )
    await app.evaluate(({ app }) => {
      const state = globalThis as unknown as { readingPageRequests: string[] }
      state.readingPageRequests = []
      app.once('web-contents-created', (_event, contents) => {
        const load = contents.loadURL.bind(contents)
        contents.loadURL = async(url) => {
          state.readingPageRequests.push(url)
          await load(
            'data:text/html,<html><body><p>Isolated translation page fixture</p></body></html>'
          )
        }
      })
    })
    await page.getByRole('button', { name: '阅读助手', exact: true }).click()
    const panel = page.getByRole('complementary', { name: '阅读助手' })
    await panel.getByRole('button', { name: '整句翻译在线', exact: true }).click()
    await panel.getByRole('button', { name: '官方网页', exact: true }).click()
    await expect(panel.locator('.reading-web-host')).toBeVisible()
    const nativeView = () =>
      app.evaluate(({ BrowserWindow }) => {
        const view = BrowserWindow.getAllWindows()[0].contentView.children.find(
          (view) => 'webContents' in view
        ) as Electron.WebContentsView | undefined
        if (!view) return null
        const contents = view.webContents as Electron.WebContents & {
          getLastWebPreferences: () => Electron.WebPreferences
        }
        return {
          bounds: view.getBounds(),
          visible: view.getVisible(),
          preferences: contents.getLastWebPreferences()
        }
      })
    await expect.poll(async() => (await nativeView())?.visible).toBe(true)
    const details = await nativeView()
    expect(details?.preferences.sandbox).toBe(true)
    expect(details?.preferences.contextIsolation).toBe(true)
    expect(details?.preferences.nodeIntegration).toBe(false)
    expect(details?.preferences.webSecurity).toBe(true)
    expect(details?.preferences.preload).toBeUndefined()
    expect(details?.bounds.width).toBeGreaterThan(100)
    const requests = await app.evaluate(
      () => (globalThis as unknown as { readingPageRequests: string[] }).readingPageRequests
    )
    expect(requests).toHaveLength(1)
    expect(new URL(requests[0]).searchParams.has('text')).toBe(false)
    await page.evaluate(() => {
      const overlay = document.createElement('div')
      overlay.id = 'reading-modal-test'
      overlay.className = 'el-overlay'
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.1)'
      document.body.append(overlay)
    })
    await expect.poll(async() => (await nativeView())?.visible).toBe(false)
    await page.evaluate(() => document.getElementById('reading-modal-test')?.remove())
    await expect.poll(async() => (await nativeView())?.visible).toBe(true)
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(900, 680)
    )
    await expect
      .poll(async() => (await nativeView())?.bounds.width)
      .toBeLessThan(details?.bounds.width || 1000)
    await panel.getByRole('button', { name: '返回对照', exact: true }).click()
    await expect.poll(async() => (await nativeView())?.visible).toBe(false)
    await panel.getByRole('button', { name: '官方网页', exact: true }).click()
    await expect.poll(async() => (await nativeView())?.visible).toBe(true)
    await panel.getByRole('button', { name: '关闭翻译面板', exact: true }).click()
    await expect.poll(nativeView).toBeNull()
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((win) => win.destroy())
    )
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})
