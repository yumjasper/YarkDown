import { describe, expect, it } from 'vitest'
import { editablePdfFields, pdfFieldEntries } from '../../../src/renderer/src/util/pdfFormFields'

describe('PDF.js form field adaptation', () => {
  it('accepts PDF.js 6 Map results and older object results', () => {
    const fields = { Customer: [{ type: 'text', value: 'Before', editable: true }] }
    expect(editablePdfFields(new Map(Object.entries(fields)))).toEqual(editablePdfFields(fields))
    expect(editablePdfFields(fields)[0].original).toBe('Before')
    expect(pdfFieldEntries(null)).toEqual([])
  })
  it('ignores unsupported parents, readonly, hidden and signature fields', () => {
    expect(editablePdfFields({ A: [{ type: 'unknown' }, { type: 'text', value: 'A' }], B: [{ type: 'text', editable: false }], C: [{ type: 'signature' }], D: [{ type: 'text', hidden: true }] }).map(field => field.name)).toEqual(['A'])
  })
  it('normalizes checkbox and grouped radio values and choice arrays', () => {
    const fields = editablePdfFields({ Check: [{ type: 'checkbox', value: 'Off' }], Radio: [{ type: 'radiobutton', value: 'Two', exportValues: 'One' }, { type: 'radiobutton', exportValues: 'Two' }], Choice: [{ type: 'combobox', value: ['Two'], options: [{ exportValue: 'One' }, { exportValue: 'Two' }] }] })
    expect(fields[0].value).toBe(false)
    expect(fields[1].options).toEqual(['One', 'Two'])
    expect(fields[2].value).toBe('Two')
  })
})
