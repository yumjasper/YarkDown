import { expect, test } from '@playwright/test'
import { launchWithMarkdown, enterSourceMode, exitSourceMode, expectNoRendererErrors, sendIpcToRenderer } from './helpers'

test('UI motion remains short, releases effects and respects reduced motion without delaying source handoff', async() => {
  test.setTimeout(60000)
  const { app, page } = await launchWithMarkdown('# Motion\n\nAlpha beta gamma\n', { suppressErrorDialog: true })
  try {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await sendIpcToRenderer(app, 'mt::set-view-layout', { showSideBar: true })
    const activeEffects = () => page.evaluate(() => document.getAnimations().filter(animation => {
      const target = (animation.effect as KeyframeEffect | null)?.target
      return target instanceof Element && target.matches('.side-bar, .right-column, .side-bar-folder, .opened-files-list, .tree-wrapper, .editor-wrapper, .source-code, .editor-context-menu, .editor-context-menu *, .editor-mode-switch *, .el-dialog, .el-overlay, .el-overlay-dialog') && (animation.playState === 'running' || animation.playState === 'finished')
    }).length)
    const rail = page.locator('.side-bar-rail .rail-icon').first()
    await rail.click()
    await rail.click()
    await expect(page.locator('.right-column')).toBeVisible()
    await expect.poll(activeEffects).toBe(0)
    const width = await page.locator('.side-bar').evaluate(element => element.getBoundingClientRect().width)
    await page.locator('.side-bar-rail .rail-icon').nth(1).click()
    await expect(page.locator('.side-bar .search-wrapper')).toBeVisible()
    await expect.poll(activeEffects).toBe(0)
    expect(await page.locator('.side-bar').evaluate(element => element.getBoundingClientRect().width)).toBe(width)
    await rail.click()

    const paragraph = page.locator('.editor-component p .mu-paragraph-content').first()
    await paragraph.click({ button: 'right' })
    const menu = page.locator('.editor-context-menu:not(.context-submenu)')
    await expect(menu).toBeVisible()
    await menu.locator('[data-id="insert"]').hover()
    const submenu = page.locator('.context-submenu')
    await expect(submenu).toBeVisible()
    await expect.poll(activeEffects).toBe(0)
    expect(await submenu.evaluate(element => {
      const rect = element.getBoundingClientRect()
      return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
    })).toBe(true)
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)

    await enterSourceMode(page, app)
    await expect.poll(activeEffects).toBe(0)
    await page.evaluate(() => {
      const element = document.querySelector('.source-code .CodeMirror') as (HTMLElement & { CodeMirror?: { setValue(value: string): void } }) | null
      element?.CodeMirror?.setValue('# Motion\n\nImmediate handoff\n')
    })
    await exitSourceMode(page, app)
    await expect(page.locator('.source-code')).toHaveCount(0)
    await expect(paragraph).toContainText('Immediate handoff')
    await expect.poll(activeEffects).toBe(0)
    expect(await page.locator('.editor-wrapper').evaluate(element => getComputedStyle(element).willChange)).toBe('auto')

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await enterSourceMode(page, app)
    expect(await activeEffects()).toBe(0)
    await exitSourceMode(page, app)
    expect(await activeEffects()).toBe(0)
    await rail.click()
    await rail.click()
    expect(await activeEffects()).toBe(0)
    await paragraph.click({ button: 'right' })
    await menu.locator('[data-id="insert"]').hover()
    await expect(submenu).toBeVisible()
    expect(await activeEffects()).toBe(0)
    await page.keyboard.press('Escape')
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())).catch(() => {})
    await app.close()
  }
})
