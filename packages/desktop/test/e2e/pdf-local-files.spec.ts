import { expect, test } from '@playwright/test'
import { launchWithDoc, expectNoRendererErrors } from './helpers'

test('opens a local PDF regression fixture', async() => {
  const filename = process.env.PDF_REGRESSION_PATH
  test.skip(!filename, 'Set PDF_REGRESSION_PATH to an external PDF fixture')
  if (!filename) return
  test.setTimeout(180000)
  const { app, page } = await launchWithDoc(filename, { suppressErrorDialog: true })
  page.on('console', (message) => {
    if (message.type() === 'error') console.log('PDF console:', message.text())
  })
  try {
    await expect(page.locator('.pdf-reader')).toBeVisible()
    await expect
      .poll(
        async() => {
          const error = (await page.locator('.pdf-message[role=alert]').allTextContents()).join('')
          if (error) return error
          return (await page.locator('.pdfViewer .page canvas').first().isVisible())
            ? 'rendered'
            : 'loading'
        },
        { timeout: 45000 }
      )
      .toBe('rendered')
    const bytes = await page
      .locator('.pdf-reader')
      .evaluate((element) => ({
        loaded: Number(element.getAttribute('data-loaded-bytes')),
        total: Number(element.getAttribute('data-total-bytes'))
      }))
    if (bytes.total > 100 * 1024 * 1024) expect(bytes.loaded).toBeLessThan(bytes.total / 2)
    const pageInput = page.getByRole('spinbutton', { name: '页码' })
    const lastPage = await pageInput.getAttribute('max')
    if (process.env.PDF_REGRESSION_SWEEP === '1') {
      for (let number = 1; number <= Number(lastPage); number++) {
        await pageInput.fill(String(number))
        await pageInput.press('Enter')
        const rendered = page.locator(`.pdfViewer .page[data-page-number="${number}"]`)
        await expect(rendered.locator('canvas')).toBeVisible()
        await expect(rendered).not.toHaveClass(/loadingIcon/, { timeout: 15000 })
        await expect(page.locator('.pdf-message[role=alert]')).toHaveCount(0)
      }
    }
    await pageInput.fill(lastPage || '1')
    await pageInput.press('Enter')
    await expect(
      page.locator(`.pdfViewer .page[data-page-number="${lastPage}"] canvas`)
    ).toBeVisible({ timeout: 30000 })
    await expect(page.locator('.side-bar .pdf-navigation')).toBeVisible()
    await page.getByRole('button', { name: '目录 / 缩略图' }).click()
    await expect(page.locator('.side-bar .pdf-navigation')).toHaveCount(0)
    await page.screenshot({
      path: `../../.tools/pdf-${process.env.PDF_REGRESSION_NAME || 'local'}-preview.png`
    })
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((window) => window.destroy())
    )
    await app.close()
  }
})
