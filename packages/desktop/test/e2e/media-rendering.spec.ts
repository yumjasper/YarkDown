import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { launchWithMarkdown, getMarkdownContent, expectNoRendererErrors, setSourceMarkdown } from './helpers'

test('image source and captions preserve Markdown; math previews occupy document space', async() => {
  const markdown = '# Media\n\n![Description](figure.svg "Figure caption")\n\nAfter image.\n\n$$\n\\int_0^1 x^2 dx = \\frac{1}{3}\n$$\n\nAfter formula.\n'
  const { app, page, filePath } = await launchWithMarkdown(markdown, { suppressErrorDialog: true })
  try {
    await writeFile(path.join(path.dirname(filePath), 'figure.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="180"><rect width="400" height="180" fill="#dde9ef"/><circle cx="200" cy="90" r="65" fill="#8c6239"/></svg>')
    await setSourceMarkdown(page, app, markdown)
    const image = page.locator('.mu-inline-image img')
    const source = page.locator('.mu-image-source')
    const caption = page.locator('.mu-image-caption')
    await expect(image).toBeVisible()
    await expect(caption).toHaveText('Figure caption')
    await expect(source).not.toBeVisible()
    const imageRect = await image.boundingBox()
    const captionRect = await caption.boundingBox()
    expect(captionRect!.y).toBeGreaterThanOrEqual(imageRect!.y + imageRect!.height)

    await image.click()
    await expect(source).toBeVisible()
    await expect(source).toHaveText('![Description](figure.svg "Figure caption")')
    expect(await source.evaluate(node => getComputedStyle(node, '::before').maskImage)).not.toBe('none')
    await source.click()
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.type('Updated ')
    await expect.poll(() => getMarkdownContent(page, app)).toContain('![Updated Description]')
    await page.screenshot({ path: '../../.tools/media-image-preview.png' })
    await page.locator('.mu-paragraph-content').filter({ hasText: 'After image.' }).click()
    await expect(source).not.toBeVisible()
    for (const end of [false, true]) {
      await page.locator('.mu-inline-image').evaluate((node, atEnd) => {
        const content = node.closest('.mu-paragraph-content') as HTMLElement & {
          __MUYA_BLOCK__: { text: string, setCursor: (start: number, end: number, render: boolean) => void }
        }
        const block = content.__MUYA_BLOCK__
        const offset = atEnd ? block.text.length : 0
        block.setCursor(offset, offset, true)
      }, end)
      await expect(source).toBeVisible()
      await page.locator('.mu-paragraph-content').filter({ hasText: 'After image.' }).click()
      await expect(source).not.toBeVisible()
    }
    expect(await getMarkdownContent(page, app)).not.toContain('Figure caption\nFigure caption')

    const math = page.locator('.mu-math-block')
    await math.locator('.mu-math-preview').click()
    await expect(math).toHaveClass(/mu-active/)
    const codeRect = await math.locator('.mu-math-container').boundingBox()
    const previousRect = await page.locator('.mu-paragraph-content').filter({ hasText: 'After image.' }).boundingBox()
    expect(codeRect!.y).toBeGreaterThanOrEqual(previousRect!.y + previousRect!.height)
    const typography = await math.locator('.mu-math-container').evaluate(node => {
      const style = getComputedStyle(node)
      const code = node.querySelector('.mu-code')!
      return {
        font: getComputedStyle(code).fontFamily,
        before: getComputedStyle(node, '::before').position,
        after: getComputedStyle(node, '::after').position,
        reservedHeight: node.getBoundingClientRect().height - code.getBoundingClientRect().height,
        markerHeight: parseFloat(style.lineHeight) * 2
      }
    })
    expect(typography.font).toMatch(/^"?Lucida Console/)
    expect(typography.before).toBe('static')
    expect(typography.after).toBe('static')
    expect(typography.reservedHeight).toBeGreaterThanOrEqual(typography.markerHeight)
    const previewRect = await math.locator('.mu-math-preview').boundingBox()
    const nextRect = await page.locator('.mu-paragraph-content').filter({ hasText: 'After formula.' }).boundingBox()
    expect(previewRect!.y).toBeGreaterThanOrEqual(codeRect!.y + codeRect!.height)
    expect(nextRect!.y).toBeGreaterThanOrEqual(previewRect!.y + previewRect!.height)
    await page.screenshot({ path: '../../.tools/media-math-preview.png' })
    await setSourceMarkdown(page, app, '# References\n\n![Description][figure]\n\nAfter reference.\n\n[figure]: figure.svg "Reference caption"\n')
    const reference = page.locator('.mu-image-marked-text + img')
    await expect(reference).toBeVisible()
    await expect(page.locator('.mu-image-caption')).toHaveText('Reference caption')
    await reference.click()
    await expect(page.locator('.mu-image-marked-text')).toBeVisible()
    await expect(page.locator('.mu-image-marked-text')).toHaveText('![Description][figure]')
    await setSourceMarkdown(page, app, '# Inline math\n\nBefore $x^2 + y^2$ after.\n\nFollowing paragraph.\n')
    await page.locator('.mu-math-render').click()
    const inline = page.locator('.mu-math:not(.mu-hide)')
    await expect(inline).toBeVisible()
    const inlineSource = await inline.locator('.mu-math-text').boundingBox()
    const inlinePreview = await inline.locator('.mu-math-render').boundingBox()
    const following = await page.locator('.mu-paragraph-content').filter({ hasText: 'Following paragraph.' }).boundingBox()
    expect(inlinePreview!.y).toBeGreaterThanOrEqual(inlineSource!.y + inlineSource!.height)
    expect(following!.y).toBeGreaterThanOrEqual(inlinePreview!.y + inlinePreview!.height)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})
