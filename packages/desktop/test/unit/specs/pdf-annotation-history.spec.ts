import { describe, expect, it } from 'vitest'
import { PdfAnnotationHistory } from '../../../src/renderer/src/util/pdfAnnotationHistory'
import type { PdfAnnotation } from '../../../src/shared/pdf'
const annotation = (id: string, text = ''): PdfAnnotation => ({ id, text, page: 1, kind: 'Text', rect: [0, 0, 24, 24], color: '#fff100', opacity: 1, width: 1, author: 'Test', modified: '2026-10-16' })
describe('PDF annotation transaction history', () => {
  it('undoes and redoes additions, edits and removals without changing unrelated objects', () => {
    const history = new PdfAnnotationHistory()
    const first = annotation('first')
    const other = annotation('other')
    history.record([other], [other, first])
    expect(history.undo([other, first])).toEqual([other])
    expect(history.redo([other])).toEqual([other, first])
    history.record([other, first], [other, { ...first, text: 'Edited' }])
    expect(history.undo([other, { ...first, text: 'Edited' }])).toEqual([other, first])
    history.record([other, first], [other])
    expect(history.undo([other])).toEqual([other, first])
  })
  it('merges continuous text input and clears redo on a new action', () => {
    const history = new PdfAnnotationHistory()
    const first = annotation('first')
    history.record([first], [annotation('first', 'a')], 'edit:first')
    history.record([annotation('first', 'a')], [annotation('first', 'ab')], 'edit:first')
    expect(history.size).toBe(1)
    expect(history.undo([annotation('first', 'ab')])).toEqual([first])
    history.record([first], [annotation('first', 'new')])
    expect(history.canRedo).toBe(false)
  })
  it('bounds count and byte size and ignores unchanged edits', () => {
    const history = new PdfAnnotationHistory(2, 4096)
    for (let index = 0; index < 4; index++) history.record([], [annotation(String(index))])
    expect(history.size).toBe(2)
    expect(history.record([], [])).toBe(false)
    history.record([], [annotation('large', 'x'.repeat(5000))])
    expect(history.size).toBe(0)
    history.clear()
    expect(history.canUndo).toBe(false)
  })
})
