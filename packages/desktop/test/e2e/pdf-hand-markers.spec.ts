import { expect, test } from '@playwright/test'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PDFDocument, PDFDict, PDFArray, PDFName } from 'pdf-lib'
import { launchWithDoc, expectNoRendererErrors } from './helpers'

test('hand tool pans pages and marker colors coexist with independent remembered settings', async() => {
  test.setTimeout(90000)
  const directory = await mkdtemp(path.join(tmpdir(), 'yarktext-hand-markers-'))
  const filename = path.join(directory, 'markers.pdf')
  const pdf = await PDFDocument.create()
  for (let i = 0; i < 3; i++) pdf.addPage([612, 792]).drawText('Multiple marker colors can coexist on this page', { x: 45, y: 700, size: 20 })
  await writeFile(filename, await pdf.save())
  const options = { suppressErrorDialog: true, userDataDir: path.join(directory, 'profile') }
  let { app, page } = await launchWithDoc(filename, options)
  try {
    await expect(page.getByRole('button', { name: '拖拽阅读', exact: true })).toBeEnabled()
    await page.getByRole('combobox', { name: '缩放', exact: true }).selectOption('2')
    await page.getByRole('button', { name: '拖拽阅读', exact: true }).click()
    await expect(page.getByRole('button', { name: '拖拽阅读', exact: true })).toHaveAttribute('aria-pressed', 'true')
    const scroll = page.locator('.pdf-scroll')
    await scroll.evaluate(element => element.scrollTo(40, 150))
    const before = await scroll.evaluate(element => ({ x: element.scrollLeft, y: element.scrollTop }))
    const box = await scroll.boundingBox()
    if (!box) throw new Error('Missing PDF viewport')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 - 70, box.y + box.height / 2 - 110, { steps: 6 })
    await page.mouse.up()
    const after = await scroll.evaluate(element => ({ x: element.scrollLeft, y: element.scrollTop }))
    expect(after.x - before.x).toBeGreaterThan(40)
    expect(after.y - before.y).toBeGreaterThan(80)
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('')
    await page.getByRole('combobox', { name: '缩放', exact: true }).selectOption('page-width')
    await page.getByRole('button', { name: '选择', exact: true }).click()
    await scroll.evaluate(element => element.scrollTo(0, 0))
    for (const [index, color] of ['#fff100', '#f29bd4'].entries()) {
      await page.locator('.textLayer span').first().evaluate((element, index) => {
        const range = document.createRange(), text = element.firstChild
        if (!text) throw new Error('Missing PDF text')
        range.setStart(text, index * 9); range.setEnd(text, index * 9 + 8)
        window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range)
      }, index)
      await page.getByRole('button', { name: `使用记号笔 ${color}`, exact: true }).click()
    }
    await expect(page.locator('.pdf-annotation-item')).toHaveCount(2)
    await page.getByRole('button', { name: '使用记号笔 #fff100', exact: true }).click()
    await page.locator('.pdf-marker-settings summary').click()
    await page.getByRole('slider', { name: '记号笔粗细', exact: true }).fill('24')
    await page.getByRole('checkbox', { name: '仅文本突出显示', exact: true }).uncheck()
    await page.getByRole('button', { name: '使用记号笔 #f29bd4', exact: true }).click()
    await expect(page.getByRole('slider', { name: '记号笔粗细', exact: true })).toHaveValue('14')
    await page.getByRole('slider', { name: '记号笔粗细', exact: true }).fill('18')
    await page.getByRole('button', { name: '使用记号笔 #fff100', exact: true }).click()
    await expect(page.getByRole('slider', { name: '记号笔粗细', exact: true })).toHaveValue('24')
    await expect(page.getByRole('checkbox', { name: '仅文本突出显示', exact: true })).not.toBeChecked()
    await page.locator('.pdf-marker-settings summary').click()
    await page.getByRole('button', { name: '保存批注', exact: true }).click()
    await expect(page.locator('.pdf-action-feedback')).toContainText('批注已保存')
    const saved = await PDFDocument.load(await readFile(filename))
    const annotations = saved.getPage(0).node.Annots()?.asArray() || []
    const colors = annotations.map(ref => saved.context.lookup(ref, PDFDict).lookup(PDFName.of('C'), PDFArray).asArray().map(n => Number(n.toString())))
    expect(colors).toEqual(expect.arrayContaining([[1, 241 / 255, 0], [242 / 255, 155 / 255, 212 / 255]]))
    await app.close()
    ;({ app, page } = await launchWithDoc(filename, options))
    await expect(page.getByRole('button', { name: '使用记号笔 #fff100', exact: true })).toBeEnabled({ timeout: 30000 })
    await page.getByRole('button', { name: '使用记号笔 #fff100', exact: true }).click()
    await page.locator('.pdf-marker-settings summary').click()
    await expect(page.getByRole('slider', { name: '记号笔粗细', exact: true })).toHaveValue('24')
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})
