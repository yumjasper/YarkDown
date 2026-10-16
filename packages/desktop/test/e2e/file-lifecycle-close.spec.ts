import { expect, test } from '@playwright/test'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { launchElectron, sendIpcToRenderer, expectNoRendererErrors } from './helpers'

test('restoreAll still prompts, cancelled save keeps the window and a successful save survives restart', async() => {
  test.setTimeout(60000)
  const directory = await mkdtemp(path.join(tmpdir(), 'yarktext-close-'))
  const profile = path.join(directory, 'profile')
  const savedFile = path.join(directory, 'saved.md')
  let { app, page } = await launchElectron([], { userDataDir: profile, preferences: { startUpAction: 'restoreAll', sideBarVisibility: true, tabBarVisibility: true }, suppressErrorDialog: true })
  try {
    await page.getByTestId('home-new-file').click()
    await expect(page.locator('.editor-component')).toBeVisible()
    await page.locator('.mu-editor').click()
    await page.keyboard.type('draft before closing')
    await app.evaluate(({ dialog, ipcMain }) => {
      const g = global as unknown as { closePrompts: number; closeResponse: number; saveCancelled: boolean; closeFinished: boolean; saveCalls: number }
      g.closePrompts = 0
      g.closeResponse = 2
      g.saveCancelled = true
      g.closeFinished = false
      g.saveCalls = 0
      dialog.showMessageBox = async() => {
        g.closePrompts++
        return { response: g.closeResponse, checkboxChecked: false }
      }
      dialog.showSaveDialog = async() => {
        g.saveCalls++
        return { canceled: g.saveCancelled, filePath: '' }
      }
      ipcMain.on('mt::close-window', () => { g.closeFinished = true })
    })
    await sendIpcToRenderer(app, 'mt::ask-for-close')
    await expect.poll(() => app.evaluate(() => (global as unknown as { closePrompts: number }).closePrompts)).toBe(1)
    await expect(page.locator('.tabs-container li.active')).toHaveClass(/unsaved/)
    await app.evaluate(() => { (global as unknown as { closeResponse: number }).closeResponse = 0 })
    await sendIpcToRenderer(app, 'mt::ask-for-close')
    await expect.poll(() => app.evaluate(() => (global as unknown as { closePrompts: number }).closePrompts)).toBe(2)
    await expect.poll(() => app.evaluate(() => (global as unknown as { saveCalls: number }).saveCalls)).toBe(1)
    await expect(page.locator('.tabs-container li.active')).toHaveClass(/unsaved/)
    expect(await app.evaluate(() => (global as unknown as { closeFinished: boolean }).closeFinished)).toBe(false)

    const unwritableTarget = path.join(directory, 'directory.md')
    await mkdir(unwritableTarget)
    await app.evaluate(({ dialog }, filename) => {
      dialog.showSaveDialog = async() => ({ canceled: false, filePath: filename })
    }, unwritableTarget)
    await sendIpcToRenderer(app, 'mt::ask-for-close')
    await expect(page.getByText(/EISDIR|EPERM|illegal operation on a directory/).first()).toBeVisible()
    await expect(page.locator('.tabs-container li.active')).toHaveClass(/unsaved/)
    expect(await app.evaluate(() => (global as unknown as { closeFinished: boolean }).closeFinished)).toBe(false)
    await app.evaluate(({ dialog }, filename) => {
      dialog.showSaveDialog = async() => ({ canceled: false, filePath: filename })
    }, savedFile)
    await expectNoRendererErrors(app)
    const closed = page.waitForEvent('close')
    await sendIpcToRenderer(app, 'mt::ask-for-close')
    await closed
    await app.close()
    expect((await readFile(savedFile, 'utf8')).trim()).toBe('draft before closing')
    ;({ app, page } = await launchElectron([], { userDataDir: profile, suppressErrorDialog: true }))
    await page.getByTestId('home-continue').click()
    await expect(page.locator('.tabs-container li.active')).toContainText('saved.md')
    await expect(page.locator('.tabs-container li.active')).not.toHaveClass(/unsaved/)
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy())).catch(() => {})
    await app.close().catch(() => {})
    await rm(directory, { recursive: true, force: true })
  }
})

test('discard on exit does not restore the discarded untitled draft', async() => {
  test.setTimeout(60000)
  const profile = await mkdtemp(path.join(tmpdir(), 'yarktext-discard-'))
  let { app, page } = await launchElectron([], { userDataDir: profile, preferences: { startUpAction: 'restoreAll', sideBarVisibility: true, tabBarVisibility: true }, suppressErrorDialog: true })
  try {
    await page.getByTestId('home-new-file').click()
    await expect(page.locator('.editor-component')).toBeVisible()
    await page.locator('.mu-editor').click()
    await page.keyboard.type('discard this draft')
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async() => ({ response: 1, checkboxChecked: false })
    })
    const closed = page.waitForEvent('close')
    await sendIpcToRenderer(app, 'mt::ask-for-close')
    await closed
    await app.close()
    ;({ app, page } = await launchElectron([], { userDataDir: profile, suppressErrorDialog: true }))
    await expect(page.locator('.opened-file')).toHaveCount(0)
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy())).catch(() => {})
    await app.close().catch(() => {})
    await rm(profile, { recursive: true, force: true })
  }
})
