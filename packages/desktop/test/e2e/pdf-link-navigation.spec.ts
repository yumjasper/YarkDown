import { expect, test } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib'
import { expectNoRendererErrors, launchWithDoc } from './helpers'

test('PDF contents links and bookmarks navigate inside the reader while web links remain external', async() => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yarktext-pdf-links-'))
  const filename = path.join(directory, 'contents.pdf')
  const pdf = await PDFDocument.create()
  const first = pdf.addPage(), second = pdf.addPage()
  first.drawText('Contents: chapter two', { x: 50, y: 700 })
  second.drawText('Chapter two destination', { x: 50, y: 700 })
  pdf.catalog.set(PDFName.of('Dests'), pdf.context.obj({ chapterTwo: [second.ref, 'Fit'] }))
  const actions = [
    { S: 'GoTo', D: [second.ref, 'Fit'] },
    { S: 'GoTo', D: PDFString.of('chapterTwo') },
    { S: 'Named', N: 'NextPage' },
    { S: 'URI', URI: PDFString.of('https://example.com/reference') }
  ]
  first.node.set(PDFName.of('Annots'), pdf.context.obj(actions.map((action, index) =>
    pdf.context.register(pdf.context.obj({
      Type: 'Annot', Subtype: 'Link', Rect: [50, 640 - index * 50, 260, 670 - index * 50],
      Border: [0, 0, 0], A: action
    }))
  )))
  const outline = pdf.context.obj({ Type: 'Outlines', Count: 1 })
  const outlineRef = pdf.context.register(outline)
  const bookmark = pdf.context.register(pdf.context.obj({
    Title: PDFHexString.fromText('第二章'), Parent: outlineRef, Dest: [second.ref, 'Fit']
  }))
  outline.set(PDFName.of('First'), bookmark)
  outline.set(PDFName.of('Last'), bookmark)
  pdf.catalog.set(PDFName.of('Outlines'), outlineRef)
  await writeFile(filename, await pdf.save())
  const { app, page } = await launchWithDoc(filename, { suppressErrorDialog: true })
  try {
    await expect(page.locator('.pdf-reader .textLayer').first()).toContainText('Contents: chapter two')
    await app.evaluate(({ shell }) => {
      const state = globalThis as unknown as { pdfLinkCalls: string[] }
      state.pdfLinkCalls = []
      shell.openExternal = async url => { state.pdfLinkCalls.push(url) }
    })
    const calls = () => app.evaluate(() => (globalThis as unknown as { pdfLinkCalls: string[] }).pdfLinkCalls)
    const initialUrl = page.url()
    const number = page.getByRole('spinbutton', { name: '页码' })
    const links = page.locator('.pdfViewer .page[data-page-number="1"] .linkAnnotation a')
    await expect(links).toHaveCount(4)
    for (let index = 0; index < 3; index++) {
      await links.nth(index).click()
      await expect(number).toHaveValue('2')
      await expect(page.locator('.pdfViewer .page[data-page-number="2"] canvas')).toBeVisible()
      expect(await calls()).toEqual([])
      expect(page.url()).toBe(initialUrl)
      await number.fill('1')
      await number.press('Enter')
      await expect(number).toHaveValue('1')
    }
    await links.nth(3).click()
    await expect.poll(calls).toEqual(['https://example.com/reference'])
    await expect(number).toHaveValue('1')
    const bookmarkLabel = page.locator('.pdf-navigation .el-tree-node__label').getByText('第二章', { exact: true })
    if (!await bookmarkLabel.isVisible()) await page.getByRole('button', { name: '目录 / 缩略图', exact: true }).click()
    await bookmarkLabel.click()
    await expect(number).toHaveValue('2')
    expect(await calls()).toEqual(['https://example.com/reference'])
    expect(page.url()).toBe(initialUrl)
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})
