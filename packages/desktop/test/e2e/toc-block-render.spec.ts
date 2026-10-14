import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, waitForEditor, enterSourceMode, exitSourceMode } from './helpers'

const DOC = '# First\n\n## Second\n\n### Third\n\n[TOC]\n\nBody text.\n'

test.describe('[TOC] block', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown(DOC)
    app = launched.app
    page = launched.page
    await waitForEditor(page)
    await page.waitForSelector('.mu-toc-block', { timeout: 15000 })
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('renders the document headings as an outline', async() => {
    const toc = page.locator('.mu-toc-block')
    await expect(toc).toBeVisible()
    await expect(toc).toContainText('First')
    await expect(toc).toContainText('Second')
    await expect(toc).toContainText('Third')
  })

  test('indents nested headings by level', async() => {
    const indents = await page.evaluate(() => {
      const pick = (level: number) => {
        const el = document.querySelector(
          `.mu-toc-block .mu-toc-h${level} > span`
        ) as HTMLElement | null
        return el ? el.getBoundingClientRect().left : -1
      }
      return { h1: pick(1), h2: pick(2), h3: pick(3) }
    })

    expect(indents.h1).toBeGreaterThan(0)
    expect(indents.h2).toBeGreaterThan(indents.h1)
    expect(indents.h3).toBeGreaterThan(indents.h2)
  })

  test('keeps the [TOC] marker in the markdown', async() => {
    await enterSourceMode(page, app)
    const value = await page.evaluate(() => {
      const cm = document.querySelector('.source-code .CodeMirror') as
        | (Element & { CodeMirror?: { getValue(): string } })
        | null
      return cm && cm.CodeMirror ? cm.CodeMirror.getValue() : ''
    })
    await exitSourceMode(page, app)

    expect(value).toContain('[TOC]')
    expect(value).toContain('# First')
  })
})
