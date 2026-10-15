import { test, expect } from '@playwright/test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PDFDocument, PDFHexString, PDFName } from 'pdf-lib'
import { launchElectron, expectNoRendererErrors, clickMenuById, sendIpcToRenderer } from './helpers'

test('selection menu, marker settings, captions, navigation and native printing', async() => {
  test.setTimeout(90000)
  const directory = mkdtempSync(path.join(tmpdir(), 'yarktext-pdf-tools-'))
  const filename = path.join(directory, 'tools 中文.pdf')
  const doc = await PDFDocument.create()
  doc
    .addPage([612, 792])
    .drawText('Select this text for the floating annotation menu', { x: 50, y: 700, size: 18 })
  const second = doc.addPage([612, 792])
  second.drawText('Chapter two', { x: 50, y: 700, size: 20 })
  const outline = doc.context.obj({ Type: 'Outlines', Count: 1 })
  const outlineRef = doc.context.register(outline)
  const entry = doc.context.register(
    doc.context.obj({
      Title: PDFHexString.fromText('第二章'),
      Parent: outlineRef,
      Dest: [second.ref, 'Fit']
    })
  )
  outline.set(PDFName.of('First'), entry)
  outline.set(PDFName.of('Last'), entry)
  doc.catalog.set(PDFName.of('Outlines'), outlineRef)
  writeFileSync(filename, await doc.save())
  const { app, page } = await launchElectron([], { suppressErrorDialog: true })
  try {
    await page.evaluate(() => {
      const state = globalThis as unknown as { pdfProgress: number[] }
      state.pdfProgress = []
      const observer = new MutationObserver(() => {
        const bar = document.querySelector<HTMLProgressElement>('.pdf-message progress')
        if (bar) state.pdfProgress.push(bar.value)
      })
      observer.observe(document.body, { childList: true, subtree: true, attributes: true })
      ;(globalThis as unknown as { stopPdfProgress: () => void }).stopPdfProgress = () =>
        observer.disconnect()
    })
    await page.evaluate(
      (pathname) => window.electron.ipcRenderer.send('mt::window::drop', [pathname]),
      filename
    )
    await expect(page.locator('.pdf-reader .textLayer').first()).toContainText('Select this text')
    const progress = await page.evaluate(() => {
      ;(globalThis as unknown as { stopPdfProgress: () => void }).stopPdfProgress()
      return (globalThis as unknown as { pdfProgress: number[] }).pdfProgress
    })
    expect(progress.length).toBeGreaterThan(0)
    expect(progress.some((value) => value > 0)).toBe(true)
    await expect(page.getByRole('button', { name: '高亮', exact: true })).toBeEnabled()
    await expect(page.getByRole('button', { name: '手绘', exact: true })).toHaveCount(0)
    const selectText = async() => {
      await page
        .locator('.textLayer span')
        .first()
        .evaluate((element) => {
          const text = element.firstChild
          if (!text) throw new Error('Missing text')
          const range = document.createRange()
          range.setStart(text, 0)
          range.setEnd(text, 16)
          const selection = window.getSelection()
          selection?.removeAllRanges()
          selection?.addRange(range)
        })
      await expect(page.getByRole('toolbar', { name: '选区批注菜单' })).toBeVisible()
    }
    await selectText()
    await page.screenshot({ path: '../../.tools/pdf-selection-preview.png' })
    await page
      .getByRole('toolbar', { name: '选区批注菜单' })
      .getByRole('button', { name: '复制', exact: true })
      .click()
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('Select this text')
    await app.evaluate(({ shell }) => {
      shell.openExternal = async url => { (globalThis as unknown as { pdfExternalUrl: string }).pdfExternalUrl = url }
    })
    await selectText()
    await page.locator('.pdf-selection-more summary').click()
    await page.getByRole('button', { name: '在线翻译选区', exact: true }).click()
    await expect.poll(() => app.evaluate(() => (globalThis as unknown as { pdfExternalUrl: string }).pdfExternalUrl)).toContain('text=Select%20this%20text')
    await selectText()
    await page
      .getByRole('toolbar', { name: '选区批注菜单' })
      .getByRole('button', { name: '搜索', exact: true })
      .click()
    await expect(page.getByRole('searchbox', { name: '搜索 PDF 文字' })).toHaveValue(
      'Select this text'
    )
    await selectText()
    await page.getByRole('button', { name: '添加注释', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '批注正文', exact: true })).toBeFocused()
    await page.getByRole('textbox', { name: '批注正文', exact: true }).fill('选区评论')
    await page.getByRole('button', { name: '应用修改' }).click()
    await expect(page.locator('.pdf-annotation-item')).toContainText('选区评论')
    await page.getByRole('button', { name: '橡皮擦', exact: true }).click()
    await page.locator('.pdf-draft-layer polygon').first().click()
    await expect(page.locator('.pdf-annotation-item')).toHaveCount(0)
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(page.locator('.pdf-annotation-item')).toHaveCount(1)
    await page.getByRole('button', { name: '选择', exact: true }).click()
    await page.locator('.pdf-marker-settings summary').click()
    await page.getByLabel('记号笔颜色 #78ed53').click()
    await page.getByRole('slider', { name: '记号笔粗细' }).fill('22')
    await expect(page.getByLabel('批注颜色', { exact: true })).toHaveValue('#78ed53')
    await page.locator('.pdf-marker-settings summary').click()
    await page.getByRole('button', { name: '文本题注', exact: true }).click()
    const bounds = await page.locator('.canvasWrapper').first().boundingBox()
    if (!bounds) throw new Error('Missing page')
    await page.mouse.click(bounds.x + 100, bounds.y + 240)
    await page.getByRole('textbox', { name: '直接编辑题注' }).fill('中文题注直接输入')
    await page.getByRole('spinbutton', { name: '题注字号' }).fill('24')
    await page.getByRole('spinbutton', { name: '题注字号' }).press('Tab')
    await page.getByRole('spinbutton', { name: '题注字间距' }).fill('2')
    await page.getByRole('spinbutton', { name: '题注字间距' }).press('Tab')
    await expect(
      page.locator('.pdf-annotation-item').filter({ hasText: '文本题注' })
    ).toContainText('中文题注直接输入')
    const move = await page.getByRole('button', { name: '移动题注', exact: true }).boundingBox()
    if (!move) throw new Error('Missing move handle')
    const captionImage = page.locator('.pdf-draft-layer image')
    const position = await captionImage.getAttribute('transform')
    await page.mouse.move(move.x + 8, move.y + 8)
    await page.mouse.down()
    await page.mouse.move(move.x + 55, move.y + 35, { steps: 4 })
    await page.mouse.up()
    await expect(captionImage).not.toHaveAttribute('transform', position || '')
    const resize = await page
      .getByRole('button', { name: '调整题注宽度', exact: true })
      .boundingBox()
    if (!resize) throw new Error('Missing resize handle')
    const width = await captionImage.getAttribute('width')
    await page.mouse.move(resize.x + 8, resize.y + 8)
    await page.mouse.down()
    await page.mouse.move(resize.x + 70, resize.y + 8, { steps: 4 })
    await page.mouse.up()
    await expect(captionImage).not.toHaveAttribute('width', width || '')
    await page.getByRole('button', { name: '保存批注', exact: true }).click()
    await expect(page.locator('.tabs-container li.active')).not.toHaveClass(/unsaved/)
    await page.locator('.pdf-annotation-item').filter({ hasText: '文本题注' }).click()
    await expect(page.getByRole('spinbutton', { name: '题注字号' })).toHaveValue('24')
    await expect(page.getByRole('spinbutton', { name: '题注字间距' })).toHaveValue('2')
    await page.keyboard.press('Escape')
    await expect(page.locator('.side-bar .pdf-navigation')).toBeVisible()
    await expect(page.locator('.pdf-reader .pdf-navigation')).toHaveCount(0)
    await page.locator('.side-bar .pdf-navigation').getByText('第二章', { exact: true }).click()
    await expect(page.getByRole('spinbutton', { name: '页码' })).toHaveValue('2')
    await page.getByRole('button', { name: 'PDF 缩略图', exact: true }).click()
    await expect(page.locator('.pdf-thumbnail.current')).toHaveAttribute('data-render-state', 'ready')
    const ink = await page.locator('.pdf-thumbnail.current canvas').evaluate(element => {
      const canvas = element as HTMLCanvasElement
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      let count = 0
      for (let i = 0; i < data.length; i += 4) if (data[i + 3] && data[i] < 230) count++
      return count
    })
    expect(ink).toBeGreaterThan(10)
    await page.getByRole('button', { name: '转到页码 1', exact: true }).click()
    await expect(page.getByRole('spinbutton', { name: '页码' })).toHaveValue('1')
    await page.getByRole('combobox', { name: '页面布局' }).selectOption('spread')
    await expect(page.locator('.pdfViewer .spread')).toHaveCount(1)
    await page.getByRole('combobox', { name: '页面布局' }).selectOption('continuous')
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, '# Shared sidebar\n\n## Markdown outline')
    await expect(page.locator('.side-bar-toc')).toContainText('Markdown outline')
    await expect(page.getByRole('button', { name: 'PDF 缩略图', exact: true })).toHaveCount(0)
    await page.locator('.tabs-container li').filter({ hasText: 'tools 中文.pdf' }).click()
    await expect(page.locator('.side-bar .pdf-navigation .el-tree')).toBeVisible()
    await page.locator('.side-bar .pdf-navigation').getByText('第二章', { exact: true }).click()
    await expect(page.getByRole('spinbutton', { name: '页码' })).toHaveValue('2')
    await page.getByRole('button', { name: 'PDF 缩略图', exact: true }).click()
    await page.screenshot({ path: '../../.tools/pdf-sidebar-preview.png' })
    await app.evaluate(({ app }) => {
      app.on('web-contents-created', (_event, contents) => {
        contents.print = (_options, callback) => {
          const state = globalThis as unknown as { pdfPrintedUrl: string; pdfPrintCount?: number }
          state.pdfPrintedUrl = contents.getURL()
          state.pdfPrintCount = (state.pdfPrintCount || 0) + 1
          callback?.(true, '')
        }
      })
    })
    await page.getByRole('button', { name: '打印', exact: true }).click()
    await expect
      .poll(
        () =>
          app.evaluate(
            () => (globalThis as unknown as { pdfPrintedUrl?: string }).pdfPrintedUrl || ''
          ),
        { timeout: 15000 }
      )
      .toContain('tools%20')
    await expect(page.getByRole('button', { name: '打印', exact: true })).toBeEnabled()
    await clickMenuById(app, 'printMenuEntry')
    await expect.poll(() => app.evaluate(() => (globalThis as unknown as { pdfPrintCount: number }).pdfPrintCount)).toBe(2)
    await expect(page.locator('.export-dialog')).not.toBeVisible()
    await expect(page.locator('.pdf-annotation-tools').getByRole('button', { name: '下划线', exact: true }).locator('svg')).toBeVisible()
    await expectNoRendererErrors(app)
    await page.screenshot({ path: '../../.tools/pdf-tools-preview.png' })
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((window) => window.destroy())
    )
    await app.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
