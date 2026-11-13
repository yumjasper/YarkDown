import { expect, test } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import type { ElectronApplication } from 'playwright'
import { expectNoRendererErrors, launchWithDoc } from './helpers'
import { readingPassage } from './fixtures/reading-passage'

const source = 'Quantum entanglement is a physical phenomenon.'
const fixture = async(content = source) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yarktext-reading-sync-'))
  const filename = path.join(directory, 'reading-sync.pdf')
  const pdf = await PDFDocument.create()
  pdf.addPage().drawText(content, { x: 40, y: 700, size: 10, maxWidth: 500, lineHeight: 16 })
  await writeFile(filename, await pdf.save())
  return { directory, ...(await launchWithDoc(filename, { suppressErrorDialog: true })) }
}
const dispose = async(app: ElectronApplication, directory: string) => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
  await app.close()
  await rm(directory, { recursive: true, force: true })
}
const officialFixture = async(app: ElectronApplication, html: string) => {
  await app.evaluate(({ app }, html) => {
    app.once('web-contents-created', (_event, contents) => {
      void contents.session.protocol.handle('https', () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }))
    })
  }, html)
}

test('all vocabulary meanings and definitions in the supplied paragraph are simplified', async() => {
  const { app, page, directory } = await fixture(readingPassage)
  try {
    for (const domain of ['general', 'computing', 'chemistry'] as const) {
      const result = await page.evaluate(({ source, domain }) => window.electron.ipcRenderer.invoke('mt::reading::vocabulary', source, domain), { source: readingPassage, domain })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.tokens.map(token => token.text).join('')).toBe(result.data.text)
        expect(result.data.tokens.flatMap(token => token.entry?.senses || []).join('')).not.toMatch(/[強現資產應規條對視擴紋]/)
      }
    }
    await expect(page.locator('.textLayer').first()).toContainText('material')
    await page.locator('.textLayer').first().evaluate(element => {
      const range = document.createRange()
      range.selectNodeContents(element)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
    })
    await page.getByRole('toolbar', { name: '选区批注菜单' }).getByRole('button', { name: '翻译', exact: true }).click()
    const panel = page.getByRole('complementary', { name: '阅读助手' })
    await panel.getByLabel('学科词义', { exact: true }).selectOption('computing')
    await expect(panel.locator('.annotated-passage')).toContainText('增强')
    expect(await panel.locator('rt').allTextContents()).not.toEqual([])
    expect((await panel.locator('rt').allTextContents()).join('')).not.toMatch(/[強現資產應規條對視擴紋]/)
    const annotations = await panel.locator('ruby').evaluateAll(elements => elements.map(element => ({
      word: Array.from(element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(''),
      gloss: element.querySelector('rt')?.textContent
    })))
    expect(annotations.some(({ word }) => /^[A-Za-z]$|\d/.test(word) || ['back', 'using', 'are', 'is'].includes(word.toLowerCase()))).toBe(false)
    expect(annotations.some(({ word }) => /diffusion/i.test(word))).toBe(true)
    for (const domain of ['general', 'computing', 'chemistry'] as const) {
      const result = await page.evaluate(domain => window.electron.ipcRenderer.invoke('mt::reading::vocabulary', 'A B C D 3D are back using', domain), domain)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data.tokens.some(token => token.unknown || (token.entry && !token.entry.common))).toBe(false)
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1000, 900))
    await page.evaluate(() => window.getSelection()?.removeAllRanges())
    await page.screenshot({ path: '../../.tools/reading-simplified-vocabulary.png' })
    await expectNoRendererErrors(app)
  } finally { await dispose(app, directory) }
})

test('imports existing same-source official results without waiting for a new mutation', async() => {
  const { app, page, directory } = await fixture()
  try {
    for (const provider of ['bing', 'google'] as const) {
      const id = `existing-${provider}`
      const output = provider === 'bing' ? '<div id="tta_output_ta">量子糾纏是一種物理現象。</div>' : '<span class="ryNqvb">量子糾纏是一種物理現象。</span>'
      await officialFixture(app, `<!doctype html><body><textarea id="tta_input_ta">${source}</textarea>${output}</body>`)
      const open = await page.evaluate(({ id, provider }) => window.electron.ipcRenderer.invoke('mt::reading::open-web', id, provider, { x: 100, y: 100, width: 600, height: 450 }), { id, provider })
      expect(open.ok).toBe(true)
      const start = Date.now()
      const result = await page.evaluate(({ id, provider, source }) => window.electron.ipcRenderer.invoke('mt::reading::translate', id, { source, provider, sequence: 1 }), { id, provider, source })
      expect(result).toEqual({ ok: true, data: '量子纠缠是一种物理现象。' })
      expect(Date.now() - start).toBeLessThan(1500)
      await page.evaluate(id => window.electron.ipcRenderer.invoke('mt::reading::close-web', id), id)
    }
    await expectNoRendererErrors(app)
  } finally { await dispose(app, directory) }
})

for (const cancel of [false, true]) {
  test(`side panel synchronizes before completion and ${cancel ? 'ignores cancelled updates' : 'confirms the final result'}`, async() => {
    const { app, page, directory } = await fixture()
    try {
      await expect(page.locator('.textLayer').first()).toContainText(source)
      await page.locator('.textLayer span').first().evaluate(element => {
        const range = document.createRange()
        range.selectNodeContents(element)
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
      })
      await page.getByRole('toolbar', { name: '选区批注菜单' }).getByRole('button', { name: '翻译', exact: true }).click()
      const panel = page.getByRole('complementary', { name: '阅读助手' })
      await panel.getByRole('button', { name: '整句翻译', exact: false }).click()
      await panel.getByLabel('翻译服务', { exact: true }).selectOption('bing')
      await officialFixture(app, `<!doctype html><body><textarea id="tta_input_ta"></textarea><div id="tta_output_ta"></div><script>
        const input = document.querySelector('textarea'), output = document.querySelector('#tta_output_ta');
        input.addEventListener('input', () => {
          output.setAttribute('aria-busy', 'true');
          setTimeout(() => { output.textContent = '量子糾纏是一種物理現象。'; window.firstResultAt = Date.now(); }, 100);
          setTimeout(() => { output.textContent += '這是完整結果。'; output.removeAttribute('aria-busy'); }, 2200);
        });
      </script></body>`)
      await page.evaluate(() => {
        const state = window as unknown as { readingFirstDisplayAt?: number }
        const observer = new MutationObserver(() => {
          if (document.querySelector('.pdf-reading-assistant .translation-result pre')?.textContent === '量子纠缠是一种物理现象。') {
            state.readingFirstDisplayAt = Date.now()
            observer.disconnect()
          }
        })
        observer.observe(document.body, { childList: true, characterData: true, subtree: true })
      })
      await panel.getByRole('button', { name: '翻译成中文', exact: true }).click()
      const result = panel.getByRole('region', { name: '中文译文' })
      await expect(result.locator('pre')).toHaveText('量子纠缠是一种物理现象。')
      const observed = await app.evaluate(async({ BrowserWindow }) => {
        const view = BrowserWindow.getAllWindows()[0].contentView.children.find(view => 'webContents' in view) as Electron.WebContentsView
        return view.webContents.mainFrame.executeJavaScript('window.firstResultAt') as Promise<number>
      })
      const displayed = await page.evaluate(() => (window as unknown as { readingFirstDisplayAt: number }).readingFirstDisplayAt)
      expect(displayed).toBeGreaterThanOrEqual(observed)
      const delay = displayed - observed
      console.log(`OFFICIAL DOM TO SIDE PANEL ${cancel ? 'cancel' : 'complete'}: ${delay}ms`)
      expect(delay).toBeLessThan(500)
      await expect(result).toHaveAttribute('aria-busy', 'true')
      await expect(panel.getByRole('button', { name: '复制译文', exact: true })).toBeDisabled()
      if (cancel) {
        await panel.getByRole('button', { name: '取消翻译', exact: true }).click()
        await page.waitForTimeout(2400)
        await expect(result.locator('pre')).toHaveText('量子纠缠是一种物理现象。')
        await expect(result).toContainText('未确认完成')
        await expect(panel.getByRole('button', { name: '复制译文', exact: true })).toBeDisabled()
      } else {
        await expect(result.locator('pre')).toHaveText('量子纠缠是一种物理现象。这是完整结果。')
        await expect(result).toHaveAttribute('aria-busy', 'false')
        await expect(panel.getByRole('button', { name: '复制译文', exact: true })).toBeEnabled()
        await page.screenshot({ path: '../../.tools/reading-simplified-sync.png' })
      }
      await expectNoRendererErrors(app)
    } finally { await dispose(app, directory) }
  })
}
