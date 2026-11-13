import { expect, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import { expectNoRendererErrors, launchWithDoc } from './helpers'

const filename = process.env.YARKTEXT_READING_SOURCE_PDF || 'D:/Tools/MaterialEnhance/Generative Detail Enhancement for Physically Based Materials__SIGGRAPH 2025.pdf'

test('preserves real research PDF word boundaries in copy and vocabulary analysis', async() => {
  test.skip(!existsSync(filename), 'Set YARKTEXT_READING_SOURCE_PDF to the research PDF fixture')
  const { app, page } = await launchWithDoc(filename, { suppressErrorDialog: true })
  try {
    const layer = page.locator('.textLayer').first()
    await expect(layer).toContainText('Conditioned')
    await layer.evaluate(element => {
      const range = document.createRange()
      range.selectNodeContents(element)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
    })
    const copied = await layer.evaluate(element => {
      const data = new DataTransfer()
      element.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: data }))
      return data.getData('text/plain')
    })
    expect(copied).toMatch(/Conditioned\s+on\s+a\s+set/)
    expect(copied).toMatch(/succesful\s+inverse-rendering/)
    expect(copied).not.toContain('succesfulinverse-rendering')
    console.log('Real PDF extracted caption:', copied.slice(copied.indexOf('Conditioned'), copied.indexOf('Conditioned') + 650))
    await page.getByRole('toolbar', { name: '选区批注菜单' }).getByRole('button', { name: '翻译', exact: true }).click()
    const panel = page.getByRole('complementary', { name: '阅读助手' })
    await panel.getByLabel('学科词义', { exact: true }).selectOption('computing')
    await expect(panel.locator('.annotated-passage')).toContainText('噪声')
    const annotated = await panel.locator('ruby').evaluateAll(elements => elements.map(element => ({
      word: Array.from(element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(''),
      gloss: element.querySelector('rt')?.textContent
    })))
    expect(annotated.some(item => ['ona', 'building', 'improve', 'are', 'back'].includes(item.word.toLowerCase()))).toBe(false)
    expect(annotated.find(item => item.word.toLowerCase() === 'noise')?.gloss).toBe('噪声')
    expect(annotated.find(item => item.word.toLowerCase() === 'inverse-rendering')?.gloss).toContain('逆向渲染')
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close()
  }
})
