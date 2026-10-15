import { expect, test } from '@playwright/test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { PopupOptions } from 'electron'
import type CodeMirror from 'codemirror'
import { clickMenuById, expectNoRendererErrors, launchWithDoc } from './helpers'

test('anchors native menus at scaled coordinates and restores preferences after a restart', async() => {
  test.setTimeout(90000)
  const directory = mkdtempSync(path.join(tmpdir(), 'yarktext-settings-'))
  const profile = path.join(directory, 'profile')
  mkdirSync(profile)
  const filename = path.join(directory, 'test.txt')
  const preferencesFile = path.join(profile, 'preferences.json')
  writeFileSync(filename, 'first\nsecond\nthird\n')
  writeFileSync(preferencesFile, JSON.stringify({ fontSize: 19, texMathGfm: true, customLegacySetting: 'keep' }))
  let { app, page } = await launchWithDoc(filename, { userDataDir: profile, suppressErrorDialog: true })
  const readPreferences = () => JSON.parse(readFileSync(preferencesFile, 'utf8'))
  try {
    await expect(page.locator('.plain-text-toolbar')).toHaveCount(0)
    await app.evaluate(({ Menu }) => {
      Menu.prototype.popup = function(options?: PopupOptions) {
        Object.assign(globalThis, { __popupPoint: { x: options?.x, y: options?.y } })
        options?.callback?.()
      }
    })
    for (const zoom of [0.75, 1.25, 1.75]) {
      await app.evaluate(({ BrowserWindow }, factor) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(factor), zoom)
      const button = page.locator('.menu-bar-item').first()
      const rect = await button.evaluate(element => {
        const bounds = element.getBoundingClientRect()
        return { x: bounds.left, y: bounds.bottom }
      })
      await button.dispatchEvent('mousedown', { button: 0 })
      await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { __popupPoint?: unknown }).__popupPoint)).toEqual({ x: Math.round(rect.x * zoom), y: Math.round(rect.y * zoom) })
      await page.locator('.tabs-container li.active').evaluate(element => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 240, clientY: 72, button: 2 })))
      await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { __popupPoint?: unknown }).__popupPoint)).toEqual({ x: Math.round(240 * zoom), y: Math.round(72 * zoom) })
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1))
    await clickMenuById(app, 'txtWordWrap')
    await expect.poll(() => readPreferences().txtWordWrap).toBe(false)

    const settingsPromise = app.waitForEvent('window')
    await app.evaluate(({ ipcMain }) => { ipcMain.emit('app-create-settings-window') })
    const settings = await settingsPromise
    await settings.locator('.pref-sidebar .category .item').filter({ hasText: /^TXT$/ }).click()
    await expect(settings.locator('.pref-txt')).toBeVisible()
    await settings.locator('.pref-txt .pref-font-input-item input').fill('Cascadia Mono')
    await settings.locator('.pref-txt .pref-compound-item .pref-switch-item .el-switch').nth(1).click()
    await expect.poll(() => readPreferences().txtFontFamily).toBe('Cascadia Mono')
    await expect.poll(() => readPreferences().txtLineNumbers).toBe(false)
    const categories = await settings.locator('.category .item span').allTextContents()
    expect(categories.indexOf('TXT')).toBe(categories.indexOf('Markdown') + 1)
    await settings.locator('.pref-sidebar .category .item').nth(1).click()
    await settings.locator('.pref-editor .pref-text-box-item input').first().fill('860px')
    await settings.evaluate(() => window.electron.windowControl.close())
    await expect.poll(() => readPreferences().editorLineWidth).toBe('860px')
    await expectNoRendererErrors(app)
    await app.close()

    ;({ app, page } = await launchWithDoc(filename, { userDataDir: profile, suppressErrorDialog: true }))
    await expect(page.locator('.plain-text-toolbar')).toHaveCount(0)
    expect(await page.locator('.plain-text-editor .CodeMirror').evaluate(element => {
      const cm = (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror
      return { wrap: cm.getOption('lineWrapping'), numbers: cm.getOption('lineNumbers') }
    })).toEqual({ wrap: false, numbers: false })
    expect(readPreferences()).toMatchObject({ fontSize: 19, texMathGfm: true, editorLineWidth: '860px', customLegacySetting: 'keep', txtFontFamily: 'Cascadia Mono' })
    await expectNoRendererErrors(app)
  } finally {
    await app.close().catch(() => {})
    rmSync(directory, { recursive: true, force: true })
  }
})
