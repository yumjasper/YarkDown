import { expect, test } from '@playwright/test'
import { expectNoRendererErrors, launchWithMarkdown } from './helpers'

test('底部切换保留编辑内容，状态文字居中且侧栏保留顶部间距', async() => {
  const { app, page } = await launchWithMarkdown('# 布局检查\n\n正文内容\n', {
    suppressErrorDialog: true,
    preferences: { sideBarVisibility: true, restoreLayoutState: true, openedFilesInSidebar: true }
  })
  try {
    const source = page.locator('.editor-mode-switch button').first()
    const rendered = page.locator('.editor-mode-switch button').last()
    await expect(rendered).toHaveAttribute('aria-pressed', 'true')
    await source.click()
    await expect(source).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.source-code .CodeMirror')).toBeVisible()
    await page.locator('.source-code .CodeMirror').evaluate(element => {
      const cm = (element as HTMLElement & { CodeMirror: { setValue(value: string): void } }).CodeMirror
      cm.setValue('# 布局检查\n\n修改后内容\n')
    })
    await rendered.click()
    await expect(page.locator('.editor-component')).toContainText('修改后内容')
    await expect(rendered).toHaveAttribute('aria-pressed', 'true')
    await rendered.click()
    await expect(page.locator('.source-code')).toHaveCount(0)

    for (const zoom of [0.75, 1, 1.5]) {
      await app.evaluate(({ BrowserWindow }, factor) => {
        BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(factor)
      }, zoom)
      const offset = await page.locator('.editor-status-bar').evaluate(bar => {
        const label = bar.querySelector('.word-count span')
        if (!label) throw new Error('字数统计未显示')
        const text = label.getBoundingClientRect()
        const bounds = bar.getBoundingClientRect()
        return Math.abs((text.top + text.bottom - bounds.top - bounds.bottom) / 2)
      })
      expect(offset).toBeLessThanOrEqual(1)
      const gap = await page.locator('.right-column').evaluate(panel => {
        const heading = panel.querySelector('.opened-files > .title')
        if (!heading) throw new Error('文件区标题未显示')
        const bounds = heading.getBoundingClientRect()
        const label = heading.querySelector('span')
        const icon = heading.querySelector('.el-icon')
        if (!label || !icon) throw new Error('文件区标题内容未显示')
        return {
          top: label.getBoundingClientRect().top - panel.getBoundingClientRect().top,
          left: icon.getBoundingClientRect().left - panel.getBoundingClientRect().left,
          height: bounds.height
        }
      })
      expect(Math.abs(gap.top - gap.left)).toBeLessThanOrEqual(5)
      expect(gap.height).toBeGreaterThanOrEqual(32)
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1))
    await page.locator('.rail-icon').nth(1).click()
    await expect(page.locator('.side-bar-search')).toBeVisible()
    await page.locator('.rail-icon').nth(2).click()
    await expect(page.locator('.side-bar-toc')).toBeVisible()
    await page.screenshot({ path: '../../.tools/editor-chrome-preview.png' })
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})
