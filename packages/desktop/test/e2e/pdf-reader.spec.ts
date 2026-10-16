import { expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type CodeMirror from 'codemirror'
import type { OpenDialogOptions, SaveDialogOptions } from 'electron'
import { clickMenuById, expectNoRendererErrors, launchWithDoc, sendIpcToRenderer } from './helpers'

const createPdf = (firstPage = 'PDF reader first page'): Buffer => {
  const stream = (text: string) => `BT /F1 24 Tf 50 700 Td (${text}) Tj ET`
  const first = stream(firstPage)
  const second = stream('Second page searchable needle')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${first.length} >>\nstream\n${first}\nendstream`,
    `<< /Length ${second.length} >>\nstream\n${second}\nendstream`
  ]
  let pdf = '%PDF-1.7\n'
  const offsets = [0]
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n` })
  const xref = pdf.length
  pdf += `xref\n0 8\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`
  pdf += `trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf)
}

test('reads PDF offline, searches, switches text tabs and protects the original bytes', async() => {
  test.setTimeout(90000)
  for (const asset of ['images/annotation-comment.svg', 'cmaps/Adobe-GB1-UCS2.bcmap', 'standard_fonts/LiberationSans-Regular.ttf', 'wasm/openjpeg.wasm', 'LICENSE']) {
    expect(existsSync(path.resolve('out/renderer/pdfjs', asset)), `Missing offline PDF asset: ${asset}`).toBe(true)
  }
  const directory = mkdtempSync(path.join(tmpdir(), 'yarktext-pdf-'))
  const filename = path.join(directory, '中文 reader #1.PDF')
  const original = createPdf()
  writeFileSync(filename, original)
  const { app, page } = await launchWithDoc(filename, { suppressErrorDialog: true, preferences: { tabBarVisibility: true } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await expect(page.locator('.pdf-reader')).toBeVisible()
    await expect(page.locator('.pdf-reader .textLayer').first()).toContainText('PDF reader first page')
    await expect(page.locator('.pdf-reader canvas').first()).toBeVisible()
    await expect(page.locator('.editor-wrapper')).not.toBeVisible()
    await page.getByRole('button', { name: '下一页', exact: true }).click()
    await expect(page.getByRole('spinbutton', { name: '页码' })).toHaveValue('2')
    await page.getByRole('combobox', { name: '缩放' }).selectOption('1.5')
    await page.getByRole('button', { name: '顺时针旋转' }).click()
    await expect(page.locator('.pdfViewer .page').first()).toHaveAttribute('data-loaded', 'true')
    await page.getByRole('searchbox', { name: '搜索 PDF 文字' }).fill('needle')
    await expect(page.locator('.pdf-matches')).toHaveText('1 / 1')
    await page.locator('.pdf-find-options summary').click()
    await page.getByRole('checkbox', { name: '区分大小写', exact: true }).check()
    await page.getByRole('searchbox', { name: '搜索 PDF 文字' }).fill('NEEDLE')
    await expect(page.locator('.pdf-matches')).toHaveText('0 / 0')
    await page.getByRole('checkbox', { name: '区分大小写', exact: true }).uncheck()
    await expect(page.locator('.pdf-matches')).toHaveText('1 / 1')
    await page.locator('.pdf-find-options summary').click()
    await page.getByRole('combobox', { name: '页面布局' }).selectOption('single')
    await page.getByLabel('PDF 页面', { exact: true }).focus()
    await page.keyboard.press('Home')
    await expect(page.getByRole('spinbutton', { name: '页码' })).toHaveValue('1')
    await page.keyboard.press('PageDown')
    await expect(page.getByRole('spinbutton', { name: '页码' })).toHaveValue('2')
    await page.getByRole('combobox', { name: '页面布局' }).selectOption('continuous')
    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async() => ({ canceled: true, filePath: '' })
    })
    await sendIpcToRenderer(app, 'mt::editor-ask-file-save-as')
    expect(readFileSync(filename)).toEqual(original)
    await page.locator('.new-file').click()
    await expect(page.locator('.editor-component')).toBeVisible()
    await page.locator('.editor-component').click()
    await page.keyboard.type('# Markdown alongside PDF')
    await expect(page.locator('.editor-component')).toContainText('Markdown alongside PDF')
    await clickMenuById(app, 'sourceCodeModeMenuItem')
    await page.locator('.source-code .CodeMirror').evaluate(element => {
      const cm = (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror
      cm.setCursor({ line: 0, ch: 0 })
      cm.replaceSelection('source edit ')
    })
    await page.locator('.tabs-container li').filter({ hasText: '中文 reader #1.PDF' }).click()
    await expect(page.getByRole('spinbutton', { name: '页码' })).toHaveValue('2')
    await expect(page.getByRole('combobox', { name: '缩放' })).toHaveValue('1.5')
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'literal # TXT', true)
    await expect(page.locator('.plain-text-editor .CodeMirror')).toContainText('literal # TXT')
    await page.locator('.tabs-container li').filter({ hasText: 'Untitled-1' }).first().click()
    await expect(page.locator('.source-code .CodeMirror')).toContainText('source edit')
    const savedMarkdown = path.join(directory, 'saved.md')
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async(_window, _options?: SaveDialogOptions) => ({ canceled: false, filePath })
    }, savedMarkdown)
    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await expect.poll(() => existsSync(savedMarkdown) ? readFileSync(savedMarkdown, 'utf8') : '').toContain('source edit')
    await page.locator('.tabs-container li').filter({ hasText: '中文 reader #1.PDF' }).click()
    const replacement = createPdf('PDF external update')
    writeFileSync(filename, replacement)
    await expect(page.locator('.pdf-reader .textLayer').first()).toContainText('PDF external update', { timeout: 15000 })
    await page.evaluate((filePath) => window.electron.ipcRenderer.send('mt::window::drop', [filePath]), filename)
    await expect(page.locator('.tabs-container li').filter({ hasText: '中文 reader #1.PDF' })).toHaveCount(1)
    const dialogPath = path.join(directory, 'dialog.pdf')
    writeFileSync(dialogPath, original)
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async(_window, options?: OpenDialogOptions) => {
        if (!options?.filters?.some(filter => filter.extensions.includes('pdf'))) throw new Error('PDF filter missing')
        return { canceled: false, filePaths: [filePath] }
      }
    }, dialogPath)
    await page.evaluate(() => window.electron.ipcRenderer.send('mt::cmd-open-file'))
    await expect(page.locator('.tabs-container li.active')).toContainText('dialog.pdf')
    await expect(page.locator('.pdf-reader .textLayer').first()).toContainText('PDF reader first page')
    await page.screenshot({ path: path.resolve('../../.tools/pdf-reader-preview.png') })
    const brokenPath = path.join(directory, 'broken.pdf')
    writeFileSync(brokenPath, 'This is not a PDF')
    await page.evaluate((filePath) => window.electron.ipcRenderer.send('mt::open-file', filePath, {}), brokenPath)
    await expect(page.locator('.pdf-reader [role=alert]')).toContainText('无法打开 PDF')
    expect(errors).toEqual([])
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
