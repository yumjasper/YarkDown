import { expect, test } from '@playwright/test'
import { expectNoRendererErrors, launchWithMarkdown } from './helpers'

test('offscreen math previews preserve scrolling geometry and remain editable', async() => {
  const markdown = '# Formula layout\n\n' + Array.from({ length: 24 }, (_, i) =>
    `## Section ${i}\n\nBody paragraph ${i}.\n\n$$\nx_{${i}}^2 + y^2 = z^2\n$$\n`
  ).join('\n')
  const { app, page } = await launchWithMarkdown(markdown, { suppressErrorDialog: true })
  try {
    await expect(page.locator('.measured-math-preview')).toHaveCount(24)
    const height = await page.locator('.editor-component').evaluate(element => element.scrollHeight)
    const last = page.locator('.mu-math-preview').last()
    await last.scrollIntoViewIfNeeded()
    await expect(last).toBeVisible()
    const after = await page.locator('.editor-component').evaluate(element => element.scrollHeight)
    expect(Math.abs(after - height)).toBeLessThanOrEqual(2)
    await last.click()
    await expect(page.locator('.mu-math-block.mu-active').last()).toBeVisible()
    await expect(page.locator('.mu-math-block.mu-active .mu-math-container').last()).toContainText('x_{23}')
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})
