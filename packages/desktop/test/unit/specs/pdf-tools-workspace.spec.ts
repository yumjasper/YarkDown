import { describe, expect, it } from 'vitest'
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import { createPdf } from '../../../src/main/utils/pdfTools'
import { annotatePdf } from '../../../src/main/utils/pdfAnnotations'
import type { PdfAnnotation } from '../../../src/shared/pdf'

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
const fixture = async() => {
  const doc = await PDFDocument.create(), page = doc.addPage([595, 842]), form = doc.getForm()
  const text = form.createTextField('name'); text.setText('Before'); text.addToPage(page)
  const check = form.createCheckBox('approved'); check.addToPage(page)
  const dropdown = form.createDropdown('choice'); dropdown.addOptions(['One', 'Two']); dropdown.select('One'); dropdown.addToPage(page)
  return doc.save()
}
const content: PdfAnnotation = { id: 'content-1', kind: 'FreeText', page: 1, rect: [40, 600, 120, 630], color: '#111111', opacity: 1, width: 1, text: 'Added text', author: 'YarkText', modified: '2026-10-16T12:00:00.000Z', appearance: png, asContent: true }

describe('PDF tools workspace engine', () => {
  it('creates bounded blank A4 documents and rejects invalid requests', async() => {
    const doc = await PDFDocument.load(await createPdf({ kind: 'blank', pages: 3 }))
    expect(doc.getPageCount()).toBe(3)
    expect(doc.getPage(0).getWidth()).toBeCloseTo(595.28)
    await expect(createPdf({ kind: 'blank', pages: 0 })).rejects.toThrow()
    await expect(createPdf({ kind: 'blank', pages: 101 })).rejects.toThrow()
    await expect(createPdf({ kind: 'images', images: [] })).rejects.toThrow()
    await expect(createPdf({ kind: 'images', images: [new Uint8Array([1, 2])] })).rejects.toThrow()
  })
  it('creates image pages with embedded resources', async() => {
    const image = new Uint8Array(Buffer.from(png.split(',')[1], 'base64'))
    const doc = await PDFDocument.load(await createPdf({ kind: 'images', images: [image, image] }))
    expect(doc.getPageCount()).toBe(2)
    expect(doc.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict).keys().length).toBe(1)
  })
  it('fills text, checkboxes and choices while retaining interactive fields', async() => {
    const source = await fixture()
    const saved = await annotatePdf(source, [], [{ name: 'name', value: 'After' }, { name: 'approved', value: true }, { name: 'choice', value: 'Two' }])
    const form = (await PDFDocument.load(saved)).getForm()
    expect(form.getTextField('name').getText()).toBe('After')
    expect(form.getCheckBox('approved').isChecked()).toBe(true)
    expect(form.getDropdown('choice').getSelected()).toEqual(['Two'])
    expect((await PDFDocument.load(source)).getForm().getTextField('name').getText()).toBe('Before')
  })
  it('rejects missing, readonly, unsupported character and invalid choice values', async() => {
    const source = await fixture()
    await expect(annotatePdf(source, [], [{ name: 'missing', value: 'A' }])).rejects.toThrow()
    await expect(annotatePdf(source, [], [{ name: 'name', value: '中文' }])).rejects.toThrow('CJK')
    await expect(annotatePdf(source, [], [{ name: 'choice', value: 'Invalid' }])).rejects.toThrow()
    await expect(annotatePdf(source, [], [{ name: 'approved', value: 'true' }])).rejects.toThrow()
    const doc = await PDFDocument.load(source); doc.getForm().getTextField('name').enableReadOnly()
    await expect(annotatePdf(await doc.save(), [], [{ name: 'name', value: 'A' }])).rejects.toThrow('Read-only')
  })
  it('writes additions to page content rather than annotations and rejects invalid content flags', async() => {
    const source = await createPdf({ kind: 'blank', pages: 1 })
    const doc = await PDFDocument.load(await annotatePdf(source, [content]))
    expect(doc.getPage(0).node.Annots()?.size() || 0).toBe(0)
    expect(doc.getPage(0).node.Contents()).toBeDefined()
    await expect(annotatePdf(source, [{ ...content, kind: 'Square' }])).rejects.toThrow()
    await expect(annotatePdf(source, [{ ...content, sourceId: 'missing' }])).rejects.toThrow()
  })
  it('preserves signed documents by refusing changes including form filling', async() => {
    const doc = await PDFDocument.load(await fixture())
    doc.context.register(doc.context.obj({ Type: 'Sig', ByteRange: [0, 1, 2, 3] }))
    await expect(annotatePdf(await doc.save(), [], [{ name: 'name', value: 'After' }])).rejects.toThrow('signed')
  })
})
