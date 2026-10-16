export const isPdfFile = (filename: string): boolean => /\.pdf$/i.test(filename)

export type PdfAnnotationKind =
  'Highlight' | 'Underline' | 'StrikeOut' | 'Text' | 'FreeText' | 'Ink' | 'Square'

export interface PdfAnnotation {
  id: string
  sourceId?: string
  page: number
  kind: PdfAnnotationKind
  // Unrotated PDF user-space coordinates, independent of display zoom/rotation.
  rect: [number, number, number, number]
  quadPoints?: number[]
  inkList?: number[][]
  color: string
  opacity: number
  width: number
  text: string
  author: string
  modified: string
  appearance?: string
  fontSize?: number
  letterSpacing?: number
  deleted?: boolean
  // New captions can become page content; imported annotations retain their original subtype.
  asContent?: boolean
}

export interface PdfFormValue {
  name: string
  value: string | boolean
}

export type PdfCreateRequest =
  { kind: 'blank'; pages: number } | { kind: 'images'; images: Uint8Array[] }

export interface PdfSaveRequest {
  pathname: string
  sourceHash: string
  annotations: PdfAnnotation[]
  copy: boolean
  formValues?: PdfFormValue[]
}

export type PdfSaveResult = { pathname: string; hash: string } | null

export interface PdfTextBlock {
  id: number
  // Unrotated, top-left-origin coordinates in PDF points, as returned by the native engine.
  rect: [number, number, number, number]
  text: string
  fontSize: number
  color: string
  editable: boolean
}

export interface PdfBlockInspection {
  blocks: PdfTextBlock[]
  width: number
  height: number
  sourceHash: string
}

export interface PdfAdvancedCapabilities {
  available: boolean
  version?: string
  ocr?: boolean
  docx?: boolean
  xlsx?: boolean
  pptx?: boolean
  error?: string
}

export type PdfAdvancedRequest =
  | { action: 'ocr'; pathname: string }
  | { action: 'convert'; pathname: string; kind: 'docx' | 'xlsx' | 'pptx' }
  | {
      action: 'edit'
      pathname: string
      page: number
      blockId: number
      text: string
      fontSize: number
      sourceHash: string
    }

export type PdfAdvancedResult = { pathname: string; message: string } | null
