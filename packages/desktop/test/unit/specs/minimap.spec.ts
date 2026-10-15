import { describe, expect, it } from 'vitest'
import { minimapLayout, minimapScrollTarget } from '../../../src/renderer/src/components/minimap/layout'
import { hashContent } from '../../../src/renderer/src/components/editorWithTabs/syntheticHistory'

describe('minimap navigation geometry', () => {
  it.each(['proportional', 'fit', 'fill'] as const)('keeps the viewport within the canvas in %s mode', size => {
    for (const scroll of [0, 100, 5000, 9500]) {
      const geometry = minimapLayout(500, 10000, 500, scroll, 1000, 1, size)
      expect(geometry.sliderTop).toBeGreaterThanOrEqual(0)
      expect(geometry.sliderTop + geometry.sliderHeight).toBeLessThanOrEqual(500)
      expect(minimapScrollTarget(0, geometry, 10000, 500)).toBeGreaterThanOrEqual(0)
      expect(minimapScrollTarget(500, geometry, 10000, 500)).toBeLessThanOrEqual(9500)
    }
  })
  it('distinguishes proportional, fit and fill for short and long documents', () => {
    expect(minimapLayout(500, 10000, 500, 0, 1000, 1, 'proportional').contentHeight).toBe(3000)
    expect(minimapLayout(500, 10000, 500, 0, 1000, 1, 'fit').contentHeight).toBe(500)
    expect(minimapLayout(500, 100, 500, 0, 10, 1, 'fit').contentHeight).toBe(30)
    expect(minimapLayout(500, 100, 500, 0, 10, 1, 'fill').contentHeight).toBe(500)
  })
  it('handles empty documents and zero-sized windows without NaN', () => {
    expect(Object.values(minimapLayout(0, 0, 0, 0, 0, 1, 'fit')).every(Number.isFinite)).toBe(true)
  })
})

describe('fast save-state fingerprint', () => {
  it('retains the exact original 64-bit FNV-1a result, including Unicode and overflow', () => {
    const samples = ['', 'hello', '中文😀\n\n', 'x'.repeat(20000), Array.from({ length: 1000 }, (_, i) => String.fromCharCode((i * 997) % 65536)).join('')]
    for (const text of samples) {
      let expected = 0xcbf29ce484222325n
      for (const char of text.split('')) expected = ((expected ^ BigInt(char.charCodeAt(0))) * 0x100000001b3n) & 0xffffffffffffffffn
      expect(hashContent(text, true)).toBe(expected)
    }
  })
})
