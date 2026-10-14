import { expect, test } from '@playwright/test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { launchWithMarkdown, clickMenuById, expectNoRendererErrors } from './helpers'

test('default exports create HTML, plain HTML, PDF, PNG and editable Word without Pandoc', async() => {
  test.setTimeout(120000)
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yarktext-export-test-'))
  const image = path.join(directory, 'figure.svg')
  await writeFile(image, '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#1db978"/></svg>')
  const markdown = `# 中文导出\n\n正文含 $x^2$ 内联公式。\n\n| 名称 | 数量 |\n| --- | --- |\n| 示例 | 2 |\n\n![图片](${pathToFileURL(image).href} "本地图注")\n\n$$\n\\int_0^1 x dx=\\frac{1}{2}\n$$\n\n${'后续正文，用于验证长图没有截断。\n\n'.repeat(30)}文档结尾。\n`
  const { app, page } = await launchWithMarkdown(markdown, { suppressErrorDialog: true })
  try {
    const blockFont = await page.locator('.mu-math-container').evaluate(node => getComputedStyle(node).fontFamily)
    expect(await page.locator('.mu-math-text').evaluate(node => getComputedStyle(node).fontFamily)).toBe(blockFont)
    for (const type of ['styledHtml', 'html', 'pdf', 'png', 'docx']) {
      const extension = ['styledHtml', 'html'].includes(type) ? 'html' : type
      const filename = path.join(directory, `${type}.${extension}`)
      await app.evaluate(({ dialog }, output) => {
        dialog.showSaveDialog = async() => ({ canceled: false, filePath: output })
      }, filename)
      await clickMenuById(app, `export-${type}`)
      const settings = page.locator('.print-settings-dialog .el-dialog')
      await expect(settings).toBeVisible()
      await settings.locator('button').last().click()
      await expect.poll(async() => {
        try { return (await readFile(filename)).length } catch { return 0 }
      }, { timeout: 30000, message: `Export failed: ${type}` }).toBeGreaterThan(100).catch(async(error) => {
        throw new Error(`${error}\n${await page.locator('body').innerText()}`)
      })
      const data = await readFile(filename)
      if (type === 'pdf') expect(data.subarray(0, 4).toString()).toBe('%PDF')
      if (type === 'png') {
        expect(data.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
        expect(data.readUInt32BE(20)).toBeGreaterThan(900)
        await writeFile('../../.tools/default-export-preview.png', data)
      }
      if (type === 'html') expect(data.toString()).not.toMatch(/<style|rel="stylesheet"| class=| style=/)
      if (type === 'styledHtml') {
        expect(data.toString()).toContain('<style>')
        await writeFile('../../.tools/default-export-preview.html', data)
      }
      if (type === 'docx') {
        await writeFile('../../.tools/default-export-preview.docx', data)
        const loadPackage = createRequire(__filename)
        const JSZip = loadPackage(loadPackage.resolve('jszip', { paths: [loadPackage.resolve('docx')] }))
        const zip = await JSZip.loadAsync(data)
        const xml = await zip.file('word/document.xml').async('string')
        expect(xml).toContain('中文导出')
        expect(xml).toContain('文档结尾')
        expect(xml).toContain('<w:tbl>')
        expect(Object.keys(zip.files).filter(name => name.startsWith('word/media/') && !zip.files[name].dir).length).toBeGreaterThanOrEqual(3)
      }
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(win => !win.isVisible()).length)).toBe(0)
    }
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async() => ({ canceled: true, filePath: '' })
    })
    await clickMenuById(app, 'export-png')
    await page.locator('.print-settings-dialog .el-dialog button').last().click()
    await expect(page.locator('.print-settings-dialog .el-dialog')).not.toBeVisible()
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})
