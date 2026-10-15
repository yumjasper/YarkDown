import { test, expect } from '@playwright/test'
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PDFDocument, PDFDict, PDFHexString, PDFName } from 'pdf-lib'
import { launchWithDoc, expectNoRendererErrors } from './helpers'

test('a locked Windows PDF can be saved as a copy without losing the original or annotation', async() => {
  test.skip(process.platform !== 'win32', 'Windows replacement lock semantics')
  test.setTimeout(60000)
  const directory = await mkdtemp(path.join(tmpdir(), 'yarktext-pdf-locked-'))
  const filename = path.join(directory, '锁定的 PDF.pdf'),
    copy = path.join(directory, '批注副本.pdf')
  const pdf = await PDFDocument.create()
  pdf.addPage([612, 792]).drawText('Original PDF')
  const original = process.env.PDF_SAVE_FIXTURE
    ? await readFile(process.env.PDF_SAVE_FIXTURE)
    : Buffer.from(await pdf.save())
  await writeFile(filename, original)
  const { app, page } = await launchWithDoc(filename, { suppressErrorDialog: true })
  let lock: Awaited<ReturnType<typeof open>> | undefined
  try {
    await expect(page.getByRole('button', { name: '便签评论', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: '便签评论', exact: true }).click()
    const bounds = await page.locator('.pdf-reader .canvasWrapper').first().boundingBox()
    if (!bounds) throw new Error('Missing PDF canvas')
    await page.mouse.click(bounds.x + 120, bounds.y + 140)
    await page
      .getByRole('textbox', { name: '批注正文', exact: true })
      .fill('被占用时也能保留的批注')
    await page.getByRole('button', { name: '应用修改', exact: true }).click()
    await expect(page.locator('.pdf-action-feedback')).toContainText('修改已应用')
    await expect(page.getByRole('button', { name: '应用修改', exact: true })).toHaveText('✓ 已应用')
    await app.evaluate(({ dialog }, target) => {
      dialog.showMessageBox = async() => {
        ;(globalThis as unknown as { pdfLockPrompted: boolean }).pdfLockPrompted = true
        return { response: 0, checkboxChecked: false }
      }
      dialog.showSaveDialog = async() => ({ canceled: false, filePath: target })
    }, copy)
    lock = await open(filename, 'r')
    await page.getByRole('button', { name: '保存批注', exact: true }).click()
    await expect(page.locator('.tabs-container li.active')).toContainText('批注副本.pdf')
    expect(
      await app.evaluate(
        () => (globalThis as unknown as { pdfLockPrompted: boolean }).pdfLockPrompted
      )
    ).toBe(true)
    expect(await readFile(filename)).toEqual(original)
    const saved = await PDFDocument.load(await readFile(copy))
    const annotations = saved.getPage(0).node.Annots()?.asArray() || []
    expect(annotations.some(ref => {
      const annotation = saved.context.lookup(ref, PDFDict)
      const text = annotation.lookupMaybe(PDFName.of('Contents'), PDFHexString)
      return text?.decodeText() === '被占用时也能保留的批注'
    })).toBe(true)
    await expectNoRendererErrors(app)
  } finally {
    await lock?.close()
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((win) => win.destroy())
    )
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})
