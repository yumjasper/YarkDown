import { test, expect } from '@playwright/test'
import { closeApp, launchWithDoc } from './helpers'

/**
 * 真实论文选区回归：用户反馈第一段里 weathering 的首选释义是名词"天气"，
 * 因为查词把词形自身的词条换成了词根的词条。这里直接读侧栏的行内释义。
 */
const PDF = 'D:/Tools/MaterialEnhance/Generative Detail Enhancement for Physically Based Materials__SIGGRAPH 2025.pdf'

test('real paper keeps weather(ing) and trained senses contextual', async() => {
  test.setTimeout(120000)
  const { app, page } = await launchWithDoc(PDF, {
    suppressErrorDialog: true,
    preferences: { theme: 'light' }
  })
  try {
    await expect(page.locator('.textLayer').first()).toBeVisible({ timeout: 30000 })
    const sentence = 'aging, and weathering that are tedious to author.'
    const located = await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('.textLayer span'))
      const text = spans.map((span) => span.textContent ?? '').join(' ')
      return text.replace(/\s+/g, ' ').includes('weathering')
    })
    expect(located, 'weathering should be present in the text layer').toBe(true)

    // 选中包含 weathering 的一行，触发侧栏查词。
    const clicked = await page.evaluate(() => {
      const span = Array.from(document.querySelectorAll('.textLayer span')).find((item) =>
        (item.textContent ?? '').includes('weathering')
      )
      if (!span) return false
      const range = document.createRange()
      range.selectNodeContents(span)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      return true
    })
    expect(clicked).toBe(true)
    await page
      .getByRole('toolbar', { name: '选区批注菜单' })
      .getByRole('button', { name: '翻译', exact: true })
      .click()

    const panel = page.locator('.pdf-reading-assistant')
    const passage = panel.locator('.annotated-passage')
    await expect(passage).toBeVisible()
    const glosses = await passage.locator('ruby rt').allTextContents()
    console.log('inline glosses:', glosses.join(' | '))
    console.log('annotated passage:', (await passage.textContent())?.slice(0, 400))

    // weathering 在 weathering 自己的词条里首选就是风化，不应是天气。
    const weathering = passage.locator('button', { hasText: 'weathering' }).first()
    if (await weathering.count()) {
      await weathering.click()
      const first = panel.locator('.senses button').first()
      await expect(first).toContainText(/风化|風化/)
      console.log('weathering first sense:', (await first.textContent())?.trim())
    }
    const trained = passage.locator('button', { hasText: 'trained' }).first()
    if (await trained.count()) {
      await trained.click()
      const first = panel.locator('.senses button').first()
      console.log('trained first sense:', (await first.textContent())?.trim())
      await expect(first).not.toContainText(/列车|火车/)
    }
    void sentence
  } finally {
    await closeApp(app)
  }
})
