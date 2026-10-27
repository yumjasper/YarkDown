export interface SettledViewport {
  setInteractive: (active: boolean) => void
  dispose: () => void
}

/** Pins a heavy child surface while its clipping viewport changes, then commits the final size. */
export const observeSettledViewport = (
  viewport: HTMLElement,
  surface: HTMLElement,
  callback: () => void,
  delay = 250
): SettledViewport => {
  const previousWidth = surface.style.width
  const previousHeight = surface.style.height
  const previousViewportHeight = surface.style.getPropertyValue('--settled-viewport-height')
  let width = viewport.clientWidth
  let height = viewport.clientHeight
  let appliedWidth = width
  let appliedHeight = height
  let interactive = false
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const apply = () => {
    timer = undefined
    if (disposed || interactive || width <= 0 || height <= 0) return
    if (width === appliedWidth && height === appliedHeight) return
    surface.style.width = `${width}px`
    surface.style.height = `${height}px`
    surface.style.setProperty('--settled-viewport-height', `${height}px`)
    appliedWidth = width
    appliedHeight = height
    callback()
  }
  if (width > 0 && height > 0) {
    surface.style.width = `${width}px`
    surface.style.height = `${height}px`
    surface.style.setProperty('--settled-viewport-height', `${height}px`)
  }
  const observer = new ResizeObserver(entries => {
    if (disposed) return
    const entry = entries.find(entry => entry.target === viewport)
    if (!entry) return
    const nextWidth = Math.round(entry.contentRect.width)
    const nextHeight = Math.round(entry.contentRect.height)
    if (nextWidth === width && nextHeight === height) return
    width = nextWidth
    height = nextHeight
    clearTimeout(timer)
    if (!interactive && width > 0 && height > 0) timer = setTimeout(apply, delay)
  })
  observer.observe(viewport)
  return {
    setInteractive(active) {
      if (disposed) return
      interactive = active
      clearTimeout(timer)
      if (!active) {
        // WM_EXITSIZEMOVE may precede the final ResizeObserver delivery.
        width = viewport.clientWidth
        height = viewport.clientHeight
        timer = setTimeout(apply, 0)
      }
    },
    dispose() {
      disposed = true
      clearTimeout(timer)
      observer.disconnect()
      surface.style.width = previousWidth
      surface.style.height = previousHeight
      if (previousViewportHeight) surface.style.setProperty('--settled-viewport-height', previousViewportHeight)
      else surface.style.removeProperty('--settled-viewport-height')
    }
  }
}
