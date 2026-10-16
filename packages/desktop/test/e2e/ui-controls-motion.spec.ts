import { expect, test } from '@playwright/test'
import { launchWithMarkdown, enterSourceMode, expectNoRendererErrors } from './helpers'

test('control feedback and settings entrances stay lightweight and respect reduced motion', async() => {
  test.setTimeout(60000)
  const { app, page } = await launchWithMarkdown('# Controls\n\nKeep typing immediate\n', { suppressErrorDialog: true })
  try {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const bold = page.locator('.bottom-toolbar-button[data-id="bold"]')
    await expect(bold).toBeVisible()
    const properties = await bold.evaluate(element => getComputedStyle(element).transitionProperty)
    expect(properties).toContain('scale')
    expect(properties.split(',').map(value => value.trim())).not.toContain('all')
    const box = await bold.boundingBox()
    expect(box).not.toBeNull()
    await bold.hover()
    await page.mouse.down()
    try {
      await expect.poll(() => bold.evaluate(element => getComputedStyle(element).scale)).toBe('0.97')
      expect(await bold.boundingBox()).not.toBeNull()
    } finally {
      await page.mouse.move(1, 1)
      await page.mouse.up()
    }
    await expect.poll(() => bold.evaluate(element => getComputedStyle(element).scale)).toBe('none')

    await page.locator('.bottom-toolbar-button[data-id="more"]').click()
    await page.locator('.bottom-toolbar-menu-item[data-id="hide-toolbar"]').click()
    await expect(page.locator('.bottom-toolbar')).toHaveCount(0)
    await page.locator('[data-id="show-toolbar"]').click()
    await expect(page.locator('.bottom-toolbar')).toBeVisible()
    await expect.poll(() => page.locator('.bottom-toolbar').evaluate(element => element.getAnimations().length)).toBe(0)
    expect(await page.locator('.editor-wrapper').evaluate(element => getComputedStyle(element).transform)).toBe('none')

    await enterSourceMode(page, app)
    await expect(bold).toBeDisabled()
    await bold.hover({ force: true })
    await page.mouse.down()
    try {
      expect(await bold.evaluate(element => getComputedStyle(element).scale)).toBe('none')
    } finally {
      await page.mouse.up()
    }
    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await bold.evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s')
    expect(await bold.evaluate(element => getComputedStyle(element).scale)).toBe('none')
    expect(await page.locator('.editor-tabs .new-file').evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s')

    const settingsReady = app.waitForEvent('window')
    await app.evaluate(({ ipcMain }) => { ipcMain.emit('app-create-settings-window') })
    const settings = await settingsReady
    await settings.waitForLoadState('domcontentloaded')
    await expect(settings.locator('.pref-general')).toBeVisible()
    await settings.emulateMedia({ reducedMotion: 'no-preference' })
    await settings.evaluate(() => {
      const panel = document.querySelector('.pref-setting')
      if (!panel) throw new Error('Settings panel is missing')
      const state = window as unknown as { __motionFrames: PropertyIndexedKeyframes | Keyframe[] | null }
      state.__motionFrames = null
      const animate = panel.animate.bind(panel)
      panel.animate = (frames, options) => {
        state.__motionFrames = frames
        return animate(frames, options)
      }
    })
    await settings.locator('.pref-sidebar .category .item').nth(1).click()
    await expect(settings.locator('.pref-editor')).toBeVisible()
    expect(await settings.evaluate(() => (window as unknown as { __motionFrames: unknown }).__motionFrames)).toEqual([{ opacity: 0.35 }, { opacity: 1 }])
    await expect.poll(() => settings.locator('.pref-setting').evaluate(element => element.getAnimations().length)).toBe(0)
    expect(await settings.locator('.pref-setting').evaluate(element => getComputedStyle(element).transform)).toBe('none')
    expect(await settings.locator('.pref-setting').evaluate(element => getComputedStyle(element).willChange)).toBe('auto')
    await settings.emulateMedia({ reducedMotion: 'reduce' })
    await settings.evaluate(() => { (window as unknown as { __motionFrames: unknown }).__motionFrames = null })
    await settings.locator('.pref-sidebar .category .item').first().click()
    await expect(settings.locator('.pref-general')).toBeVisible()
    expect(await settings.evaluate(() => (window as unknown as { __motionFrames: unknown }).__motionFrames)).toBeNull()
    expect(await settings.locator('.pref-sidebar .category .item').first().evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s')
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())).catch(() => {})
    await app.close()
  }
})
