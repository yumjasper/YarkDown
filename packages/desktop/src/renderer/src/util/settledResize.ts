/** Defer expensive reflow work until resizing pauses; disposal cancels pending work. */
export const observeSettledResize = (
  element: Element,
  callback: () => void,
  delay = 120
): (() => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  let width = -1
  let height = -1
  let disposed = false
  const observer = new ResizeObserver((entries) => {
    if (disposed) return
    const entry = entries.find(entry => entry.target === element)
    if (!entry) return
    const next = entry.contentRect
    if (next.width === width && next.height === height) return
    width = next.width
    height = next.height
    clearTimeout(timer)
    if (width <= 0 || height <= 0) return
    // Keep the existing surface while dragging instead of recreating it at every intermediate size.
    timer = setTimeout(() => {
      timer = undefined
      if (!disposed) callback()
    }, delay)
  })
  observer.observe(element)
  return () => {
    disposed = true
    observer.disconnect()
    clearTimeout(timer)
  }
}
