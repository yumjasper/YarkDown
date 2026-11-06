import { afterEach, describe, expect, it, vi } from 'vitest'

// `printService` imports `resolveLocalImageSrc`, which reads `window.path` /
// `window.DIRNAME` for its relative-resolve branch (mirrors printService-image.spec.ts).
vi.hoisted(() => {
  const w = globalThis as unknown as {
    window?: { path?: { sep: string }, DIRNAME?: string }
  }
  w.window ??= {}
  w.window.path ??= { sep: '/' }
  w.window.DIRNAME = '/docs'
})

import MarkdownPrint, { MM_TO_PX } from '@/services/printService'

// The adaptive export turns a measured height into one tall PDF page, so the
// measurement must include the images: an `img` parsed from `innerHTML` has no
// intrinsic height until it decodes, and measuring too early exported a page
// sized for the text alone, clipping every picture after the first screenful.
describe('MarkdownPrint — adaptive height measurement', () => {
  afterEach(() => {
    document.body.querySelectorAll('.adaptive-measure').forEach((n) => n.remove())
    vi.restoreAllMocks()
  })

  /** An image whose decode the test controls. */
  const imageHtml = (): string =>
    '<article class="markdown-body"><p>text</p><img src="file:///docs/a.png"></article>'

  it('waits for images to load before measuring', async() => {
    let heightReads = 0
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => {
      heightReads += 1
      return 1000
    })

    const print = new MarkdownPrint()
    const measuring = print.measureAdaptiveHeightPx(imageHtml(), 210, 10, 10, 10, 10)

    // The image is still loading, so nothing has been measured yet.
    const pendingImg = document.body.querySelector<HTMLImageElement>('.adaptive-measure img')
    expect(pendingImg).not.toBeNull()
    expect(heightReads).toBe(0)

    pendingImg!.dispatchEvent(new Event('load'))

    await expect(measuring).resolves.toBe(1000)
    expect(heightReads).toBeGreaterThan(0)
  })

  it('resolves when an image fails, so a broken link cannot block the export', async() => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(500)

    const print = new MarkdownPrint()
    const measuring = print.measureAdaptiveHeightPx(imageHtml(), 210, 10, 10, 10, 10)
    document.body
      .querySelector('.adaptive-measure img')!
      .dispatchEvent(new Event('error'))

    await expect(measuring).resolves.toBe(500)
  })

  it('clamps an over-long document below the height Chromium rejects', async() => {
    // 30000mm of content: printToPDF fails outright past roughly 20000mm.
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(
      30000 * MM_TO_PX
    )

    const print = new MarkdownPrint()
    const height = await print.measureAdaptiveHeightPx(
      '<article class="markdown-body"><p>text</p></article>',
      210,
      10,
      10,
      10,
      10
    )

    expect(height).toBe(20000 * MM_TO_PX)
  })

  it('removes the offscreen host afterwards', async() => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(100)

    const print = new MarkdownPrint()
    await print.measureAdaptiveHeightPx(
      '<article class="markdown-body"><p>text</p></article>',
      210,
      10,
      10,
      10,
      10
    )

    expect(document.body.querySelector('.adaptive-measure')).toBeNull()
  })
})
