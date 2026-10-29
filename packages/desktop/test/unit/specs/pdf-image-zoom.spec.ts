import { describe, expect, it } from 'vitest'
import { hitTestPageImage, PDF_IMAGE_MIN_POINTS, type PdfImageQuad } from '@/util/pdfImageZoom'

/**
 * Builds one record in the shape pdf.js reports: bottom-left, top-left and
 * bottom-right corners of the painted image, normalized to the page.
 */
const record = (
  left: number,
  top: number,
  width: number,
  height: number
): number[] => [
  left,
  top + height,
  left,
  top,
  left + width,
  top + height
]

const expectHit = (hit: PdfImageQuad | null): PdfImageQuad => {
  expect(hit).not.toBeNull()
  if (!hit) throw new Error('expected a hit')
  return hit
}

describe('PDF image hit testing', () => {
  it('matches a point inside the only image on the page', () => {
    const coordinates = Float32Array.from(record(0.2, 0.2, 0.4, 0.3))
    const hit = expectHit(hitTestPageImage(coordinates, 0.3, 0.3, 600, 800))
    expect(hit.quad[0][0]).toBeCloseTo(0.2, 5)
    expect(hit.quad[0][1]).toBeCloseTo(0.2, 5)
    // Coordinates are stored as Float32, so compare at single-precision scale.
    expect(hit.width).toBeCloseTo(0.4 * 600, 3)
    expect(hit.height).toBeCloseTo(0.3 * 800, 3)
  })

  it('ignores points outside the image rectangle', () => {
    const coordinates = Float32Array.from(record(0.2, 0.2, 0.4, 0.3))
    expect(hitTestPageImage(coordinates, 0.7, 0.3, 600, 800)).toBeNull()
    expect(hitTestPageImage(coordinates, 0.3, 0.6, 600, 800)).toBeNull()
  })

  it('prefers the innermost image when several overlap', () => {
    const coordinates = Float32Array.from([
      ...record(0.1, 0.1, 0.8, 0.8),
      ...record(0.4, 0.4, 0.1, 0.1)
    ])
    const hit = expectHit(hitTestPageImage(coordinates, 0.45, 0.45, 600, 800))
    expect(hit.area).toBeCloseTo(0.01, 5)
  })

  it('skips decorative images below the point threshold', () => {
    // 4x4 points: a bullet or rule, not content the reader would zoom into.
    const coordinates = Float32Array.from(record(0.5, 0.5, 4 / 600, 4 / 800))
    expect(hitTestPageImage(coordinates, 0.51, 0.51, 600, 800)).toBeNull()
    expect(PDF_IMAGE_MIN_POINTS).toBeGreaterThan(4)
  })

  it('matches rotated images through their own axes', () => {
    // Corners of a 90-degree rotated square: the axes are no longer page-aligned.
    const coordinates = Float32Array.from([
      0.5, 0.2,
      0.2, 0.2,
      0.5, 0.5
    ])
    expect(hitTestPageImage(coordinates, 0.35, 0.35, 600, 800)).not.toBeNull()
    expect(hitTestPageImage(coordinates, 0.6, 0.6, 600, 800)).toBeNull()
  })

  it('tolerates a truncated record list', () => {
    expect(hitTestPageImage(Float32Array.from([0.1, 0.1, 0.2]), 0.15, 0.15, 600, 800)).toBeNull()
  })
})

describe('PDF image hit testing on recorded output', () => {
  // Captured from pdf.js 6.4 rendering a 500x800pt page with a 200x100pt image
  // at (50,600) and a 120x120pt image at (300,250), both in bottom-left coords.
  const recorded = Float32Array.from([
    0.1, 0.125, 0.1, 0.25, 0.5, 0.125,
    0.6001, 0.5376, 0.6001, 0.6875, 0.8398, 0.5376
  ])

  it('measures the recorded rectangles in PDF points', () => {
    const big = expectHit(hitTestPageImage(recorded, 0.3, 0.18, 500, 800))
    expect(big.width).toBeCloseTo(200, 1)
    expect(big.height).toBeCloseTo(100, 1)
    expect(big.quad[0][0]).toBeCloseTo(0.1, 3)
    expect(big.quad[0][1]).toBeCloseTo(0.25, 3)

    const small = expectHit(hitTestPageImage(recorded, 0.72, 0.61, 500, 800))
    expect(small.width).toBeCloseTo(120, 0)
    expect(small.height).toBeCloseTo(120, 0)
  })

  it('misses body text between and below the images', () => {
    // Text sits at PDF y=400, i.e. half way down the page.
    expect(hitTestPageImage(recorded, 0.12, 0.5, 500, 800)).toBeNull()
    // Whitespace to the right of the big image.
    expect(hitTestPageImage(recorded, 0.9, 0.18, 500, 800)).toBeNull()
  })
})
