import { expect, test } from '@playwright/test'
import { _electron, type ElectronApplication, type Page } from 'playwright'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

// Measures the widened default editing column with a real Chromium layout
// engine driven through Electron. `pnpm test:e2e` normally boots the packaged
// app, but `build:unpack` is currently broken for an unrelated reason (muya
// imports a missing `assets/styles/toc.css`), so this spec loads the shipped
// stylesheets into a standalone file:// page instead — the layout maths is
// identical, and a page we author ourselves carries no app CSP.

const OLD_DESKTOP_WIDTH = 750
const NEW_DESKTOP_WIDTH = 1000

// Wrapping must be driven purely by column width, and the text must outlast the
// widened column so the per-line count can actually grow.
const PROBE_TEXT = '国'.repeat(600) + 'a'.repeat(600)

const REPO_ROOT = resolve(__dirname, '../../../..')

const STYLESHEETS = [
  resolve(REPO_ROOT, 'packages/muya/src/assets/styles/index.css'),
  resolve(REPO_ROOT, 'packages/muya/src/assets/styles/blockSyntax.css'),
  resolve(REPO_ROOT, 'packages/desktop/src/renderer/src/assets/styles/index.css')
]

const toFileUrl = (file: string) =>
  `file:///${file.replace(/\\/g, '/')}`

const columnWidth = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const container = document.querySelector('.mu-container') as HTMLElement | null
    return container ? Number.parseFloat(getComputedStyle(container).maxWidth) : NaN
  })

/**
 * Characters that fit on the first rendered line. Measures each character's own
 * rect and counts the run sharing the first line's top — one Range over a long
 * run collapses to a single rect and cannot reveal where the line breaks.
 */
const charsOnFirstLine = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const probe = document.querySelector('#probe') as HTMLElement | null
    const node = probe?.firstChild as Text | null
    if (!node) return 0

    const range = document.createRange()
    const topAt = (index: number) => {
      range.setStart(node, index)
      range.setEnd(node, index + 1)
      const rect = range.getBoundingClientRect()
      return rect.top
    }

    const firstTop = topAt(0)
    for (let i = 1; i < node.length; i++) {
      if (topAt(i) !== firstTop) return i
    }
    return node.length
  })

const forceWidth = (page: Page, px: number): Promise<void> =>
  page.evaluate((value) => {
    const style = document.createElement('style')
    style.textContent =
      `:root { --editorAreaWidth: ${value}px; --editor-area-width: ${value}px; }`
    document.head.appendChild(style)
  }, px)

test.describe('default editor line width (widened)', () => {
  let app: ElectronApplication
  let page: Page
  let workDir: string

  test.beforeEach(async() => {
    workDir = mkdtempSync(resolve(tmpdir(), 'marktext-width-'))
    const html = `<!doctype html>
<html><head>
${STYLESHEETS.map(file => `<link rel="stylesheet" href="${toFileUrl(file)}">`).join('\n')}
</head>
<body><div class="mu-container"><p id="probe"></p></div></body></html>`
    const htmlFile = resolve(workDir, 'probe.html')
    writeFileSync(htmlFile, html)

    app = await _electron.launch({
      args: ['--no-sandbox', '--disable-gpu']
    })
    page = await app.firstWindow()
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.goto(toFileUrl(htmlFile))
    await page.evaluate((text) => {
      const probe = document.querySelector('#probe') as HTMLElement
      probe.textContent = text
    }, PROBE_TEXT)
    await page.waitForFunction(
      () => (document.querySelector('#probe') as HTMLElement)?.textContent?.length > 0
    )
  })

  test.afterEach(async() => {
    if (app) await app.close()
    if (workDir) rmSync(workDir, { recursive: true, force: true })
  })

  test('the editing column resolves to the widened default', async() => {
    expect(await columnWidth(page)).toBeCloseTo(NEW_DESKTOP_WIDTH, 0)
  })

  test('more characters fit per line than at the old width', async() => {
    const widened = await charsOnFirstLine(page)

    await forceWidth(page, OLD_DESKTOP_WIDTH)
    expect(await columnWidth(page)).toBeCloseTo(OLD_DESKTOP_WIDTH, 0)
    const narrow = await charsOnFirstLine(page)

    expect(widened).toBeGreaterThan(narrow)
    // 750 → 1000px is a third wider, so per-line gain should land near that.
    const gain = widened / narrow
    expect(gain).toBeGreaterThan(1.2)
    expect(gain).toBeLessThan(1.5)
  })
})
