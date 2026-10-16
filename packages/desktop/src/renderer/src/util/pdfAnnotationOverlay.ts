import type { PdfAnnotation } from '@shared/pdf'
const namespace = 'http://www.w3.org/2000/svg'
const svg = (tag: string, attributes: Record<string, string | number>) => {
  const node = document.createElementNS(namespace, tag)
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value))
  return node
}
interface Surface {
  page: HTMLElement
  surface: HTMLElement
  number: number
  viewport: { width: number; height: number; transform: number[] }
}
interface Layer { node: Element; signature: string }

// PDF.js owns page DOM and may reset it on zoom. Recreate detached layers, but never repaint unchanged pages.
export class PdfAnnotationOverlay {
  private layers = new Map<HTMLElement, Layer>()
  constructor(private readonly select: (item: PdfAnnotation) => void, private readonly context?: (event: MouseEvent, item: PdfAnnotation) => void) {}
  clear() { for (const layer of this.layers.values()) layer.node.remove(); this.layers.clear() }
  preview(item: PdfAnnotation, dx: number, dy: number, width?: number) {
    for (const layer of this.layers.values()) {
      for (const group of layer.node.children) {
        if (group.getAttribute('data-annotation-id') !== item.id) continue
        const base = group.getAttribute('data-base-transform') || ''
        const [x, , right, top] = item.rect
        const transform = width === undefined
          ? `translate(${dx} ${dy})`
          : `translate(${x} ${top}) scale(${width / (right - x)} 1) translate(${-x} ${-top})`
        group.setAttribute('transform', `${base} ${transform}`)
        const element = group as SVGElement
        element.style.cursor = 'grabbing'
      }
    }
  }
  resetPreview() {
    for (const layer of this.layers.values()) {
      for (const group of layer.node.children) {
        group.setAttribute('transform', group.getAttribute('data-base-transform') || '')
        const element = group as SVGElement
        element.style.cursor = 'pointer'
      }
    }
  }
  render(surfaces: Surface[], items: PdfAnnotation[], interactive: boolean, selectedId: string) {
    const pages = new Set(surfaces.map(surface => surface.page))
    for (const [page, layer] of this.layers) {
      if (!pages.has(page) || !page.isConnected) { layer.node.remove(); this.layers.delete(page) }
    }
    for (const { page, surface, number, viewport } of surfaces) {
      const annotations = items.filter(item => item.page === number && !item.deleted)
      const signature = JSON.stringify([annotations, viewport.transform, surface.clientWidth, surface.clientHeight, interactive, selectedId])
      const previous = this.layers.get(page)
      if (previous?.node.isConnected && previous.signature === signature) continue
      previous?.node.remove()
      if (!annotations.length) { this.layers.delete(page); continue }
      const layer = svg('svg', { class: 'pdf-draft-layer', viewBox: `0 0 ${viewport.width} ${viewport.height}`, width: '100%', height: '100%', 'aria-hidden': 'true' })
      Object.assign(layer.style, { position: 'absolute', left: `${surface.offsetLeft}px`, top: `${surface.offsetTop}px`, width: `${surface.clientWidth}px`, height: `${surface.clientHeight}px`, zIndex: '4', pointerEvents: 'none' })
      for (const item of annotations) {
        const transform = `matrix(${viewport.transform.join(' ')})`
        const group = svg('g', { transform, 'data-base-transform': transform, fill: 'none', stroke: item.color, 'stroke-width': item.width, opacity: item.opacity, 'data-annotation-id': item.id })
        const [x, y, right, top] = item.rect
        if (item.kind === 'FreeText' && item.appearance) group.append(svg('image', { href: item.appearance, x: 0, y: 0, width: right - x, height: top - y, transform: `translate(${x} ${top}) scale(1 -1)` }))
        else if (item.kind === 'Ink') {
          for (const line of item.inkList || []) group.append(svg('polyline', { points: line.join(' '), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }))
        } else if (item.kind === 'Text' || item.kind === 'Square') group.append(svg('rect', { x, y, width: right - x, height: top - y, fill: item.kind === 'Text' ? item.color : 'transparent', stroke: item.kind === 'Text' ? '#555555' : item.color, rx: item.kind === 'Text' ? 3 : 0 }))
        else for (let index = 0; index < (item.quadPoints?.length || 0); index += 8) {
          const quad = (item.quadPoints || []).slice(index, index + 8)
          if (item.kind === 'Highlight') group.append(svg('polygon', { points: [quad[0], quad[1], quad[2], quad[3], quad[6], quad[7], quad[4], quad[5]].join(' '), fill: item.color, stroke: 'none' }))
          else {
            const ratio = item.kind === 'Underline' ? .05 : .5
            group.append(svg('line', { x1: quad[4] + (quad[0] - quad[4]) * ratio, y1: quad[5] + (quad[1] - quad[5]) * ratio, x2: quad[6] + (quad[2] - quad[6]) * ratio, y2: quad[7] + (quad[3] - quad[7]) * ratio }))
          }
        }
        if (selectedId === item.id) group.append(svg('rect', { x: x - 2, y: y - 2, width: right - x + 4, height: top - y + 4, fill: 'none', stroke: '#36a97b', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 1, 'pointer-events': 'none' }))
        group.style.pointerEvents = interactive ? 'all' : 'none'
        group.style.cursor = 'pointer'
        group.addEventListener('click', event => { event.stopPropagation(); this.select(item) })
        group.addEventListener('contextmenu', event => this.context?.(event, item))
        layer.append(group)
      }
      page.append(layer)
      this.layers.set(page, { node: layer, signature })
    }
  }
}
