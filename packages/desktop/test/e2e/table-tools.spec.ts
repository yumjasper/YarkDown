import { expect, test } from '@playwright/test'
import { launchWithMarkdown, getMarkdownContent, setSourceMarkdown, expectNoRendererErrors, sendIpcToRenderer } from './helpers'

test('table layout, toolbar, resizing and context actions preserve document content', async() => {
  test.setTimeout(60000)
  const markdown = '# Lighting\n\n| Topic | Read more |\n| --- | --- |\n| MegaLights 灯分流 / DefaultShadowMethod / RT-VSM 混用 / 平台闸门 | [Lighting](rendering/lighting-direct) |\n| MegaLights 阴影 / HZB / HWRT / SDF / VSM / 体积 | [Shadow notes](rendering/shadows) |\n\nAfter table.\n'
  const { app, page } = await launchWithMarkdown(markdown, { suppressErrorDialog: true })
  const tool = (id: string) => page.locator(`[data-table-tool="${id}"]`)
  const action = (id: string) => page.locator(`[data-table-action="${id}"]`)
  const bodyCell = () => page.locator('.mu-table-inner tr').nth(1).locator('.mu-table-cell-content').first()
  try {
    await expect(page.locator('.mu-table-inner tr')).toHaveCount(3)
    const layout = await page.locator('.mu-table-inner').evaluate(node => {
      const table = node as HTMLTableElement
      const rect = table.getBoundingClientRect()
      return {
        width: rect.width,
        parentWidth: table.closest('figure')!.getBoundingClientRect().width,
        firstColumn: table.rows[1].cells[0].getBoundingClientRect().width,
        odd: getComputedStyle(table.rows[0]).backgroundColor,
        even: getComputedStyle(table.rows[1]).backgroundColor
      }
    })
    expect(Math.abs(layout.width - layout.parentWidth)).toBeLessThan(3)
    expect(layout.firstColumn / layout.width).toBeGreaterThan(0.45)
    expect(layout.odd).not.toBe(layout.even)
    await bodyCell().click()
    await expect(tool('resize')).toBeVisible()
    await tool('center').click()
    await expect.poll(() => getMarkdownContent(page, app)).toMatch(/:-+:/)
    await tool('resize').click()
    await page.getByRole('spinbutton', { name: '列数', exact: true }).fill('3')
    await page.getByRole('spinbutton', { name: '行数（包含表头）', exact: true }).fill('5')
    await page.screenshot({ path: '../../.tools/table-resize-preview.png' })
    await page.locator('.table-tools-size button').click()
    await expect(page.locator('.mu-table-inner tr')).toHaveCount(5)
    await expect(page.locator('.mu-table-inner tr').first().locator('td')).toHaveCount(3)
    expect(await getMarkdownContent(page, app)).toContain('DefaultShadowMethod')

    await tool('more').click()
    await page.screenshot({ path: '../../.tools/table-menu-preview.png' })
    await action('row-below').click()
    await expect(page.locator('.mu-table-inner tr')).toHaveCount(6)
    await tool('more').click()
    await action('copy').click()
    const copied = await app.evaluate(({ clipboard }) => clipboard.readText())
    expect(copied).toContain('Shadow notes')
    expect(copied).not.toContain('After table.')
    await page.screenshot({ path: '../../.tools/table-tools-preview.png' })

    await bodyCell().click({ button: 'right' })
    await page.locator('.editor-context-menu [data-id="table"]').hover()
    await page.locator('.editor-context-menu [data-id="table-column-right"]').click()
    await expect(page.locator('.mu-table-inner tr').first().locator('td')).toHaveCount(4)
    await bodyCell().click({ button: 'right' })
    await page.locator('.editor-context-menu [data-id="insert"]').hover()
    await expect(page.locator('.editor-context-menu [data-id="code-block"]')).toHaveCount(0)
    await page.locator('.editor-context-menu [data-id="insert-before"]').click()
    await expect(page.locator('.mu-table-inner tr')).toHaveCount(6)

    await setSourceMarkdown(page, app, markdown)
    await bodyCell().click()
    await tool('resize').click()
    await page.getByRole('button', { name: '3 × 4', exact: true }).click()
    await expect(page.locator('.mu-table-inner tr')).toHaveCount(4)
    await expect(page.locator('.mu-table-inner tr').first().locator('td')).toHaveCount(3)
    await page.waitForTimeout(300)
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect(page.locator('.mu-table-inner tr')).toHaveCount(3)
    expect(await getMarkdownContent(page, app)).toContain('DefaultShadowMethod')
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})
