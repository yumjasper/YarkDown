import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { clickMenuById, launchWithMarkdown } from './helpers'

/**
 * #4831: every dark theme kept a light table surface and dark math glyphs.
 * `@muyajs/core` declares light defaults for the kebab-case editor variables in
 * its own `:root` block, and that stylesheet is a lazy chunk link emitted after
 * the theme `<style>`, so it won over the theme on equal specificity. Themes are
 * now patched to `:root:root`. These assertions pin the behaviour, which a
 * `body.dark` class check cannot catch.
 */

const SAMPLE = [
  '# 主题表格检查',
  '',
  '| 课堂角色 | 本项目的对应对象 |',
  '| --- | --- |',
  '| 摄影棚 | UE 里的固定几何体与固定材质 |',
  '| 灯的旋钮 | 位置、RGB 发光强度、衰减半径 |',
  '',
  '$$',
  '\\int_0^1 x^2 \\, dx = \\frac{1}{3}',
  '$$',
  ''
].join('\n')

const DARK_THEMES = ['dark', 'typora-dracula', 'typora-nord', 'typora-github-dark']
const LIGHT_THEMES = ['light', 'typora-github']

const parseColor = (color: string): [number, number, number, number] | null => {
  const match = /rgba?\(([^)]+)\)/.exec(color)
  if (!match) return null
  const parts = match[1].split(',').map((part) => Number(part.trim()))
  return [parts[0], parts[1], parts[2], parts[3] ?? 1]
}

const luma = ([r, g, b]: [number, number, number, number]): number => r * 0.299 + g * 0.587 + b * 0.114

/** -1 marks an unparseable colour so assertions fail loudly instead of silently passing. */
const lumaOf = (color: string): number => {
  const parsed = parseColor(color)
  return parsed ? luma(parsed) : -1
}

/**
 * Row washes are translucent overlays, so their brightness is only meaningful
 * once composited over the editor surface underneath.
 */
const compositeLuma = (overlay: string, base: string): number => {
  const top = parseColor(overlay)
  const bottom = parseColor(base)
  if (!top || !bottom) return -1
  const alpha = top[3]
  if (alpha === 0) return luma(bottom)
  return luma([
    top[0] * alpha + bottom[0] * (1 - alpha),
    top[1] * alpha + bottom[1] * (1 - alpha),
    top[2] * alpha + bottom[2] * (1 - alpha),
    1
  ])
}

const readSurfaces = async(page: Page) => {
  return await page.evaluate(() => {
    const style = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) return null
      const computed = getComputedStyle(element)
      return { background: computed.backgroundColor, color: computed.color }
    }
    // Read the theme surface through a probe so translucent rows can be
    // composited against the colour actually behind them.
    const probe = document.createElement('div')
    probe.style.background = 'var(--editor-bg-color)'
    probe.style.position = 'absolute'
    probe.style.visibility = 'hidden'
    document.body.appendChild(probe)
    const editorBg = getComputedStyle(probe).backgroundColor
    probe.remove()
    return {
      editorBg,
      oddRow: style('.mu-table-inner tr:nth-child(1)'),
      evenRow: style('.mu-table-inner tr:nth-child(2)'),
      cell: style('.mu-table-inner td'),
      math: style('figure.mu-math-block .katex')
    }
  })
}

test.describe('Dark theme table and math surfaces', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown(SAMPLE, {
      preferences: { tabBarVisibility: true, titleBarVisibility: true }
    })
    app = launched.app
    page = launched.page
    await expect(page.locator('.editor-component .mu-table-inner').first()).toBeVisible()
    await expect(page.locator('.editor-component .katex').first()).toBeVisible()
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  for (const theme of DARK_THEMES) {
    test(`${theme} paints dark table rows with light text and math`, async() => {
      await clickMenuById(app, theme)
      await expect(page.locator('body')).toHaveClass(/(^|\s)dark(\s|$)/)
      await expect
        .poll(
          async() => {
            const state = await readSurfaces(page)
            return state.editorBg
          },
          { timeout: 10000 }
        )
        // The editor surface must be themed, i.e. not the light default.
        .not.toBe('rgb(255, 255, 255)')

      const state = await readSurfaces(page)
      const { cell, math, oddRow, evenRow, editorBg } = state
      if (!cell || !math || !oddRow || !evenRow) throw new Error('table or math not rendered')
      const textLuma = lumaOf(cell.color)
      const mathLuma = lumaOf(math.color)
      const oddLuma = compositeLuma(oddRow.background, editorBg)
      const evenLuma = compositeLuma(evenRow.background, editorBg)

      // Light glyphs on a dark surface. Before the fix both were dark, which is
      // what made math and table text unreadable in dark themes.
      expect(textLuma, `${theme} table text`).toBeGreaterThan(150)
      expect(mathLuma, `${theme} math`).toBeGreaterThan(150)
      expect(oddLuma, `${theme} odd row`).toBeLessThan(90)
      expect(evenLuma, `${theme} even row`).toBeLessThan(90)
    })
  }

  for (const theme of LIGHT_THEMES) {
    test(`${theme} keeps light table rows with dark text`, async() => {
      await clickMenuById(app, theme)
      await page.waitForFunction(() => !document.body.classList.contains('dark'), null, {
        timeout: 5000
      })
      const state = await readSurfaces(page)
      const { cell, oddRow, editorBg } = state
      if (!cell || !oddRow) throw new Error('table not rendered')
      const textLuma = lumaOf(cell.color)
      const oddLuma = compositeLuma(oddRow.background, editorBg)

      // The specificity bump must not change light themes.
      expect(textLuma, `${theme} table text`).toBeLessThan(150)
      expect(oddLuma, `${theme} odd row`).toBeGreaterThan(200)
    })
  }
})
