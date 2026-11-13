import { expect, test } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { expectNoRendererErrors, launchWithDoc } from './helpers'
const title = 'Generative Detail Enhancement for Physically Based Materials'
const fixture = async() => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yarktext-research-'))
  const filename = path.join(directory, 'research.pdf')
  const pdf = await PDFDocument.create()
  pdf.addPage().drawText(title, { x: 40, y: 700, size: 12 })
  await writeFile(filename, await pdf.save())
  return { directory, ...(await launchWithDoc(filename, { suppressErrorDialog: true })) }
}

test('research terminology prioritizes modern computer meanings and displays sources', async() => {
  const { directory, app, page } = await fixture()
  try {
    await expect(page.locator('.textLayer').first()).toContainText(title)
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
    await panel.getByLabel('学科词义', { exact: true }).selectOption('computing')
    await expect(panel.locator('.annotated-passage')).toContainText('生成式的')
    await expect(panel.locator('.annotated-passage')).toContainText('基于物理的材质')
    await panel.getByRole('button', { name: 'Generative：查词', exact: true }).click()
    await expect(panel.locator('.senses button').first()).toContainText(
      '计算机 / AI · YarkText research terms'
    )
    await expect(panel.locator('.senses button').first()).toContainText('生成式的')
    await expect(panel.locator('.senses')).toContainText('生殖')
    await panel.getByLabel('学科词义', { exact: true }).selectOption('general')
    await expect(panel.locator('.senses button').first()).toContainText('能产生')
    await expect(panel.locator('.sense-definition').first()).not.toBeEmpty()
    await expect(panel.getByLabel('学科词义', { exact: true }).locator('option')).toHaveCount(3)
    await panel.getByLabel('学科词义', { exact: true }).selectOption('computing')
    await expect(panel.locator('.annotated-passage')).toContainText('生成式的')
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(900, 720)
    )
    expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
    await page.screenshot({ path: '../../.tools/reading-research-terms.png' })
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((win) => win.destroy())
    )
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('reads completed translation DOM while another page resource is still loading', async() => {
  const { directory, app, page } = await fixture()
  try {
    await app.evaluate(({ app }) => {
      app.once('web-contents-created', (_event, contents) => {
        void contents.session.protocol.handle('https', async(request) => {
          if (new URL(request.url).pathname === '/slow-resource.js') {
            await new Promise((resolve) => setTimeout(resolve, 6000))
            return new Response('', { headers: { 'content-type': 'text/javascript' } })
          }
          return new Response(
            '<!doctype html><body><textarea id="tta_input_ta">Generative Detail Enhancement for Physically Based Materials</textarea><div id="tta_output_ta">基于物理材质的生成式细节增强</div><script src="/slow-resource.js"></script></body>',
            { headers: { 'content-type': 'text/html; charset=utf-8' } }
          )
        })
      })
    })
    const start = Date.now()
    const result = await page.evaluate(
      (source) =>
        window.electron.ipcRenderer.invoke('mt::reading::translate', 'slow-resource', {
          provider: 'bing',
          source
        }),
      title
    )
    expect(result).toEqual({ ok: true, data: '基于物理材质的生成式细节增强' })
    expect(Date.now() - start).toBeLessThan(3000)
    expect(
      await app.evaluate(({ BrowserWindow }) => {
        const view = BrowserWindow.getAllWindows()[0].contentView.children.find(
          (view) => 'webContents' in view
        ) as Electron.WebContentsView
        return view.webContents.isLoadingMainFrame()
      })
    ).toBe(true)
    await page.evaluate(() =>
      window.electron.ipcRenderer.invoke('mt::reading::close-web', 'slow-resource')
    )
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((win) => win.destroy())
    )
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('measure real cold, warm and cached official translation results', async() => {
  test.skip(process.env.YARKTEXT_READING_LIVE_TEST !== '1', 'Explicit non-personal live test only.')
  test.setTimeout(150000)
  const { directory, app, page } = await fixture()
  try {
    for (const provider of ['bing', 'google'] as const) {
      const id = `timing-${provider}`
      const measurements = []
      let nativeId: number | undefined
      for (const [kind, source] of [
        ['cold', title],
        ['warm', 'Quantum entanglement is a physical phenomenon.'],
        ['cache', 'Quantum entanglement is a physical phenomenon.']
      ] as const) {
        const measurement = await page.evaluate(
          async({ id, provider, source, kind }) => {
            const start = performance.now()
            const result = await window.electron.ipcRenderer.invoke('mt::reading::translate', id, {
              provider,
              source
            })
            return { kind, milliseconds: Math.round(performance.now() - start), result }
          },
          { id, provider, source, kind }
        )
        measurements.push(measurement)
        expect(measurement.result.ok, JSON.stringify(measurement)).toBe(true)
        if (measurement.result.ok) {
          expect(measurement.result.data).toMatch(/[\u3400-\u9fff]/)
          expect(measurement.result.data).not.toMatch(/(?:\.{3}|…)\s*$/)
          if (kind !== 'cold') {
            expect(measurement.result.data).toContain('量子')
            expect(measurement.result.data).toContain('纠缠')
            expect(measurement.result.data).not.toContain('材质')
          }
        }
        const currentId = await app.evaluate(({ BrowserWindow }) => {
          const view = BrowserWindow.getAllWindows()[0].contentView.children.find(
            (view) => 'webContents' in view
          ) as Electron.WebContentsView | undefined
          return view?.webContents.id
        })
        if (nativeId !== undefined) expect(currentId).toBe(nativeId)
        nativeId = currentId
        if (kind === 'cache') expect(measurement.milliseconds).toBeLessThan(1000)
      }
      console.log(`TRANSLATION TIMING ${provider}: ${JSON.stringify(measurements)}`)
      await page.evaluate(
        (id) => window.electron.ipcRenderer.invoke('mt::reading::close-web', id),
        id
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
