/** Extracts source-like text without walking generated math, HTML or diagram previews. */
export const minimapText = (element: Element, limit = 16000): string => {
  const parts: string[] = []
  let length = 0
  const append = (text: string) => {
    const part = text.slice(0, Math.max(0, limit - length))
    parts.push(part)
    length += part.length
  }
  const pending: Node[] = [element]
  while (pending.length && length < limit) {
    const node = pending.pop()
    if (!node) break
    if (node.nodeType === Node.TEXT_NODE) {
      append(node.textContent || '')
    } else if (node instanceof Element) {
      if (node.matches('.mu-math-preview, .mu-diagram-preview, .mu-html-preview')) continue
      if (node.classList.contains('katex')) {
        append(node.querySelector('annotation[encoding="application/x-tex"]')?.textContent || '')
        continue
      }
      if (node.tagName === 'BR') append('\n')
      else if (node.tagName === 'IMG') append('▧')
      else {
        for (let child = node.lastChild; child; child = child.previousSibling) pending.push(child)
      }
    }
  }
  return parts.join('')
}
