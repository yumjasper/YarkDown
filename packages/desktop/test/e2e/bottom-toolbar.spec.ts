import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import {
  launchWithMarkdown,
  waitForEditor,
  setSourceMarkdown,
  placeCaretInEditor,
  focusEditor,
  getMarkdownContent,
  expectNoRendererErrors
} from './helpers'

const DOC = 'Alpha beta gamma\n\nDelta epsilon\n'

test.describe('Bottom toolbar', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown(DOC, {
      suppressErrorDialog: true,
      env: { MARKTEXT_EXIT_ON_ERROR: '1' }
    })
    app = launched.app
    page = launched.page
    await waitForEditor(page)
    await page.waitForSelector('.bottom-toolbar', { timeout: 15000 })
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test.beforeEach(async() => {
    await setSourceMarkdown(page, app, DOC)
    await placeCaretInEditor(page)
  })

  test.afterEach(async() => {
    await expectNoRendererErrors(app)
  })

  test('is displayed below the editing area', async() => {
    const toolbar = page.locator('.bottom-toolbar')
    await expect(toolbar).toBeVisible()

    const geometry = await page.evaluate(() => {
      const bar = document.querySelector('.bottom-toolbar') as HTMLElement | null
      const editor = document.querySelector('.editor-component') as HTMLElement | null
      if (!bar || !editor) return null
      const b = bar.getBoundingClientRect()
      const e = editor.getBoundingClientRect()
      return { barBottom: b.bottom, barTop: b.top, editorBottom: e.bottom, editorTop: e.top }
    })
    expect(geometry).toBeTruthy()
    expect(geometry!.barTop).toBeGreaterThanOrEqual(geometry!.editorBottom)
    await expect(page.locator('.bottom-toolbar-button[data-id="image"] svg')).toBeVisible()
    await page.locator('.bottom-toolbar-button[data-id="more"]').click()
    await expect(page.locator('.bottom-toolbar-menu-item[data-id="copy"]')).toBeVisible()
    const barBox = await toolbar.boundingBox()
    const menuBox = await page.locator('.bottom-toolbar-popover:visible').boundingBox()
    if (!barBox || !menuBox) throw new Error('Toolbar preview is outside the viewport')
    const left = Math.min(barBox.x, menuBox.x) - 12
    const top = Math.min(barBox.y, menuBox.y) - 12
    await page.screenshot({
      path: test.info().outputPath('bottom-toolbar.png'),
      animations: 'disabled',
      clip: {
        x: left,
        y: top,
        width: Math.max(barBox.x + barBox.width, menuBox.x + menuBox.width) - left + 12,
        height: Math.max(barBox.y + barBox.height, menuBox.y + menuBox.height) - top + 12
      }
    })
    await page.locator('.bottom-toolbar-button[data-id="more"]').click()
  })

  test('exposes the paragraph actions', async() => {
    await page.locator('.bottom-toolbar-button[data-id="more"]').click()
    for (const id of [
      'insert-before',
      'insert-after',
      'copy',
      'paste',
      'clear-format',
      'delete-block'
    ]) {
      await expect(page.locator(`.bottom-toolbar-menu-item[data-id="${id}"]`)).toBeVisible()
    }
    await page.locator('.bottom-toolbar-button[data-id="more"]').click()
  })

  test('inserts a paragraph below the current one', async() => {
    await page.click('.editor-component')
    const before = await page.locator('p.mu-paragraph').count()

    await page.click('.bottom-toolbar-button[data-id="more"]')
    await page.click('.bottom-toolbar-menu-item[data-id="insert-after"]')

    await expect.poll(() => page.locator('p.mu-paragraph').count()).toBe(before + 1)
  })

  test('inserts a paragraph above the current one', async() => {
    await page.click('.editor-component')
    const before = await page.locator('p.mu-paragraph').count()

    await page.click('.bottom-toolbar-button[data-id="more"]')
    await page.click('.bottom-toolbar-menu-item[data-id="insert-before"]')

    await expect.poll(() => page.locator('p.mu-paragraph').count()).toBe(before + 1)
  })

  test('formats the retained selection with the bold icon', async() => {
    await focusEditor(page)
    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString()))
      .toBe('Alpha beta gamma')
    await page.click('.bottom-toolbar-button[data-id="bold"]')
    await expect(page.locator('.editor-component strong')).toContainText('Alpha beta gamma')
    expect(await getMarkdownContent(page, app)).toContain('**Alpha beta gamma**')
  })

  test('opens the image insertion tool from its icon', async() => {
    await page.click('.bottom-toolbar-button[data-id="image"]')
    const input = page.locator('.mu-image-selector input.src')
    await expect(input).toBeFocused()
    await expect
      .poll(() =>
        page.evaluate(() => {
          const wrapper = document
            .querySelector('.mu-image-selector')
            ?.closest('.mu-float-wrapper') as HTMLElement | null
          return Number.parseFloat(wrapper?.style.opacity || '0')
        })
      )
      .toBeGreaterThan(0)
    await page.click('.bottom-toolbar-host')
  })

  test('switches source mode through the menu and keeps the toolbar usable', async() => {
    await page.click('.bottom-toolbar-button[data-id="more"]')
    await page.click('.bottom-toolbar-menu-item[data-id="source-code"]')
    await expect(page.locator('.source-code .CodeMirror')).toBeVisible()
    await expect(page.locator('.bottom-toolbar-button[data-id="image"]')).toBeDisabled()
    await page.click('.bottom-toolbar-button[data-id="more"]')
    await expect(page.locator('.bottom-toolbar-menu-item[data-id="insert-before"]')).toBeDisabled()
    await page.click('.bottom-toolbar-menu-item[data-id="source-code"]')
    await expect(page.locator('.source-code')).toHaveCount(0)
    await expect(page.locator('.bottom-toolbar-button[data-id="image"]')).toBeEnabled()
  })

  test('can hide and restore the toolbar', async() => {
    await page.click('.bottom-toolbar-button[data-id="more"]')
    await page.click('.bottom-toolbar-menu-item[data-id="hide-toolbar"]')
    await expect(page.locator('.bottom-toolbar')).toHaveCount(0)
    await page.click('[data-id="show-toolbar"]')
    await expect(page.locator('.bottom-toolbar')).toBeVisible()
  })

  test('supports keyboard navigation and dismissal', async() => {
    const trigger = page.locator('.bottom-toolbar-button[data-id="more"]')
    await trigger.focus()
    await trigger.press('ArrowDown')
    await expect(page.locator('.bottom-toolbar-menu-item[data-id="source-code"]')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('.bottom-toolbar-menu-item[data-id="insert-before"]')).toBeFocused()
    await page.keyboard.press('End')
    await expect(page.locator('.bottom-toolbar-menu-item[data-id="hide-toolbar"]')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})
