import { expect, test } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { expectNoRendererErrors, launchWithDoc } from './helpers'

test('PDF selection supports fluent offline glosses and selectable online providers', async() => {
  test.setTimeout(90000)
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yarktext-reading-'))
  const filename = path.join(directory, 'reading.pdf')
  const pdf = await PDFDocument.create()
  const sentence = 'The anomalous phenomenon was investigated by researchers.'
  pdf.addPage().drawText(sentence, { x: 40, y: 700, size: 12 })
  await writeFile(filename, await pdf.save())
  const { app, page } = await launchWithDoc(filename, { suppressErrorDialog: true })
  try {
    await expect(page.locator('.textLayer').first()).toContainText(sentence)
    await page
      .locator('.textLayer span')
      .first()
      .evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
      })
    await page
      .getByRole('toolbar', { name: '选区批注菜单' })
      .getByRole('button', { name: '翻译', exact: true })
      .click()
    const panel = page.getByRole('complementary', { name: '阅读助手' })
    await panel.getByLabel('学科词义', { exact: true }).selectOption('general')
    await expect(panel.locator('.annotated-passage')).toContainText('phenomenon')
    await expect(panel.locator('ruby')).not.toHaveCount(0)
    await expect(panel.locator('rt')).toContainText(['不规则的', '现象'])
    await panel.getByRole('button', { name: 'phenomenon：查词', exact: true }).click()
    await expect(panel.getByRole('region', { name: '单词释义' })).toContainText('现象')
    const senses = panel.locator('.senses button')
    expect(await senses.count()).toBeGreaterThan(1)
    await senses.nth(1).click()
    await expect(senses.nth(1)).toHaveAttribute('aria-pressed', 'true')
    await panel.getByRole('button', { name: '标为掌握', exact: true }).click()
    await expect(
      panel.getByRole('button', { name: 'phenomenon：查词', exact: true }).locator('ruby')
    ).toHaveCount(0)
    await panel.locator('.dictionary-info summary').click()
    await panel.getByRole('button', { name: '取消掌握 phenomenon', exact: true }).click()
    await panel.getByLabel('词下释义', { exact: true }).uncheck()
    await expect(panel.locator('ruby')).toHaveCount(0)
    await panel.getByLabel('词下释义', { exact: true }).check()
    await panel.locator('.dictionary-info summary').click()
    await page.screenshot({ path: '../../.tools/reading-vocabulary-wide.png' })
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(900, 680)
    )
    expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
    await page.screenshot({ path: '../../.tools/reading-vocabulary-narrow.png' })
    await app.evaluate(({ ipcMain }) => {
      const state = globalThis as unknown as {
        readingRequests: Array<{ source: string; provider: string }>
      }
      state.readingRequests = []
      ipcMain.removeHandler('mt::reading::translate')
      ipcMain.handle(
        'mt::reading::translate',
        async(_event, _id, request: { source: string; provider: string }) => {
          state.readingRequests.push(request)
          if (request.provider === 'google')
            await new Promise((resolve) => setTimeout(resolve, 600))
          return { ok: true, data: `${request.provider}：研究人员调查了这个异常现象。` }
        }
      )
    })
    await panel.getByRole('button', { name: '整句翻译在线', exact: true }).click()
    expect(
      await app.evaluate(
        () => (globalThis as unknown as { readingRequests: unknown[] }).readingRequests.length
      )
    ).toBe(0)
    await panel.getByRole('button', { name: '翻译成中文', exact: true }).click()
    await expect(panel.getByRole('region', { name: '中文译文' })).toContainText('bing：')
    await panel.getByRole('button', { name: '复制译文', exact: true }).click()
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toContain('研究人员')
    await panel.getByLabel('翻译服务', { exact: true }).selectOption('google')
    await expect(panel.locator('.translation-result')).toHaveCount(0)
    await panel.getByRole('button', { name: '翻译成中文', exact: true }).click()
    await panel.getByRole('button', { name: '取消翻译', exact: true }).click()
    await expect(panel.getByRole('alert')).toContainText('取消')
    await page.waitForTimeout(800)
    await expect(panel.locator('.translation-result')).toHaveCount(0)
    await panel.getByRole('button', { name: '翻译成中文', exact: true }).click()
    await expect(panel.getByRole('region', { name: '中文译文' })).toContainText('google：')
    await page.screenshot({ path: '../../.tools/reading-online-preview.png' })
    await panel.getByRole('button', { name: '生词辅助离线', exact: true }).click()
    await expect(panel.locator('.annotated-passage')).toContainText('phenomenon')
    await panel.getByRole('button', { name: '关闭翻译面板', exact: true }).click()
    await expect(page.locator('.pdf-reader canvas').first()).toBeVisible()
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((win) => win.destroy())
    )
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('probe actual official pages with a non-personal sentence', async() => {
  test.skip(process.env.YARKTEXT_READING_LIVE_TEST !== '1', 'Explicit live website probe only.')
  test.setTimeout(150000)
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yarktext-reading-live-'))
  const filename = path.join(directory, 'live.pdf')
  const pdf = await PDFDocument.create()
  pdf.addPage().drawText('Hello world.')
  await writeFile(filename, await pdf.save())
  const { app, page } = await launchWithDoc(filename, { suppressErrorDialog: true })
  try {
    for (const provider of ['bing', 'google'] as const) {
      const result = await page.evaluate(
        (provider) =>
          window.electron.ipcRenderer.invoke('mt::reading::translate', `live-${provider}`, {
            source: 'The researchers investigated an unusual phenomenon.',
            provider
          }),
        provider
      )
      console.log(`LIVE ${provider}: ${JSON.stringify(result)}`)
      if (result.ok) expect(result.data).toMatch(/[\u3400-\u9fff]/)
      else {
        expect(result.error).toBeTruthy()
        const diagnostic = await app.evaluate(async({ BrowserWindow }) => {
          const view = BrowserWindow.getAllWindows()[0].contentView.children.find(
            (view) => 'webContents' in view
          ) as Electron.WebContentsView | undefined
          if (!view) return 'No view'
          const url = new URL(view.webContents.getURL())
          if (
            !['www.bing.com', 'cn.bing.com'].includes(url.hostname) ||
            url.pathname !== '/translator'
          )
            return { host: url.hostname, path: url.pathname }
          return view.webContents.executeJavaScript(
            `(() => ['tta_input_ta', 'tta_output_ta'].map(id => { const node = document.getElementById(id); return { id, tag: node?.tagName, hasValue: !!node && 'value' in node, text: node?.textContent?.slice(0, 200) }; }))()`
          )
        })
        console.log(`LIVE PAGE DIAGNOSTIC: ${JSON.stringify(diagnostic)}`)
      }
      await page.evaluate(
        (id) => window.electron.ipcRenderer.invoke('mt::reading::close-web', id),
        `live-${provider}`
      )
    }
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((win) => win.destroy())
    )
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})
