export const PDF_MAX_CANVAS_PIXELS = 8 * 1024 * 1024
export const PDF_OFFSCREEN_CANVAS_BYTES = 32 * 1024 * 1024

interface CachedPage {
  id: number
  canvas?: HTMLCanvasElement | null
  div: HTMLElement
  renderingState: number
  destroy(): void
}

/** Keeps visible pages and active selections intact while evicting distant raster buffers. */
export const trimPdfCanvasCache = (
  pages: Iterable<CachedPage>,
  viewport: { top: number; bottom: number },
  currentPage: number,
  protectedPages: ReadonlySet<number>,
  budgetBytes = PDF_OFFSCREEN_CANVAS_BYTES
): void => {
  const candidates = [...pages].filter(page => {
    if (!page.canvas || page.renderingState !== 3 || protectedPages.has(page.id)) return false
    const rect = page.div.getBoundingClientRect()
    return rect.bottom <= viewport.top || rect.top >= viewport.bottom
  }).map(page => ({ page, bytes: (page.canvas?.width ?? 0) * (page.canvas?.height ?? 0) * 4 }))
  let bytes = candidates.reduce((sum, entry) => sum + entry.bytes, 0)
  candidates.sort((a, b) => Math.abs(b.page.id - currentPage) - Math.abs(a.page.id - currentPage))
  for (const entry of candidates) {
    if (bytes <= budgetBytes) break
    entry.page.destroy()
    bytes -= entry.bytes
  }
}
