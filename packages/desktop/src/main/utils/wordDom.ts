export interface WordInline {
  text?: string
  image?: string
  width?: number
  height?: number
  alt?: string
  math?: boolean
  bold?: boolean
  italic?: boolean
  code?: boolean
  strike?: boolean
  underline?: boolean
  sub?: boolean
  sup?: boolean
  link?: string
  break?: boolean
}

export interface WordBlock {
  kind: 'paragraph' | 'heading' | 'code' | 'table' | 'rule'
  runs?: WordInline[]
  level?: number
  text?: string
  style?: 'figure' | 'caption' | 'equation' | 'quote'
  alignment?: 'left' | 'center' | 'right'
  list?: { id: string; ordered: boolean; level: number; start: number; continuation?: boolean }
  rows?: { header: boolean; cells: WordBlock[][] }[]
}

export interface WordContent {
  title: string
  blocks: WordBlock[]
}

/** Runs in the isolated export renderer; only semantic Markdown structure crosses IPC. */
export function serializeWordDocument(): WordContent {
  let listId = 0
  const inline = (node: Node, inherited: WordInline = {}): WordInline[] => {
    if (node.nodeType === Node.TEXT_NODE)
      return [{ ...inherited, text: (node.textContent || '').replace(/\s+/g, ' ') }]
    if (!(node instanceof HTMLElement)) return []
    const tag = node.tagName.toLowerCase()
    if (tag === 'br') return [{ break: true }]
    if (tag === 'img')
      return [
        {
          ...inherited,
          image: node.getAttribute('src') || '',
          width: Number(node.getAttribute('width')),
          height: Number(node.getAttribute('height')),
          alt: node.getAttribute('alt') || '',
          math: node.hasAttribute('data-word-math')
        }
      ]
    if (tag === 'input') return [{ ...inherited, text: node.hasAttribute('checked') ? '☑ ' : '☐ ' }]
    const format = { ...inherited }
    if (tag === 'strong' || tag === 'b') format.bold = true
    if (tag === 'em' || tag === 'i') format.italic = true
    if (tag === 'code') format.code = true
    if (tag === 'del' || tag === 's') format.strike = true
    if (tag === 'u') format.underline = true
    if (tag === 'sub') format.sub = true
    if (tag === 'sup') format.sup = true
    if (tag === 'a') format.link = node.getAttribute('href') || undefined
    return Array.from(node.childNodes).flatMap((child) => inline(child, format))
  }
  const blocks = (container: Element, list?: WordBlock['list'], quote = false): WordBlock[] => {
    const result: WordBlock[] = []
    let pending: WordInline[] = []
    const flush = () => {
      if (pending.some((run) => run.image || run.text?.trim()))
        result.push({ kind: 'paragraph', runs: pending, list, style: quote ? 'quote' : undefined })
      pending = []
    }
    for (const node of Array.from(container.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        pending.push(...inline(node))
        continue
      }
      if (!(node instanceof HTMLElement)) continue
      const tag = node.tagName.toLowerCase()
      if (
        [
          'span',
          'strong',
          'em',
          'b',
          'i',
          'code',
          'a',
          'img',
          'input',
          'sup',
          'sub',
          'del',
          's',
          'u',
          'br'
        ].includes(tag)
      ) {
        pending.push(...inline(node))
        continue
      }
      flush()
      if (tag === 'ul' || tag === 'ol') {
        const nextList = {
          id: `list-${listId++}`,
          ordered: tag === 'ol',
          level: list ? Math.min(8, list.level + 1) : 0,
          start: Number(node.getAttribute('start')) || 1
        }
        for (const item of Array.from(node.children)) {
          const childBlocks = blocks(item, nextList, quote)
          let numbered = false
          for (const block of childBlocks) {
            if (block.list?.id !== nextList.id) continue
            block.list = { ...block.list, continuation: numbered }
            numbered = true
          }
          if (childBlocks.length) result.push(...childBlocks)
        }
      } else if (tag === 'table') {
        result.push({
          kind: 'table',
          rows: Array.from(
            node.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tr')
          ).map((row) => ({
            header: row.parentElement?.tagName === 'THEAD' || row.querySelector('th') !== null,
            cells: Array.from(row.children).map((cell) => {
              const cellBlocks = blocks(cell)
              const align =
                cell.getAttribute('align') ||
                cell.getAttribute('data-align') ||
                (cell instanceof HTMLElement ? cell.style.textAlign : '')
              for (const block of cellBlocks) {
                if (align === 'left' || align === 'center' || align === 'right')
                  block.alignment = align
                if (cell.tagName === 'TH')
                  block.runs = block.runs?.map((run) => ({ ...run, bold: true }))
              }
              return cellBlocks
            })
          }))
        })
      } else if (tag === 'pre') {
        result.push({ kind: 'code', text: (node.textContent || '').replace(/\n$/, '') })
      } else if (tag === 'hr') {
        result.push({ kind: 'rule' })
      } else if (/^h[1-6]$/.test(tag)) {
        result.push({ kind: 'heading', level: Number(tag[1]), runs: inline(node) })
      } else if (tag === 'blockquote') {
        result.push(...blocks(node, list, true))
      } else if (['p', 'figcaption'].includes(tag) || node.hasAttribute('data-word-equation')) {
        const runs = inline(node)
        const standalone =
          runs.some((run) => run.image && !run.math) &&
          runs.every((run) => run.image || !run.text?.trim())
        const style = node.hasAttribute('data-word-equation')
          ? 'equation'
          : tag === 'figcaption'
            ? 'caption'
            : standalone
              ? 'figure'
              : quote
                ? 'quote'
                : undefined
        result.push({
          kind: 'paragraph',
          runs,
          style,
          list,
          alignment:
            standalone || style === 'caption' || style === 'equation' ? 'center' : undefined
        })
        if (standalone && style === 'figure') {
          const caption = node.querySelector('img')?.getAttribute('title')
          if (caption)
            result.push({
              kind: 'paragraph',
              runs: [{ text: caption }],
              style: 'caption',
              alignment: 'center'
            })
        }
      } else if (['script', 'style', 'noscript'].includes(tag)) {
        continue
      } else if (['div', 'section', 'article', 'figure', 'main'].includes(tag)) {
        result.push(...blocks(node, list, quote))
      } else {
        result.push({
          kind: 'paragraph',
          runs: inline(node),
          list,
          style: quote ? 'quote' : undefined
        })
      }
    }
    flush()
    return result
  }
  return {
    title: document.title,
    blocks: blocks(document.querySelector('article') || document.body)
  }
}
