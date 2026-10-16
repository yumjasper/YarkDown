import type { PdfAnnotation } from '@shared/pdf'

// Deltas are in unrotated PDF points; paths and text quads must move with the bounding box.
export const movePdfAnnotation = (item: PdfAnnotation, dx: number, dy: number): PdfAnnotation => {
  const translate = (points: number[]) => points.map((value, index) => value + (index % 2 === 0 ? dx : dy))
  return {
    ...item,
    rect: translate(item.rect) as PdfAnnotation['rect'],
    ...(item.quadPoints ? { quadPoints: translate(item.quadPoints) } : {}),
    ...(item.inkList ? { inkList: item.inkList.map(translate) } : {})
  }
}
