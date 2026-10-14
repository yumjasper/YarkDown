import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  LineRuleType,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableLayoutType,
  VerticalAlign,
  Tab,
  TabStopType,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
  type ParagraphChild,
  type IRunOptions
} from 'docx'
import type { WordBlock, WordContent, WordInline } from './wordDom'

export const WORD_TEMPLATE = {
  pageWidth: 11906,
  pageHeight: 16838,
  margin: 1440,
  fontSize: 22,
  codeSize: 19,
  bodyFont: { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: '宋体', cs: 'Calibri' },
  headingFont: { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: '微软雅黑', cs: 'Calibri' },
  codeFont: { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: '宋体', cs: 'Consolas' }
} as const

// Word page dimensions are twips; Chromium/image dimensions are CSS pixels at 96 dpi.
export const WORD_CONTENT_WIDTH = (WORD_TEMPLATE.pageWidth - 2 * WORD_TEMPLATE.margin) / 15
const CONTENT_HEIGHT = (WORD_TEMPLATE.pageHeight - 2 * WORD_TEMPLATE.margin) / 15
const headingLevels = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6
]

const createRun = (run: WordInline, availableWidth: number): ParagraphChild => {
  if (run.image) {
    const match = /^data:image\/png;base64,(.*)$/s.exec(run.image)
    if (!match) return new TextRun(run.alt || '')
    const width = run.width || availableWidth
    const height = run.height || 100
    const scale = Math.min(1, availableWidth / width, (CONTENT_HEIGHT - 80) / height)
    return new ImageRun({
      type: 'png',
      data: Buffer.from(match[1], 'base64'),
      transformation: { width: Math.max(1, width * scale), height: Math.max(1, height * scale) },
      altText: {
        title: run.math ? '公式' : '图片',
        description: run.alt || '',
        name: run.math ? 'formula' : 'figure'
      }
    })
  }
  const options: IRunOptions = {
    text: run.text || '',
    break: run.break ? 1 : undefined,
    bold: run.bold,
    italics: run.italic,
    strike: run.strike,
    subScript: run.sub,
    superScript: run.sup,
    font: run.code ? WORD_TEMPLATE.codeFont : undefined,
    size: run.code ? WORD_TEMPLATE.codeSize : undefined,
    color: run.link ? '245A81' : undefined,
    underline: run.underline || run.link ? { type: UnderlineType.SINGLE } : undefined,
    shading: run.code ? { fill: 'F2F4F6', type: ShadingType.CLEAR } : undefined
  }
  const text = new TextRun(options)
  return run.link && !run.link.startsWith('#')
    ? new ExternalHyperlink({ link: run.link, children: [text] })
    : text
}

const createBlocks = (
  blocks: WordBlock[],
  width = WORD_CONTENT_WIDTH,
  inCell = false
): (Paragraph | Table)[] =>
  blocks.flatMap((block, blockIndex) => {
    if (block.kind === 'table') {
      const columns = Math.max(1, ...(block.rows || []).map((row) => row.cells.length))
      const border = { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' }
      const totalWidth = Math.floor(width * 15)
      const columnWidths = Array.from(
        { length: columns },
        (_, i) => Math.floor(totalWidth / columns) + (i < totalWidth % columns ? 1 : 0)
      )
      return [
        new Table({
          layout: TableLayoutType.FIXED,
          width: { size: totalWidth, type: WidthType.DXA },
          columnWidths,
          rows: (block.rows || []).map(
            (row, index) =>
              new TableRow({
                tableHeader: row.header,
                cantSplit: row.header,
                children: row.cells.map(
                  (cell, column) =>
                    new TableCell({
                      children: createBlocks(
                        cell.length ? cell : [{ kind: 'paragraph', runs: [] }],
                        columnWidths[column] / 15 - 16,
                        true
                      ),
                      width: { size: columnWidths[column], type: WidthType.DXA },
                      verticalAlign: VerticalAlign.CENTER,
                      margins: { top: 80, bottom: 80, left: 100, right: 100 },
                      shading: {
                        fill: row.header ? 'E8EDF2' : index % 2 === 0 ? 'F6F7F8' : 'FFFFFF'
                      },
                      borders: { top: border, bottom: border, left: border, right: border }
                    })
                )
              })
          )
        }),
        // A nonempty spacer survives Word's suppression of leading space after a table.
        new Paragraph({
          children: [new TextRun({ text: '\u00a0', size: 2, color: 'FFFFFF' })],
          spacing: { before: 0, after: 0, line: 120, lineRule: LineRuleType.EXACT }
        })
      ]
    }
    if (block.kind === 'code') {
      const lines = (block.text || '').split('\n')
      return lines.map(
        (line, index) =>
          new Paragraph({
            style: 'CodeBlock',
            spacing: { before: index === 0 ? 120 : 0, after: index === lines.length - 1 ? 120 : 0 },
            tabStops: Array.from({ length: 32 }, (_, tab) => ({
              type: TabStopType.LEFT,
              position: 120 + (tab + 1) * 380
            })),
            children: [
              new TextRun({
                children: (line || ' ')
                  .split('\t')
                  .flatMap((part, i) => (i ? [new Tab(), part] : [part])),
                font: WORD_TEMPLATE.codeFont,
                size: WORD_TEMPLATE.codeSize
              })
            ]
          })
      )
    }
    if (block.kind === 'rule')
      return [
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' } }
        })
      ]
    const style =
      block.style === 'caption' ? 'Caption' : block.style === 'quote' ? 'Quote' : undefined
    const figure = block.style === 'figure' || block.style === 'equation'
    return [
      new Paragraph({
        style: style || (inCell ? 'TableBody' : undefined),
        heading:
          block.kind === 'heading'
            ? headingLevels[Math.max(0, Math.min(5, (block.level || 1) - 1))]
            : undefined,
        alignment:
          block.alignment === 'center'
            ? AlignmentType.CENTER
            : block.alignment === 'right'
              ? AlignmentType.RIGHT
              : undefined,
        numbering:
          block.list && !block.list.continuation
            ? { reference: block.list.id, level: block.list.level }
            : undefined,
        indent: block.list?.continuation ? { left: 360 * (block.list.level + 1) } : undefined,
        widowControl: true,
        keepNext:
          block.kind === 'heading' ||
          (block.style === 'figure' && blocks[blockIndex + 1]?.style === 'caption')
            ? true
            : undefined,
        keepLines: figure,
        spacing: figure
          ? { before: 120, after: 120, line: 240, lineRule: LineRuleType.AUTO }
          : undefined,
        children: (block.runs || []).map((run) => createRun(run, width))
      })
    ]
  })

export const createWordDocument = async(content: WordContent): Promise<Buffer> => {
  const lists = new Map<string, NonNullable<WordBlock['list']>>()
  const collect = (blocks: WordBlock[]) =>
    blocks.forEach((block) => {
      if (block.list) lists.set(block.list.id, block.list)
      block.rows?.forEach((row) => row.cells.forEach(collect))
    })
  collect(content.blocks)
  const doc = new Document({
    creator: 'YarkText',
    title: content.title,
    styles: {
      default: {
        document: {
          run: { font: WORD_TEMPLATE.bodyFont, size: WORD_TEMPLATE.fontSize, color: '202020' },
          paragraph: {
            spacing: { after: 120, line: 360, lineRule: LineRuleType.AUTO }
          }
        },
        heading1: {
          run: { font: WORD_TEMPLATE.headingFont, size: 36, bold: true, color: '000000' },
          paragraph: { spacing: { before: 240, after: 160 }, keepNext: true }
        },
        heading2: {
          run: { font: WORD_TEMPLATE.headingFont, size: 30, bold: true, color: '000000' },
          paragraph: { spacing: { before: 200, after: 120 }, keepNext: true }
        },
        heading3: {
          run: { font: WORD_TEMPLATE.headingFont, size: 26, bold: true, color: '000000' },
          paragraph: { spacing: { before: 160, after: 100 }, keepNext: true }
        },
        heading4: {
          run: { font: WORD_TEMPLATE.headingFont, size: 24, bold: true, color: '000000' },
          paragraph: { spacing: { before: 140, after: 80 }, keepNext: true }
        },
        heading5: {
          run: { font: WORD_TEMPLATE.headingFont, size: 22, bold: true, color: '000000' },
          paragraph: { spacing: { before: 120, after: 80 }, keepNext: true }
        },
        heading6: {
          run: { font: WORD_TEMPLATE.headingFont, size: 22, bold: true, color: '000000' },
          paragraph: { spacing: { before: 120, after: 80 }, keepNext: true }
        }
      },
      paragraphStyles: [
        {
          id: 'TableBody',
          name: '表格正文',
          basedOn: 'Normal',
          paragraph: { spacing: { before: 0, after: 0, line: 276, lineRule: LineRuleType.AUTO } }
        },
        {
          id: 'CodeBlock',
          name: '代码块',
          basedOn: 'Normal',
          run: { font: WORD_TEMPLATE.codeFont, size: WORD_TEMPLATE.codeSize },
          paragraph: {
            spacing: { before: 0, after: 0, line: 276, lineRule: LineRuleType.AUTO },
            shading: { fill: 'F2F4F6' },
            indent: { left: 120, right: 120 }
          }
        },
        {
          id: 'Caption',
          name: '图注',
          basedOn: 'Normal',
          run: { size: 20, color: '555555' },
          paragraph: {
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 160, line: 300, lineRule: LineRuleType.AUTO }
          }
        },
        {
          id: 'Quote',
          name: '引用',
          basedOn: 'Normal',
          paragraph: {
            indent: { left: 320 },
            border: { left: { color: 'D9D9D9', size: 12, style: BorderStyle.SINGLE, space: 10 } }
          }
        }
      ]
    },
    numbering: {
      config: Array.from(lists.values(), (list) => ({
        reference: list.id,
        levels: Array.from({ length: 9 }, (_, level) => ({
          level,
          format: list.ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
          text: list.ordered ? `%${level + 1}.` : '•',
          start: list.start,
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 240 } } }
        }))
      }))
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: WORD_TEMPLATE.pageWidth, height: WORD_TEMPLATE.pageHeight },
            margin: {
              top: WORD_TEMPLATE.margin,
              bottom: WORD_TEMPLATE.margin,
              left: WORD_TEMPLATE.margin,
              right: WORD_TEMPLATE.margin
            }
          }
        },
        children: createBlocks(content.blocks)
      }
    ]
  })
  return Packer.toBuffer(doc)
}
