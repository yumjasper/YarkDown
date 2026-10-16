import { afterEach, describe, expect, it } from 'vitest'
import type { PdfAnnotation } from '../../../src/shared/pdf'
import { movePdfAnnotation } from '../../../src/renderer/src/util/pdfAnnotationMove'
import { PdfAnnotationOverlay } from '../../../src/renderer/src/util/pdfAnnotationOverlay'

const annotation = (kind: PdfAnnotation['kind'] = 'FreeText'): PdfAnnotation => ({
  id: 'caption', kind, page: 1, rect: [10, 20, 110, 50],
  color: '#123456', opacity: 1, width: 1, text: 'Caption', author: 'Test', modified: '2026-10-16',
  appearance: 'data:image/png;base64,test'
})

afterEach(() => document.body.replaceChildren())

describe('PDF annotation movement', () => {
  it.each(['Text', 'FreeText', 'Square', 'Ink', 'Highlight', 'Underline', 'StrikeOut'] as const)('moves %s without mutating the original appearance or coordinates', kind => {
    const item = { ...annotation(kind), quadPoints: [10, 50, 110, 50, 10, 20, 110, 20], inkList: [[10, 20, 30, 40]] }
    const moved = movePdfAnnotation(item, 8, -6)
    expect(moved.rect).toEqual([18, 14, 118, 44])
    expect(moved.quadPoints).toEqual([18, 44, 118, 44, 18, 14, 118, 14])
    expect(moved.inkList).toEqual([[18, 14, 38, 34]])
    expect(moved.appearance).toBe(item.appearance)
    expect(item.rect).toEqual([10, 20, 110, 50])
    expect(item.inkList).toEqual([[10, 20, 30, 40]])
  })

  it('previews repeated moves and resize in place and restores the original transform on cancellation', () => {
    const page = document.createElement('div')
    const surface = document.createElement('div')
    page.append(surface)
    document.body.append(page)
    const item = annotation()
    const overlay = new PdfAnnotationOverlay(() => {})
    const surfaces = [{ page, surface, number: 1, viewport: { width: 612, height: 792, transform: [0, 2, 2, 0, 0, 0] } }]
    overlay.render(surfaces, [item], true, item.id)
    const layer = page.querySelector('.pdf-draft-layer')
    const group = layer?.firstElementChild
    if (!layer || !group) throw new Error('Missing annotation layer')
    const image = group.firstElementChild
    for (let index = 1; index <= 100; index++) overlay.preview(item, index, -index)
    expect(group.getAttribute('transform')).toBe('matrix(0 2 2 0 0 0) translate(100 -100)')
    expect(layer.firstElementChild).toBe(group)
    expect(group.firstElementChild).toBe(image)
    expect(item.rect).toEqual([10, 20, 110, 50])
    overlay.preview(item, 0, 0, 200)
    expect(group.getAttribute('transform')).toBe('matrix(0 2 2 0 0 0) translate(10 50) scale(2 1) translate(-10 -50)')
    overlay.resetPreview()
    expect(group.getAttribute('transform')).toBe('matrix(0 2 2 0 0 0)')
    overlay.render(surfaces, [item], true, item.id)
    expect(layer.firstElementChild).toBe(group)
    overlay.clear()
    expect(page.querySelector('.pdf-draft-layer')).toBeNull()
  })
})
