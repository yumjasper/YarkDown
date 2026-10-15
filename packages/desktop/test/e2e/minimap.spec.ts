import { expect, test } from '@playwright/test'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type CodeMirror from 'codemirror'
import { clickMenuById, expectNoRendererErrors, launchWithDoc, sendIpcToRenderer } from './helpers'

test('navigates TXT and Markdown with the minimap, persists options and virtualizes large source files', async() => {
  test.setTimeout(120000)
  const folder = mkdtempSync(path.join(tmpdir(), 'yarktext-minimap-'))
  const filename = path.join(folder, 'long.txt')
  writeFileSync(filename, Array.from({ length: 6000 }, (_, i) => `Line ${i}: a plain text line`).join('\n'))
  const { app, page } = await launchWithDoc(filename, { suppressErrorDialog: true, preferences: { txtWordWrap: false } })
  const scrollInfo = () => page.locator('.plain-text-editor .CodeMirror').evaluate(element => (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror.getScrollInfo())
  try {
    const minimap = page.locator('.editor-minimap')
    await expect(minimap).toBeVisible()
    await expect(minimap.locator('.minimap-tiles canvas[data-renderer="worker"]').first()).toBeAttached()
    await expect.poll(() => minimap.locator('.minimap-tiles canvas[data-renderer="worker"]').first().evaluate(element => {
      const canvas = element as HTMLCanvasElement
      const snapshot = document.createElement('canvas')
      snapshot.width = canvas.width
      snapshot.height = canvas.height
      const context = snapshot.getContext('2d')
      if (!context) return false
      context.drawImage(canvas, 0, 0)
      return context.getImageData(0, 0, snapshot.width, snapshot.height).data.some((value, index) => index % 4 === 3 && value > 0)
    })).toBe(true)
    const box = (await minimap.boundingBox())!
    await minimap.click({ position: { x: box.width / 2, y: box.height / 2 } })
    await expect.poll(async() => (await scrollInfo()).top).toBeGreaterThan(0)
    await minimap.focus()
    await page.keyboard.press('Home')
    await expect.poll(async() => (await scrollInfo()).top).toBe(0)
    await minimap.evaluate(element => {
      const bounds = element.getBoundingClientRect()
      const slider = element.querySelector('.minimap-slider')!.getBoundingClientRect()
      element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, pointerId: 1, clientX: slider.x + slider.width / 2, clientY: slider.y + slider.height / 2 }))
      element.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 1, pointerId: 1, clientX: bounds.x + bounds.width / 2, clientY: bounds.y + bounds.height * .85 }))
      element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1 }))
    })
    await expect.poll(async() => { const info = await scrollInfo(); return info.top / (info.height - info.clientHeight) }).toBeGreaterThan(.7)
    const beforeWheel = (await scrollInfo()).top
    await page.mouse.wheel(0, -200)
    await expect.poll(async() => (await scrollInfo()).top).toBeLessThan(beforeWheel)
    await app.evaluate(({ Menu }) => {
      Menu.prototype.popup = function(options) {
        Object.assign(globalThis, { __minimapMenu: this, __minimapClose: options?.callback })
      }
    })
    const choose = async(label: string, parent?: string) => {
      await app.evaluate(({ BrowserWindow }, selection) => {
        const state = globalThis as typeof globalThis & { __minimapMenu: Electron.Menu; __minimapClose?: () => void }
        const menu = selection.parent ? state.__minimapMenu.items.find(item => item.label === selection.parent)?.submenu : state.__minimapMenu
        const item = menu?.items.find(item => item.label === selection.label)
        if (!item) throw new Error('Missing minimap menu item: ' + selection.label)
        item.click(undefined, BrowserWindow.getAllWindows()[0], undefined)
        state.__minimapClose?.()
      }, { label, parent })
    }
    const bar = page.locator('.plain-text-editor .CodeMirror-vscrollbar')
    await bar.click({ button: 'right', position: { x: 5, y: 40 } })
    await expect.poll(() => app.evaluate(() => {
      const state = globalThis as typeof globalThis & { __minimapMenu?: Electron.Menu }
      return state.__minimapMenu?.items.map(item => item.label)
    })).toContain('垂直大小')
    await choose('适应窗口', '垂直大小')
    await minimap.click({ button: 'right' })
    await choose('渲染字符')
    await minimap.hover()
    await minimap.locator('.minimap-close').click()
    await expect(minimap).toHaveCount(0)
    await bar.click({ button: 'right', position: { x: 5, y: 40 } })
    await choose('显示缩略图')
    await expect(minimap).toBeVisible()
    await expect(minimap.locator('.minimap-tiles canvas').first()).toHaveJSProperty('width', 200)
    const preferencesPath = await app.evaluate(({ app }) => app.getPath('userData'))
    await expect.poll(() => JSON.parse(readFileSync(path.join(preferencesPath, 'preferences.json'), 'utf8'))).toMatchObject({ minimapSize: 'fit', minimapRenderCharacters: false, minimapEnabled: true })
    const markdown = Array.from({ length: 3000 }, (_, i) => `Paragraph ${i} with **bold** content and text for a long document.\n\n`).join('')
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, markdown)
    await expect(page.locator('.editor-component')).toContainText('Paragraph 2399')
    await expect(minimap).toBeVisible()
    const editor = page.locator('.editor-component')
    const bounds = await editor.boundingBox()
    if (!bounds) throw new Error('Markdown editor is hidden')
    await page.mouse.click(bounds.x + bounds.width - 6, bounds.y + 80, { button: 'right' })
    await choose('左侧', '显示位置')
    await expect(page.locator('.container')).toHaveClass(/minimap-left/)
    await minimap.click({ button: 'right' })
    await choose('右侧', '显示位置')
    await expect(page.locator('.container')).not.toHaveClass(/minimap-left/)
    await clickMenuById(app, 'sourceCodeModeMenuItem')
    await expect(page.locator('.source-code')).toHaveClass(/virtualized/)
    await page.locator('.source-code .CodeMirror-vscrollbar').click({ button: 'right', position: { x: 5, y: 40 } })
    await choose('始终显示', '视口滑块')
    await expect(minimap).toHaveClass(/slider-always/)
    const sliderAlpha = await minimap.locator('.minimap-slider').evaluate(element => {
      const color = getComputedStyle(element).backgroundColor
      return Number(color.slice(color.lastIndexOf(',') + 1, -1))
    })
    expect(sliderAlpha).toBeGreaterThan(0)
    expect(sliderAlpha).toBeLessThan(.3)
    await expect.poll(() => page.locator('.source-code .CodeMirror-code > div').count()).toBeLessThan(500)
    await minimap.focus()
    await page.keyboard.press('End')
    await expect.poll(() => page.locator('.source-code .CodeMirror').evaluate(element => (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror.getScrollInfo().top)).toBeGreaterThan(1000)
    await clickMenuById(app, 'sourceCodeModeMenuItem')
    await expect(page.locator('.editor-component')).toContainText('Paragraph 2399')
    await expectNoRendererErrors(app)
    await page.screenshot({ path: path.resolve('../../.tools/minimap-preview.png') })
  } finally {
    await app.close()
    rmSync(folder, { recursive: true, force: true })
  }
})
