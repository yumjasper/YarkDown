import { describe, it, expect } from 'vitest'
import { markerPalette, updateMarkerPalette, boundedMarkerPresets, DEFAULT_PDF_MARKERS } from '../../../src/renderer/src/util/pdfMarkerPresets'

describe('PDF marker limit', () => {
  it('trims legacy colors and preserves the active custom color', () => {
    const stored = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`#${(index + 1).toString(16).padStart(6, '0')}`, { width: 18, textOnly: false }]))
    const palette = markerPalette(stored, '#abcdef')
    expect(palette).toHaveLength(6)
    expect(palette.slice(0, 5)).toEqual(DEFAULT_PDF_MARKERS)
    expect(palette[5]).toBe('#abcdef')
    expect(Object.keys(boundedMarkerPresets(palette, stored))).toHaveLength(6)
  })
  it('replaces the custom slot for every color-input update', () => {
    let palette = [...DEFAULT_PDF_MARKERS]
    for (let index = 1; index < 100; index++) palette = updateMarkerPalette(palette, `#${index.toString(16).padStart(6, '0')}`)
    expect(palette).toHaveLength(6)
    expect(palette.slice(0, 5)).toEqual(DEFAULT_PDF_MARKERS)
    expect(palette[5]).toBe('#000063')
  })
  it('deduplicates colors and sanitizes invalid preset values', () => {
    expect(markerPalette([], 'invalid')).toEqual(DEFAULT_PDF_MARKERS)
    const palette = updateMarkerPalette(['#ABCDEF', '#abcdef', 'invalid'], '#abcdef')
    expect(palette).toEqual(['#abcdef'])
    expect(boundedMarkerPresets(palette, { '#abcdef': { width: Infinity, textOnly: false } })).toEqual({ '#abcdef': { width: 14, textOnly: false } })
  })
})
