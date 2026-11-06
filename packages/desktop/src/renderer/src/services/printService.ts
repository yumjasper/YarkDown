import { resolveLocalImageSrc } from '../util/resolveImageSrc'

// CSS px per mm at Chromium's print resolution (96 dpi).
export const MM_TO_PX = 96 / 25.4

/** Longest an export waits for images; a stalled remote URL must not hang it. */
const IMAGE_WAIT_TIMEOUT_MS = 10000

/**
 * Resolve once every `<img>` under `root` has decoded or failed, so a height
 * measurement taken afterwards reflects the rendered images instead of their
 * zero-height placeholders. Never rejects: a broken image resolves on `error`,
 * and the timeout covers a load that never settles at all.
 */
const waitForImages = async(root: HTMLElement): Promise<void> => {
  const pending = Array.from(root.getElementsByTagName('img')).filter(
    (img) => !(img.complete && img.naturalWidth > 0)
  )
  if (pending.length > 0) {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, IMAGE_WAIT_TIMEOUT_MS)
    })
    const loaded = Promise.all(
      pending.map(
        (img) =>
          new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          })
      )
    )
    await Promise.race([loaded, timeout])
    clearTimeout(timer)
  }
  // Layout settles a frame after the last decode; measuring before that can
  // still read the pre-image height.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

class MarkdownPrint {
  private container: HTMLElement | null = null

  /**
   * Prepare document export and append a hidden print container to the window.
   * Everything outside of this hidden print container will be hidden with display: none.
   *
   * @param html HTML string
   * @param renderStatic Render for static files like PDF documents
   * @param dir Text direction to mirror onto the container. `innerHTML` drops
   *   the exporter's outer `<html dir=…>` shell and the container is a sibling
   *   of `.editor-wrapper`, so RTL documents print LTR unless we set it here
   *   (#4833). LTR is the default and stays implicit.
   */
  renderMarkdown(html: string, renderStatic?: boolean, dir?: string): void {
    this.clearup()
    const printContainer = document.createElement('article')
    printContainer.classList.add('print-container')
    if (dir === 'rtl' || dir === 'auto') {
      printContainer.setAttribute('dir', dir)
    }
    this.container = printContainer
    printContainer.innerHTML = html

    // Fix images when rendering for static files like PDF (GH#678).
    if (renderStatic) {
      // Traverse through the DOM tree and fix all relative image sources.
      const images = printContainer.getElementsByTagName('img')
      for (const image of Array.from(images)) {
        const rawSrc = image.getAttribute('src') ?? ''
        image.src = resolveLocalImageSrc(rawSrc)
      }
    }

    document.body.appendChild(printContainer)
  }

  /**
   * Remove the print container from the window.
   */
  clearup(): void {
    if (this.container) {
      this.container.remove()
    }
  }

  /**
   * Render the export HTML into an offscreen element laid out at the PDF page
   * width (page width minus margins) and measure the resulting content height.
   * Used by the adaptive page-size export: the measured height becomes a
   * one-page-tall custom PDF page, so nothing is paginated (#adaptive).
   * Returns the height in CSS px, clamped to Chromium's printToPDF maximum.
   */
  async measureAdaptiveHeightPx(
    html: string,
    pageWidthMm: number,
    marginTopMm: number,
    marginBottomMm: number,
    marginLeftMm: number,
    marginRightMm: number
  ): Promise<number> {
    const host = document.createElement('div')
    // Offscreen but rendered: fixed placement + opacity keeps layout live
    // (display:none would collapse every element to 0 height). Padding
    // mirrors the @page margins so line wrapping matches the printed layout.
    host.setAttribute(
      'style',
      `position:fixed;left:0;top:0;opacity:0;pointer-events:none;overflow:hidden;` +
        `box-sizing:border-box;width:${pageWidthMm}mm;max-width:${pageWidthMm}mm;` +
        `padding:${marginTopMm}mm ${marginRightMm}mm ${marginBottomMm}mm ${marginLeftMm}mm;` +
        `z-index:-1000;`
    )
    // The @media print block in printService.css only applies while printing;
    // mirror its layout rules inline so the measurement matches the printed
    // layout. The container itself must not be display:none-ed by that block.
    const style = document.createElement('style')
    style.textContent = `
      .adaptive-measure article.print-container { display: block; height: auto; }
      .adaptive-measure article.markdown-body {
        box-sizing: border-box; min-width: 200px; max-width: 980px;
        margin: 0 auto; padding: 0;
      }
      .adaptive-measure pre code { white-space: pre-wrap; word-break: break-word; }
    `
    host.classList.add('adaptive-measure')
    host.innerHTML = html
    host.appendChild(style)
    document.body.appendChild(host)
    // `img` inside `innerHTML` has no intrinsic height until it decodes, so an
    // immediate `scrollHeight` reports the text-only height and the resulting
    // page would clip every picture. Wait for the loads (settled, not retried:
    // a broken image must not block the export) before measuring.
    await waitForImages(host)
    const heightPx = Math.ceil(host.scrollHeight)
    host.remove()
    // Chromium's printToPDF rejects custom page heights past ~20000mm with
    // "Printing failed"; clamp well inside that so long documents still export.
    const MAX_PDF_HEIGHT_MM = 20000
    return Math.min(heightPx, MAX_PDF_HEIGHT_MM * MM_TO_PX)
  }
}

export default MarkdownPrint
