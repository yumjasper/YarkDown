import { expect, test } from '@playwright/test'
import { expectNoRendererErrors, getMarkdownContent, launchWithMarkdown } from './helpers'

test('sidebar arcade retains free exchanges, celebrates level completion and resumes the next level', async() => {
  test.setTimeout(60000)
  const { app, page } = await launchWithMarkdown('# Keep writing\n\nDocument stays intact.', {
    suppressErrorDialog: true
  })
  try {
    await expect(page.locator('.editor-component')).toContainText('Document stays intact.')
    const before = await getMarkdownContent(page, app)
    const launcher = page.getByRole('button', { name: '打开小憩', exact: true })
    await expect(
      page.locator('.side-bar').getByRole('button', { name: '打开小憩', exact: true })
    ).toBeVisible()
    expect(
      await launcher
        .locator('svg')
        .evaluate((svg) => ({
          width: svg.getBoundingClientRect().width,
          height: svg.getBoundingClientRect().height
        }))
    ).toEqual({ width: 18, height: 18 })
    await expect(page.locator('.arcade-launcher')).toHaveCount(0)
    await launcher.click()
    const dialog = page.getByRole('dialog', { name: '小憩', exact: true })
    await dialog.getByRole('button', { name: '轻消消', exact: true }).click()
    const board = dialog.locator('.arcade-match button')
    const invalid = await board.evaluateAll((cells) => {
      const values = cells.map((cell) => Number(cell.getAttribute('data-value')))
      for (let i = 0; i < 48; i++) {
        if (i % 7 === 6 || values[i] === values[i + 1]) continue
        const copy = [...values]
        ;[copy[i], copy[i + 1]] = [copy[i + 1], copy[i]]
        if (
          !copy.some(
            (v, k) =>
              (k % 7 < 5 && v === copy[k + 1] && v === copy[k + 2]) ||
              (k < 35 && v === copy[k + 7] && v === copy[k + 14])
          )
        )
          return { a: i, b: i + 1, values: copy }
      }
      throw new Error('No nonmatching pair')
    })
    await board.nth(invalid.a).click()
    await board.nth(invalid.b).click()
    await expect(dialog.locator('.match-adventure')).toHaveAttribute('aria-busy', 'false')
    expect(
      await board.evaluateAll((cells) =>
        cells.map((cell) => Number(cell.getAttribute('data-value')))
      )
    ).toEqual(invalid.values)
    await expect(dialog.locator('.arcade-message')).toContainText('交换已保留')
    await expect(dialog.locator('.match-moves b')).toHaveText('29')
    await page.keyboard.press('Escape')
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('yarktext.arcade.v1') || '{}')
      saved.sessions.match.state.stage.target = 1
      saved.sessions.match.state.stage.charge = 3
      localStorage.setItem('yarktext.arcade.v1', JSON.stringify(saved))
    })
    await launcher.click()
    await board.nth(0).click()
    await board.nth(1).click()
    await expect(dialog.locator('.match-adventure')).toHaveAttribute('aria-busy', 'false', {
      timeout: 15000
    })
    await expect(dialog.locator('.match-won')).toContainText('第 1 关完成')
    await expect(dialog.locator('.match-stars')).toHaveText('★★★')
    await page.screenshot({ path: '../../.tools/arcade-match-win.png' })
    const score = await dialog.locator('.arcade-stats b').innerText()
    await dialog.getByRole('button', { name: '前往第 2 关 →', exact: true }).click()
    await expect(dialog.locator('.match-level')).toHaveText('第 2 关')
    await expect(dialog.locator('.arcade-stats b')).toHaveText(score)
    await page.screenshot({ path: '../../.tools/arcade-match-adventure.png' })
    const a = await board.nth(0).boundingBox(), b = await board.nth(1).boundingBox()
    if (!a || !b) throw new Error('Missing swap targets')
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 })
    await page.mouse.up()
    await expect(dialog.locator('.match-adventure')).toHaveAttribute('aria-busy', 'false', { timeout: 15000 })
    await expect(dialog.locator('.match-moves b')).toHaveText('29')
    await page.keyboard.press('Escape')
    await launcher.click()
    await expect(dialog.locator('.match-level')).toHaveText('第 2 关')
    expect(await getMarkdownContent(page, app)).toBe(before)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})
