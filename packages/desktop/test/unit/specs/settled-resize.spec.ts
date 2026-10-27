import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { observeSettledResize } from '@/util/settledResize'

describe('expensive resize work', () => {
  let notify: ResizeObserverCallback
  let disconnect: ReturnType<typeof vi.fn>
  let element: HTMLElement
  const resize = (width: number, height = 600, target: Element = element) => {
    notify([{ target, contentRect: { width, height } } as ResizeObserverEntry], {} as ResizeObserver)
  }
  beforeEach(() => {
    vi.useFakeTimers()
    element = document.createElement('div')
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
  it('collapses a continuous edge drag into one refresh after the final size', () => {
    const callback = vi.fn()
    const stop = observeSettledResize(element, callback)
    for (let i = 0; i < 100; i++) {
      resize(800 + i)
      vi.advanceTimersByTime(16)
    }
    expect(callback).not.toHaveBeenCalled()
    vi.advanceTimersByTime(104)
    expect(callback).toHaveBeenCalledTimes(1)
    resize(1000)
    vi.advanceTimersByTime(120)
    expect(callback).toHaveBeenCalledTimes(2)
    stop()
  })
  it('ignores unchanged dimensions and unrelated entries without delaying a pending refresh', () => {
    const callback = vi.fn()
    const stop = observeSettledResize(element, callback)
    resize(800)
    vi.advanceTimersByTime(100)
    resize(800)
    resize(900, 600, document.createElement('div'))
    vi.advanceTimersByTime(20)
    expect(callback).toHaveBeenCalledTimes(1)
    resize(800)
    vi.advanceTimersByTime(120)
    expect(callback).toHaveBeenCalledTimes(1)
    resize(800, 700)
    vi.advanceTimersByTime(120)
    expect(callback).toHaveBeenCalledTimes(2)
    stop()
  })
  it('cancels pending work for a hidden view and refreshes when shown again', () => {
    const callback = vi.fn()
    const stop = observeSettledResize(element, callback)
    resize(800)
    resize(0, 0)
    vi.advanceTimersByTime(120)
    expect(callback).not.toHaveBeenCalled()
    resize(800)
    vi.advanceTimersByTime(120)
    expect(callback).toHaveBeenCalledTimes(1)
    stop()
  })
  it('disconnects and cancels all queued work when an editor unmounts', () => {
    const callback = vi.fn()
    const stop = observeSettledResize(element, callback)
    resize(800)
    stop()
    resize(900)
    vi.advanceTimersByTime(1000)
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(callback).not.toHaveBeenCalled()
  })
})
