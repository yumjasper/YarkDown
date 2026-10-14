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
