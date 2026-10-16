import { test, expect } from '@playwright/test'
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { launchElectron, expectNoRendererErrors } from './helpers'

test('direct PDF text editing and six-marker preference migration', async() => {
  test.setTimeout(120000)
  const directory = mkdtempSync(path.join(tmpdir(), 'yarktext-advanced-test-'))
  const input = path.join(directory, 'input.pdf')
  const output = path.join(directory, 'edited.pdf')
  const document = await PDFDocument.create()
  const pdfPage = document.addPage([595, 842])
  const font = await document.embedFont(StandardFonts.Helvetica)
  pdfPage.drawText('Original long paragraph for replacement testing.', { x: 40, y: 760, size: 14, font })
  writeFileSync(input, await document.save())
  const { app, page } = await launchElectron([], { suppressErrorDialog: true })
  try {
    await page.evaluate(file => {
      localStorage.setItem('pdf-marker-presets', JSON.stringify(Object.fromEntries(Array.from({ length: 90 }, (_, index) => [`#${(index + 1).toString(16).padStart(6, '0')}`, { width: 14, textOnly: true }]))))
      localStorage.setItem('pdf-marker-color', '#abcdef')
      window.electron.ipcRenderer.send('mt::window::drop', [file])
    }, input)
    await expect(page.locator('.pdf-reader .textLayer').first()).toContainText('Original long paragraph')
    await expect(page.locator('.pdf-marker-presets button')).toHaveCount(6)
    for (const color of ['#aabbcc', '#bbccdd', '#ccddee']) {
      await page.getByLabel('批注颜色', { exact: true }).fill(color)
      await expect(page.locator('.pdf-marker-presets button')).toHaveCount(6)
    }
    expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('pdf-marker-presets') || '{}')).length)).toBe(6)
    const workspace = page.getByRole('region', { name: 'PDF 工具工作区' })
    await workspace.getByRole('button', { name: '编辑 PDF', exact: true }).click()
    await expect(page.locator('.append-tools')).not.toHaveAttribute('open', '')
    await expectNoRendererErrors(app)
    const block = page.getByRole('button', { name: '编辑正文: Original long paragraph for replacement testing.' })
    await expect(block).toBeVisible({ timeout: 30000 })
    await page.getByLabel('缩放', { exact: true }).selectOption('1.5')
    await block.click()
    const editor = page.getByRole('form', { name: '正文编辑' })
    await expect(editor.getByLabel('修改原正文')).toHaveValue('Original long paragraph for replacement testing.')
    await editor.getByLabel('修改原正文').fill('Rewritten 中文 paragraph.')
    await editor.getByLabel('字号 (pt)').fill('10')
    await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async() => ({ canceled: true, filePath: '' }) })
    await editor.getByRole('button', { name: '保存修改…' }).click()
    await expect(editor.getByRole('status')).toContainText('已取消')
    await expect(editor.getByLabel('修改原正文')).toHaveValue('Rewritten 中文 paragraph.')

    await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async() => ({ canceled: false, filePath: file }) }, output)
    await editor.getByLabel('修改原正文').press('Control+Enter')
    await expect.poll(() => existsSync(output), { timeout: 30000 }).toBe(true)
    await expect(page.locator('.pdf-reader .textLayer').first()).toContainText('Rewritten', { timeout: 15000 })
    await expect(page.locator('.pdf-reader .textLayer').first()).not.toContainText('Original long paragraph')
    await expect(page.locator('.pdf-marker-presets button')).toHaveCount(6)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
