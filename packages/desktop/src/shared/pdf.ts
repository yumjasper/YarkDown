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
}

export interface PdfSaveRequest {
  pathname: string
  sourceHash: string
  annotations: PdfAnnotation[]
  copy: boolean
}

export type PdfSaveResult = { pathname: string; hash: string } | null
