import { expect, test } from '@playwright/test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PDFDocument, rgb } from 'pdf-lib'
import { launchWithDoc, expectNoRendererErrors } from './helpers'

test('all four PDF rotations retain visible painted pixels', async() => {
  test.setTimeout(90000)
  const directory = await mkdtemp(path.join(tmpdir(), 'yarktext-rotation-'))
  const pdf = await PDFDocument.create()
  const sheet = pdf.addPage([612, 792])
  sheet.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(0.1, 0.4, 0.8) })
  sheet.drawText('PDF Rotation', { x: 80, y: 500, size: 32 })
  const filename = process.env.PDF_ROTATION_FIXTURE || path.join(directory, 'rotation.pdf')
  if (!process.env.PDF_ROTATION_FIXTURE) await writeFile(filename, await pdf.save())
  const { app, page } = await launchWithDoc(filename, { suppressErrorDialog: true })
  try {
    await expect(page.getByRole('button', { name: '顺时针旋转', exact: true })).toBeEnabled({ timeout: 30000 })
    await page.evaluate(() => {
      type Events = { on: (name: string, callback: (event: { pageNumber: number; source: { viewport: { rotation: number } } }) => void) => void }
      type Node = { component?: { props: { events?: Events }; subTree: Node }; children?: Node[] }
      const findEvents = (node: Node): Events | undefined => {
        if (node.component?.props.events) return node.component.props.events
        const nested = node.component && findEvents(node.component.subTree)
        return nested || (Array.isArray(node.children) ? node.children.map(findEvents).find(Boolean) : undefined)
      }
      const root = document.querySelector('#app') as unknown as { __vue_app__: { _container: { _vnode: Node } } }
      const events = findEvents(root.__vue_app__._container._vnode)
      if (!events) throw new Error('Missing PDF event bus')
      ;(globalThis as unknown as { rotations: number[] }).rotations = []
      events.on('pagerendered', event => { if (event.pageNumber === 1) (globalThis as unknown as { rotations: number[] }).rotations.push(event.source.viewport.rotation) })
    })
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: '顺时针旋转', exact: true }).click()
      await expect.poll(() => page.evaluate(() => (globalThis as unknown as { rotations: number[] }).rotations.at(-1)), { timeout: 30000 }).toBe(((i + 1) * 90) % 360)
      const sheet = page.locator('.pdfViewer .page[data-page-number="1"]')
      await expect(sheet.locator('canvas')).toBeVisible({ timeout: 30000 })
      await expect(sheet).not.toHaveClass(/loadingIcon/, { timeout: 30000 })
      await expect.poll(() => sheet.locator('canvas').evaluate(element => {
        const canvas = element as HTMLCanvasElement
        const ctx = canvas.getContext('2d')
        if (!ctx || !canvas.width || !canvas.height) return 0
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        let ink = 0
        for (let n = 0; n < pixels.length; n += 64) if (pixels[n + 3] && Math.min(pixels[n], pixels[n + 1], pixels[n + 2]) < 230) ink++
        return ink
      }), { timeout: 30000 }).toBeGreaterThan(30)
      await expect(page.locator('.pdf-message[role=alert]')).toHaveCount(0)
      await expect.poll(() => sheet.evaluate(element => {
        const box = element.getBoundingClientRect()
        const viewport = document.querySelector('.pdf-scroll')?.getBoundingClientRect()
        return !!viewport && box.bottom > viewport.top && box.top < viewport.bottom && box.right > viewport.left && box.left < viewport.right
      })).toBe(true)
      await page.screenshot({ path: `../../.tools/pdf-rotation-${i + 1}.png` })
    }
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})
