import { expect, test } from '@playwright/test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { launchWithMarkdown, clickMenuById, expectNoRendererErrors } from './helpers'

test('Word template contains bounded figures, isolated inline math and editable code', async() => {
  test.setTimeout(90000)
  const directory = await mkdtemp(path.join(os.tmpdir(), 'word-layout-'))
  const image = path.join(directory, 'wide.svg')
  await writeFile(image, '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="800"><rect width="2400" height="800" fill="#dfe9f0"/><circle cx="600" cy="400" r="300" fill="#a46c3c"/><circle cx="1800" cy="400" r="300" fill="#a46c3c"/></svg>')
  const paragraph = '对于一个 Lambert BRDF 而言，表面法线为 $\\mathbf{n}$，' + '积分贡献需要考虑空间位置和光照方向，'.repeat(8) + '半径为 $r$，辐射亮度为 $L_l$，导数为 $\\frac{\\partial L}{\\partial x}$，反射方向是 $\\mathbf{p}^{\\prime}$。'
  const markdown = '# 技术文档排版验证\n\n## 正文与行内公式\n\n' + paragraph + '\n\n' + paragraph + '\n\n## 图片与图注\n\n![宽幅图片](' + pathToFileURL(image).href + ' "图 1 两个物体的光照对比")\n\n图片后面的正文必须保持在页边距内。\n\n## 独立公式\n\n$$\nL_o(\\mathbf{v})=\\int_{\\Omega}f(\\mathbf{l},\\mathbf{v})L_l(\\mathbf{l})(\\mathbf{n}\\cdot\\mathbf{l})^{+}d\\mathbf{l}\\tag{10.11}\n$$\n\n## 代码与列表\n\n```cpp\nfloat evaluate(float value) {\n    // 保留缩进与换行\n    return value * 2.0f;\n}\n```\n\n行内代码 `evaluate(value)` 使用等宽字体。\n\n1. 第一项包含 **加粗文本**\n2. 第二项包含 *斜体文本*\n\n| 参数 | 含义 |\n| --- | --- |\n| radius | 半径 |\n| radiance | 辐射亮度 |\n'
  const { app, page } = await launchWithMarkdown(markdown, { suppressErrorDialog: true })
  const output = path.resolve('../../.tools/word-layout-preview.docx')
  await rm(output, { force: true })
  try {
    await app.evaluate(({ dialog }, filename) => { dialog.showSaveDialog = async() => ({ canceled: false, filePath: filename }) }, output)
    await clickMenuById(app, 'export-docx')
    await page.locator('.print-settings-dialog .el-dialog .button-primary').click()
    await expect.poll(async() => { try { return (await readFile(output)).length } catch { return 0 } }, { timeout: 30000 }).toBeGreaterThan(1000)
    const load = createRequire(__filename)
    const JSZip = load(load.resolve('jszip', { paths: [load.resolve('docx')] }))
    const zip = await JSZip.loadAsync(await readFile(output))
    const xml: string = await zip.file('word/document.xml').async('string')
    const styles: string = await zip.file('word/styles.xml').async('string')
    expect(xml).not.toContain('wp:anchor')
    expect(xml).toContain('图 1 两个物体的光照对比')
    expect(xml).toContain('保留缩进与换行')
    expect(styles).toContain('Consolas')
    expect(styles).toContain('宋体')
    expect(styles).toContain('w:lineRule="auto"')
    const extents = Array.from(xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"/g), match => ({ width: Number(match[1]) / 9525, height: Number(match[2]) / 9525 }))
    expect(extents.length).toBeGreaterThanOrEqual(12)
    expect(extents.every(rect => rect.width <= 603)).toBe(true)
    expect(extents.filter(rect => rect.width < 100).every(rect => rect.height < 65)).toBe(true)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})
