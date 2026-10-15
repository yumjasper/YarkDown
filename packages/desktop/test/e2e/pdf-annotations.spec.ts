import { expect, test } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PDFArray, PDFDict, PDFDocument, PDFName, type PDFNumber } from 'pdf-lib'
import type { SaveDialogOptions } from 'electron'
import { expectNoRendererErrors, launchWithDoc, sendIpcToRenderer } from './helpers'

test('creates standard annotations, keeps drafts across tabs, roundtrips comments and protects external edits', async() => {
  test.setTimeout(90000)
  const directory = mkdtempSync(path.join(tmpdir(), 'yarktext-pdf-annotations-'))
  const filename = path.join(directory, 'source.pdf')
  const copy = path.join(directory, 'annotated.pdf')
  const doc = await PDFDocument.create()
  doc
    .addPage([612, 792])
    .drawText('PDF text for highlighting and comments', { x: 50, y: 700, size: 20 })
  const original = Buffer.from(await doc.save())
  writeFileSync(filename, original)
  const { app, page } = await launchWithDoc(filename, { suppressErrorDialog: true })
  const rendererErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    for (const arg of message.args())
      void arg
        .evaluate((value) => {
          const event = value as ErrorEvent
          return { message: event.message, filename: event.filename, type: event.type }
        })
        .then((value) => rendererErrors.push(value.message || message.text()))
        .catch(() => {})
  })
  try {
    await expect(page.locator('.pdf-reader .textLayer')).toContainText('PDF text for highlighting')
    const selectText = () =>
      page
        .locator('.pdf-reader .textLayer span')
        .first()
        .evaluate((element) => {
          const range = document.createRange()
          range.selectNodeContents(element)
          window.getSelection()?.removeAllRanges()
          window.getSelection()?.addRange(range)
        })
    for (const kind of ['高亮', '下划线', '删除线']) {
      if (kind === '下划线') await page.getByRole('button', { name: '顺时针旋转' }).click()
      await selectText()
      await page
        .locator('.pdf-annotation-tools')
        .getByRole('button', { name: kind, exact: true })
        .click()
      await expect(page.locator('.pdf-draft-layer')).toHaveCount(1)
      await page.getByRole('textbox', { name: '批注正文', exact: true }).fill(`${kind}的中文评论`)
      await page.getByRole('button', { name: '应用修改' }).click()
      if (kind === '下划线')
        for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '顺时针旋转' }).click()
    }
    const clickPointTool = async(tool: string, x: number, y: number) => {
      await page.getByRole('button', { name: tool, exact: true }).click()
      const bounds = await page.locator('.pdf-reader .canvasWrapper').first().boundingBox()
      if (!bounds) throw new Error('PDF page not visible')
      await page.mouse.click(bounds.x + x, bounds.y + y)
    }
    await clickPointTool('便签评论', 100, 150)
    await page
      .getByRole('textbox', { name: '批注正文', exact: true })
      .fill('这是一条可以共享的中文评论')
    await page.getByRole('textbox', { name: '修改批注作者' }).fill('作者甲')
    await page.getByRole('button', { name: '应用修改' }).click()
    await clickPointTool('文本题注', 100, 210)
    await page.getByRole('textbox', { name: '批注正文', exact: true }).fill('图 1：批注互通验证')
    await page.getByLabel('修改批注颜色').fill('#1f2937')
    await page.getByRole('button', { name: '应用修改' }).click()
    for (const tool of ['矩形', '高亮']) {
      if (tool === '高亮') {
        await page.locator('.pdf-marker-settings summary').click()
        await page.getByRole('checkbox', { name: '仅文本突出显示' }).uncheck()
        await page.locator('.pdf-marker-settings summary').click()
      }
      await page.getByRole('button', { name: tool, exact: true }).click()
      const bounds = await page.locator('.pdf-reader .canvasWrapper').first().boundingBox()
      if (!bounds) throw new Error('PDF page not visible')
      await page.mouse.move(bounds.x + 80, bounds.y + 280)
      await page.mouse.down()
      await page.mouse.move(bounds.x + 130, bounds.y + 300, { steps: 5 })
      await page.mouse.move(bounds.x + 190, bounds.y + 280, { steps: 5 })
      await page.mouse.up()
    }
    await expect(page.locator('.pdf-annotation-item')).toHaveCount(7)
    await expect(page.locator('.tabs-container li.active')).toHaveClass(/unsaved/)
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, '# Another tab')
    await page.locator('.tabs-container li').filter({ hasText: 'source.pdf' }).click()
    await expect(page.getByRole('button', { name: /批注列表/ })).toHaveAccessibleName('批注列表 (7)')
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async(_window, _options?: SaveDialogOptions) => ({
        canceled: false,
        filePath
      })
    }, copy)
    await page.getByRole('button', { name: '保存副本', exact: true }).click()
    await expect(page.locator('.tabs-container li.active')).toContainText('annotated.pdf')
    await page.getByRole('button', { name: /批注列表/ }).click()
    await expect(page.locator('.pdf-annotation-item')).toHaveCount(7)
    await expect(page.locator('.pdf-annotation-sidebar')).toContainText(
      '这是一条可以共享的中文评论'
    )
    await expect(page.locator('.pdf-annotation-sidebar')).toContainText('图 1：批注互通验证')
    expect(readFileSync(filename)).toEqual(original)
    const exported = await PDFDocument.load(readFileSync(copy))
    const annotationObjects =
      exported
        .getPage(0)
        .node.Annots()
        ?.asArray()
        .map((ref) => exported.context.lookup(ref, PDFDict)) || []
    const quadrilaterals = ['Highlight', 'Underline'].map((kind) =>
      annotationObjects
        .find((dict) => dict.get(PDFName.of('Subtype')) === PDFName.of(kind))
        ?.lookup(PDFName.of('QuadPoints'), PDFArray)
        .asArray()
        .map((value) => (value as PDFNumber).asNumber())
    )
    expect(quadrilaterals[0]?.length).toBe(quadrilaterals[1]?.length)
    quadrilaterals[0]?.forEach((value, index) =>
      expect(value).toBeCloseTo(quadrilaterals[1]?.[index] || 0, 0)
    )
    if (process.env.PDF_INTEROP_PYTHON === '1') {
      const independentlyParsed = JSON.parse(
        execFileSync(
          'python',
          [
            '-c',
            'import json,sys,pymupdf; d=pymupdf.open(sys.argv[1]); print(json.dumps([{"type":a.type[1],"content":a.info["content"],"author":a.info["title"],"appearance": bool(d.xref_get_key(a.xref,"AP")[0]!="null")} for p in d for a in p.annots()],ensure_ascii=True))',
            copy
          ],
          { encoding: 'utf8' }
        )
      ) as Array<{ type: string; content: string; author: string; appearance: boolean }>
      expect(independentlyParsed.map((item) => item.type).sort()).toEqual(
        ['Highlight', 'Underline', 'StrikeOut', 'Text', 'FreeText', 'Highlight', 'Square'].sort()
      )
      expect(independentlyParsed.find((item) => item.type === 'Text')).toMatchObject({
        content: '这是一条可以共享的中文评论',
        author: '作者甲'
      })
      expect(independentlyParsed.every((item) => item.appearance)).toBe(true)
    }
    await page.locator('.pdf-annotation-item').filter({ hasText: '便签评论' }).click()
    await page.getByRole('textbox', { name: '批注正文', exact: true }).fill('往返修改后的评论')
    await page.getByRole('button', { name: '应用修改' }).click()
    await page.getByRole('button', { name: '保存批注', exact: true }).click()
    await expect(page.locator('.tabs-container li.active')).not.toHaveClass(/unsaved/)
    await expect(page.locator('.pdf-annotation-sidebar')).toContainText('往返修改后的评论')
    await page.locator('.pdf-annotation-item').filter({ hasText: '下划线' }).click()
    await page.getByRole('button', { name: '删除批注' }).click()
    await page.getByRole('button', { name: '保存批注', exact: true }).click()
    await expect(page.locator('.pdf-annotation-item')).toHaveCount(6)
    await expect(page.locator('.tabs-container li.active')).not.toHaveClass(/unsaved/)
    await expect(page.locator('.pdf-reader .textLayer')).toContainText('PDF text for highlighting')
    await expect(page.getByRole('button', { name: /批注列表/ })).toHaveAccessibleName('批注列表 (6)')
    await expect
      .poll(() =>
        page
          .locator('.pdf-reader .annotationLayer img')
          .evaluateAll((images) =>
            images.every(
              (image) =>
                (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
            )
          )
      )
      .toBe(true)
    await page.screenshot({ path: path.resolve('../../.tools/pdf-annotations-preview.png') })
    await clickPointTool('便签评论', 200, 180)
    const external = Buffer.from(await doc.save())
    writeFileSync(copy, external)
    await page.getByRole('button', { name: '保存批注', exact: true }).click()
    await expect(page.getByText(/PDF changed on disk/)).toBeVisible()
    expect(readFileSync(copy)).toEqual(external)
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async() => ({ response: 2, checkboxChecked: false })
    })
    await sendIpcToRenderer(app, 'mt::editor-close-tab')
    await expect(page.locator('.tabs-container li.active')).toContainText('annotated.pdf')
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async() => ({ response: 1, checkboxChecked: false })
    })
    await sendIpcToRenderer(app, 'mt::editor-close-tab')
    await expect(
      page.locator('.tabs-container li').filter({ hasText: 'annotated.pdf' })
    ).toHaveCount(0)
    await expectNoRendererErrors(app)
    expect(rendererErrors).toEqual([])
  } finally {
    await app
      .evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((window) => window.destroy())
      )
      .catch(() => {})
    await app.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
