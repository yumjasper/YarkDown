import { describe, expect, it } from 'vitest'
import { PDFDict, PDFDocument, PDFHexString, PDFName, type PDFNumber, PDFString } from 'pdf-lib'
import { annotatePdf, pdfHash, validatePdfAnnotations } from '../../../src/main/utils/pdfAnnotations'
import type { PdfAnnotation, PdfAnnotationKind } from '../../../src/shared/pdf'

const name = PDFName.of
const annotation = (kind: PdfAnnotationKind, extra: Partial<PdfAnnotation> = {}): PdfAnnotation => ({
  id: `test-${kind}`, kind, page: 1, rect: [40, 600, 250, 625], color: '#f6c344', opacity: 0.5,
  width: 1.5, text: '中文评论 — interoperable annotation', author: '评阅人', modified: '2026-10-15T12:00:00.000Z', ...extra
})
const sourcePdf = async() => {
  const doc = await PDFDocument.create()
  doc.addPage([612, 792]).drawText('Original text remains editable/selectable')
  doc.addPage([612, 792])
  return doc.save()
}

describe('standard PDF annotations', () => {
  it('writes editable annotation objects with Unicode comments, author and appearance streams', async() => {
    const source = await sourcePdf()
    const changes = (['Highlight', 'Underline', 'StrikeOut', 'Text', 'FreeText', 'Ink', 'Square'] as const).map(kind => annotation(kind, {
      quadPoints: ['Highlight', 'Underline', 'StrikeOut'].includes(kind) ? [40, 625, 250, 625, 40, 600, 250, 600] : undefined,
      inkList: kind === 'Ink' ? [[40, 600, 100, 620, 250, 600]] : undefined,
      appearance: kind === 'FreeText' ? 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==' : undefined
    }))
    const saved = await annotatePdf(source, changes)
    const doc = await PDFDocument.load(saved)
    const annots = doc.getPage(0).node.Annots()!
    expect(annots.size()).toBe(7)
    for (let index = 0; index < annots.size(); index++) {
      const dict = doc.context.lookup(annots.get(index), PDFDict)
      expect(dict.get(name('Subtype'))).toBe(name(changes[index].kind))
      expect((dict.get(name('Contents')) as PDFHexString).decodeText()).toBe(changes[index].text)
      expect((dict.get(name('T')) as PDFHexString).decodeText()).toBe('评阅人')
      expect(dict.lookup(name('AP'), PDFDict).get(name('N'))).toBeDefined()
      expect((dict.get(name('F')) as PDFNumber).asNumber()).toBe(4)
    }
    expect(doc.getPage(1).node.Annots()).toBeUndefined()
    expect(pdfHash(saved)).not.toBe(pdfHash(source))
    expect((await PDFDocument.load(source)).getPage(0).node.Annots()?.size() || 0).toBe(0)
  })

  it('edits imported annotations in place, preserves other types and removes related popups/replies on deletion', async() => {
    const initial = await annotatePdf(await sourcePdf(), [annotation('Text')])
    const doc = await PDFDocument.load(initial)
    const annots = doc.getPage(0).node.Annots()!
    const parent = annots.get(0)
    annots.push(doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Popup', Parent: parent, Rect: [0, 0, 20, 20] })))
    annots.push(doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Text', IRT: parent, Rect: [0, 0, 20, 20], Contents: PDFHexString.fromText('reply') })))
    annots.push(doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 20, 20], A: { S: 'URI', URI: PDFString.of('https://example.com') } })))
    const withForeignAnnotations = await doc.save()
    const edited = await annotatePdf(withForeignAnnotations, [annotation('Text', { sourceId: 'test-Text', text: '修改后的中文评论' })])
    const loaded = await PDFDocument.load(edited)
    const updated = loaded.context.lookup(loaded.getPage(0).node.Annots()!.get(0), PDFDict)
    expect((updated.get(name('Contents')) as PDFHexString).decodeText()).toBe('修改后的中文评论')
    expect(loaded.getPage(0).node.Annots()!.size()).toBe(4)
    const deleted = await PDFDocument.load(await annotatePdf(edited, [annotation('Text', { sourceId: 'test-Text', deleted: true })]))
    expect(deleted.getPage(0).node.Annots()!.size()).toBe(1)
    expect(deleted.context.lookup(deleted.getPage(0).node.Annots()!.get(0), PDFDict).get(name('Subtype'))).toBe(name('Link'))
  })

  it('rejects invalid geometry, duplicate ids, nonexistent originals and signed PDFs', async() => {
    expect(() => validatePdfAnnotations([annotation('Square', { rect: [NaN, 0, 20, 20] })], 2)).toThrow()
    expect(() => validatePdfAnnotations([annotation('Text'), annotation('Text')], 2)).toThrow()
    expect(() => validatePdfAnnotations([annotation('Highlight')], 2)).toThrow()
    expect(() => validatePdfAnnotations([annotation('Text', { page: 3 })], 2)).toThrow()
    await expect(annotatePdf(await sourcePdf(), [annotation('Text', { sourceId: 'missing' })])).rejects.toThrow('no longer exists')
    const doc = await PDFDocument.load(await sourcePdf())
    doc.context.register(doc.context.obj({ Type: 'Sig', ByteRange: [0, 1, 2, 3] }))
    await expect(annotatePdf(await doc.save(), [annotation('Text')])).rejects.toThrow('signed')
  })
})
