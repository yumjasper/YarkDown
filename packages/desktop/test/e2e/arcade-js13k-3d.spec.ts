import { expect, test } from '@playwright/test'
import { expectNoRendererErrors, getMarkdownContent, launchWithMarkdown } from './helpers'

test('Q1K3 supports combined mouse and keyboard input without document access', async() => {
  test.setTimeout(90000)
  const { app, page } = await launchWithMarkdown('# 3D isolation\n\nKeep this document.\n', {
    suppressErrorDialog: true
  })
  const errors: string[] = []
  const remote: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) remote.push(request.url())
  })
  const panel = page.getByRole('dialog', { name: '小憩', exact: true })
  try {
    await expect(page.locator('.editor-component h1')).toContainText('3D isolation')
    const before = await getMarkdownContent(page, app)
    await page.keyboard.press('Control+Alt+g')
    await panel.getByRole('button', { name: '经典精选', exact: true }).click()
    await panel.getByRole('button', { name: /^Q1K3 / }).click()
    const q1k3 = page.frameLocator('iframe[title="Q1K3"]')
    const qFrame = await page
      .locator('iframe')
      .elementHandle()
      .then((handle) => handle?.contentFrame())
    if (!qFrame) throw new Error('Q1K3 did not load')
    await qFrame.waitForFunction(() => !!document.getElementById('g')?.onclick)
    await q1k3.locator('#g').click()
    await expect.poll(() => qFrame.evaluate(() => !!document.pointerLockElement)).toBe(true)
    await expect(panel.getByRole('status')).toContainText('鼠标已锁定')
    const position = await qFrame.evaluate('JSON.stringify(game_entity_player.p)')
    const yaw = await qFrame.evaluate('game_entity_player._yaw')
    await page.keyboard.down('w')
    await page.mouse.move(650, 330, { steps: 12 })
    await expect
      .poll(() => qFrame.evaluate('JSON.stringify(game_entity_player.p)'))
      .not.toBe(position)
    await page.keyboard.up('w')
    await expect.poll(() => qFrame.evaluate('game_entity_player._yaw')).not.toBe(yaw)
    await page.mouse.down()
    await expect.poll(() => qFrame.evaluate('game_entity_player._can_shoot_at')).toBeGreaterThan(0)
    await page.mouse.up()
    await page.keyboard.press('Escape')
    await expect.poll(() => qFrame.evaluate(() => !!document.pointerLockElement)).toBe(false)
    await expect(panel).toBeVisible()
    await page.screenshot({ path: '../../.tools/js13k-q1k3.png' })
    await page.keyboard.press('Escape')
    await expect(panel).not.toBeVisible()
    await expect(page.locator('iframe')).toHaveCount(0)

    expect(await getMarkdownContent(page, app)).toBe(before)
    expect(remote).toEqual([])
    expect(errors).toEqual([])
    await expectNoRendererErrors(app)
  } catch (error) {
    console.log('Current UI:', await page.locator('body').innerText())
    console.log('Page errors:', errors)
    await page.screenshot({ path: '../../.tools/js13k-3d-failed.png' })
    throw error
  } finally {
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.destroy()
    })
    await app.close()
  }
})
