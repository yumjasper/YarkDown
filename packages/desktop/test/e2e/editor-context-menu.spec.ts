import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import {
  launchWithMarkdown,
  setSourceMarkdown,
  placeCaretInEditor,
  focusEditor,
  getMarkdownContent,
  expectNoRendererErrors,
  enterSourceMode,
  exitSourceMode
} from './helpers'

const DOC = 'Alpha beta gamma\n\nSecond paragraph.\n'
test.describe('Typora-style editor context menu', () => {
  // Stop on failure so later checks do not restart Electron and obscure the first error.
  test.describe.configure({ mode: 'serial' })
  let app: ElectronApplication
  let page: Page
  const menu = () => page.locator('.editor-context-menu:not(.context-submenu)')
  const item = (id: string) => page.locator(`.editor-context-menu [data-id="${id}"]`)
  const open = async() => {
    await page
      .locator('.editor-component p .mu-paragraph-content')
      .first()
      .click({ button: 'right' })
    await expect(menu()).toBeVisible()
  }
  const insert = async(id: string) => {
    await open()
    await item('insert').hover()
    await item(id).click()
    await expect(menu()).toHaveCount(0)
  }
  test.beforeAll(async() => {
    const launched = await launchWithMarkdown(DOC, {
      suppressErrorDialog: true,
      preferences: { footnote: true, spellcheckerEnabled: false },
      env: { MARKTEXT_EXIT_ON_ERROR: '1' }
    })
    app = launched.app
    page = launched.page
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

  test('opens icon grids and insertion submenu from a real right-click', async() => {
    await page.locator('.editor-component p .mu-paragraph-content').first().click({ button: 'right', position: { x: 40, y: 8 } })
    await expect(menu()).toBeVisible()
    await expect(item('cut')).toBeDisabled()
    await expect(item('copy')).toBeDisabled()
    await expect(menu().locator('.context-format-grid button')).toHaveCount(8)
    await item('insert').hover()
    for (const id of [
      'image',
      'footnote',
      'reference-link',
      'table',
      'code-block',
      'math-block',
      'toc',
      'front-matter',
      'insert-before',
      'insert-after'
    ]) {
      await expect(item(id)).toBeVisible()
    }
    const rootBox = await menu().boundingBox()
    const subBox = await page.locator('.context-submenu').boundingBox()
    if (!rootBox || !subBox) throw new Error('Context menu preview is missing')
    const left = Math.min(rootBox.x, subBox.x) - 12
    const top = Math.min(rootBox.y, subBox.y) - 12
    await page.screenshot({
      path: test.info().outputPath('editor-context-menu.png'),
      animations: 'disabled',
      clip: {
        x: left,
        y: top,
        width: Math.max(rootBox.x + rootBox.width, subBox.x + subBox.width) - left + 12,
        height: Math.max(rootBox.y + rootBox.height, subBox.y + subBox.height) - top + 12
      }
    })
    await page.keyboard.press('Escape')
    await expect(menu()).toHaveCount(0)
  })
  test('preserves selection when formatting with an icon', async() => {
    await focusEditor(page)
    await open()
    await expect(item('copy')).toBeEnabled()
    await item('bold').click()
    await expect(page.locator('.editor-component strong')).toContainText('Alpha beta gamma')
  })
  test('changes the paragraph to a heading from the submenu', async() => {
    await open()
    await item('paragraph').hover()
    await item('heading-2').click()
    await expect(page.locator('.editor-component h2')).toContainText('Alpha beta gamma')
  })
  test('opens the image insertion tool', async() => {
    await insert('image')
    await expect(page.locator('.mu-image-selector input.src')).toBeFocused()
  })
  test('inserts a footnote with a definition', async() => {
    await insert('footnote')
    await expect(page.locator('.editor-component')).toContainText('note-1')
    expect(await getMarkdownContent(page, app)).toContain('[^note-1]:')
  })
  test('inserts a reference link and definition', async() => {
    await insert('reference-link')
    await expect(page.locator('.editor-component')).toContainText('ref-1')
    expect(await getMarkdownContent(page, app)).toContain('[ref-1]: https://example.com')
  })
  test('inserts a rendered table of contents', async() => {
    await setSourceMarkdown(page, app, '# One\n\nBody\n\n## Two\n')
    await page.locator('.editor-component p').first().click()
    await insert('toc')
    await expect(page.locator('.mu-toc-block')).toBeVisible()
    await expect(page.locator('.mu-toc-block')).toContainText('One')
  })
  test('copies selected formatted content as plain text', async() => {
    await setSourceMarkdown(page, app, '**Bold** and [link](https://example.com)\n')
    await focusEditor(page)
    await open()
    await item('copy-as').hover()
    await item('copy-plain').click()
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe('Bold and link')
    expect(await app.evaluate(({ clipboard }) => clipboard.readHTML())).toBe('')
  })
  test('keeps menus within the viewport near the bottom-right edge', async() => {
    const box = await page.locator('.editor-component').boundingBox()
    if (!box) throw new Error('Editor is missing')
    await page.mouse.click(box.x + box.width - 40, box.y + box.height - 50, { button: 'right' })
    await expect(menu()).toBeVisible()
    await item('insert').hover()
    for (const panel of await page.locator('.editor-context-menu').all()) {
      const rect = await panel.boundingBox()
      if (!rect) throw new Error('Menu is missing')
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.y).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width)
      expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height)
    }
  })
  test('supports keyboard submenu navigation', async() => {
    await open()
    await page.keyboard.press('ArrowDown')
    await expect(item('paste')).toBeFocused()
    await item('insert').focus()
    await page.keyboard.press('ArrowRight')
    await expect(item('image')).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(item('insert')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu()).toHaveCount(0)
  })

  test('keeps source-mode insertion disabled and pastes plain text into CodeMirror', async() => {
    await app.evaluate(({ clipboard }) => clipboard.writeText('source-paste-token'))
    await enterSourceMode(page, app)
    await page.locator('.source-code .CodeMirror').click({ button: 'right' })
    await expect(menu()).toBeVisible()
    await expect(item('bold')).toBeDisabled()
    await expect(item('insert')).toBeDisabled()
    await item('copy-as').hover()
    await item('paste-plain').click()
    await expect(page.locator('.source-code .CodeMirror')).toContainText('source-paste-token')
    await exitSourceMode(page, app)
    expect(await getMarkdownContent(page, app)).toContain('source-paste-token')
  })
})
