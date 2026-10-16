import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import type { PdfAnnotation } from '../../src/shared/pdf'
import { expectNoRendererErrors, launchWithDoc } from './helpers'

const original = process.env.YARKTEXT_TEST_PDF
const hash = (filename: string) => createHash('sha256').update(readFileSync(filename)).digest('hex')

test('real PDF readonly save, concurrent reads and seven annotation types', async() => {
  test.skip(!original, 'Set YARKTEXT_TEST_PDF; the original is never modified.')
  test.setTimeout(180000)
  if (!original) return
  const originalHash = hash(original)
  const directory = mkdtempSync(path.join(tmpdir(), 'yarktext-real-pdf-'))
  const filename = path.join(directory, 'readonly.pdf')
  const copy = path.join(directory, 'writable.pdf')
  writeFileSync(filename, readFileSync(original))
  chmodSync(filename, 0o444)
  const { app, page } = await launchWithDoc(filename, { suppressErrorDialog: true, preferences: { watcherUsePolling: true } })
  try {
    await expect(page.locator('.pdf-reader .textLayer').first()).not.toBeEmpty({ timeout: 30000 })
    for (const name of ['填写和签名', '编辑 PDF', '导出 PDF', '创建 PDF']) {
      const button = page.locator('.pdf-annotation-tools').getByRole('button', { name, exact: true })
      await expect(button).toBeVisible()
      await expect(button.locator('svg')).toHaveCount(1)
    }
    await expect(page.locator('.pdf-secondary-tools')).toHaveCount(0)
    await app.evaluate(({ dialog }, output) => {
      const g = globalThis as unknown as { pdfSaveMessages: string[] }
      g.pdfSaveMessages = []
      dialog.showMessageBox = async(...args: unknown[]) => {
        const options = args.length > 1 ? args[1] : args[0]
        g.pdfSaveMessages.push((options as { message: string }).message)
        return { response: 0, checkboxChecked: false }
      }
      dialog.showSaveDialog = async() => ({ canceled: false, filePath: output })
    }, copy)
    const changes: PdfAnnotation[] = ['Highlight', 'Underline', 'StrikeOut', 'Text', 'FreeText', 'Ink', 'Square'].map((kind, index) => ({
      id: `real-test-${index}`, page: 1, kind: kind as PdfAnnotation['kind'],
      rect: [40, 80 + index * 30, 180, 100 + index * 30],
      quadPoints: ['Highlight', 'Underline', 'StrikeOut'].includes(kind) ? [40, 100 + index * 30, 180, 100 + index * 30, 40, 80 + index * 30, 180, 80 + index * 30] : undefined,
      inkList: kind === 'Ink' ? [[40, 80 + index * 30, 100, 100 + index * 30, 180, 80 + index * 30]] : undefined,
      color: '#ed4145', opacity: 0.6, width: 3, text: `测试批注 ${kind}`, author: 'YarkText test', modified: new Date().toISOString()
    }))
    const appearance = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 280
      canvas.height = 40
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas unavailable')
      context.font = '18px sans-serif'
      context.fillText('测试题注', 2, 25)
      return canvas.toDataURL('image/png')
    })
    const caption = changes.find(item => item.kind === 'FreeText')
    if (caption) caption.appearance = appearance
    const result = await page.evaluate(async({ filename, changes }) => {
      const session = await window.electron.ipcRenderer.invoke('mt::pdf::open', filename)
      try {
        const sourceHash = await window.electron.ipcRenderer.invoke('mt::pdf::hash', session.token)
        return await window.electron.ipcRenderer.invoke('mt::pdf::save', { pathname: filename, sourceHash, annotations: changes, copy: false })
      } finally {
        await window.electron.ipcRenderer.invoke('mt::pdf::close', session.token)
      }
    }, { filename, changes })
    expect(result?.pathname).toBe(copy)
    expect(await app.evaluate(() => (globalThis as unknown as { pdfSaveMessages: string[] }).pdfSaveMessages)).toEqual(['PDF 文件为只读，无法覆盖保存 / PDF file is read-only'])
    expect(hash(filename)).toBe(originalHash)
    const saved = await PDFDocument.load(readFileSync(copy))
    expect(saved.getPageCount()).toBe((await PDFDocument.load(readFileSync(original))).getPageCount())
    expect(saved.getPage(0).node.Annots()?.size()).toBe(7)
    await page.evaluate(file => window.electron.ipcRenderer.send('mt::window::drop', [file]), copy)
    await expect(page.locator('.tabs-container li.active')).toContainText('writable.pdf')
    await expect(page.locator('.pdf-reader .textLayer').first()).not.toBeEmpty()
    for (let iteration = 0; iteration < 5; iteration++) {
      const sourceHash = hash(copy)
      const outcome = await page.evaluate(async({ pathname, sourceHash }) => {
        const session = await window.electron.ipcRenderer.invoke('mt::pdf::open', pathname)
        try {
          const reads = Array.from({ length: 12 }, (_, index) => window.electron.ipcRenderer.invoke('mt::pdf::read-range', session.token, index * 65536, (index + 1) * 65536))
          const hashes = Array.from({ length: 3 }, () => window.electron.ipcRenderer.invoke('mt::pdf::hash', session.token))
          const save = window.electron.ipcRenderer.invoke('mt::pdf::save', { pathname, sourceHash, annotations: [], copy: false })
          const values = await Promise.all([...reads, ...hashes, save])
          return values.length
        } finally {
          await window.electron.ipcRenderer.invoke('mt::pdf::close', session.token)
        }
      }, { pathname: copy, sourceHash })
      expect(outcome).toBe(16)
      expect(hash(copy)).toBe(sourceHash)
    }
    expect(await app.evaluate(() => (globalThis as unknown as { pdfSaveMessages: string[] }).pdfSaveMessages)).toHaveLength(1)
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())).catch(() => {})
    await app.close()
    chmodSync(filename, 0o666)
    rmSync(directory, { recursive: true, force: true })
    expect(hash(original)).toBe(originalHash)
  }
})
