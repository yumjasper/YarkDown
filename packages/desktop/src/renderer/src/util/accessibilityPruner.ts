/**
 * Keeps offscreen blocks out of the Chromium accessibility tree while a native
 * window resize gesture is running. Chromium serializes every AX node of the
 * renderer on `CrBrowserMain` for each frame of the gesture, which on a
 * formula-dense document blocks the whole UI thread (measured 3.6 s for a
 * single task). Because the pruning is `aria-hidden` only, layout, scroll
 * height and text metrics stay byte-identical; nothing is re-measured when the
 * gesture ends.
 *
 * The state is deliberately gesture-scoped: offscreen content is removed from
 * the tree only while the user drags a window edge and restored immediately
 * afterwards, so assistive technology sees the full document at rest.
 */

/** Blocks further than this from the viewport are pruned; small overscan keeps
 *  blocks that are about to scroll in from contributing to the tree. */
const OVERSCAN_PX = 400

/** Auto-restores when resizing stops without a gesture-end message, so a lost
 *  notification can never leave content permanently hidden from the tree. */
const IDLE_RESTORE_MS = 2000

export interface AccessibilityPruner {
  setActive: (active: boolean) => void
  dispose: () => void
}

/** Restore budget per frame. Removing `aria-hidden` makes Chromium walk and
 *  insert each block's whole subtree, so restoring all 600+ blocks in one turn
 *  produced a ~700 ms main-process stall right as the drag ended. */
const RESTORE_BATCH = 40

export const createAccessibilityPruner = (
  scroller: HTMLElement,
  surface: HTMLElement
): AccessibilityPruner => {
  const hidden = new Set<HTMLElement>()
  let watchdog: ReturnType<typeof setTimeout> | undefined
  let restoreFrame = 0
  let disposed = false
  // `surface` is the engine root (`.mu-editor`); the top-level blocks are the
  // children of the centered column inside it.
  const container = surface.querySelector<HTMLElement>('.mu-container') ?? surface

  const cancelRestore = () => {
    if (restoreFrame) cancelAnimationFrame(restoreFrame)
    restoreFrame = 0
  }

  const restoreAll = () => {
    cancelRestore()
    for (const block of hidden) block.removeAttribute('aria-hidden')
    hidden.clear()
  }

  const restoreProgressively = () => {
    cancelRestore()
    const step = () => {
      restoreFrame = 0
      let budget = RESTORE_BATCH
      for (const block of hidden) {
        if (budget-- <= 0) break
        block.removeAttribute('aria-hidden')
        hidden.delete(block)
      }
      if (hidden.size > 0) restoreFrame = requestAnimationFrame(step)
    }
    restoreFrame = requestAnimationFrame(step)
  }

  const prune = () => {
    cancelRestore()
    for (const block of hidden) block.removeAttribute('aria-hidden')
    hidden.clear()
    const scrollerRect = scroller.getBoundingClientRect()
    const top = scrollerRect.top - OVERSCAN_PX
    const bottom = scrollerRect.bottom + OVERSCAN_PX
    const focused = document.activeElement
    // One batched read pass: the layout is already clean at gesture start.
    for (const block of Array.from(container.children)) {
      if (!(block instanceof HTMLElement)) continue
      // The caret's block must stay in the tree: `aria-hidden` on an ancestor
      // of the focused element hides the very node assistive tech is tracking.
      if (focused && block.contains(focused)) continue
      const rect = block.getBoundingClientRect()
      if (rect.bottom < top || rect.top > bottom) {
        block.setAttribute('aria-hidden', 'true')
        hidden.add(block)
      }
    }
  }

  // A drag keeps firing resize events. Re-arming on each one keeps the tree
  // pruned for the whole gesture, while a genuine loss of the gesture-end
  // message still restores the document once resizing goes quiet.
  const rearm = () => {
    clearTimeout(watchdog)
    watchdog = setTimeout(restoreAll, IDLE_RESTORE_MS)
  }

  return {
    setActive(active: boolean) {
      if (disposed) return
      clearTimeout(watchdog)
      watchdog = undefined
      if (!active) {
        window.removeEventListener('resize', rearm)
        restoreProgressively()
        return
      }
      prune()
      window.addEventListener('resize', rearm)
      rearm()
    },
    dispose() {
      disposed = true
      clearTimeout(watchdog)
      window.removeEventListener('resize', rearm)
      restoreAll()
    }
  }
}
