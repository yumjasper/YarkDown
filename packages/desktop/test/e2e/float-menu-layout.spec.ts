import { expect, test } from '@playwright/test'
import { launchWithMarkdown, expectNoRendererErrors } from './helpers'

test('math and link controls fit their contents; bottom list menu has icons', async() => {
  const { app, page } = await launchWithMarkdown('# Controls\n\nBefore formula.\n\n$$\nx^2+y^2=z^2\\tag{14.2}\n$$\n\n[Link example](https://example.com)\n\nAfter link.\n', { suppressErrorDialog: true })
  const checkLayout = async(selector: string, count: number) => {
    const panel = page.locator(selector)
    await expect(panel).toHaveCSS('opacity', '1')
    const layout = await panel.evaluate(node => {
      const outer = node.getBoundingClientRect()
      const items = Array.from(node.querySelectorAll('li.item')).map(item => item.getBoundingClientRect())
      return { width: outer.width, left: items[0].left - outer.left, right: outer.right - items[items.length - 1].right, count: items.length }
    })
    expect(layout.count).toBe(count)
    expect(layout.width).toBeLessThan(90)
    expect(layout.left).toBeCloseTo(layout.right, 0)
    return panel.boundingBox()
  }
  try {
    const formula = page.locator('.mu-math-block .katex-display')
    await formula.hover()
    const toolbar = await checkLayout('.mu-preview-tools-container', 2)
    const rendered = await formula.boundingBox()
    if (!toolbar || !rendered) throw new Error('Missing math layout')
    expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(rendered.y)
    await page.locator('.mu-preview-tools .edit').hover()
    await expect(page.locator('.mu-preview-tools-container')).toHaveCSS('opacity', '1')
    await page.screenshot({ path: '../../.tools/math-hover-controls-preview.png' })
    await page.locator('.mu-link').hover()
    await checkLayout('.mu-link-tools-container', 2)
    await page.screenshot({ path: '../../.tools/link-controls-preview.png' })
    await page.locator('.bottom-toolbar [data-id="list"]').click()
    for (const id of ['ordered-list', 'bullet-list', 'task-list']) {
      const item = page.locator(`.bottom-toolbar-menu-item[data-id="${id}"]`)
      await expect(item).toBeVisible()
      await expect(item.locator('svg path')).toHaveAttribute('d', /\S+/)
    }
    await expectNoRendererErrors(app)
  } finally { await app.close() }
})
