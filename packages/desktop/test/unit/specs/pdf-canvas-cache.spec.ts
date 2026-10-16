import { describe, expect, it, vi } from 'vitest'
import { trimPdfCanvasCache } from '@/util/pdfCanvasCache'

const page = (id: number, top: number, renderingState = 3) => ({
  id,
  canvas: { width: 1024, height: 1024 } as HTMLCanvasElement,
  div: { getBoundingClientRect: () => ({ top, bottom: top + 100 }) } as HTMLElement,
  renderingState,
  destroy: vi.fn()
})

describe('PDF canvas memory budget', () => {
  it('evicts distant offscreen canvases first while keeping visible pages', () => {
    const pages = [page(1, -500), page(9, -100), page(10, 50), page(11, 600)]
    trimPdfCanvasCache(pages, { top: 0, bottom: 500 }, 10, new Set(), 8 * 1024 * 1024)
    expect(pages[0]?.destroy).toHaveBeenCalledOnce()
    expect(pages[1]?.destroy).not.toHaveBeenCalled()
    expect(pages[2]?.destroy).not.toHaveBeenCalled()
    expect(pages[3]?.destroy).not.toHaveBeenCalled()
  })

  it('does not evict active selections, input fields or unfinished renders', () => {
    const pages = [page(1, -500), page(2, 600, 1), page(3, 800)]
    trimPdfCanvasCache(pages, { top: 0, bottom: 500 }, 10, new Set([1]), 0)
    expect(pages[0]?.destroy).not.toHaveBeenCalled()
    expect(pages[1]?.destroy).not.toHaveBeenCalled()
    expect(pages[2]?.destroy).toHaveBeenCalledOnce()
  })
})
