import { expect, test } from '@playwright/test'
import { expectNoRendererErrors, getMarkdownContent, launchWithMarkdown } from './helpers'

test('settings categories, native and Element scrollbars, and arcade share typography and spacing', async() => {
  test.setTimeout(90000)
  const { app, page } = await launchWithMarkdown('# Surface styles\n\nKeep the document unchanged.\n', { suppressErrorDialog: true, preferences: { theme: 'light' } })
  try {
    const original = await getMarkdownContent(page, app)
    await page.keyboard.press('Control+Alt+g')
    const arcade = page.getByRole('dialog', { name: '小憩', exact: true })
    await expect(arcade).toBeVisible()
    const metrics = await arcade.evaluate(element => {
      const style = getComputedStyle(element)
      return { font: style.fontFamily, size: style.fontSize, radius: getComputedStyle(element, '::-webkit-scrollbar-thumb').borderRadius, width: getComputedStyle(element, '::-webkit-scrollbar').width }
    })
    expect(metrics.size).toBe('14px')
    expect(metrics.radius).toBe('999px')
    expect(metrics.width).toBe('10px')
    await expect(arcade.locator('.arcade-board')).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: '../../.tools/surfaces-arcade-light.png' })
    await arcade.getByRole('button', { name: '经典精选', exact: true }).click()
    const catalog = arcade.locator('.js13k-catalog')
    await expect(catalog.locator('.js13k-card').first()).toBeVisible()
    expect(await catalog.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2)
    expect(await arcade.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true)
    await arcade.evaluate(el => el.scrollTo(0, el.scrollHeight))
    await expect(catalog.locator('.js13k-card').last()).toBeInViewport()
    await arcade.evaluate(el => el.scrollTo(0, 0))
    await page.screenshot({ path: '../../.tools/surfaces-arcade-library.png' })
    await page.keyboard.press('Escape')
    const settingsPromise = app.waitForEvent('window')
    await app.evaluate(({ ipcMain }) => ipcMain.emit('app-create-settings-window'))
    const settings = await settingsPromise
    await expect(settings.locator('.pref-general')).toBeVisible()
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/preference'))?.setSize(1100, 820))
    const categories = settings.locator('.pref-sidebar .category .item')
    const settle = () => settings.locator('.pref-setting').evaluate(async element => {
      await new Promise(requestAnimationFrame)
      await Promise.allSettled(element.getAnimations().map(animation => animation.finished))
    })
    for (let index = 0; index < await categories.count(); index++) {
      await categories.nth(index).click()
      await expect(categories.nth(index)).toHaveAttribute('aria-current', 'page')
      await expect(settings.locator('.pref-setting h4')).toBeVisible()
      const styles = await settings.locator('.pref-setting').evaluate(element => ({
        font: getComputedStyle(element).fontFamily,
        size: getComputedStyle(element).fontSize,
        radius: getComputedStyle(element, '::-webkit-scrollbar-thumb').borderRadius,
        width: getComputedStyle(element, '::-webkit-scrollbar').width,
        overflow: element.scrollWidth > element.clientWidth + 1,
        scroll: element.scrollTop
      }))
      expect(styles).toEqual({ font: metrics.font, size: '14px', radius: '999px', width: '10px', overflow: false, scroll: 0 })
      const label = (await categories.nth(index).innerText()).trim()
      if (['通用', '图片', '快捷键'].includes(label)) {
        await settle()
        await settings.screenshot({ path: `../../.tools/surfaces-settings-${index}.png` })
      }
    }
    await categories.first().click()
    await settings.locator('.pref-select-item').filter({ hasText: /^缩放/ }).locator('.el-select').click()
    const popper = settings.locator('.el-popper.pref-control-popper:visible')
    await expect(popper).toBeVisible()
    const customBar = popper.locator('.el-scrollbar__bar.is-vertical')
    expect(await customBar.evaluate(el => getComputedStyle(el).width)).toBe('4px')
    expect(await popper.locator('.el-scrollbar__thumb').first().evaluate(el => getComputedStyle(el).borderRadius)).toBe('999px')
    expect(await popper.locator('.el-scrollbar__wrap').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true)
    await settings.keyboard.press('Escape')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/preference'))?.setSize(760, 560))
    for (let index = 0; index < await categories.count(); index++) {
      await categories.nth(index).click()
      await expect(categories.nth(index)).toHaveAttribute('aria-current', 'page')
      expect(await settings.locator('.pref-setting').evaluate(el => el.scrollWidth > el.clientWidth + 1), await categories.nth(index).innerText()).toBe(false)
    }
    await categories.filter({ hasText: /^图片$/ }).click()
    expect(await settings.locator('.pref-setting').evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(false)
    await settle()
    await settings.screenshot({ path: '../../.tools/surfaces-settings-compact.png' })
    await categories.filter({ hasText: /^主题$/ }).click()
    await settings.locator('.theme.dark').click()
    await categories.first().click()
    await settle()
    await settings.screenshot({ path: '../../.tools/surfaces-settings-dark.png' })
    await settings.getByRole('button', { name: '返回应用' }).click()
    await page.keyboard.press('Control+Alt+g')
    await expect(arcade).toBeVisible()
    await page.screenshot({ path: '../../.tools/surfaces-arcade-dark.png' })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(620, 760))
    await expect.poll(() => catalog.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(1)
    expect(await arcade.evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(false)
    await page.screenshot({ path: '../../.tools/surfaces-arcade-compact.png' })
    await page.keyboard.press('Escape')
    expect(await getMarkdownContent(page, app)).toBe(original)
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close()
  }
})
