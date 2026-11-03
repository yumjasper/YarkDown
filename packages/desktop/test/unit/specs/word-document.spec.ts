import { expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { createWordDocument, WORD_TEMPLATE } from '../../../src/main/utils/wordDocument'

it('writes fixed integer table widths, native code tabs and list continuation paragraphs', async() => {
  const list = { id: 'list', ordered: true, level: 0, start: 3 }
  const bytes = await createWordDocument({ title: '布局', blocks: [
    { kind: 'paragraph', list, runs: [{ text: '列表第一项' }] },
    { kind: 'paragraph', list: { ...list, continuation: true }, runs: [{ text: '续段' }] },
    { kind: 'paragraph', list, runs: [{ text: '列表第二项' }] },
    { kind: 'code', text: 'before\tafter\nsecond' },
    { kind: 'table', rows: [{ header: true, cells: [[{ kind: 'paragraph', alignment: 'right', runs: [{ text: '值' }] }], [], []] }] }
  ] })
  const load = createRequire(import.meta.url)
  const JSZip = load(load.resolve('jszip', { paths: [load.resolve('docx')] }))
  const zip = await JSZip.loadAsync(bytes)
  const xml: string = await zip.file('word/document.xml').async('string')
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  expect(doc.getElementsByTagName('w:tblLayout')[0].getAttribute('w:type')).toBe('fixed')
  const widths = Array.from(doc.getElementsByTagName('w:gridCol'), col => Number(col.getAttribute('w:w')))
  expect(widths.every(Number.isInteger)).toBe(true)
  expect(widths.reduce((sum, width) => sum + width, 0)).toBe(WORD_TEMPLATE.pageWidth - 2 * WORD_TEMPLATE.margin)
  const paragraph = Array.from(doc.getElementsByTagName('w:p')).find(p => p.textContent === '续段')
  if (!paragraph) throw new Error('Missing continuation paragraph')
  expect(paragraph.getElementsByTagName('w:numPr')).toHaveLength(0)
  expect(paragraph.getElementsByTagName('w:ind')[0].getAttribute('w:left')).toBe('360')
  expect(Array.from(doc.getElementsByTagName('w:tab')).filter(tab => tab.parentElement?.tagName === 'w:r')).toHaveLength(1)
  expect(xml).toContain('TableBody')
  expect(xml).toContain('w:val="right"')
})

it('writes the table of contents as a native Word TOC field', async() => {
  const bytes = await createWordDocument({ title: '目录', blocks: [
    { kind: 'toc', text: '目录', entries: [{ level: 2, text: '安装' }] },
    { kind: 'heading', level: 2, runs: [{ text: '安装' }] },
    { kind: 'heading', level: 2, runs: [{ text: '用法' }] }
  ] })
  const load = createRequire(import.meta.url)
  const JSZip = load(load.resolve('jszip', { paths: [load.resolve('docx')] }))
  const zip = await JSZip.loadAsync(bytes)
  const xml: string = await zip.file('word/document.xml').async('string')
  const settings: string = await zip.file('word/settings.xml').async('string')

  // A real field, not a rendered list: Word owns the entries from here on.
  expect(xml).toContain('TOC \\h \\o &quot;1-6&quot;')
  expect(xml).toContain('<w:sdtContent>')
  expect(xml).toContain('PAGEREF')
  // Word fills page numbers in on open, so it must be told to update fields.
  expect(settings).toContain('updateFields')

  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  // The field anchors to bookmarks, and docx writes one per heading.
  const bookmarkNames = Array.from(doc.getElementsByTagName('w:bookmarkStart'), node => node.getAttribute('w:name'))
  expect(bookmarkNames).toEqual(['_Toc1', '_Toc2'])
  // Every entry links to its heading rather than sitting there as dead text.
  const anchors = Array.from(doc.getElementsByTagName('w:hyperlink'), node => node.getAttribute('w:anchor'))
  expect(anchors).toEqual(['_Toc1', '_Toc2'])
  // Nesting comes from the TOC1/TOC2 styles the field writes per level.
  const levels = Array.from(doc.getElementsByTagName('w:pStyle'))
    .map(node => node.getAttribute('w:val'))
    .filter(value => /^TOC\d$/.test(value || ''))
  expect(levels).toEqual(['TOC2', 'TOC2'])

  // Word rebuilds the entries from these styles on every field update, so they must
  // exist and carry the indentation — otherwise the outline flattens to one level.
  const styles: string = await zip.file('word/styles.xml').async('string')
  const styleDoc = new DOMParser().parseFromString(styles, 'application/xml')
  const indentOf = (styleId: string) => {
    const style = Array.from(styleDoc.getElementsByTagName('w:style'))
      .find(node => node.getAttribute('w:styleId') === styleId)
    if (!style) throw new Error(`Missing style ${styleId}`)
    return style.getElementsByTagName('w:ind')[0]?.getAttribute('w:left')
  }
  expect(indentOf('TOC1')).toBe('0')
  expect(indentOf('TOC2')).toBe('240')
  expect(indentOf('TOC3')).toBe('480')
})
