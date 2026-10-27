import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { observeSettledViewport } from '@/util/settledViewport'
import { minimapText } from '@/components/minimap/text'

describe('heavy document viewport', () => {
  let notify: ResizeObserverCallback
  let disconnect: ReturnType<typeof vi.fn>
  let viewport: HTMLElement
  let surface: HTMLElement
  let width: number
  let height: number
  const resize = (w: number, h = 600) => {
    width = w
    height = h
    notify([{
      target: viewport, contentRect: new DOMRect(0, 0, width, height),
      borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: []
    }], {} as ResizeObserver)
  }
  beforeEach(() => {
    vi.useFakeTimers()
    width = 800
    height = 600
    viewport = document.createElement('div')
    surface = document.createElement('div')
    Object.defineProperties(viewport, {
      clientWidth: { get: () => width }, clientHeight: { get: () => height }
    })
    disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { notify = callback }
      observe = vi.fn()
      disconnect = disconnect
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  it('keeps document geometry and viewport-relative spacing stable through a drag', () => {
    const callback = vi.fn()
    const handle = observeSettledViewport(viewport, surface, callback)
    for (let i = 0; i < 30; i++) {
      resize(900 + i, 700 + i)
      vi.advanceTimersByTime(16)
      expect(surface.style.width).toBe('800px')
      expect(surface.style.getPropertyValue('--settled-viewport-height')).toBe('600px')
    }
    expect(callback).not.toHaveBeenCalled()
    vi.advanceTimersByTime(250)
    expect(surface.style.width).toBe('929px')
    expect(surface.style.height).toBe('729px')
    expect(callback).toHaveBeenCalledTimes(1)
    handle.dispose()
  })
  it('does not commit during a paused native resize gesture', () => {
    const callback = vi.fn()
    const handle = observeSettledViewport(viewport, surface, callback)
    handle.setInteractive(true)
    resize(1000)
    vi.advanceTimersByTime(1000)
    expect(callback).not.toHaveBeenCalled()
    handle.setInteractive(false)
    vi.runOnlyPendingTimers()
    expect(surface.style.width).toBe('1000px')
    expect(callback).toHaveBeenCalledTimes(1)
    handle.dispose()
  })
  it('recovers a hidden Markdown view and ignores repeated dimensions', () => {
    const callback = vi.fn()
    const handle = observeSettledViewport(viewport, surface, callback)
    resize(0, 0)
    vi.advanceTimersByTime(250)
    expect(surface.style.width).toBe('800px')
    resize(1000)
    vi.advanceTimersByTime(250)
    resize(1000)
    vi.advanceTimersByTime(250)
    expect(callback).toHaveBeenCalledTimes(1)
    handle.dispose()
  })
  it('restores inline styles and cancels pending work on teardown', () => {
    surface.style.width = '90%'
    surface.style.height = '100%'
    surface.style.setProperty('--settled-viewport-height', '20px')
    const callback = vi.fn()
    const handle = observeSettledViewport(viewport, surface, callback)
    resize(1100)
    handle.dispose()
    vi.runOnlyPendingTimers()
    expect(callback).not.toHaveBeenCalled()
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(surface.style.width).toBe('90%')
    expect(surface.style.height).toBe('100%')
    expect(surface.style.getPropertyValue('--settled-viewport-height')).toBe('20px')
  })
})

describe('minimap source text', () => {
  const parse = (html: string) => {
    const element = document.createElement('div')
    element.innerHTML = html
    return element
  }
  it('reads block math source without duplicated generated previews', () => {
    const element = parse('<figure><pre class="mu-math-container">a^2+b^2</pre><div class="mu-math-preview"><span class="katex">generated</span></div></figure>')
    expect(minimapText(element)).toBe('a^2+b^2')
  })
  it('uses inline TeX once instead of both MathML and HTML glyphs', () => {
    const element = parse('<p>Before <span class="katex"><span class="katex-mathml"><annotation encoding="application/x-tex">x^2</annotation></span><span class="katex-html">duplicate</span></span> after</p>')
    expect(minimapText(element)).toBe('Before x^2 after')
  })
  it('bounds per-block text and preserves basic text, breaks and image markers', () => {
    expect(minimapText(parse('<p>ab<br>cd<img></p>'))).toBe('ab\ncd▧')
    expect(minimapText(parse('<p>' + 'x'.repeat(50000) + '</p>'), 100)).toHaveLength(100)
    expect(minimapText(parse('<div class="mu-diagram-preview">ignored</div><code>source</code>'))).toBe('source')
  })
})
