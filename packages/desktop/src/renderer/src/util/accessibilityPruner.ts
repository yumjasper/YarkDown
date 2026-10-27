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
 * Assistive technology still reaches the whole document: the overscan band keeps
 * about-to-enter blocks announced, and bringing the caret or the virtual cursor
 * into a pruned block scrolls it into view, which makes the observer drop its
 * `aria-hidden` before it is read.
 */

/** Blocks further than this from the viewport stay out of the tree. Generous
 *  enough that a fast wheel flick does not outrun the re-announcement. */
const OVERSCAN_PX = 600

/** Below this the subtree is cheap to serialize; pruning would only add observer
 *  bookkeeping without a measurable win. */
const MIN_BLOCKS = 120

export interface AccessibilityPruner {
  /** Rebuilds the observed block list; call after the document content changes. */
  refresh: () => void
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

  const hide = (block: HTMLElement) => {
    // The caret's block must stay announced: `aria-hidden` on an ancestor of the
    // focused element hides the very node assistive tech is tracking.
    const focused = document.activeElement
    if (focused && block.contains(focused)) return
    block.setAttribute('aria-hidden', 'true')
    pruned.add(block)
  }

  const onIntersect = (entries: IntersectionObserverEntry[]) => {
    for (const entry of entries) {
      const block = entry.target as HTMLElement
      if (entry.isIntersecting) {
        if (pruned.delete(block)) block.removeAttribute('aria-hidden')
      } else if (!pruned.has(block)) {
        hide(block)
      }
    }
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
    stopWatchingReadiness()
    follow?.disconnect()
    follow = undefined
    observer?.disconnect()
    observer = undefined
    observed = new WeakSet<HTMLElement>()
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
    dispose() {
      disposed = true
      teardown()
    }
  }
}
