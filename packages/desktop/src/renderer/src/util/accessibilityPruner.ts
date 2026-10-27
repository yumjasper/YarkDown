/**
 * Keeps offscreen blocks out of the Chromium accessibility tree.
 *
 * Chromium serializes the renderer's AX nodes on the browser process main
 * thread. With the native accessibility flags this app runs with, a long
 * formula-dense document pays that cost on every scroll and resize frame:
 * measured 615 ms for one AX task while wheel-scrolling a 1920x1120 window and
 * 3665 ms per resize gesture. That work lands on the UI thread, so the window and
 * the rest of the desktop stutter while it runs.
 *
 * Pruning offscreen blocks with `aria-hidden` removes essentially all of it. It
 * is attribute-only, so layout, scroll height and text metrics stay identical and
 * nothing needs re-measuring. Visibility is tracked by an `IntersectionObserver`,
 * which avoids a forced layout read on every scroll event.
 *
 * Toggling the attribute is not free, though. Each write invalidates the style of
 * that block's subtree, and a KaTeX-heavy block is thousands of nodes, so writing
 * per intersection entry produced a style recalc, a commit and a paint on every
 * scroll frame - measured p95 42-50 ms versus 25 ms with pruning disabled
 * entirely. Worse, every toggle makes the browser re-serialize the whole
 * accessibility tree on its main thread: 38 ms per task mid-gesture, and up to
 * 197 ms for a restore, which puts a KaTeX subtree back rather than removing it.
 *
 * So no attribute is written while a gesture is in flight, in either direction.
 * The writes are queued, and a settle timer applies them once the wheel stops,
 * a few blocks per frame: a whole gesture's queue written in one task measured a
 * 108 ms frame and a 207 ms serialization. Both directions are delayed, and the
 * final state is the state of the viewport when the gesture stopped, because the
 * settled batch replays the accumulated sets.
 *
 * Assistive technology still reaches the whole document: the overscan band keeps
 * about-to-enter blocks announced, and bringing the caret or the virtual cursor
 * into a pruned block scrolls it into view, which makes the observer drop its
 * `aria-hidden` before it is read. A keyboard scroll fires one scroll event per
 * key repeat, so each step is announced within `SETTLE_MS`.
 */

/** Blocks further than this from the viewport stay out of the tree. Generous
 *  enough that a fast wheel flick does not outrun the re-announcement, but no
 *  larger: the browser serializes every announced block on each scroll frame, so
 *  this band is a direct per-frame cost. 600 px kept twice the viewport worth of
 *  KaTeX subtree in the tree and measured 25 ms p95 against 17 ms with the tree
 *  disabled entirely. */
const OVERSCAN_PX = 300

/** Below this the subtree is cheap to serialize; pruning would only add observer
 *  bookkeeping without a measurable win. */
const MIN_BLOCKS = 120

/** Hiding is only applied after the scroll has travelled this far since the last
 *  batch, so the write cost is paid once per viewport rather than once per frame.
 *  Measured both ways: 300 px produced more batches and more long frames than
 *  1200 px, because each batch costs a style recalc of the blocks it touches.
 *  This gate only decides how quickly a long gesture releases a batch when it
 *  stops early; the settle timer applies the queue regardless. */
const HIDE_QUANTUM_PX = 1200

/** A scroll that stops still has to be pruned; the quantum alone would leave the
 *  last partial stretch unpruned until the next gesture. */
const SETTLE_MS = 150

/** How many blocks a single frame may hide once the gesture has settled. A whole
 *  gesture's worth of blocks written in one task re-serialized the accessibility
 *  tree once and measured 105 ms - a visible hitch just after the wheel stops.
 *  The frames after a gesture are idle, so the same writes spread over a dozen of
 *  them cost nothing the user can observe. Four measured a 60 ms worst
 *  serialization against 207 ms when the queue was written in one task. */
const HIDE_DRAIN_PER_FRAME = 4

/** Budget for the document-opening pass. It runs before any gesture, and the tree
 *  is still whole, so finishing fast matters more than keeping the task short:
 *  a user who starts wheeling before the first pass completes pays for a full
 *  tree. 639 blocks drain in 27 frames (~0.45 s) at this rate. */
const OPENING_DRAIN_PER_FRAME = 24

export interface AccessibilityPruner {
  /** Rebuilds the observed block list; call after the document content changes. */
  refresh: () => void
  /** Applies any pending batch immediately. */
  flush: () => void
  dispose: () => void
}

const isElement = (node: Element): node is HTMLElement => node instanceof HTMLElement

export const createAccessibilityPruner = (
  scroller: HTMLElement,
  surface: HTMLElement
): AccessibilityPruner => {
  const pruned = new Set<HTMLElement>()
  // Replaced on every teardown: the observer is recreated, so the "already
  // observed" marks must not survive it.
  let observed = new WeakSet<HTMLElement>()
  let observer: IntersectionObserver | undefined
  let follow: MutationObserver | undefined
  let pending: (ResizeObserver | MutationObserver)[] = []
  let disposed = false

  // Batches. `toShow` is filled by the observer and always applied on the next
  // frame; `toHide` additionally waits for `HIDE_QUANTUM_PX`.
  const toShow = new Set<HTMLElement>()
  const toHide = new Set<HTMLElement>()
  let frame = 0
  let settleTimer: ReturnType<typeof setTimeout> | undefined
  // Scroll distance accumulated in the scroll event since the last batch that
  // was allowed to hide. Kept here, not in the frame callback, because reading
  // `scrollTop` in the callback forces a layout flush on every frame.
  let lastScrollTop = 0
  let travelled = 0
  // Set once a quantum has been travelled, cleared by the batch that uses it.
  let hideUnlocked = false
  // The first batch of a freshly opened document is not a scroll: nothing is being
  // composited, so it may hide immediately. Cleared as soon as the user scrolls.
  let initialPass = true
  // True between the first scroll event and the settle timer. Attribute writes are
  // held back for the whole gesture: each `aria-hidden` toggle costs a style
  // invalidation of that block's subtree plus an accessibility-tree re-serialization
  // on the browser process main thread, which measured 38 ms per task and ~1.1 s
  // across a 12 s wheel stream.
  let settling = false

  // `surface` is the engine root (`.mu-editor`); the top-level blocks are the
  // children of the centered column inside it. The column does not exist yet when
  // the editor mounts, so it has to be looked up again on every attempt - binding
  // it once made the pruner watch the bare root, never find enough blocks, and
  // silently leave the whole document in the accessibility tree.
  const resolveContainer = (): HTMLElement =>
    surface.querySelector<HTMLElement>('.mu-container') ?? surface

  const restoreAll = () => {
    for (const block of pruned) block.removeAttribute('aria-hidden')
    pruned.clear()
  }

  const stopWatchingReadiness = () => {
    for (const watcher of pending) watcher.disconnect()
    pending = []
  }

  const canHide = (block: HTMLElement): boolean => {
    // The caret's block must stay announced: `aria-hidden` on an ancestor of the
    // focused element hides the very node assistive tech is tracking.
    const focused = document.activeElement
    return !focused || !block.contains(focused)
  }

  const cancelFrame = () => {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    clearTimeout(settleTimer)
    settleTimer = undefined
  }

  /** Resumes a partially applied batch on the next frame, unless a gesture is in
   *  flight - then the settle timer owns the remainder and applies it once the
   *  wheel stops. */
  const continueDraining = () => {
    if (frame || settling) return
    frame = requestAnimationFrame(() => flush(true, HIDE_DRAIN_PER_FRAME))
  }

  const flush = (allowHide: boolean, limit = Number.POSITIVE_INFINITY) => {
    frame = 0
    if (disposed) return
    let written = 0
    // Restores go first and always: a block may have been queued for hiding and
    // then scrolled back in within the same batch window, and a block that is on
    // screen must be announced before anything else. They share the frame budget
    // with hides because a restore is the more expensive direction - it puts a
    // whole KaTeX subtree back into the tree - and a fast flick across a dozen
    // viewports queues one restore per block passed. Writing all of them in one
    // task measured a 107 ms renderer task plus a 193 ms accessibility
    // serialization right after the wheel stopped.
    for (const block of toShow) {
      toHide.delete(block)
      if (pruned.delete(block)) block.removeAttribute('aria-hidden')
      if (++written >= limit) break
    }
    for (const block of toShow) {
      if (!pruned.has(block)) toShow.delete(block)
    }
    const exhausted = written >= limit && (toShow.size > 0 || toHide.size > 0)
    if (exhausted) {
      // Budget spent. The rest is written on the following frames; once the
      // gesture has stopped those frames are idle, so the remainder is invisible.
      continueDraining()
      return
    }
    if (!allowHide || toHide.size === 0) return
    // Every attribute write invalidates the style of that block's whole subtree,
    // and a KaTeX-heavy block is thousands of nodes. Doing that while the wheel
    // turns is what turned a compositor-only scroll into a per-frame style recalc
    // plus commit plus paint, so hiding is released once per viewport rather than
    // once per frame. What a batch hides is already `OVERSCAN_PX` offscreen. The
    // per-frame budget below is what keeps a settled queue from becoming one long
    // task; splitting the writes across frames *during* the gesture was measured
    // worse instead - the style damage is identical but it is paid in more
    // commits, and the worst commit grew from 58 to 161 ms.
    for (const block of toHide) {
      if (pruned.has(block) || !canHide(block)) {
        toHide.delete(block)
        continue
      }
      block.setAttribute('aria-hidden', 'true')
      pruned.add(block)
      toHide.delete(block)
      if (++written >= limit) break
    }
    if (toHide.size) {
      // A cap was hit: the remainder is written on the following frames. This is
      // the post-gesture drain - writing the whole queue in one task measured a
      // 105 ms long task and a 196 ms accessibility serialization, i.e. a hitch
      // right after the wheel stops. Those frames are idle otherwise.
      continueDraining()
      return
    }
    travelled = 0
    hideUnlocked = false
    initialPass = false
  }

  const schedule = () => {
    if (frame) return
    // No attribute is written while a wheel gesture is in flight, for hiding or for
    // restoring. Every `aria-hidden` toggle makes the browser re-serialize the
    // accessibility tree, and both directions cost the same: measured 38 ms per task
    // for a mid-gesture hide, and up to 197 ms for a mid-gesture restore, because
    // putting a KaTeX subtree back into the tree serializes all of it. Holding both
    // until the gesture settles took the 12 s scroll from 1146 ms of AX work with a
    // 38 ms worst task down to 151 ms with a 3 ms worst task.
    //
    // Correctness does not depend on the delay: the settle timer is armed by every
    // scroll event, `toShow` and `toHide` keep accumulating meanwhile, and the
    // settled `flush` applies restores before hides over the accumulated sets, so
    // the final state is the one the viewport has at that moment. A keyboard scroll
    // fires one scroll event per key repeat, so assistive technology sees the update
    // within `SETTLE_MS` of each step.
    if (settling) return
    // The opening pass gets a larger budget: the accessibility tree is still
    // whole, so finishing it quickly matters more than keeping the task short.
    frame = requestAnimationFrame(() =>
      flush(
        hideUnlocked || initialPass,
        initialPass ? OPENING_DRAIN_PER_FRAME : HIDE_DRAIN_PER_FRAME
      )
    )
  }

  const onIntersect = (entries: IntersectionObserverEntry[]) => {
    for (const entry of entries) {
      const block = entry.target as HTMLElement
      if (entry.isIntersecting) {
        if (!pruned.has(block) && !toHide.has(block)) continue
        toHide.delete(block)
        toShow.add(block)
      } else {
        toHide.add(block)
      }
    }
    if (toShow.size || toHide.size) schedule()
  }

  const onScroll = () => {
    // Any scroll means the document is being composited; the opening pass no
    // longer gets a free write.
    initialPass = false
    settling = true
    // Read here, in the event, not in the frame callback: a read inside rAF
    // forces a layout flush per frame instead of reusing the committed layout.
    const scrollTop = scroller.scrollTop
    travelled += Math.abs(scrollTop - lastScrollTop)
    lastScrollTop = scrollTop
    if (!hideUnlocked && travelled >= HIDE_QUANTUM_PX) {
      hideUnlocked = true
      // Release with whatever is already queued rather than waiting for the next
      // intersection entry, which may only arrive after more scroll.
      if (toHide.size) schedule()
    }
    clearTimeout(settleTimer)
    settleTimer = setTimeout(() => {
      settleTimer = undefined
      settling = false
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      flush(true, HIDE_DRAIN_PER_FRAME)
    }, SETTLE_MS)
  }

  const observeBlocks = (blocks: HTMLElement[]) => {
    observer ??= new IntersectionObserver(onIntersect, {
      root: scroller,
      rootMargin: `${OVERSCAN_PX}px 0px`
    })
    for (const block of blocks) {
      if (observed.has(block)) continue
      observed.add(block)
      observer.observe(block)
    }
  }

  // Editing appends blocks after the first pass; without this they would stay in
  // the tree forever, since nothing re-observes them.
  const followNewBlocks = (container: HTMLElement) => {
    follow = new MutationObserver(() => {
      observeBlocks(Array.from(container.children).filter(isElement))
    })
    follow.observe(container, { childList: true })
  }

  const teardown = () => {
    cancelFrame()
    toShow.clear()
    toHide.clear()
    travelled = 0
    hideUnlocked = false
    initialPass = true
    settling = false
    stopWatchingReadiness()
    follow?.disconnect()
    follow = undefined
    observer?.disconnect()
    observer = undefined
    observed = new WeakSet<HTMLElement>()
    scroller.removeEventListener('scroll', onScroll)
    restoreAll()
  }

  const attempt = (): boolean => {
    if (disposed) return false
    // A hidden or not-yet-laid-out window reports a 0x0 scroll port, and with a
    // 0x0 root every block reads as "not intersecting" - the first callback would
    // hide the whole document and, because `IntersectionObserver` only fires on
    // change, nothing would ever be re-announced.
    if (scroller.clientHeight <= 0 || scroller.clientWidth <= 0) return false
    const container = resolveContainer()
    const blocks = Array.from(container.children).filter(isElement)
    if (blocks.length < MIN_BLOCKS) return false
    observeBlocks(blocks)
    followNewBlocks(container)
    lastScrollTop = scroller.scrollTop
    travelled = 0
    hideUnlocked = false
    initialPass = true
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return true
  }

  return {
    refresh() {
      if (disposed) return
      teardown()
      if (attempt()) return
      // Muya renders asynchronously and the window may still be laid out later, so
      // wait for whichever of the two arrives instead of assuming a fixed delay.
      const onReady = () => {
        if (attempt()) stopWatchingReadiness()
      }
      const resize = new ResizeObserver(onReady)
      resize.observe(scroller)
      const mutation = new MutationObserver(onReady)
      mutation.observe(surface, { childList: true, subtree: true })
      pending = [resize, mutation]
    },
    flush() {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      clearTimeout(settleTimer)
      settleTimer = undefined
      flush(true)
    },
    dispose() {
      disposed = true
      teardown()
    }
  }
}
