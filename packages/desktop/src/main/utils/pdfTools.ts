import {
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts
} from 'pdf-lib'
import type { PdfCreateRequest, PdfFormValue } from '@shared/pdf'

export const assertUnsignedPdf = (doc: PDFDocument): void => {
  if (
    doc.context
      .enumerateIndirectObjects()
      .some(
        ([, object]) =>
          object instanceof PDFDict &&
          (object.has(PDFName.of('ByteRange')) ||
            object.get(PDFName.of('FT')) === PDFName.of('Sig'))
      )
  ) {
    throw new Error('数字签名 PDF 保持只读，以免破坏签名。 / Digitally signed PDFs are read only.')
  }
}

export const fillPdfFields = async(doc: PDFDocument, values: PdfFormValue[]): Promise<void> => {
  if (!Array.isArray(values) || values.length > 2000) throw new Error('Invalid PDF form values.')
  const form = doc.getForm()
  if (form.hasXFA()) throw new Error('暂不支持 XFA 动态表单。 / XFA forms are not supported.')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const seen = new Set<string>()
  for (const entry of values) {
    if (!entry || typeof entry.name !== 'string' || seen.has(entry.name))
      throw new Error('Invalid form field name.')
    seen.add(entry.name)
    const field = form.getField(entry.name)
    if (field.isReadOnly()) throw new Error(`只读字段 / Read-only field: ${entry.name}`)
    if (field instanceof PDFTextField) {
      if (typeof entry.value !== 'string' || entry.value.length > 20000)
        throw new Error('Invalid text field value.')
      const max = field.getMaxLength()
      if (max !== undefined && entry.value.length > max)
        throw new Error(`字段超出长度限制 / Field too long: ${entry.name}`)
      try {
        font.encodeText(entry.value)
      } catch {
        throw new Error(
          '表单字段暂支持西欧字符；中文请使用“添加填写文字”。 / Use Add fill text for CJK characters.'
        )
      }
      field.setText(entry.value)
      field.updateAppearances(font)
    } else if (field instanceof PDFCheckBox) {
      if (typeof entry.value !== 'boolean') throw new Error('Invalid checkbox value.')
      if (entry.value) field.check()
      else field.uncheck()
      field.updateAppearances()
    } else if (
      field instanceof PDFDropdown ||
      field instanceof PDFOptionList ||
      field instanceof PDFRadioGroup
    ) {
      if (typeof entry.value !== 'string' || !field.getOptions().includes(entry.value))
        throw new Error('Invalid field option.')
      field.select(entry.value)
      if (field instanceof PDFRadioGroup) field.updateAppearances()
      else {
        try {
          font.encodeText(entry.value)
        } catch {
          throw new Error('该选项需要尚未嵌入的字体。 / This option requires an embedded font.')
        }
        field.updateAppearances(font)
      }
    } else throw new Error(`暂不支持该字段类型 / Unsupported field: ${entry.name}`)
  }
}

export const createPdf = async(request: PdfCreateRequest): Promise<Uint8Array> => {
  if (!request || !['blank', 'images'].includes(request.kind))
    throw new Error('Invalid PDF creation request.')
  const doc = await PDFDocument.create()
  doc.setCreator('YarkText')
  if (request.kind === 'blank') {
    if (!Number.isInteger(request.pages) || request.pages < 1 || request.pages > 100)
      throw new Error('页数必须为 1–100。 / Pages must be between 1 and 100.')
    for (let i = 0; i < request.pages; i++) doc.addPage([595.28, 841.89])
  } else {
    if (!Array.isArray(request.images) || !request.images.length || request.images.length > 100)
      throw new Error('请选择 1–100 张图片。 / Select 1–100 images.')
    let total = 0
    for (const bytes of request.images) {
      if (
        !(bytes instanceof Uint8Array) ||
        !bytes.length ||
        (total += bytes.length) > 100 * 1024 * 1024
      )
        throw new Error('图片总大小超过 100 MB。 / Images exceed 100 MB.')
      const png = bytes[0] === 137 && bytes[1] === 80
      const jpg = bytes[0] === 255 && bytes[1] === 216
      if (!png && !jpg) throw new Error('仅支持 PNG / JPEG。 / Only PNG and JPEG are supported.')
      const image = png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
      if (image.width * image.height > 40_000_000)
        throw new Error('图片像素过多。 / Image exceeds 40 megapixels.')
      const page = doc.addPage([595.28, 841.89])
      const size = image.scaleToFit(555.28, 801.89)
      page.drawImage(image, {
        x: (595.28 - size.width) / 2,
        y: (841.89 - size.height) / 2,
        ...size
      })
    }
  }
  return doc.save()
}
