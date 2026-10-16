import { expect, test } from '@playwright/test'
import { expectNoRendererErrors, getMarkdownContent, launchWithMarkdown } from './helpers'

test('racer and falling blocks play offline, save bounded records and release their frames', async() => {
  test.setTimeout(60000)
  const { app, page } = await launchWithMarkdown('# Classics\n\n::game racer\n', {
    suppressErrorDialog: true
  })
  const errors: string[] = []
  const remote: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) remote.push(request.url())
  })
  try {
    const before = await getMarkdownContent(page, app)
    const inline = page.locator('.mu-game-preview[data-game="racer"]')
    await inline.getByRole('button', { name: '开始游戏' }).click()
    const racer = page.frameLocator('iframe[title="Racer"]')
    await expect(racer.locator('#canvas')).toBeVisible()
    const frame = await page
      .locator('iframe')
      .elementHandle()
      .then((handle) => handle?.contentFrame())
    if (!frame) throw new Error('Missing racing frame')
    await racer.locator('#canvas').click()
    await page.keyboard.down('ArrowUp')
    await expect.poll(() => frame.evaluate('speed')).toBeGreaterThan(500)
    const startX = await frame.evaluate('playerX')
    await page.keyboard.down('ArrowRight')
    await expect.poll(() => frame.evaluate('playerX')).not.toBe(startX)
    await page.keyboard.up('ArrowRight')
    await page.keyboard.up('ArrowUp')
    await page.keyboard.press('p')
    await expect(racer.getByRole('button', { name: '继续驾驶' })).toBeVisible()
    const stoppedAt = await frame.evaluate('position')
    await racer.getByRole('button', { name: '继续驾驶' }).click()
    await racer.locator('[data-drive="up"]').hover()
    await page.mouse.down()
    await expect.poll(() => frame.evaluate('position')).not.toBe(stoppedAt)
    await page.mouse.up()
    expect(
      await frame.evaluate(() => {
        try {
          void parent.document
          return false
        } catch {
          return true
        }
      })
    ).toBe(true)
    expect(await frame.evaluate(() => typeof window.electron)).toBe('undefined')
    await frame.evaluate(
      'position = trackLength - 10; speed = maxSpeed; playerX = 0; currentLapTime = 65; cars = []; segments.forEach(segment => segment.cars = [])'
    )
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('yarktext-js13k:racer:fast_lap_time')))
      .not.toBeNull()
    await page.screenshot({ path: '../../.tools/classic-racer.png' })
    await page.keyboard.press('Control+Alt+g')
    await expect(page.locator('iframe')).toHaveCount(0)
    await page.keyboard.press('Control+Alt+g')
    const panel = page.getByRole('dialog', { name: '小憩', exact: true })
    await panel.getByRole('button', { name: '经典精选', exact: true }).click()
    await expect(panel.locator('.js13k-card')).toHaveCount(3)
    await panel.getByRole('button', { name: /俄罗斯方块/ }).click()
    const tetris = page.frameLocator('iframe[title="Tetris"]')
    await tetris.getByRole('button', { name: '开始游戏', exact: true }).click()
    const blocks = await page
      .locator('iframe')
      .elementHandle()
      .then((handle) => handle?.contentFrame())
    if (!blocks) throw new Error('Missing blocks frame')
    const x = await blocks.evaluate('current.x')
    await page.keyboard.press('ArrowLeft')
    await expect.poll(() => blocks.evaluate('current.x')).toBe(Number(x) - 1)
    await page.keyboard.press('p')
    await expect(tetris.locator('#status')).toHaveText('已暂停')
    await page.keyboard.press('p')
    await blocks.evaluate(
      'clearBlocks(); for (var row=16; row<20; row++) for(var col=0; col<9; col++) setBlock(col,row,o); setCurrentPiece({type:i, x:7, y:0, dir:1})'
    )
    await page.keyboard.press('Space')
    await expect(tetris.locator('#rows')).toHaveText('4')
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('yarktext-js13k:tetris:best')))
      .toBe('810')
    await blocks.evaluate(() =>
      parent.postMessage(
        { channel: 'yarktext-js13k', type: 'save', key: 'document', value: 'bad' },
        '*'
      )
    )
    expect(
      await page.evaluate(() => localStorage.getItem('yarktext-js13k:tetris:document'))
    ).toBeNull()
    await page.screenshot({ path: '../../.tools/classic-tetris.png' })
    await panel.getByRole('button', { name: '返回精选' }).click()
    await panel.getByRole('button', { name: /俄罗斯方块/ }).click()
    await expect(tetris.locator('#best')).toHaveText('810')
    await panel.getByRole('button', { name: '返回精选' }).click()
    await panel.getByRole('button', { name: /公路赛车/ }).click()
    await expect(racer.locator('#fast_lap_time_value')).not.toHaveText('—')
    await racer.locator('#canvas').click()
    await page.keyboard.press('Escape')
    await expect(panel).not.toBeVisible()
    expect(await getMarkdownContent(page, app)).toBe(before)
    expect(remote).toEqual([])
    expect(errors).toEqual([])
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.destroy()
    })
    await app.close()
  }
})
