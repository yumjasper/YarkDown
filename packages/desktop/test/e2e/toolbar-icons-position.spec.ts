import { test, expect } from '@playwright/test'
import { launchWithMarkdown, expectNoRendererErrors } from './helpers'

test('vector toolbars and exact right-click origins survive renderer zoom', async() => {
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII='
  const { app, page } = await launchWithMarkdown(`# Icons\n\nPlain text for context positioning.\n\n<img src="${image}" width="200" height="100">\n\nFollowing paragraph.\n`, { suppressErrorDialog: true })
  try {
    for (const zoom of [1, 1.25]) {
      await app.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(value), zoom)
      await expect(page.locator('.mu-inline-image img')).toBeVisible()
      for (const target of [page.locator('.mu-paragraph-content').filter({ hasText: 'Plain text' }), page.locator('.mu-inline-image img')]) {
        const rect = await target.boundingBox()
        if (!rect) throw new Error('Missing context target')
        const point = { x: Math.ceil(rect.x + 20), y: Math.ceil(rect.y + 10) }
        await page.mouse.click(point.x, point.y, { button: 'right' })
        const menu = page.locator('.editor-context-menu:not(.context-submenu)')
        await expect(menu).toBeVisible()
        const menuRect = await menu.boundingBox()
        expect(menuRect?.x).toBeCloseTo(point.x, 0)
        expect(menuRect?.y).toBeCloseTo(point.y, 0)
        await page.keyboard.press('Escape')
      }
    }
    await page.locator('.mu-inline-image img').click()
    await expect(page.locator('.mu-image-toolbar')).toBeVisible()
    await expect(page.locator('.mu-image-toolbar-container')).toHaveCSS('opacity', '1')
    const sourceRect = await page.locator('.mu-image-source').boundingBox()
    const toolbarRect = await page.locator('.mu-image-toolbar-container').boundingBox()
    expect(toolbarRect!.y).toBeGreaterThanOrEqual(sourceRect!.y + sourceRect!.height)
    const layout = await page.locator('.mu-image-toolbar-container').evaluate(node => {
      const panel = node.getBoundingClientRect()
      return Array.from(node.querySelectorAll('li.item')).map(item => {
        const rect = item.getBoundingClientRect()
        return { width: rect.width, left: rect.left - panel.left, right: panel.right - rect.right }
      })
    })
    for (const button of layout) {
      expect(button.width).toBeGreaterThanOrEqual(32)
      expect(button.left).toBeGreaterThanOrEqual(0)
      expect(button.right).toBeGreaterThanOrEqual(0)
    }
    const icons = page.locator('.mu-image-toolbar .icon-inner')
    await expect(icons).toHaveCount(6)
    for (const icon of await icons.all()) {
      const paint = await icon.evaluate(node => ({ mask: getComputedStyle(node).maskImage, filter: getComputedStyle(node).filter, left: getComputedStyle(node).left }))
      expect(paint.mask).toContain('image/svg+xml')
      expect(paint.filter).toBe('none')
      expect(paint.left).toBe('0px')
    }
    await page.screenshot({ path: '../../.tools/unified-toolbar-preview.png' })
    await expectNoRendererErrors(app)
  } finally { await app.close() }
})
