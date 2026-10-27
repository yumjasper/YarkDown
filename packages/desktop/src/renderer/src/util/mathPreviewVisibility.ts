/** Keeps offscreen, non-editable KaTeX previews out of resize layout without losing their measured height. */
export const observeMathPreviewVisibility = (surface: HTMLElement): (() => void) => {
  const selector = '.mu-math-preview'
  const measured = new Set<HTMLElement>()
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      const element = entry.target
      if (!(element instanceof HTMLElement) || entry.contentRect.height <= 0) continue
      const size = `${entry.contentRect.height}px`
      if (element.style.getPropertyValue('--math-preview-height') !== size) {
        element.style.setProperty('--math-preview-height', size)
      }
      element.classList.add('measured-math-preview')
    }
  })
  const register = (element: HTMLElement) => {
    if (measured.has(element)) return
    measured.add(element)
    observer.observe(element)
  }
  const scan = (node: Node) => {
    if (!(node instanceof HTMLElement)) return
    if (node.matches(selector)) register(node)
    node.querySelectorAll<HTMLElement>(selector).forEach(register)
  }
  const mutations = new MutationObserver(records => {
    for (const record of records) record.addedNodes.forEach(scan)
    for (const element of measured) {
      if (!surface.contains(element)) {
        observer.unobserve(element)
        measured.delete(element)
      }
    }
  })
  scan(surface)
  mutations.observe(surface, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    mutations.disconnect()
    for (const element of measured) {
      element.classList.remove('measured-math-preview')
      element.style.removeProperty('--math-preview-height')
    }
    measured.clear()
  }
}
