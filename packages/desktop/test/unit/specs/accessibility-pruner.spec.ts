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

const mount = (blockCount: number, portSize = 900, heavyNodes = 30) => {
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
    // Dense subtrees are the ones worth pruning; a bare paragraph is not.
    for (let child = 0; child < heavyNodes; child++) block.appendChild(document.createElement('span'))
    container.appendChild(block)
    blocks.push(block)
  }
  Object.defineProperty(scroller, 'clientHeight', { value: portSize, configurable: true })
  Object.defineProperty(scroller, 'clientWidth', { value: 1200, configurable: true })
  return { scroller, surface, container, blocks }
}

/** Delivers intersection results without applying the batch. */
const reportOnly = (blocks: HTMLElement[], isIntersecting: boolean) => {
  const observer = observers[observers.length - 1]
  observer.callback(
    blocks.map(
      (target) => ({ target, isIntersecting }) as unknown as IntersectionObserverEntry
    )
  )
}

/** jsdom has no layout, so `scrollTop` is always 0 unless it is made writable. */
const makeScrollable = (scroller: HTMLElement) => {
  let value = 0
  Object.defineProperty(scroller, 'scrollTop', {
    configurable: true,
    get: () => value,
    set: (next: number) => {
      value = next
    }
  })
  return (next: number) => {
    scroller.scrollTop = next
    scroller.dispatchEvent(new Event('scroll'))
  }
}

/** Reports the given blocks as either visible or offscreen and applies the batch. */
const report = (
  blocks: HTMLElement[],
  isIntersecting: boolean,
  pruner: { flush: () => void }
) => {
  reportOnly(blocks, isIntersecting)
  // Attribute writes are batched into a frame; flush stands in for that frame.
  pruner.flush()
}

/** Once a gesture settles the queued hides drain a few blocks per frame, so a
 *  large queue finishes over several frames rather than in one long task. Polls
 *  instead of assuming a frame count. */
const waitForHidden = async(blocks: HTMLElement[], expected: number) => {
  const deadline = Date.now() + 4000
  const hidden = () => blocks.filter((block) => block.hasAttribute('aria-hidden'))
  while (Date.now() < deadline) {
    if (hidden().length >= expected) return
    await new Promise((resolve) => setTimeout(resolve, 16))
  }
  return hidden().length
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
    report([blocks[150]], false, pruner)
    expect(blocks[150].getAttribute('aria-hidden')).toBe('true')
    report([blocks[150]], true, pruner)
    expect(blocks[150].hasAttribute('aria-hidden')).toBe(false)
    pruner.dispose()
  })

  it('keeps the layout untouched while pruning', () => {
    const { scroller, surface, blocks } = mount(200)
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.refresh()
    const textBefore = blocks.map((block) => block.textContent)
    report(blocks.slice(100), false, pruner)
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
    report([blocks[150]], false, pruner)
    expect(blocks[150].hasAttribute('aria-hidden')).toBe(false)
    pruner.dispose()
  })

  it('restores everything when the content is refreshed', () => {
    const { scroller, surface, blocks } = mount(200)
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.refresh()
    report(blocks.slice(100), false, pruner)
    expect(blocks.filter((block) => block.hasAttribute('aria-hidden'))).toHaveLength(100)
    pruner.refresh()
    expect(blocks.filter((block) => block.hasAttribute('aria-hidden'))).toHaveLength(0)
    pruner.dispose()
  })

  it('coalesces a burst of intersections into a single batch', () => {
    const { scroller, surface, blocks } = mount(200)
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.refresh()
    const writes: string[] = []
    const record = (block: HTMLElement) => {
      const original = block.setAttribute.bind(block)
      block.setAttribute = (name: string, value: string) => {
        if (name === 'aria-hidden') writes.push(block.textContent || '')
        original(name, value)
      }
    }
    blocks.slice(100).forEach(record)
    // Two separate intersection callbacks before the frame lands: the style write
    // must be batched once, not once per callback.
    reportOnly(blocks.slice(100, 150), false)
    reportOnly(blocks.slice(150), false)
    expect(writes).toHaveLength(0)
    pruner.flush()
    expect(writes).toHaveLength(100)
    pruner.dispose()
  })

  it('holds hiding back until the scroll settles', async() => {
    const { scroller, surface, blocks } = mount(200)
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.refresh()
    const scrollTo = makeScrollable(scroller)
    // No write may happen mid-gesture: every `aria-hidden` toggle invalidates that
    // block's subtree and makes the browser re-serialize the accessibility tree,
    // measured at up to 38 ms per task. Travel alone must not release a batch.
    scrollTo(200)
    reportOnly(blocks.slice(100), false)
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    expect(blocks.filter((block) => block.hasAttribute('aria-hidden'))).toHaveLength(0)
    // Crossing the quantum mid-gesture must still not write.
    scrollTo(1200)
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    expect(blocks.filter((block) => block.hasAttribute('aria-hidden'))).toHaveLength(0)
    // The settle timer applies the whole queue, a few blocks per frame so that no
    // single task blocks the main thread.
    await new Promise((resolve) => setTimeout(resolve, 200))
    await waitForHidden(blocks, 100)
    expect(blocks.filter((block) => block.hasAttribute('aria-hidden'))).toHaveLength(100)
    pruner.dispose()
  })

  it('applies a pending batch once the scroll settles', async() => {
    const { scroller, surface, blocks } = mount(200)
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.refresh()
    const scrollTo = makeScrollable(scroller)
    scrollTo(50)
    reportOnly(blocks.slice(100), false)
    await new Promise((resolve) => setTimeout(resolve, 200))
    // A gesture that never reaches the quantum still ends up pruned.
    await waitForHidden(blocks, 100)
    expect(blocks.filter((block) => block.hasAttribute('aria-hidden'))).toHaveLength(100)
    pruner.dispose()
  })

  it('prunes on the first pass without waiting for a scroll', async() => {
    const { scroller, surface, blocks } = mount(200)
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.refresh()
    // Opening a long document produces one intersection pass and no scroll at
    // all; gating that pass behind a travel quantum left every offscreen block
    // announced until the user happened to wheel.
    reportOnly(blocks.slice(100), false)
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    await waitForHidden(blocks, 100)
    expect(blocks.filter((block) => block.hasAttribute('aria-hidden'))).toHaveLength(100)
    pruner.dispose()
  })

  it('restores a block once the gesture settles', async() => {
    const { scroller, surface, blocks } = mount(200)
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.refresh()
    report(blocks.slice(100), false, pruner)
    expect(blocks[120].getAttribute('aria-hidden')).toBe('true')
    scroller.dispatchEvent(new Event('scroll'))
    // Mid-gesture the attribute is left alone in both directions: every toggle
    // re-serializes the accessibility tree, and a restore costs more than a hide
    // because it puts the whole subtree back. `reportOnly` is used here on
    // purpose: `report` calls the public `flush`, which is the explicit
    // apply-now escape hatch and is not what a wheel gesture goes through.
    reportOnly([blocks[120]], true)
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    expect(blocks[120].getAttribute('aria-hidden')).toBe('true')
    // The settle timer is armed by the scroll event above, so the block that came
    // back on screen is announced once the gesture stops.
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(blocks[120].hasAttribute('aria-hidden')).toBe(false)
    pruner.dispose()
  })

  it('restores everything on disposal and stops observing', () => {
    const { scroller, surface, blocks } = mount(200)
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.refresh()
    report(blocks.slice(100), false, pruner)
    pruner.dispose()
    expect(blocks.filter((block) => block.hasAttribute('aria-hidden'))).toHaveLength(0)
    expect(observers[0].targets).toHaveLength(0)
  })

  it('prunes a block that scrolls back out before its batch lands', () => {
    const { scroller, surface, blocks } = mount(200)
    const pruner = createAccessibilityPruner(scroller, surface)
    pruner.refresh()
    // An animated outline scroll moves several viewports in 300 ms, so blocks
    // enter and leave again inside one batch window. The observer only reports
    // changes, so a block left queued for restore is never reported again: it
    // stayed announced for the rest of the session, and on the math tutorial the
    // accessibility tree grew from 1372 to 19226 nodes, which made every later
    // jump serialize it for ~115 ms.
    reportOnly([blocks[120]], true)
    reportOnly([blocks[120]], false)
    pruner.flush()
    expect(blocks[120].getAttribute('aria-hidden')).toBe('true')
    pruner.dispose()
  })
})
