import { createHash } from 'node:crypto'
import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
  StandardFonts
} from 'pdf-lib'
import type { PdfAnnotation, PdfFormValue } from '@shared/pdf'
import { assertUnsignedPdf, fillPdfFields } from './pdfTools'

export const pdfHash = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex')
const name = PDFName.of
const kinds = new Set(['Highlight', 'Underline', 'StrikeOut', 'Text', 'FreeText', 'Ink', 'Square'])
const numbers = (values: unknown, min: number, multiple: number): values is number[] =>
  Array.isArray(values) &&
  values.length >= min &&
  values.length <= 40000 &&
  values.length % multiple === 0 &&
  values.every(
    (value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e7
  )

export const validatePdfAnnotations = (changes: PdfAnnotation[], pageCount: number): void => {
  if (!Array.isArray(changes) || changes.length > 2000)
    throw new Error('Invalid PDF annotation count.')
  const ids = new Set<string>()
  for (const item of changes) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      !item.id ||
      ids.has(item.id) ||
      !kinds.has(item.kind) ||
      !Number.isInteger(item.page) ||
      item.page < 1 ||
      item.page > pageCount ||
      !numbers(item.rect, 4, 4) ||
      item.rect.length !== 4 ||
      item.rect[0] >= item.rect[2] ||
      item.rect[1] >= item.rect[3] ||
      !/^#[\da-f]{6}$/i.test(item.color) ||
      !Number.isFinite(item.opacity) ||
      item.opacity < 0 ||
      item.opacity > 1 ||
      !Number.isFinite(item.width) ||
      item.width < 0.1 ||
      item.width > 50 ||
      typeof item.text !== 'string' ||
      item.text.length > 20000 ||
      typeof item.author !== 'string' ||
      item.author.length > 200 ||
      !Number.isFinite(Date.parse(item.modified))
    )
      throw new Error('Invalid PDF annotation data.')
    if (item.sourceId !== undefined && typeof item.sourceId !== 'string')
      throw new Error('Invalid annotation reference.')
    if (
      ['Highlight', 'Underline', 'StrikeOut'].includes(item.kind) &&
      !numbers(item.quadPoints, 8, 8)
    )
      throw new Error('Invalid text selection.')
    if (
      item.kind === 'Ink' &&
      (!Array.isArray(item.inkList) ||
        item.inkList.length > 1000 ||
        !item.inkList.length ||
        item.inkList.some((line) => !numbers(line, 4, 2)))
    )
      throw new Error('Invalid ink path.')
    if (
      item.appearance &&
      (!/^data:image\/png;base64,[a-z\d+/=]+$/i.test(item.appearance) ||
        item.appearance.length > 3000000)
    )
      throw new Error('Invalid caption appearance.')
    if (
      (item.fontSize !== undefined &&
        (!Number.isFinite(item.fontSize) || item.fontSize < 8 || item.fontSize > 72)) ||
      (item.letterSpacing !== undefined &&
        (!Number.isFinite(item.letterSpacing) || item.letterSpacing < 0 || item.letterSpacing > 12))
    )
      throw new Error('Invalid caption typography.')
    if (
      item.asContent !== undefined &&
      (typeof item.asContent !== 'boolean' ||
        (item.asContent &&
          (item.kind !== 'FreeText' || item.sourceId || !item.appearance || item.deleted)))
    )
      throw new Error('Invalid PDF content addition.')
    ids.add(item.id)
  }
}

const matches = (ref: PDFRef, dict: PDFDict, id: string): boolean => {
  const nm = dict.get(name('NM'))
  return (
    id === `${ref.objectNumber}R${ref.generationNumber || ''}` ||
    ((nm instanceof PDFString || nm instanceof PDFHexString) && nm.decodeText() === id)
  )
}

export const annotatePdf = async(
  source: Uint8Array,
  changes: PdfAnnotation[],
  formValues: PdfFormValue[] = []
): Promise<Uint8Array> => {
  const doc = await PDFDocument.load(source, { updateMetadata: false })
  assertUnsignedPdf(doc)
  validatePdfAnnotations(changes, doc.getPageCount())
  if (formValues.length) await fillPdfFields(doc, formValues)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const change of changes) {
    const page = doc.getPage(change.page - 1)
    if (change.asContent) {
      const box = page.getCropBox()
      if (!change.appearance || change.rect[0] < box.x || change.rect[1] < box.y ||
        change.rect[2] > box.x + box.width || change.rect[3] > box.y + box.height)
        throw new Error('Added content must fit within the page.')
      const image = await doc.embedPng(change.appearance)
      page.drawImage(image, {
        x: change.rect[0],
        y: change.rect[1],
        width: change.rect[2] - change.rect[0],
        height: change.rect[3] - change.rect[1]
      })
      continue
    }
    let annots = page.node.Annots()
    if (!annots) {
      annots = doc.context.obj([])
      page.node.set(name('Annots'), annots)
    }
    let existing: { ref: PDFRef; dict: PDFDict; index: number } | undefined
    if (change.sourceId) {
      for (let i = 0; i < annots.size(); i++) {
        const ref = annots.get(i)
        const dict = doc.context.lookup(ref)
        if (
          ref instanceof PDFRef &&
          dict instanceof PDFDict &&
          matches(ref, dict, change.sourceId)
        ) {
          existing = { ref, dict, index: i }
          break
        }
      }
      if (!existing)
        throw new Error('An original annotation no longer exists. Reload the PDF before saving.')
      if (existing.dict.get(name('Subtype')) !== name(change.kind))
        throw new Error('The annotation type cannot be changed.')
      const flags = existing.dict.get(name('F'))
      if (flags instanceof PDFNumber && flags.asNumber() & (64 | 128))
        throw new Error('This annotation is locked or read only.')
    }
    if (change.deleted) {
      if (existing) {
        const removed = new Set([existing.ref.toString()])
        let grew = true
        while (grew) {
          grew = false
          for (let i = 0; i < annots.size(); i++) {
            const ref = annots.get(i)
            const dict = doc.context.lookup(ref)
            if (
              ref instanceof PDFRef &&
              dict instanceof PDFDict &&
              !removed.has(ref.toString()) &&
              ['Parent', 'IRT'].some((key) => {
                const parent = dict.get(name(key))
                return parent instanceof PDFRef && removed.has(parent.toString())
              })
            ) {
              removed.add(ref.toString())
              grew = true
            }
          }
        }
        for (let i = annots.size() - 1; i >= 0; i--)
          if (removed.has(annots.get(i).toString())) annots.remove(i)
      }
      continue
    }
    const dict =
      existing?.dict || doc.context.obj({ Type: 'Annot', Subtype: change.kind, P: page.ref, F: 4 })
    const color = [1, 3, 5].map((index) => parseInt(change.color.slice(index, index + 2), 16) / 255)
    dict.set(name('Rect'), doc.context.obj(change.rect))
    dict.set(name('Contents'), PDFHexString.fromText(change.text))
    dict.set(name('T'), PDFHexString.fromText(change.author))
    dict.set(name('M'), PDFString.fromDate(new Date(change.modified)))
    dict.set(name('C'), doc.context.obj(color))
    dict.set(name('CA'), PDFNumber.of(change.opacity))
    dict.set(name('BS'), doc.context.obj({ W: change.width, S: 'S' }))
    if (!existing) {
      dict.set(name('NM'), PDFString.of(change.id))
      dict.set(name('CreationDate'), PDFString.fromDate(new Date(change.modified)))
    }
    if (change.quadPoints) dict.set(name('QuadPoints'), doc.context.obj(change.quadPoints))
    if (change.inkList) dict.set(name('InkList'), doc.context.obj(change.inkList))
    const [x, y, right, top] = change.rect
    const w = right - x,
      h = top - y
    const resources = doc.context.obj({
      ExtGState: {
        GS: {
          Type: 'ExtGState',
          CA: change.opacity,
          ca: change.opacity,
          BM: change.kind === 'Highlight' ? 'Multiply' : 'Normal'
        }
      }
    })
    let drawing = `q /GS gs ${color.join(' ')} RG ${color.join(' ')} rg ${change.width} w 1 J 1 j\n`
    if (change.kind === 'FreeText') {
      dict.set(
        name('DA'),
        PDFString.of(
          `/Helv ${change.fontSize || 14} Tf ${change.letterSpacing || 0} Tc ${color.join(' ')} rg`
        )
      )
      dict.set(name('DR'), doc.context.obj({ Font: { Helv: font.ref } }))
      const richText = Array.from(change.text)
        .map((char) => `&#${char.codePointAt(0)};`)
        .join('')
      dict.set(
        name('RC'),
        PDFString.of(
          `<body xmlns="http://www.w3.org/1999/xhtml" style="font-size:${change.fontSize || 14}pt;letter-spacing:${change.letterSpacing || 0}pt;color:${change.color}"><p>${richText}</p></body>`
        )
      )
      if (!change.appearance) throw new Error('A text caption must include its appearance.')
      const image = await doc.embedPng(change.appearance)
      resources.set(name('XObject'), doc.context.obj({ Caption: image.ref }))
      resources.set(name('Font'), doc.context.obj({ Helv: font.ref }))
      // Empty text retains typography for readers inspecting AP; the raster appearance supplies CJK glyphs.
      drawing += `BT /Helv ${change.fontSize || 14} Tf ${change.letterSpacing || 0} Tc () Tj ET\n`
      drawing += `${w} 0 0 ${h} 0 0 cm /Caption Do\n`
    } else if (change.kind === 'Text') {
      dict.set(name('Name'), name('Comment'))
      dict.set(name('Open'), doc.context.obj(false))
      drawing += `0.2 0.2 0.2 RG 1 w 1 1 ${Math.max(1, w - 2)} ${Math.max(1, h - 2)} re B\n`
      for (const offset of [0.3, 0.5, 0.7])
        drawing += `${w * 0.2} ${h * offset} m ${w * 0.8} ${h * offset} l S\n`
    } else if (change.kind === 'Square') {
      const inset = change.width / 2
      drawing += `${inset} ${inset} ${Math.max(0, w - change.width)} ${Math.max(0, h - change.width)} re S\n`
    } else if (change.kind === 'Ink') {
      for (const line of change.inkList || []) {
        drawing += `${line[0] - x} ${line[1] - y} m `
        for (let i = 2; i < line.length; i += 2) drawing += `${line[i] - x} ${line[i + 1] - y} l `
        drawing += 'S\n'
      }
    } else {
      for (let i = 0; i < (change.quadPoints?.length || 0); i += 8) {
        const q = (change.quadPoints || []).slice(i, i + 8)
        const p = (j: number) => `${q[j] - x} ${q[j + 1] - y}`
        if (change.kind === 'Highlight') drawing += `${p(0)} m ${p(2)} l ${p(6)} l ${p(4)} l h f\n`
        else {
          const amount = change.kind === 'Underline' ? 0.05 : 0.5
          drawing += `${q[4] + (q[0] - q[4]) * amount - x} ${q[5] + (q[1] - q[5]) * amount - y} m ${q[6] + (q[2] - q[6]) * amount - x} ${q[7] + (q[3] - q[7]) * amount - y} l S\n`
        }
      }
    }
    const appearance = doc.context.flateStream(drawing + 'Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, w, h],
      Resources: resources
    })
    dict.set(name('AP'), doc.context.obj({ N: doc.context.register(appearance) }))
    if (!existing) annots.push(doc.context.register(dict))
  }
  return doc.save({ useObjectStreams: false })
}
