interface TextFragment {
  text: string
  rect: DOMRect
  layer: Element
}

// PDF text spans can omit space characters and represent line endings with BR nodes.
export const pdfSelectionText = (range: Range | undefined, container: Element | undefined): string => {
  if (!range || !container) return ''
  let output = ''
  let previous: TextFragment | undefined
  for (const layer of container.querySelectorAll('.textLayer')) {
    if (!range.intersectsNode(layer)) continue
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (!range.intersectsNode(node)) continue
      if (node instanceof HTMLBRElement) {
        if (output && !output.endsWith('\n')) output += '\n'
        previous = undefined
        continue
      }
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent) continue
      const segment = document.createRange()
      segment.selectNodeContents(node)
      if (range.startContainer === node) segment.setStart(node, range.startOffset)
      if (range.endContainer === node) segment.setEnd(node, range.endOffset)
      const text = segment.toString()
      if (!text) continue
      const rect = segment.getBoundingClientRect()
      if (previous && !/\s$/.test(output) && !/^\s/.test(text)) {
        const height = Math.min(previous.rect.height, rect.height)
        const lineDistance = Math.abs((rect.top + rect.bottom - previous.rect.top - previous.rect.bottom) / 2)
        if (previous.layer !== layer || (height > 0 && lineDistance > Math.max(previous.rect.height, rect.height) * 0.65)) {
          output += '\n'
        } else if (height > 0 && rect.left - previous.rect.right > Math.max(0.3, height * 0.08)) {
          output += ' '
        }
      }
      output += text
      previous = { text, rect, layer }
    }
  }
  return output || range.toString()
}
