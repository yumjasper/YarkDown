import { test, expect } from '@playwright/test'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { launchWithDoc, expectNoRendererErrors } from './helpers'

test('real PDF bookmarks reach visible pages and thumbnails contain rendered pixels', async() => {
  const filename = process.env.PDF_NAVIGATION_FIXTURE
  test.skip(!filename, 'Set PDF_NAVIGATION_FIXTURE to a PDF with bookmarks and a nonblank cover')
  if (!filename) return
  test.setTimeout(120000)
  const { app, page } = await launchWithDoc(filename, { suppressErrorDialog: true })
  try {
    await expect(page.locator('.side-bar .el-tree')).toBeVisible({ timeout: 30000 })
    const targets = await page.evaluate(async() => {
      const pinia = (
        document.querySelector('#app') as unknown as {
          __vue_app__: {
            config: {
              globalProperties: { $pinia: { _s: Map<string, { document: PDFDocumentProxy }> } }
            }
          }
        }
      ).__vue_app__.config.globalProperties.$pinia
      const pdf = pinia._s.get('pdfNavigation')!.document
      type Entry = { title: string; dest: string | unknown[] | null; items: Entry[] }
      const flat: Entry[] = []
      const flatten = (items: Entry[]) => {
        for (const item of items) {
          if (item.dest) flat.push(item)
          flatten(item.items)
        }
      }
      flatten((await pdf.getOutline()) || [])
      const unique = flat.filter(
        (entry) => flat.filter((other) => other.title.trim() === entry.title.trim()).length === 1
      )
      const chosen = [
        unique[0],
        unique[Math.min(5, unique.length - 1)],
        unique[Math.floor(unique.length / 2)],
        unique.at(-1)
      ].filter(Boolean)
      return Promise.all(
        chosen.map(async(entry) => {
          const dest =
            typeof entry!.dest === 'string' ? await pdf.getDestination(entry!.dest) : entry!.dest
          const index = typeof dest![0] === 'number' ? dest![0] : await pdf.getPageIndex(dest![0])
          return { title: entry!.title.trim(), page: index + 1 }
        })
      )
    })
    expect(targets.length).toBeGreaterThan(0)
    for (const target of targets) {
      await page
        .locator('.side-bar .el-tree-node__label')
        .getByText(target.title, { exact: true })
        .click()
      await expect(page.getByRole('spinbutton', { name: '页码' })).toHaveValue(String(target.page))
      await expect
        .poll(() =>
          page
            .locator(`.pdfViewer .page[data-page-number="${target.page}"]`)
            .evaluate((element) => {
              const bounds = element.getBoundingClientRect(),
                viewport = document.querySelector('.pdf-scroll')!.getBoundingClientRect()
              return bounds.bottom > viewport.top && bounds.top < viewport.bottom
            })
        )
        .toBe(true)
      const rendered = page.locator(`.pdfViewer .page[data-page-number="${target.page}"]`)
      await expect(rendered.locator('canvas')).toBeVisible({ timeout: 30000 })
      await expect(rendered).not.toHaveClass(/loadingIcon/, { timeout: 30000 })
      await expect(page.locator('.pdf-message[role=alert]')).toHaveCount(0)
    }
    await page.getByRole('spinbutton', { name: '页码' }).fill('1')
    await page.getByRole('spinbutton', { name: '页码' }).press('Enter')
    await expect(page.getByRole('spinbutton', { name: '页码' })).toHaveValue('1')
    await page.getByRole('button', { name: 'PDF 缩略图', exact: true }).click()
    await expect(page.locator('.pdf-thumbnail.current')).toHaveAttribute(
      'data-render-state',
      'ready',
      { timeout: 30000 }
    )
    const ink = await page.locator('.pdf-thumbnail.current canvas').evaluate((element) => {
      const canvas = element as HTMLCanvasElement
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      let count = 0
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i + 3] && Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 230) count++
      return count
    })
    expect(ink).toBeGreaterThan(30)
    await expect(page.locator('.pdf-message[role=alert]')).toHaveCount(0)
    await page.screenshot({ path: '../../.tools/pdf-fixed-real-thumbnails.png' })
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((win) => win.destroy())
    )
    await app.close()
  }
})
