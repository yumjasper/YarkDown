import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { launchWithMarkdown, expectNoRendererErrors, clearRendererErrors } from './helpers'

// A GL chart is the case the canvas path exists for: `echarts-gl` mounts its
// WebGL layer through `zr.painter.insertLayer()`, which only the canvas painter
// provides. Everything here was broken for these charts while the SVG charts
// kept working, so both shapes are exercised side by side.
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

const SVG_SPEC = {
  xAxis: { type: 'category', data: ['a', 'b', 'c'] },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data: [5, 8, 3] }]
}

const DOC = [
  'A GL chart follows.',
  '',
  '```echarts',
  JSON.stringify(GL_SPEC),
  '```',
  '',
  'An SVG chart follows.',
  '',
  '```echarts',
  JSON.stringify(SVG_SPEC),
  '```',
  ''
].join('\n')

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

let savePath = ''

const stubSaveDialog = async(app: ElectronApplication, filePath: string): Promise<void> => {
  await app.evaluate(async({ dialog }, target) => {
    const g = globalThis as typeof globalThis & {
      __mt_orig_showSaveDialog__?: typeof dialog.showSaveDialog
    }
    if (!g.__mt_orig_showSaveDialog__) {
      g.__mt_orig_showSaveDialog__ = dialog.showSaveDialog.bind(dialog)
    }
    ;(dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async() => ({
      canceled: false,
      filePath: target
    })
  }, filePath)
}

const restoreSaveDialog = async(app: ElectronApplication): Promise<void> => {
  await app.evaluate(({ dialog }) => {
    const g = globalThis as typeof globalThis & {
      __mt_orig_showSaveDialog__?: typeof dialog.showSaveDialog
    }
    if (g.__mt_orig_showSaveDialog__) {
      ;(dialog as unknown as { showSaveDialog: unknown }).showSaveDialog =
        g.__mt_orig_showSaveDialog__
    }
  })
}

const viewerVisible = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const el = document.querySelector('.image-viewer') as HTMLElement | null
    return !!el && getComputedStyle(el).display !== 'none'
  })

// A diagram block holding the caret shows its source instead of a toolbar.
const leaveDiagrams = async(page: Page): Promise<void> => {
  await page
    .locator('.editor-component .mu-paragraph-content')
    .first()
    .click({ position: { x: 2, y: 2 }, timeout: 5000 })
    .catch(() => {})
  await page.waitForTimeout(120)
}

// The toolbar is a singleton that lingers on the block it last served, and
// baseFloat hides it by parking it at -9999px with `opacity: 0` rather than
// unmounting it — the inline opacity is the only reliable shown signal, and it
// only counts while the float sits inside the block being hovered.
const toolbarShownFor = (page: Page, index: number): Promise<boolean> =>
  page.evaluate((i) => {
    const item = document.querySelector('.mu-preview-tools li.item.view')
    const wrapper = item?.closest('.mu-float-wrapper') as HTMLElement | null
    if (!wrapper || Number.parseFloat(wrapper.style.opacity || '0') !== 1) return false

    const block = document.querySelectorAll('.editor-component figure.mu-diagram-block')[i]
    if (!block) return false

    const tools = wrapper.getBoundingClientRect()
    const box = block.getBoundingClientRect()
    const x = tools.left + tools.width / 2
    const y = tools.top + tools.height / 2
    return x >= box.left - 4 && x <= box.right + 4 && y >= box.top - 4 && y <= box.bottom + 4
  }, index)

const toolbarItems = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.mu-preview-tools li.item')).map((li) =>
      [...li.classList].find((name) => name !== 'item') ?? ''
    )
  )

const hoverDiagram = async(page: Page, index: number): Promise<void> => {
  await leaveDiagrams(page)
  const block = page.locator('.editor-component figure.mu-diagram-block').nth(index)
  await block.waitFor({ state: 'visible', timeout: 30000 })
  await block.scrollIntoViewIfNeeded()
  await page.waitForTimeout(150)
  const box = await block.boundingBox()
  if (!box) throw new Error('diagram block has no box')
  const view = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
  const clamp = (lo: number, mid: number, hi: number): number => Math.min(Math.max(mid, lo), hi)
  await page.mouse.move(
    clamp(20, box.x + box.width / 2, view.w - 20),
    clamp(20, box.y + box.height / 2, view.h - 20)
  )
  await expect.poll(() => toolbarShownFor(page, index), { timeout: 15000 }).toBe(true)
}

const openDiagram = async(page: Page, index = 0): Promise<void> => {
  await hoverDiagram(page, index)
  await page.locator('.mu-preview-tools li.item.view').click({ timeout: 5000 })
  await expect.poll(() => viewerVisible(page), { timeout: 10000 }).toBe(true)
}

const closeViewer = async(page: Page): Promise<void> => {
  if (!(await viewerVisible(page))) return
  await page.keyboard.press('Escape')
  await expect.poll(() => viewerVisible(page), { timeout: 5000 }).toBe(false)
}

/** Pixels that are neither transparent nor near-white, i.e. something was drawn. */
const inkedPixels = (page: Page, dataUrl: string): Promise<number> =>
  page.evaluate(async(url) => {
    const image = new Image()
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
      image.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)

    let inked = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 8) continue
      if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) continue
      inked++
    }
    return inked
  }, dataUrl)

test.describe('echarts diagrams', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    savePath = await mkdtemp(join(tmpdir(), 'mt-echarts-'))
    const launched = await launchWithMarkdown(DOC, { suppressErrorDialog: true })
    app = launched.app
    page = launched.page
    // The GL chart is the slower one and it gates every test here.
    await page.waitForSelector('.editor-component figure.mu-diagram-block canvas', {
      state: 'attached',
      timeout: 45000
    })
    await page.waitForSelector('.editor-component figure.mu-diagram-block svg', {
      state: 'attached',
      timeout: 45000
    })
    // Both previews have to have drawn something before they can be exported.
    await page.waitForTimeout(2000)
  })

  test.afterAll(async() => {
    await restoreSaveDialog(app).catch(() => {})
    if (app) await app.close()
    if (savePath) await rm(savePath, { recursive: true, force: true })
  })

  test.beforeEach(async() => {
    await closeViewer(page)
    await clearRendererErrors(app)
  })

  // A GL chart draws into a `<canvas>`, which the block's "is it rendered?"
  // test used to miss. Without "view" the chart could be neither inspected nor
  // exported, so this is the entry point every other case depends on.
  test('a canvas chart offers the same actions as an svg chart', async() => {
    await hoverDiagram(page, 0)
    expect(await toolbarItems(page)).toEqual(['view', 'edit', 'delete'])

    await hoverDiagram(page, 1)
    expect(await toolbarItems(page)).toEqual(['view', 'edit', 'delete'])

    await expectNoRendererErrors(app)
  })

  // The name is what a screen reader reads out for the chart, and the viewer
  // takes it from the same attribute.
  test('every chart is named for assistive technology', async() => {
    const previews = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.editor-component .mu-diagram-preview')).map((el) => ({
        role: el.getAttribute('role'),
        label: (el.getAttribute('aria-label') ?? '').length,
        hasCanvas: !!el.querySelector('canvas')
      }))
    )

    // Both shapes are on screen, and the canvas one is the case that used to be
    // left unnamed.
    expect(previews.length).toBeGreaterThanOrEqual(2)
    expect(previews.some((preview) => preview.hasCanvas)).toBe(true)
    for (const { role, label } of previews) {
      expect(role).toBe('img')
      expect(label).toBeGreaterThan(0)
    }

    await expectNoRendererErrors(app)
  })

  // A DOM clone carries the `<canvas>` element but not its bitmap, so the
  // viewer used to show an empty box where the 3D chart should be.
  test('the viewer paints a canvas chart instead of an empty box', async() => {
    await openDiagram(page, 0)

    const stage = await page.evaluate(() => {
      const figure = document.querySelector('.media-viewer-stage figure')
      const image = figure?.querySelector('img') as HTMLImageElement | null
      return {
        hasCanvas: !!figure?.querySelector('canvas'),
        imageW: image?.naturalWidth ?? 0,
        imageH: image?.naturalHeight ?? 0,
        src: image?.src.slice(0, 22) ?? ''
      }
    })

    // The live canvas is swapped for the pixels it was showing.
    expect(stage.hasCanvas).toBe(false)
    expect(stage.src).toBe('data:image/png;base64,')
    expect(stage.imageW).toBeGreaterThan(100)
    expect(stage.imageH).toBeGreaterThan(100)

    const ink = await page.evaluate(() => {
      const image = document.querySelector('.media-viewer-stage figure img') as HTMLImageElement
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
      let inked = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 8) continue
        if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) continue
        inked++
      }
      return inked
    })
    expect(ink).toBeGreaterThan(1000)

    await expectNoRendererErrors(app)
  })

  test('an svg chart still opens as an svg', async() => {
    await openDiagram(page, 1)

    await expect(page.locator('.image-viewer .mu-diagram-preview svg')).toHaveCount(1)
    await expect(page.locator('.image-viewer .mu-diagram-preview canvas')).toHaveCount(0)
    // zoom out / readout / zoom in / fit + save svg / save png / copy
    await expect(page.locator('.media-viewer-toolbar button')).toHaveCount(7)

    await expectNoRendererErrors(app)
  })

  // `getDataURL` composites the WebGL layer only while the requested ratio does
  // not exceed the device's; above that zrender redraws from the display list,
  // where GL content never appears. Asking for 2x on a 1 dpr screen exported a
  // blank white image.
  test('saving a canvas chart as PNG writes the chart, not a blank image', async() => {
    const target = join(savePath, 'gl.png')
    await stubSaveDialog(app, target)
    await openDiagram(page, 0)

    await page.locator('.media-viewer-toolbar button').nth(5).click()
    await expect
      .poll(async() => (await readFile(target).catch(() => Buffer.alloc(0))).length, {
        timeout: 30000
      })
      .toBeGreaterThan(1000)

    const png = await readFile(target)
    expect([...png.subarray(0, 4)]).toEqual(PNG_MAGIC)

    const ink = await inkedPixels(page, `data:image/png;base64,${png.toString('base64')}`)
    expect(ink).toBeGreaterThan(1000)

    await expectNoRendererErrors(app)
  })

  // A canvas chart has no vector form to write, so choosing SVG has to fall
  // back to the PNG it can produce rather than save nothing.
  test('asking for SVG on a canvas chart still writes an image', async() => {
    const target = join(savePath, 'gl-as-svg.png')
    await stubSaveDialog(app, target)
    await openDiagram(page, 0)

    await page.locator('.media-viewer-toolbar button').nth(4).click()
    await expect
      .poll(async() => (await readFile(target).catch(() => Buffer.alloc(0))).length, {
        timeout: 30000
      })
      .toBeGreaterThan(1000)

    // The dialog is told the real extension, so the file is a PNG.
    const png = await readFile(target)
    expect([...png.subarray(0, 4)]).toEqual(PNG_MAGIC)

    await expectNoRendererErrors(app)
  })

  test('copying a canvas chart puts it on the clipboard as an image', async() => {
    await app.evaluate(({ clipboard }) => clipboard.clear())
    await openDiagram(page, 0)

    await page.locator('.media-viewer-toolbar button').nth(6).click()
    await expect
      .poll(() => app.evaluate(({ clipboard }) => !clipboard.readImage().isEmpty()), {
        timeout: 30000
      })
      .toBe(true)

    await expectNoRendererErrors(app)
  })
})
