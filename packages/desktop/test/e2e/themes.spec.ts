import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, clickMenuById, setSourceMarkdown } from './helpers'

test.describe('Theme switching', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Theme test\n\nHello theme world.\n')
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await app.close()
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
      await clickMenuById(app, theme)
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
