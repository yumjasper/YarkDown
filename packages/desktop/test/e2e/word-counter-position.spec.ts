import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, waitForEditor } from './helpers'

const DOC = 'Alpha beta gamma\n\nDelta epsilon\n'

// The counter used to live in the title bar; it now belongs to the editor's
// status bar. These assertions pin the position rather than just the
// presence of `.word-count`, so a regression that moves it back up top fails.
test.describe('Word counter position', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown(DOC)
    app = launched.app
    page = launched.page
    await waitForEditor(page)
    await page.waitForSelector('.word-count', { timeout: 15000 })
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('sits in the editor status bar', async() => {
    const placement = await page.evaluate(() => {
      const counter = document.querySelector('.word-count')
      const titleBar = document.querySelector('.title-bar')
      const wrapper = document.querySelector('.editor-status-bar')
      if (!counter) return null
      return {
        inTitleBar: !!(titleBar && titleBar.contains(counter)),
        inEditorWrapper: !!(wrapper && wrapper.contains(counter))
      }
    })
    expect(placement).toBeTruthy()
    expect(placement!.inTitleBar).toBe(false)
    expect(placement!.inEditorWrapper).toBe(true)
  })

  test('is laid out at the right side, below the editor text', async() => {
    const counter = page.locator('.word-count')
    const box = await counter.boundingBox()
    expect(box).toBeTruthy()

    const editor = await page.locator('.editor-component').boundingBox()
    expect(editor).toBeTruthy()

    // Right-aligned within the editor area.
    expect(box!.x + box!.width).toBeGreaterThan(editor!.x + editor!.width * 0.6)
    // Below the top of the editor text, i.e. no longer in the title bar.
    expect(box!.y).toBeGreaterThan(editor!.y)
    expect(box!.y + box!.height).toBeLessThanOrEqual(await page.evaluate(() => innerHeight))
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)
  })

  test('still cycles W -> P -> C -> A on click', async() => {
    const counter = page.locator('.word-count')
    await expect(counter).toHaveText('W 5')

    await counter.click()
    await expect(counter).toHaveText('P 2')

    await counter.click()
    await expect(counter).toHaveText('C 26')

    await counter.click()
    await expect(counter).toHaveText('A 32')

    await counter.click()
    await expect(counter).toHaveText('W 5')
  })
})
