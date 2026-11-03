import { expect, test } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { launchWithMarkdown, clickMenuById, expectNoRendererErrors } from './helpers'

// `getDataURL` composites the WebGL layer only while the requested ratio does
// not exceed the device's; above that zrender redraws from the display list,
// where GL content never appears. The export renders the chart into a container
// it creates for the purpose, so the GL layer also has to be given the frame it
// needs to catch up with that container's size — reading immediately captured
// the previous viewport and stretched the chart.
const GL_SPEC = {
  xAxis3D: { type: 'value' },
  yAxis3D: { type: 'value' },
  zAxis3D: { type: 'value' },
  grid3D: { boxWidth: 90, boxDepth: 90 },
  series: [
    {
      type: 'surface',
      equation: {
        x: { min: -3, max: 3, step: 0.4 },
        y: { min: -3, max: 3, step: 0.4 },
        z: 'sin(x) * cos(y) * 2'
      }
    }
  ]
}

const DOC = ['# GL export', '', '```echarts', JSON.stringify(GL_SPEC), '```', ''].join('\n')

// The chart is square-ish by nature: a 90x90 grid3D in a wide column paints a
// plot about 340px across with wide margins either side, so only ~8% of the
// image carries ink. A chart read before its viewport caught up is stretched to
// fill the whole frame instead, at ~94%.
const MAX_INK_RATIO = 0.3

test('exporting to HTML bakes a GL chart instead of a blank image', async() => {
  test.setTimeout(180000)
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mt-gl-export-'))
  const filename = path.join(directory, 'gl.html')
  const { app, page } = await launchWithMarkdown(DOC, { suppressErrorDialog: true })

  try {
    // The chart has to have drawn before the export can read it back.
    await page.waitForSelector('.editor-component figure.mu-diagram-block canvas', {
      state: 'attached',
      timeout: 45000
    })
    await page.waitForTimeout(2500)

    await app.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async() => ({ canceled: false, filePath: output })
    }, filename)

    await clickMenuById(app, 'export-html')
    const settings = page.locator('.print-settings-dialog .el-dialog')
    await expect(settings).toBeVisible()
    await settings.locator('button').last().click()

    await expect
      .poll(async() => {
        try {
          return (await readFile(filename, 'utf8')).length
        } catch {
          return 0
        }
      }, { timeout: 60000 })
      .toBeGreaterThan(1000)

    const html = await readFile(filename, 'utf8')
    const baked = /<img[^>]+src="data:image\/png;base64,([^"]{500,})"/.exec(html)
    expect(baked).not.toBeNull()

    const png = Buffer.from(baked![1], 'base64')
    expect(png.subarray(0, 4).toString('hex')).toBe('89504e47')
    // A blank bake is one flat colour, which compresses to almost nothing.
    expect(png.length).toBeGreaterThan(20000)

    const stats = await page.evaluate(async(data) => {
      const image = new Image()
      await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = reject
        image.src = `data:image/png;base64,${data}`
      })
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      const w = canvas.width
      const h = canvas.height
      const { data: px } = context.getImageData(0, 0, w, h)

      let ink = 0
      let minX = w
      let maxX = -1
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4
          if (px[i + 3] < 8) continue
          if (px[i] > 240 && px[i + 1] > 240 && px[i + 2] > 240) continue
          ink++
          if (x < minX) minX = x
          if (x > maxX) maxX = x
        }
      }

      return { w, h, ink, inkRatio: ink / (w * h), marginLeft: minX, marginRight: w - 1 - maxX }
    }, baked![1])

    expect(stats.w).toBeGreaterThan(100)
    expect(stats.h).toBeGreaterThan(100)
    // Something was actually painted.
    expect(stats.ink).toBeGreaterThan(1000)
    // And it sits in its own frame rather than being blown up to fill it.
    expect(stats.inkRatio).toBeLessThan(MAX_INK_RATIO)
    expect(stats.marginLeft).toBeGreaterThan(10)
    expect(stats.marginRight).toBeGreaterThan(10)

    await expectNoRendererErrors(app)
  } finally {
    await rm(directory, { recursive: true, force: true })
    await app.close()
  }
})
