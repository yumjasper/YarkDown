import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, clickMenuById, setSourceMarkdown, closeApp } from './helpers'

test.describe('Theme switching', () => {
  let app: ElectronApplication
  let page: Page

  /**
   * Fingerprint of the injected theme stylesheet. Several themes share the same
   * `body.dark` state, so tests that switch between them must wait for the
   * stylesheet itself to change rather than for the class.
   */
  const readThemeStylesheet = async(): Promise<string> => {
    return await page.evaluate(() => document.getElementById('ag-theme')?.textContent ?? '')
  }

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Theme test\n\nHello theme world.\n')
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    await closeApp(app)
  })

  test('Switch to a dark theme adds body.dark', async() => {
    await clickMenuById(app, 'typora-dracula')
    await expect(page.locator('body')).toHaveClass(/(^|\s)dark(\s|$)/)
  })

  test('Switch to a light theme removes body.dark', async() => {
    await clickMenuById(app, 'light')
    await page.waitForFunction(() => !document.body.classList.contains('dark'), null, {
      timeout: 5000
    })
    expect(await page.evaluate(() => document.body.classList.contains('dark'))).toBe(false)
  })

  test('Switch back to dark theme re-applies body.dark', async() => {
    await clickMenuById(app, 'typora-nord')
    await expect(page.locator('body')).toHaveClass(/(^|\s)dark(\s|$)/)
  })

  // Item 282 — Prism code-block syntax highlighting token colors follow the
  // active theme. The @muyajs/core engine runs prism.highlightElement over the
  // code block content (codeBlockContent/index.ts), emitting standard Prism
  // token classes (span.token.keyword, span.token.number, …). Each theme ships
  // a matching Prism CSS (assets/themes/prismjs/<theme>.theme.css) that colors
  // those tokens. We assert the keyword token color is themed (non-default) and
  // differs between a dark theme (dracula) and the light baseline. Real pixel
  // fidelity stays manual; this just proves the wiring is live and theme-aware.
  test('Prism code-block token color follows the active theme', async() => {
    await setSourceMarkdown(page, app, '```js\nconst answer = 42\n```\n')

    // The language grammar loads asynchronously, so the token spans only
    // appear once prism.highlightElement has run. Poll until a keyword token
    // (rendered for `const`) shows up inside the editor's code block.
    await page.waitForFunction(
      () => !!document.querySelector('.editor-component span.token.keyword'),
      null,
      { timeout: 15000 }
    )

    const readKeywordColor = async(): Promise<string> => {
      return await page.evaluate(() => {
        const el = document.querySelector(
          '.editor-component span.token.keyword'
        ) as HTMLElement | null
        return el ? getComputedStyle(el).color : ''
      })
    }

    // Dark theme: typora-dracula colors `.token.keyword` #ff79c6 -> rgb(255, 121, 198).
    await clickMenuById(app, 'typora-dracula')
    await expect(page.locator('body')).toHaveClass(/(^|\s)dark(\s|$)/)
    let darkColor = ''
    await expect
      .poll(
        async() => {
          darkColor = await readKeywordColor()
          return darkColor
        },
        { timeout: 10000 }
      )
      // Themed (not the default black text color).
      .not.toBe('rgb(0, 0, 0)')
    expect(darkColor).not.toBe('')

    // Light baseline: removing body.dark restores the light Prism palette.
    await clickMenuById(app, 'light')
    await page.waitForFunction(() => !document.body.classList.contains('dark'), null, {
      timeout: 5000
    })
    let lightColor = ''
    await expect
      .poll(
        async() => {
          lightColor = await readKeywordColor()
          return lightColor
        },
        { timeout: 10000 }
      )
      .not.toBe('rgb(0, 0, 0)')
    expect(lightColor).not.toBe('')

    // The whole point: the keyword token is colored differently per theme.
    expect(lightColor).not.toBe(darkColor)
  })

  // `@muyajs/core` ships its own light Prism palette and imports it from
  // muya.ts, so it previously won over the theme's palette at equal
  // specificity and every dark theme rendered `#07a` keywords. Checking several
  // dark themes proves the fallback palette no longer outranks the theme.
  test('Prism token color differs across dark themes', async() => {
    await setSourceMarkdown(page, app, '```js\nconst answer = 42\n```\n')
    await page.waitForFunction(
      () => !!document.querySelector('.editor-component span.token.keyword'),
      null,
      { timeout: 15000 }
    )

    const readKeywordColor = async(): Promise<string> => {
      return await page.evaluate(() => {
        const element = document.querySelector(
          '.editor-component span.token.keyword'
        ) as HTMLElement | null
        return element ? getComputedStyle(element).color : ''
      })
    }

    const observed = new Map<string, string>()
    for (const theme of ['typora-dracula', 'typora-nord', 'typora-github-dark']) {
      // Waiting on `body.dark` is not enough: every dark theme keeps that class,
      // so the wait returns immediately and we would read the previous theme's
      // colour. Wait until the injected stylesheet actually holds this theme.
      const before = await readThemeStylesheet()
      await clickMenuById(app, theme)
      await expect.poll(readThemeStylesheet, { timeout: 10000 }).not.toBe(before)
      await expect(page.locator('body')).toHaveClass(/(^|\s)dark(\s|$)/)
      await expect
        .poll(async() => await readKeywordColor(), { timeout: 10000 })
        // The muya fallback palette's keyword colour; if it shows up, the
        // built-in stylesheet is outranking the theme again.
        .not.toBe('rgb(7, 122, 170)')
      observed.set(theme, await readKeywordColor())
    }

    const colors = [...observed.values()]
    expect(new Set(colors).size, `dark themes share one token colour: ${colors.join(' | ')}`)
      .toBeGreaterThan(1)
  })
})
