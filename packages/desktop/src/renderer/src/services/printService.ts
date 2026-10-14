import { resolveLocalImageSrc } from '../util/resolveImageSrc'

// CSS px per mm at Chromium's print resolution (96 dpi).
export const MM_TO_PX = 96 / 25.4

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
  measureAdaptiveHeightPx(
    html: string,
    pageWidthMm: number,
    marginTopMm: number,
    marginBottomMm: number,
    marginLeftMm: number,
    marginRightMm: number
  ): number {
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
    const heightPx = Math.ceil(host.scrollHeight)
    host.remove()
    // Chromium caps printToPDF's custom page height; stay safely below it.
    const MAX_PDF_HEIGHT_MM = 5000
    return Math.min(heightPx, MAX_PDF_HEIGHT_MM * MM_TO_PX)
  }
}

export default MarkdownPrint
