import { expect, test, type Locator } from '@playwright/test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type CodeMirror from 'codemirror'
import { PDFDocument } from 'pdf-lib'
import { clickMenuById, expectNoRendererErrors, launchWithDoc, sendIpcToRenderer } from './helpers'

const value = (group: Locator) => group.locator('.CodeMirror').evaluate(element =>
  (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror.getValue())
const prefix = (group: Locator, text: string) => group.locator('.CodeMirror').evaluate((element, text) => {
  const cm = (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror
  cm.focus()
  cm.replaceRange(text, { line: 0, ch: 0 }, undefined, '+input')
}, text)

test('image source and placeholder occupy separate rows and Ctrl+N creates a file in the current window', async() => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yarktext-image-layout-'))
  const filename = path.join(directory, 'image.md')
  await writeFile(filename, 'Images\n\n')
  const { app, page } = await launchWithDoc(filename, { suppressErrorDialog: true })
  try {
    await page.locator('.editor-component').click({ position: { x: 30, y: 30 } })
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
    await page.keyboard.press('Enter')
    await clickMenuById(app, 'imageMenuItem')
    const image = page.locator('.mu-empty-image').first()
    await expect(image.locator('.mu-image-source')).toBeVisible()
    const geometry = await image.evaluate(element => {
      const sourceElement = element.querySelector('.mu-image-source'), iconElement = element.querySelector('.mu-image-icon-success')
      if (!sourceElement || !iconElement) throw new Error('Missing image controls')
      const source = sourceElement.getBoundingClientRect(), icon = iconElement.getBoundingClientRect()
      return { sourceBottom: source.bottom, iconTop: icon.top }
    })
    expect(geometry.iconTop).toBeGreaterThanOrEqual(geometry.sourceBottom)
    await page.screenshot({ path: '../../.tools/image-insert-layout-fixed.png' })
    await page.keyboard.press('Escape')
    await page.locator('.editor-component').evaluate(element => (element as HTMLElement).focus())
    const windows = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
    const newFileKey = await page.evaluate(async() => (await window.electron.ipcRenderer.invoke('mt::keybinding-get-pref-keybindings')).defaultKeybindings.get('file.new-tab'))
    expect(newFileKey).toBe(process.platform === 'darwin' ? 'Command+N' : 'Ctrl+N')
    const tabs = await page.locator('.tabs-container li').count()
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.webContents.emit('before-input-event', { preventDefault() {} }, {
        type: 'keyDown', key: 'n', code: 'KeyN', location: 0,
        control: process.platform !== 'darwin', meta: process.platform === 'darwin',
        alt: false, shift: false, isAutoRepeat: false, isComposing: false
      })
    })
    await expect(page.locator('.tabs-container li')).toHaveCount(tabs + 1)
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(windows)
    await expect(page.locator('.tabs-container li.active')).toContainText('Untitled')
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('TXT groups share edits and undo, compare different files, save the focused file and exclude PDFs', async() => {
  test.setTimeout(90000)
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yarktext-txt-split-'))
  const first = path.join(directory, 'left.txt'), second = path.join(directory, 'right.txt'), pdfPath = path.join(directory, 'reader.pdf')
  const original = Array.from({ length: 80 }, (_, index) => `Left line ${index + 1}`).join('\n') + '\n'
  await writeFile(first, '\ufeff' + original.replaceAll('\n', '\r\n'))
  await writeFile(second, 'Right text needle\n')
  const pdf = await PDFDocument.create()
  pdf.addPage().drawText('PDF has no split editor', { x: 40, y: 700 })
  await writeFile(pdfPath, await pdf.save())
  const { app, page } = await launchWithDoc(first, { suppressErrorDialog: true, preferences: { minimapEnabled: true } })
  try {
    await expect(page.locator('.plain-text-editor')).toBeVisible()
    await page.evaluate(file => window.electron.ipcRenderer.send('mt::window::drop', [file]), second)
    await expect(page.locator('.tabs-container li.active')).toContainText('right.txt')
    await page.locator('.tabs-container li').filter({ hasText: 'left.txt' }).click()
    await page.getByRole('button', { name: '向右拆分编辑器', exact: true }).click()
    const groups = page.locator('.plain-text-group'), left = groups.nth(0), right = groups.nth(1)
    await expect(groups).toHaveCount(2)
    await expect.poll(() => value(right)).toBe(original)
    await right.locator('.CodeMirror').evaluate(element => {
      const cm = (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror
      cm.setCursor({ line: 30, ch: 2 }); cm.scrollTo(0, 600)
    })
    await left.locator('.CodeMirror').evaluate(element => {
      const cm = (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror
      cm.focus(); cm.setCursor({ line: 2, ch: 0 })
    })
    expect(await right.locator('.CodeMirror').evaluate(element => (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror.getCursor().line)).toBe(30)
    await prefix(right, 'Shared edit ')
    await expect.poll(() => value(left)).toBe('Shared edit ' + original)
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect.poll(() => value(left)).toBe(original)
    await expect.poll(() => value(right)).toBe(original)
    await prefix(right, 'Saved edit ')
    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await expect.poll(() => readFile(first, 'utf8')).toBe('\ufeff' + ('Saved edit ' + original).replaceAll('\n', '\r\n'))
    const secondId = await page.locator('.tabs-container li').filter({ hasText: 'right.txt' }).getAttribute('data-id')
    if (!secondId) throw new Error('Missing right TXT tab')
    await right.getByRole('combobox', { name: '选择 TXT 文件' }).selectOption(secondId)
    await expect.poll(() => value(right)).toBe('Right text needle\n')
    await prefix(left, 'Left only ')
    await expect.poll(() => value(right)).toBe('Right text needle\n')
    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await expect.poll(() => readFile(first, 'utf8')).toContain('Left only Saved edit ')
    await prefix(right, 'Right only ')
    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await expect.poll(() => readFile(second, 'utf8')).toBe('Right only Right text needle\n')
    await page.locator('.app-menu-bar button').filter({ hasText: /^替换$/ }).dispatchEvent('mousedown', { button: 0 })
    await right.locator('.search input[type="text"]').fill('needle')
    await expect(right.locator('.search-result')).toContainText('1')
    await right.locator('.replace input[type="text"]').fill('found')
    await right.locator('.replace .button').first().click()
    await expect.poll(() => value(right)).toBe('Right only Right text found\n')
    await expect.poll(() => value(left)).toBe('Left only Saved edit ' + original)
    await page.keyboard.press('Escape')
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect.poll(() => value(right)).toBe('Right only Right text needle\n')
    const divider = page.getByRole('separator', { name: '调整编辑器宽度' })
    const bounds = await divider.boundingBox()
    if (!bounds) throw new Error('Missing split divider')
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 100)
    await page.mouse.down()
    await page.mouse.move(bounds.x + 70, bounds.y + 100)
    await page.mouse.up()
    expect(Number(await divider.getAttribute('aria-valuenow'))).toBeGreaterThan(50)
    await divider.focus(); await page.keyboard.press('Home')
    await divider.focus(); await page.keyboard.press('ArrowRight')
    await expect(divider).toHaveAttribute('aria-valuenow', '55')
    await page.keyboard.press('Home')
    await page.screenshot({ path: '../../.tools/plain-text-split-preview.png' })
    await left.getByRole('button', { name: '关闭编辑器组' }).click()
    await expect(groups).toHaveCount(1)
    await expect.poll(() => value(groups.first())).toBe('Right only Right text needle\n')
    await groups.first().locator('.CodeMirror').click()
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Backslash' : 'Control+Backslash')
    await expect(groups).toHaveCount(2)
    await groups.last().getByRole('button', { name: '关闭编辑器组' }).click()
    await page.evaluate(file => window.electron.ipcRenderer.send('mt::window::drop', [file]), pdfPath)
    await expect(page.locator('.pdf-reader')).toBeVisible()
    await expect(page.getByRole('button', { name: '向右拆分编辑器', exact: true })).toHaveCount(0)
    await page.locator('.tabs-container li').filter({ hasText: 'left.txt' }).click()
    await expect.poll(() => value(groups.first())).toBe('Left only Saved edit ' + original)
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})
