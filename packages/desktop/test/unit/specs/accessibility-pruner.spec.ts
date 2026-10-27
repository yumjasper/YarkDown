import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAccessibilityPruner } from '@/util/accessibilityPruner'

type Callback = (entries: IntersectionObserverEntry[]) => void

interface FakeObserver {
  callback: Callback
  targets: Element[]
}

/** jsdom implements neither IntersectionObserver's callback loop nor layout. */
const observers: FakeObserver[] = []
const resizeCallbacks: FakeReadiness[] = []
const mutationCallbacks: FakeReadiness[] = []

interface FakeReadiness {
  callback: () => void
  active: boolean
}

/** Mirrors the real observers: a disconnected one never fires again. */
const readinessStub = (sink: FakeReadiness[]) =>
  class {
    private readonly record: FakeReadiness

    constructor(callback: () => void) {
      this.record = { callback, active: true }
      sink.push(this.record)
    }

    observe() {}

    disconnect() {
      this.record.active = false
    }
  }

class MockIntersectionObserver {
  private readonly record: FakeObserver

  constructor(callback: Callback) {
    this.record = { callback, targets: [] }
    observers.push(this.record)
  }

  observe(target: Element) {
    this.record.targets.push(target)
  }

  unobserve() {}

  disconnect() {
    this.record.targets = []
  }

  takeRecords() {
    return []
  }
}

const triggerResize = () => {
  for (const item of [...resizeCallbacks]) if (item.active) item.callback()
}

const triggerMutation = () => {
  for (const item of [...mutationCallbacks]) if (item.active) item.callback()
}

const mount = (blockCount: number, portSize = 900) => {
  const scroller = document.createElement('div')
  const surface = document.createElement('div')
  const container = document.createElement('div')
  container.className = 'mu-container'
  scroller.appendChild(surface)
  surface.appendChild(container)
  document.body.append(scroller)
  const blocks: HTMLElement[] = []
  for (let index = 0; index < blockCount; index++) {
    const block = document.createElement('p')
    block.textContent = `block ${index}`
    container.appendChild(block)
    blocks.push(block)
  }
  Object.defineProperty(scroller, 'clientHeight', { value: portSize, configurable: true })
  Object.defineProperty(scroller, 'clientWidth', { value: 1200, configurable: true })
  return { scroller, surface, container, blocks }
}

/** Reports the given blocks as either visible or offscreen. */
const report = (blocks: HTMLElement[], isIntersecting: boolean) => {
  const observer = observers[observers.length - 1]
  observer.callback(
    blocks.map(
      (target) => ({ target, isIntersecting }) as unknown as IntersectionObserverEntry
    )
  )
}

describe('accessibilityPruner', () => {
  beforeEach(() => {
    observers.length = 0
    resizeCallbacks.length = 0
    mutationCallbacks.length = 0
    document.body.innerHTML = ''
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    vi.stubGlobal('ResizeObserver', readinessStub(resizeCallbacks))
    vi.stubGlobal('MutationObserver', readinessStub(mutationCallbacks))
  })

  it('observes every top-level block for a long document', () => {
    const { scroller, surface, blocks } = mount(200)
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.refresh()
    expect(observers).toHaveLength(1)
    expect(observers[0].targets).toEqual(blocks)
    pruner.dispose()
  })

  it('leaves short documents alone', () => {
    const { scroller, surface, blocks } = mount(20)
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.refresh()
    expect(observers).toHaveLength(0)
    // Nothing was hidden even though the port is laid out.
    expect(blocks.filter((block) => block.hasAttribute('aria-hidden'))).toHaveLength(0)
    pruner.dispose()
  })

  it('waits for the document and a laid-out port before observing', () => {
    const { scroller, surface, container } = mount(0, 0)
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.refresh()
    // Nothing to observe yet: observing a 0x0 port would report every block as
    // not intersecting and hide the whole document.
    expect(observers).toHaveLength(0)
    triggerResize()
    expect(observers).toHaveLength(0)
    // Muya renders the blocks and the window gets laid out.
    const rendered: HTMLElement[] = []
    for (let index = 0; index < 200; index++) {
      const block = document.createElement('p')
      container.appendChild(block)
      rendered.push(block)
    }
    Object.defineProperty(scroller, 'clientHeight', { value: 900, configurable: true })
    Object.defineProperty(scroller, 'clientWidth', { value: 1200, configurable: true })
    triggerMutation()
    expect(observers).toHaveLength(1)
    expect(observers[0].targets).toEqual(rendered)
    pruner.dispose()
  })

  it('does not observe when the port never gets laid out', () => {
    const { scroller, surface, container } = mount(0, 0)
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.refresh()
    for (let index = 0; index < 200; index++) container.appendChild(document.createElement('p'))
    // Blocks exist but the port is still 0x0: observing now would hide them all.
    triggerResize()
    expect(observers).toHaveLength(0)
    pruner.dispose()
  })

  it('stops watching for readiness once the blocks are observed', () => {
    const { scroller, surface } = mount(0, 0)
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.refresh()
    Object.defineProperty(scroller, 'clientHeight', { value: 900, configurable: true })
    Object.defineProperty(scroller, 'clientWidth', { value: 1200, configurable: true })
    // Lazily render just enough blocks to cross the threshold.
    const container = surface.querySelector<HTMLElement>('.mu-container') as HTMLElement
    for (let index = 0; index < 200; index++) container.appendChild(document.createElement('p'))
    triggerResize()
    expect(observers).toHaveLength(1)
    triggerMutation()
    expect(observers).toHaveLength(1)
    pruner.dispose()
  })

  it('picks up the block container created after the first refresh', () => {
    const scroller = document.createElement('div')
    const surface = document.createElement('div')
    scroller.appendChild(surface)
    document.body.append(scroller)
    Object.defineProperty(scroller, 'clientHeight', { value: 900, configurable: true })
    Object.defineProperty(scroller, 'clientWidth', { value: 1200, configurable: true })
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.refresh()
    // The editor mounts before Muya renders its column.
    expect(observers).toHaveLength(0)
    const container = document.createElement('div')
    container.className = 'mu-container'
    surface.appendChild(container)
    const blocks: HTMLElement[] = []
    for (let index = 0; index < 200; index++) {
      const block = document.createElement('p')
      container.appendChild(block)
      blocks.push(block)
    }
    triggerMutation()
    expect(observers).toHaveLength(1)
    expect(observers[0].targets).toEqual(blocks)
    pruner.dispose()
  })

  it('observes blocks appended by later edits', () => {
    const { scroller, surface, container, blocks } = mount(200)
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.refresh()
    expect(observers[0].targets).toHaveLength(200)
    const appended = document.createElement('p')
    container.appendChild(appended)
    triggerMutation()
    expect(observers[0].targets).toHaveLength(201)
    expect(observers[0].targets).toContain(appended)
    // Existing blocks are not re-observed, which would reset their state.
    expect(observers[0].targets.filter((target) => target === blocks[0])).toHaveLength(1)
    pruner.dispose()
  })

  it('hides offscreen blocks and re-announces them when they scroll in', () => {
    const { scroller, surface, blocks } = mount(200)
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.refresh()
    report([blocks[150]], false)
    expect(blocks[150].getAttribute('aria-hidden')).toBe('true')
    report([blocks[150]], true)
    expect(blocks[150].hasAttribute('aria-hidden')).toBe(false)
    pruner.dispose()
  })

  it('keeps the layout untouched while pruning', () => {
    const { scroller, surface, blocks } = mount(200)
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.refresh()
    const textBefore = blocks.map((block) => block.textContent)
    report(blocks.slice(100), false)
    // Attribute-only pruning: content and structure stay identical.
    expect(blocks.map((block) => block.textContent)).toEqual(textBefore)
    expect(blocks.filter((block) => block.hasAttribute('aria-hidden'))).toHaveLength(100)
    pruner.dispose()
  })

  it('never hides the block that contains the focused element', () => {
    const { scroller, surface, blocks } = mount(200)
    const editable = document.createElement('span')
    editable.tabIndex = 0
    blocks[150].appendChild(editable)
    editable.focus()
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.refresh()
    report([blocks[150]], false)
    expect(blocks[150].hasAttribute('aria-hidden')).toBe(false)
    pruner.dispose()
  })

  it('restores everything when the content is refreshed', () => {
    const { scroller, surface, blocks } = mount(200)
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.refresh()
    report(blocks.slice(100), false)
    expect(blocks.filter((block) => block.hasAttribute('aria-hidden'))).toHaveLength(100)
    pruner.refresh()
    expect(blocks.filter((block) => block.hasAttribute('aria-hidden'))).toHaveLength(0)
    pruner.dispose()
  })

  it('restores everything on disposal and stops observing', () => {
    const { scroller, surface, blocks } = mount(200)
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.refresh()
    report(blocks.slice(100), false)
    pruner.dispose()
    expect(blocks.filter((block) => block.hasAttribute('aria-hidden'))).toHaveLength(0)
    expect(observers[0].targets).toHaveLength(0)
  })
})
