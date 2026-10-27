import { describe, expect, it, vi } from 'vitest'
import { createAccessibilityPruner } from '@/util/accessibilityPruner'

/** Builds a scroller whose children sit at the given vertical offsets. */
const mount = (offsets: Array<{ top: number; height: number }>) => {
  const scroller = document.createElement('div')
  const surface = document.createElement('div')
  const container = document.createElement('div')
  container.className = 'mu-container'
  scroller.appendChild(surface)
  surface.appendChild(container)
  document.body.append(scroller)
  // 600px tall viewport starting at the top of the document.
  scroller.getBoundingClientRect = () =>
    ({ top: 0, bottom: 600, left: 0, right: 800, width: 800, height: 600 }) as DOMRect
  const blocks = offsets.map(({ top, height }) => {
    const block = document.createElement('p')
    block.getBoundingClientRect = () =>
      ({ top, bottom: top + height, left: 0, right: 800, width: 800, height }) as DOMRect
    container.appendChild(block)
    return block
  })
  return { scroller, surface, container, blocks }
}

describe('accessibilityPruner', () => {
  it('prunes only blocks outside the viewport and its overscan', () => {
    const { scroller, surface, blocks } = mount([
      { top: 0, height: 100 },
      { top: 100, height: 500 },
      { top: 1500, height: 100 }
    ])
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.setActive(true)
    expect(blocks[0].hasAttribute('aria-hidden')).toBe(false)
    expect(blocks[1].hasAttribute('aria-hidden')).toBe(false)
    // Inside the 400px overscan below the 600px viewport: still announced.
    expect(blocks[2].hasAttribute('aria-hidden')).toBe(true)
    pruner.dispose()
  })

  it('keeps layout geometry untouched while pruning', () => {
    const { scroller, surface, blocks } = mount([
      { top: 0, height: 100 },
      { top: 5000, height: 100 }
    ])
    const pruner = createAccessibilityPruner(scroller, surface)
    const before = blocks.map((block) => block.getBoundingClientRect().top)
    pruner.setActive(true)
    expect(blocks.map((block) => block.getBoundingClientRect().top)).toEqual(before)
    pruner.dispose()
  })

  it('restores every block after the gesture ends', async() => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const { scroller, surface, blocks } = mount(
      Array.from({ length: 120 }, (_, index) => ({ top: index * 1000, height: 100 }))
    )
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.setActive(true)
    const prunedCount = blocks.filter((block) => block.hasAttribute('aria-hidden')).length
    // Only the blocks inside the viewport plus 400px overscan stay announced.
    expect(prunedCount).toBeGreaterThan(100)
    expect(prunedCount).toBeLessThan(120)
    pruner.setActive(false)
    // Each frame restores a bounded batch so no single turn walks the whole doc.
    while (frames.length > 0) {
      const next = frames.shift()
      if (next) next(0)
    }
    expect(blocks.filter((block) => block.hasAttribute('aria-hidden')).length).toBe(0)
    pruner.dispose()
    vi.unstubAllGlobals()
  })

  it('never hides the block that contains the focused element', () => {
    const { scroller, surface, blocks } = mount([
      { top: 0, height: 100 },
      { top: 9000, height: 100 }
    ])
    const editable = document.createElement('span')
    editable.tabIndex = 0
    blocks[1].appendChild(editable)
    editable.focus()
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.setActive(true)
    expect(blocks[0].hasAttribute('aria-hidden')).toBe(false)
    expect(blocks[1].hasAttribute('aria-hidden')).toBe(false)
    pruner.dispose()
  })

  it('keeps pruning while resize events continue past the idle delay', () => {
    vi.useFakeTimers()
    const { scroller, surface, blocks } = mount([
      { top: 0, height: 100 },
      { top: 9000, height: 100 }
    ])
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.setActive(true)
    // Simulate a long drag: resize events keep the state alive.
    for (let index = 0; index < 6; index++) {
      vi.advanceTimersByTime(1000)
      window.dispatchEvent(new Event('resize'))
    }
    expect(blocks[1].hasAttribute('aria-hidden')).toBe(true)
    // Resizing goes quiet: the tree comes back on its own.
    vi.advanceTimersByTime(2500)
    expect(blocks[1].hasAttribute('aria-hidden')).toBe(false)
    pruner.dispose()
    vi.useRealTimers()
  })

  it('cancels a pending restore when a new gesture starts', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const { scroller, surface, blocks } = mount([
      { top: 0, height: 100 },
      { top: 9000, height: 100 }
    ])
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.setActive(true)
    pruner.setActive(false)
    pruner.setActive(true)
    expect(blocks[1].hasAttribute('aria-hidden')).toBe(true)
    pruner.dispose()
    expect(blocks[1].hasAttribute('aria-hidden')).toBe(false)
    vi.unstubAllGlobals()
  })

  it('does nothing after disposal', () => {
    const { scroller, surface, blocks } = mount([{ top: 9000, height: 100 }])
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.dispose()
    pruner.setActive(true)
    expect(blocks[0].hasAttribute('aria-hidden')).toBe(false)
  })
})
