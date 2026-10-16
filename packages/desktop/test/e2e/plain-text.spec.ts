import { expect, test } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type CodeMirror from 'codemirror'
import type { SaveDialogOptions } from 'electron'
import {
  clickMenuById,
  expectNoRendererErrors,
  launchWithDoc,
  sendIpcToRenderer
} from './helpers'

test('edits TXT literally, preserves saved bytes and undo across Markdown tabs, and creates text files', async() => {
  test.setTimeout(90000)
  const directory = mkdtempSync(path.join(tmpdir(), 'yarktext-txt-'))
  const filename = path.join(directory, 'notes.txt')
  const original =
    '# 原样标题\r\n* 不要转成列表\r\n$x$ [链接](test)\r\n\t保留制表符和空格  \r\nneedle needle\r\n\r\n\r\n'
  writeFileSync(filename, '\ufeff' + original, 'utf8')
  writeFileSync(path.join(directory, 'index.md'), '# folder-search-token\n')
  writeFileSync(path.join(directory, 'search.text'), 'prefix\nsecond folder-search-token line\n')
  const { app, page } = await launchWithDoc(filename, {
    suppressErrorDialog: true,
    preferences: { endOfLine: 'crlf' }
  })
  const read = () =>
    page
      .locator('.plain-text-editor .CodeMirror')
      .evaluate((element) =>
        (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror.getValue()
      )
  const edit = (value: string) =>
    page.locator('.plain-text-editor .CodeMirror').evaluate((element, text) => {
      const cm = (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror
      cm.setCursor({ line: cm.lastLine(), ch: 0 })
      cm.replaceSelection(text, 'end', '+input')
      cm.focus()
    }, value)
  try {
    await expect(page.locator('.plain-text-editor')).toBeVisible()
    await expect(page.locator('.editor-wrapper')).toHaveCount(0)
    await expect(page.locator('.plain-text-toolbar')).toHaveCount(0)
    await expect(page.locator('.rail-icon[title="目录"]')).toHaveCount(0)
    await expect(page.locator('.app-menu-bar')).toContainText('跳转')
    await expect(page.locator('.app-menu-bar')).not.toContainText('段落')
    expect(await read()).toBe(original.replace(/\r\n/g, '\n'))
    await expect(page.locator('.editor-wrapper')).not.toBeVisible()
    await expect(page.locator('.plain-text-status')).toContainText('UTF-8 BOM')
    await expect(page.locator('.plain-text-status')).toContainText('CRLF')
    await page.screenshot({ path: path.resolve('../../.tools/plain-text-preview.png') })

    await edit('added')
    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await expect.poll(() => readFileSync(filename, 'utf8')).toBe('\ufeff' + original + 'added')
    await expect(page.locator('.tabs-container li.active')).not.toHaveClass(/unsaved/)

    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, '# Markdown tab\n\nbody')
    await expect(page.locator('.editor-wrapper')).toBeVisible()
    await expect(page.locator('.editor-component')).toContainText('Markdown tab')
    await expect(page.locator('.app-menu-bar')).toContainText('段落')
    const markdownTabId = await page.locator('.tabs-container li.active').getAttribute('data-id')
    await clickMenuById(app, 'sourceCodeModeMenuItem')
    await page.locator('.source-code .CodeMirror').evaluate(element => {
      const cm = (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror
      cm.setCursor({ line: cm.lastLine(), ch: 4 })
      cm.replaceSelection(' source edit', 'end', '+input')
    })
    await page.locator('.tabs-container li').filter({ hasText: 'notes.txt' }).click()
    await expect(page.locator('.plain-text-editor')).toBeVisible()
    expect(await read()).toContain('added')
    await page.locator(`.tabs-container li[data-id="${markdownTabId}"]`).click()
    await expect(page.locator('.source-code .CodeMirror')).toBeVisible()
    expect(await page.locator('.source-code .CodeMirror').evaluate(element =>
      (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror.getValue())).toContain('source edit')
    await clickMenuById(app, 'sourceCodeModeMenuItem')
    await expect(page.locator('.editor-component')).toContainText('source edit')
    await page.locator('.tabs-container li').filter({ hasText: 'notes.txt' }).click()
    await page.locator('.plain-text-editor .CodeMirror').evaluate((element) => {
      ;(element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror.undo()
    })
    expect(await read()).toBe(original.replace(/\r\n/g, '\n'))
    await expect(page.locator('.tabs-container li.active')).toHaveClass(/unsaved/)

    await page.locator('.app-menu-bar button').filter({ hasText: /^替换$/ }).dispatchEvent('mousedown', { button: 0 })
    const searchInput = page.locator('.plain-text-editor .search input[type="text"]')
    await searchInput.fill('needle')
    await expect(page.locator('.plain-text-editor .search-result')).toContainText('2')
    await page.locator('.plain-text-editor .replace input[type="text"]').fill('found')
    await page.locator('.plain-text-editor .replace .button').first().click()
    await expect.poll(read).toContain('found found')
    await page.keyboard.press('Escape')

    await page.locator('.plain-text-editor .CodeMirror').click()
    await page.keyboard.press('Control+g')
    await page.locator('.plain-text-go-to input').fill('3')
    await page.locator('.plain-text-go-to button[type="submit"]').click()
    await expect
      .poll(() =>
        page
          .locator('.plain-text-editor .CodeMirror')
          .evaluate(
            (element) =>
              (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror.getCursor()
                .line
          )
      )
      .toBe(2)
    await page.locator('.app-menu-bar button').filter({ hasText: /自动换行/ }).dispatchEvent('mousedown', { button: 0 })
    await expect(page.locator('.app-menu-bar button').filter({ hasText: /自动换行/ })).toHaveAttribute('aria-pressed', 'false')
    expect(
      await page
        .locator('.plain-text-editor .CodeMirror')
        .evaluate((element) =>
          (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror.getOption(
            'lineWrapping'
          )
        )
    ).toBe(false)

    await clickMenuById(app, 'new-text-file')
    await expect(page.locator('.tabs-container li.active')).toContainText('.txt')
    expect(await read()).toBe('')
    await edit('# a plain text file\n\n\n')
    const output = path.join(directory, 'new-file.txt')
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async(windowOrOptions, options?) => {
        const saveOptions = (options ?? windowOrOptions) as SaveDialogOptions
        if (!saveOptions.defaultPath?.endsWith('.txt'))
          throw new Error('TXT save dialog has a wrong default extension')
        return { canceled: false, filePath }
      }
    }, output)
    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await expect
      .poll(() => {
        try {
          return readFileSync(output, 'utf8')
        } catch {
          return ''
        }
      })
      .toContain('# a plain text file\r\n\r\n\r\n')

    await app.evaluate(({ BrowserWindow, ipcMain }, root) => {
      const win = BrowserWindow.getAllWindows()[0]
      ipcMain.emit('app-open-directory-by-id', win.id, root, true)
    }, directory)
    await expect(page.locator('.tree-wrapper')).toContainText('index.md')
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'findInFolder')
    const folderInput = page.locator('.side-bar-search .search-input')
    await folderInput.fill('folder-search-token')
    await folderInput.press('Enter')
    const textResult = page.locator('.search-result-item').filter({ hasText: 'search.text' })
    await expect(textResult).toBeVisible()
    await expect(page.locator('.search-result-item').filter({ hasText: 'index.md' })).toBeVisible()
    await textResult.locator('.matches li').first().click()
    await expect(page.locator('.tabs-container li.active')).toContainText('search.text')
    await expect
      .poll(() =>
        page
          .locator('.plain-text-editor .CodeMirror')
          .evaluate((element) =>
            (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror.getSelection()
          )
      )
      .toBe('folder-search-token')
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
