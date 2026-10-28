import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import {
  launchWithMarkdown,
  expectNoRendererErrors,
  enterSourceMode,
  exitSourceMode,
  clickMenuById
} from './helpers'

test('window chrome and toolbar follow the editor column', async() => {
  test.setTimeout(60000)
  const { app, page } = await launchWithMarkdown('# Preview\n\nAn editor layout preview.\n', {
    suppressErrorDialog: true,
    env: { MARKTEXT_EXIT_ON_ERROR: '1' },
    preferences: { titleBarStyle: 'custom', restoreLayoutState: false }
  })
  const setLayout = async(showSideBar: boolean, sideBarWidth = 240) => {
    await page.evaluate(
      ({ showSideBar, sideBarWidth }) => {
        const root = document.querySelector('#app') as Element & {
          __vue_app__: {
            config: {
              globalProperties: {
                $pinia: { _s: Map<string, { SET_LAYOUT: (layout: object) => void }> }
              }
            }
          }
        }
        root.__vue_app__.config.globalProperties.$pinia._s
          .get('layout')
          ?.SET_LAYOUT({ showSideBar, rightColumn: 'files', sideBarWidth })
      },
      { showSideBar, sideBarWidth }
    )
  }
  const geometry = () =>
    page.evaluate(() => {
      const editorEl = document.querySelector('.editor-with-tabs')!
      const editor = editorEl.getBoundingClientRect()
      const toolbar = document.querySelector('.bottom-toolbar')!.getBoundingClientRect()
      const sidebar = document.querySelector('.side-bar')!.getBoundingClientRect()
      return {
        error: Math.abs(toolbar.x + toolbar.width / 2 - editor.x - editor.width / 2),
        center: toolbar.x + toolbar.width / 2,
        editorLeft: editor.left,
        sidebarRight: sidebar.right,
        // The card shell insets the editor from the sidebar by this margin, so
        // editorLeft and sidebarRight never coincide.
        gutter: parseFloat(getComputedStyle(editorEl).marginLeft)
      }
    })
  const centered = async() => {
    const deadline = Date.now() + 10000
    let last = await geometry()
    while (Date.now() < deadline && last.error >= 1) {
      await page.waitForTimeout(100)
      last = await geometry()
    }
    // Carry the measurements in the assertion message: a bare "expected < 1" on
    // an intermittent failure says nothing about which box moved.
    expect(last.error, `toolbar off centre: ${JSON.stringify(last)}`).toBeLessThan(1)
    await expect(page.locator('.bottom-toolbar')).toBeVisible()
  }
  try {
    await test.step('center in the editor with the sidebar hidden and expanded', async() => {
      await setLayout(false)
      await centered()
      const hiddenCenter = (await geometry()).center
      await setLayout(true)
      await centered()
      const expanded = await geometry()
      expect(expanded.center).toBeGreaterThan(hiddenCenter + 100)
      // The editor sits in its own card, inset from the sidebar by a fixed
      // gutter. Assert the gutter instead of expecting the two edges to touch:
      // the pre-1.0.9 flush layout is gone, but the editor must still border the
      // sidebar (no unstyled gap beyond that margin).
      expect(expanded.editorLeft - expanded.sidebarRight).toBeCloseTo(expanded.gutter, 1)
      expect(expanded.gutter).toBeGreaterThan(0)
      expect(expanded.gutter).toBeLessThan(8)
    })
    await test.step('follow collapse, repeated expansion and dragging without accumulating rail width', async() => {
      const rail = page.locator('.side-bar-rail .rail-icon').first()
      const width = (await page.locator('.side-bar').boundingBox())!.width
      for (let i = 0; i < 2; i++) {
        await rail.click()
        await centered()
        await rail.click()
        await centered()
        expect((await page.locator('.side-bar').boundingBox())!.width).toBe(width)
      }
      const handle = (await page.locator('.drag-bar').boundingBox())!
      await page.mouse.move(handle.x + 1, handle.y + 80)
      await page.mouse.down()
      await page.mouse.move(handle.x + 81, handle.y + 80)
      await page.mouse.up()
      await centered()
      expect((await page.locator('.side-bar').boundingBox())!.width).toBeGreaterThan(width + 70)
    })
    await test.step('keep title, menu, sidebar and status bands separate', async() => {
      await expect(page.locator('.title-bar')).toHaveCSS('height', '30px')
      await expect(page.locator('.menu-row')).toHaveCSS('height', '26px')
      const counter = page.locator('.editor-status-bar .word-count')
      await expect(counter).toBeVisible()
      const counterBox = (await counter.boundingBox())!
      const toolbarBox = (await page.locator('.bottom-toolbar').boundingBox())!
      expect(counterBox.y).toBeGreaterThanOrEqual(toolbarBox.y + toolbarBox.height)
      expect(counterBox.y + counterBox.height).toBeLessThanOrEqual(
        await page.evaluate(() => innerHeight)
      )
      const tintAlpha = await page.evaluate(() => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = getComputedStyle(
          document.querySelector('.title-bar-editor-bg')!
        ).backgroundColor
        ctx.fillRect(0, 0, 1, 1)
        return ctx.getImageData(0, 0, 1, 1).data[3]
      })
      expect(tintAlpha).toBeGreaterThan(0)
      expect(tintAlpha).toBeLessThan(100)
      const font = await page.locator('.menu-row').evaluate((el) => getComputedStyle(el).fontFamily)
      expect(font).toContain('Segoe UI')
    })
    await test.step('keep the toolbar and counter in source mode and after native window resizing', async() => {
      await enterSourceMode(page, app)
      await centered()
      await expect(page.locator('.editor-status-bar .word-count')).toBeVisible()
      await exitSourceMode(page, app)
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0]
        win.setBounds({ width: 1050, height: 700 })
      })
      await centered()
    })
    await test.step('keep dark-theme chrome readable and return to the light theme', async() => {
      await clickMenuById(app, 'typora-dracula')
      await expect(page.locator('body')).toHaveClass(/dark/)
      const colors = await page.evaluate(() => {
        const button = document.querySelector('.frameless-titlebar-button svg')!
        return {
          control: getComputedStyle(button).fill,
          sidebar: getComputedStyle(document.querySelector('.side-bar')!).backgroundColor
        }
      })
      expect(colors.control).not.toBe('rgb(0, 0, 0)')
      expect(colors.sidebar).not.toBe('rgb(250, 250, 250)')
      await centered()
      await clickMenuById(app, 'light')
      await expect(page.locator('body')).not.toHaveClass(/dark/)
    })
    await page.mouse.move(900, 550)
    await page.screenshot({
      path: test.info().outputPath('window-shell.png'),
      animations: 'disabled'
    })
    if (process.platform === 'win32') {
      const probe = await app.evaluate(async({ desktopCapturer, BrowserWindow, screen }) => {
        const win = BrowserWindow.getAllWindows()[0]
        const capture = async() => {
          const bounds = win.getBounds()
          const display = screen.getDisplayMatching(bounds)
          const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: {
              width: Math.round(display.size.width * display.scaleFactor),
              height: Math.round(display.size.height * display.scaleFactor)
            }
          })
          const source = sources.find((entry) => entry.display_id === String(display.id))
          if (!source) return null
          const ratio = source.thumbnail.getSize().width / display.bounds.width
          // Window capture omits DWM materials; crop the composed screen to this test window.
          const image = source.thumbnail.crop({
            x: Math.round((bounds.x - display.bounds.x) * ratio),
            y: Math.round((bounds.y - display.bounds.y) * ratio),
            width: Math.round(bounds.width * ratio),
            height: Math.round(bounds.height * ratio)
          })
          const size = image.getSize()
          const pixels = image.toBitmap()
          const offset = (Math.round(15 * ratio) * size.width + Math.floor(size.width * 0.7)) * 4
          return {
            color: [...pixels.subarray(offset, offset + 4)],
            png: image.toPNG().toString('base64')
          }
        }
        const before = await capture()
        const backing = new BrowserWindow({
          ...win.getBounds(),
          frame: false,
          backgroundColor: '#2462ac',
          show: false,
          skipTaskbar: true
        })
        try {
          await backing.loadURL(
            'data:text/html,<html><body style="margin:0;background:%232462ac;height:100vh"></body></html>'
          )
          backing.showInactive()
          win.moveTop()
          win.focus()
          const after = await capture()
          return {
            before: before?.color,
            after: after?.color,
            png: after?.png,
            beforePng: before?.png
          }
        } finally {
          backing.destroy()
        }
      })
      console.log(
        '[native backdrop]',
        JSON.stringify({ before: probe.before, behindBlueWindow: probe.after })
      )
      if (probe.png)
        await writeFile(
          test.info().outputPath('window-shell-native-blue.png'),
          Buffer.from(probe.png, 'base64')
        )
      if (probe.beforePng)
        await writeFile(
          test.info().outputPath('window-shell-composed.png'),
          Buffer.from(probe.beforePng, 'base64')
        )
      const image = await app.evaluate(async({ desktopCapturer, BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0]
        const sources = await desktopCapturer.getSources({
          types: ['window'],
          thumbnailSize: { width: 1050, height: 700 }
        })
        return sources
          .find((source) => source.id === win.getMediaSourceId())
          ?.thumbnail.toPNG()
          .toString('base64')
      })
      if (image)
        await writeFile(
          test.info().outputPath('window-shell-native.png'),
          Buffer.from(image, 'base64')
        )
    }
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})
