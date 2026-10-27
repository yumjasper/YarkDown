import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { observeMathPreviewVisibility } from '@/util/mathPreviewVisibility'

describe('offscreen math preview layout', () => {
  let resize: ResizeObserverCallback
  let changes: MutationCallback
  const observe = vi.fn()
  const unobserve = vi.fn()
  const disconnect = vi.fn()
  const disconnectMutation = vi.fn()
  const entry = (target: HTMLElement, height: number): ResizeObserverEntry => ({
    target, contentRect: new DOMRect(0, 0, 800, height),
    borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: []
  })
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resize = callback }
      observe = observe
      unobserve = unobserve
      disconnect = disconnect
    })
    vi.stubGlobal('MutationObserver', class {
      constructor(callback: MutationCallback) { changes = callback }
      observe = vi.fn()
      disconnect = disconnectMutation
    })
  })
  afterEach(() => vi.unstubAllGlobals())
  it('defers only previews after a nonzero post-layout measurement', () => {
    const surface = document.createElement('div')
    surface.innerHTML = '<figure><pre class="mu-math-container">x^2</pre><div class="mu-math-preview">math</div></figure>'
    const preview = surface.querySelector<HTMLElement>('.mu-math-preview')
    if (!preview) throw new Error('Preview fixture missing')
    const rect = vi.spyOn(preview, 'getBoundingClientRect')
    const dispose = observeMathPreviewVisibility(surface)
    expect(observe).toHaveBeenCalledExactlyOnceWith(preview)
    expect(preview.classList.contains('measured-math-preview')).toBe(false)
    resize([entry(preview, 0)], {} as ResizeObserver)
    expect(preview.classList.contains('measured-math-preview')).toBe(false)
    resize([entry(preview, 96)], {} as ResizeObserver)
    expect(preview.style.getPropertyValue('--math-preview-height')).toBe('96px')
    expect(preview.classList.contains('measured-math-preview')).toBe(true)
    expect(surface.querySelector('pre')?.classList.contains('measured-math-preview')).toBe(false)
    expect(rect).not.toHaveBeenCalled()
    dispose()
    expect(preview.classList.contains('measured-math-preview')).toBe(false)
    expect(preview.style.getPropertyValue('--math-preview-height')).toBe('')
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(disconnectMutation).toHaveBeenCalledTimes(1)
  })
  it('tracks new previews once and releases removed or replaced document nodes', () => {
    const surface = document.createElement('div')
    const dispose = observeMathPreviewVisibility(surface)
    const preview = document.createElement('div')
    preview.className = 'mu-math-preview'
    surface.append(preview)
    const records = [{ addedNodes: [preview] }] as unknown as MutationRecord[]
    changes(records, {} as MutationObserver)
    changes(records, {} as MutationObserver)
    expect(observe).toHaveBeenCalledExactlyOnceWith(preview)
    preview.remove()
    changes([{ addedNodes: [] }] as unknown as MutationRecord[], {} as MutationObserver)
    expect(unobserve).toHaveBeenCalledExactlyOnceWith(preview)
    dispose()
  })
})
